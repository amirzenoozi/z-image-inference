import time
import threading
from collections.abc import Callable
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import model_server

WAI = "wai-illustrious"
REQUEST = {"model": WAI, "prompt": "a cat", "width": 1024, "height": 1024}


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
        model_server.download_marker(self.path).touch()


@pytest.fixture
def download(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[FakeDownload]:
    fake = FakeDownload(tmp_path / WAI)
    paths = {model_id: tmp_path / model_id for model_id in model_server.MODELS}
    monkeypatch.setattr(model_server, "DOWNLOAD_PATHS", paths)
    monkeypatch.setattr(model_server, "Z_IMAGE_Q4_PATH", tmp_path / "zimage-q4")
    monkeypatch.setattr(model_server, "DOWNLOADERS", {**model_server.DOWNLOADERS, WAI: fake})
    monkeypatch.setattr(model_server, "downloads", {})
    yield fake
    fake.release.set()


def finish(model_id: str) -> None:
    model_server.downloads[model_id].exception(timeout=5)


def wait_until(condition: Callable[[], bool]) -> None:
    deadline = time.monotonic() + 5
    while not condition():
        assert time.monotonic() < deadline, "timed out"
        time.sleep(0.01)


def test_a_missing_model_starts_downloading_and_answers_at_once(download: FakeDownload) -> None:
    client = TestClient(model_server.app)
    assert client.get("/models/status").json()[WAI] == "missing"

    first = client.post("/generate", json=REQUEST)
    second = client.post("/generate", json=REQUEST)

    assert first.status_code == second.status_code == 503
    assert "downloading for first use (about 13 GB)" in first.json()["detail"]
    wait_until(lambda: client.get("/models/status").json()[WAI] == "downloading")
    download.release.set()
    finish(WAI)
    assert download.calls == 1
    assert client.get("/models/status").json()[WAI] == "ready"


def test_downloads_run_one_at_a_time_and_the_rest_wait_queued(download: FakeDownload, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    moss = FakeDownload(tmp_path / "moss-image-nsfw")
    monkeypatch.setitem(model_server.DOWNLOADERS, "moss-image-nsfw", moss)
    client = TestClient(model_server.app)

    model_server.start_download(WAI)
    model_server.start_download("moss-image-nsfw")
    wait_until(lambda: model_server.model_status(WAI) == "downloading")
    assert client.get("/models/status").json()["moss-image-nsfw"] == "queued"

    download.release.set()
    moss.release.set()
    finish("moss-image-nsfw")
    assert client.get("/models/status").json()["moss-image-nsfw"] == "ready"


def test_a_failed_download_is_reported_and_restarted(download: FakeDownload) -> None:
    client = TestClient(model_server.app)
    download.fail = True
    download.release.set()
    client.post("/generate", json=REQUEST)
    finish(WAI)
    assert client.get("/models/status").json()[WAI] == "failed"

    download.fail = False
    retry = client.post("/generate", json=REQUEST)
    finish(WAI)

    assert "The last download failed (network down) and has been restarted" in retry.json()["detail"]
    assert download.calls == 2
    assert client.get("/models/status").json()[WAI] == "ready"


def test_startup_queues_every_missing_model_default_first_without_waiting(download: FakeDownload, monkeypatch: pytest.MonkeyPatch) -> None:
    started: list[str] = []
    monkeypatch.setattr(model_server, "start_download", started.append)
    monkeypatch.setattr(model_server, "use_model", lambda model_id: pytest.fail("must not load a model that is not downloaded"))

    with TestClient(model_server.app):
        pass

    assert started[0] == model_server.DEFAULT_MODEL.id
    assert sorted(started) == sorted(model_server.MODELS)


def test_startup_downloads_nothing_already_downloaded(download: FakeDownload, monkeypatch: pytest.MonkeyPatch) -> None:
    for path in model_server.DOWNLOAD_PATHS.values():
        path.mkdir(parents=True)
        model_server.download_marker(path).touch()
    loaded: list[str] = []
    monkeypatch.setattr(model_server, "use_model", loaded.append)

    with TestClient(model_server.app):
        pass

    assert model_server.downloads == {}
    assert loaded == [model_server.DEFAULT_MODEL.id]
