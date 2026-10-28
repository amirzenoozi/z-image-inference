import time
import threading
from collections.abc import Callable, Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import model_server

WAI = "wai-illustrious"
MOSS = "moss-image-nsfw"
REQUEST = {"model": WAI, "prompt": "a cat", "width": 1024, "height": 1024}
PLENTY = 10_000 * model_server.GB


class FakeDownload:
    """Stands in for a model download: waits until the test releases it, then succeeds or fails."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.release = threading.Event()
        self.fail = False
        self.calls = 0

    def __call__(self) -> None:
        self.calls += 1
        self.release.wait(timeout=5)
        if self.fail:
            raise RuntimeError("network down")
        self.path.mkdir(parents=True, exist_ok=True)
        (self.path / "weights.safetensors").write_bytes(b"0" * 1000)
        model_server.download_marker(self.path).touch()


@pytest.fixture
def download(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[FakeDownload]:
    fake = FakeDownload(tmp_path / WAI)
    paths = {model_id: tmp_path / model_id for model_id in model_server.MODELS}
    monkeypatch.setattr(model_server, "DOWNLOAD_PATHS", paths)
    monkeypatch.setattr(model_server, "MODEL_FOLDERS", {model_id: [path] for model_id, path in paths.items()})
    monkeypatch.setattr(model_server, "Z_IMAGE_Q4_PATH", tmp_path / "zimage-q4")
    monkeypatch.setattr(model_server, "DOWNLOADERS", {**model_server.DOWNLOADERS, WAI: fake})
    monkeypatch.setattr(model_server, "downloads", {})
    monkeypatch.setattr(model_server, "free_bytes", lambda: PLENTY)
    yield fake
    fake.release.set()


def finish(model_id: str) -> None:
    model_server.downloads[model_id].exception(timeout=5)


def wait_until(condition: Callable[[], bool]) -> None:
    deadline = time.monotonic() + 5
    while not condition():
        assert time.monotonic() < deadline, "timed out"
        time.sleep(0.01)


def status_of(client: TestClient, model_id: str) -> str:
    return client.get("/models/status").json()["models"][model_id]["status"]


def test_generating_with_a_missing_model_explains_without_downloading(download: FakeDownload) -> None:
    client = TestClient(model_server.app)
    resp = client.post("/generate", json=REQUEST)

    assert resp.status_code == 503
    assert "is not downloaded. Download it from the model list first" in resp.json()["detail"]
    assert status_of(client, WAI) == "missing"
    assert download.calls == 0


def test_the_download_endpoint_starts_one_download_and_reports_progress(download: FakeDownload) -> None:
    client = TestClient(model_server.app)

    first = client.post(f"/models/{WAI}/download")
    second = client.post(f"/models/{WAI}/download")

    assert first.status_code == second.status_code == 200
    wait_until(lambda: status_of(client, WAI) == "downloading")
    assert "still downloading" in client.post("/generate", json=REQUEST).json()["detail"]
    download.release.set()
    finish(WAI)
    assert download.calls == 1
    report = client.get("/models/status").json()
    assert report["models"][WAI] == {"status": "ready", "size_bytes": 1000}
    assert report["free_bytes"] == PLENTY


def test_a_failed_download_can_be_retried(download: FakeDownload) -> None:
    client = TestClient(model_server.app)
    download.fail = True
    download.release.set()
    client.post(f"/models/{WAI}/download")
    finish(WAI)
    assert status_of(client, WAI) == "failed"

    download.fail = False
    client.post(f"/models/{WAI}/download")
    finish(WAI)

    assert download.calls == 2
    assert status_of(client, WAI) == "ready"


def test_a_download_needs_room_for_the_files_and_their_setup(download: FakeDownload, monkeypatch: pytest.MonkeyPatch) -> None:
    spec = model_server.MODELS[WAI]
    needed = int((spec.download_gb + spec.kept_gb) * model_server.GB)
    monkeypatch.setattr(model_server, "free_bytes", lambda: needed - 2 * model_server.GB)
    client = TestClient(model_server.app)

    resp = client.post(f"/models/{WAI}/download")

    assert resp.status_code == 507
    assert "free about 2.0 GB more" in resp.json()["detail"]
    assert download.calls == 0


def test_downloads_run_one_at_a_time_and_the_rest_wait_queued(download: FakeDownload, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    moss = FakeDownload(tmp_path / MOSS)
    monkeypatch.setitem(model_server.DOWNLOADERS, MOSS, moss)
    client = TestClient(model_server.app)

    client.post(f"/models/{WAI}/download")
    client.post(f"/models/{MOSS}/download")
    wait_until(lambda: model_server.model_status(WAI) == "downloading")
    assert status_of(client, MOSS) == "queued"

    download.release.set()
    moss.release.set()
    finish(MOSS)
    assert status_of(client, MOSS) == "ready"


def test_removing_a_model_unloads_it_and_deletes_its_files(download: FakeDownload, monkeypatch: pytest.MonkeyPatch) -> None:
    client = TestClient(model_server.app)
    download.release.set()
    client.post(f"/models/{WAI}/download")
    finish(WAI)
    monkeypatch.setattr(model_server, "loaded_model_id", WAI)
    monkeypatch.setattr(model_server, "loaded_generator", lambda job: None)
    monkeypatch.setattr(model_server, "release_memory", lambda: None)

    assert client.delete(f"/models/{WAI}").status_code == 204

    assert not download.path.exists()
    assert model_server.loaded_model_id is None
    assert status_of(client, WAI) == "missing"


def test_a_downloading_model_cannot_be_removed(download: FakeDownload) -> None:
    client = TestClient(model_server.app)
    client.post(f"/models/{WAI}/download")

    resp = client.delete(f"/models/{WAI}")

    assert resp.status_code == 409
    assert "remove it when the download has finished" in resp.json()["detail"]


def test_unknown_models_are_rejected(download: FakeDownload) -> None:
    client = TestClient(model_server.app)
    assert client.post("/models/not-a-model/download").status_code == 404
    assert client.delete("/models/not-a-model").status_code == 404


def test_startup_downloads_only_the_default_model_without_waiting(download: FakeDownload, monkeypatch: pytest.MonkeyPatch) -> None:
    started: list[str] = []
    monkeypatch.setattr(model_server, "start_download", started.append)
    monkeypatch.setattr(model_server, "use_model", lambda model_id: pytest.fail("must not load a model that is not downloaded"))

    with TestClient(model_server.app):
        pass

    assert started == [model_server.DEFAULT_MODEL.id]


def test_startup_loads_a_downloaded_default_model(download: FakeDownload, monkeypatch: pytest.MonkeyPatch) -> None:
    default_path = model_server.DOWNLOAD_PATHS[model_server.DEFAULT_MODEL.id]
    default_path.mkdir(parents=True)
    model_server.download_marker(default_path).touch()
    loaded: list[str] = []
    monkeypatch.setattr(model_server, "use_model", loaded.append)

    with TestClient(model_server.app):
        pass

    assert model_server.downloads == {}
    assert loaded == [model_server.DEFAULT_MODEL.id]
