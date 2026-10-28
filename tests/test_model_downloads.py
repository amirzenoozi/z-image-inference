import json
import time
import threading
from collections.abc import Callable, Iterator
from pathlib import Path

import pytest
import torch
from safetensors.torch import save_file
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
        # The original-file checks look for MOSS-Image's complete text encoder and a float32 WAI unet
        write_moss_text_encoder(self.path / "merged-model" / "text_encoder")
        unet = self.path / model_server.WAI_UNET_FILE
        unet.parent.mkdir(parents=True, exist_ok=True)
        save_file({"weight": torch.zeros(2, dtype=torch.float32)}, unet)
        model_server.download_marker(self.path).touch()


def write_moss_text_encoder(folder: Path, shards: tuple[str, ...] = ("model-1.safetensors", "model-2.safetensors"), present: int = 2) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "model.safetensors.index.json").write_text(json.dumps({"weight_map": {f"layer{n}": shard for n, shard in enumerate(shards)}}))
    for shard in shards[:present]:
        (folder / shard).write_bytes(b"0")


@pytest.fixture
def download(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[FakeDownload]:
    fake = FakeDownload(tmp_path / WAI)
    paths = {model_id: tmp_path / model_id for model_id in model_server.MODELS}
    monkeypatch.setattr(model_server, "DOWNLOAD_PATHS", paths)
    monkeypatch.setattr(model_server, "MODEL_FOLDERS", {model_id: [path] for model_id, path in paths.items()})
    monkeypatch.setattr(model_server, "Z_IMAGE_PATH", paths["z-image-turbo"])
    monkeypatch.setattr(model_server, "MODELS_DIR", tmp_path)
    monkeypatch.setattr(model_server, "WAI_ILLUSTRIOUS_PATH", paths[WAI])
    monkeypatch.setattr(model_server, "MOSS_IMAGE_PATH", paths[MOSS])
    monkeypatch.setattr(model_server, "MOSS_IMAGE_MODEL_PATH", paths[MOSS] / "merged-model")
    monkeypatch.setattr(model_server, "MOSS_TEXT_ENCODER_Q8_PATH", paths[MOSS] / "text_encoder-q8")
    monkeypatch.delenv("MODEL_COMPRESSION", raising=False)
    monkeypatch.delenv("Z_IMAGE_BITS", raising=False)
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
    assert report["models"][WAI]["status"] == "ready"
    assert report["models"][WAI]["size_bytes"] > 1000
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


@pytest.mark.parametrize("compression", ["off", "on"])
def test_a_download_needs_room_for_the_files_and_any_compression_setup(download: FakeDownload, monkeypatch: pytest.MonkeyPatch, compression: str) -> None:
    monkeypatch.setenv("MODEL_COMPRESSION", compression)
    spec = model_server.MODELS[WAI]
    setup_gb = spec.compressed_gb if compression == "on" else 0
    needed = int((spec.download_gb + setup_gb) * model_server.GB)
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


def mark_downloaded(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    model_server.download_marker(path).touch()


def write_wai_unet(dtype: torch.dtype) -> None:
    """A tiny stand-in for WAI's unet file: float32 as downloaded, float16 once compressed."""
    unet = model_server.WAI_ILLUSTRIOUS_PATH / model_server.WAI_UNET_FILE
    unet.parent.mkdir(parents=True, exist_ok=True)
    save_file({"weight": torch.zeros(2, dtype=dtype)}, unet)


@pytest.mark.parametrize(("compression", "ready"), [("off", False), ("on", True)])
def test_compressed_copies_only_count_when_compression_is_on(download: FakeDownload, monkeypatch: pytest.MonkeyPatch, compression: str, ready: bool) -> None:
    monkeypatch.setenv("MODEL_COMPRESSION", compression)
    mark_downloaded(model_server.WAI_ILLUSTRIOUS_PATH)
    write_wai_unet(torch.float16)
    mark_downloaded(model_server.MOSS_IMAGE_PATH)
    model_server.MOSS_TEXT_ENCODER_Q8_PATH.mkdir()

    for model_id in (WAI, MOSS):
        assert model_server.is_downloaded(model_id) is ready, model_id


def test_originals_count_as_downloaded_without_compression(download: FakeDownload) -> None:
    mark_downloaded(model_server.Z_IMAGE_PATH)
    mark_downloaded(model_server.WAI_ILLUSTRIOUS_PATH)
    write_wai_unet(torch.float32)
    mark_downloaded(model_server.MOSS_IMAGE_PATH)
    write_moss_text_encoder(model_server.MOSS_IMAGE_MODEL_PATH / "text_encoder")

    for model_id in ("z-image-turbo", WAI, MOSS):
        assert model_server.is_downloaded(model_id), model_id


def test_downloading_originals_fetches_what_compression_replaced(download: FakeDownload, monkeypatch: pytest.MonkeyPatch) -> None:
    fetched: list[tuple[str, list[str] | None]] = []

    def fake_snapshot(repo_id: str, local_dir: Path, cache_dir: Path, allow_patterns: list[str] | None = None) -> None:
        fetched.append((repo_id, allow_patterns))
        write_moss_text_encoder(Path(local_dir) / "merged-model" / "text_encoder")
        if repo_id == model_server.WAI_ILLUSTRIOUS.repo_id:
            write_wai_unet(torch.float32)

    monkeypatch.setattr(model_server, "snapshot_download", fake_snapshot)
    model_server.z_image_quantized_path(8).mkdir()
    mark_downloaded(model_server.Z_IMAGE_PATH)
    mark_downloaded(model_server.WAI_ILLUSTRIOUS_PATH)
    write_wai_unet(torch.float16)
    mark_downloaded(model_server.MOSS_IMAGE_PATH)
    model_server.MOSS_TEXT_ENCODER_Q8_PATH.mkdir()

    model_server.download_z_image()
    model_server.download_wai_illustrious()
    model_server.download_moss_image()

    # Z-Image's compressed copy is kept beside the original, for comparing levels
    assert model_server.z_image_quantized_path(8).exists()
    assert model_server.wai_has_original_weights()
    assert not model_server.MOSS_TEXT_ENCODER_Q8_PATH.exists()
    assert fetched == [
        (model_server.WAI_ILLUSTRIOUS.repo_id, model_server.WAI_ILLUSTRIOUS_FILES),
        (model_server.MOSS_IMAGE.repo_id, ["merged-model/text_encoder/*"]),
    ]
    for model_id in ("z-image-turbo", WAI, MOSS):
        assert model_server.is_downloaded(model_id), model_id


def test_a_partly_downloaded_text_encoder_is_not_the_original(download: FakeDownload) -> None:
    mark_downloaded(model_server.MOSS_IMAGE_PATH)
    write_moss_text_encoder(model_server.MOSS_IMAGE_MODEL_PATH / "text_encoder", present=1)
    assert not model_server.is_downloaded(MOSS)


def test_a_running_download_is_never_reported_ready(download: FakeDownload) -> None:
    mark_downloaded(model_server.WAI_ILLUSTRIOUS_PATH)
    write_wai_unet(torch.float32)
    assert model_server.model_status(WAI) == "ready"

    model_server.downloads[WAI] = model_server.download_thread.submit(download)
    wait_until(lambda: model_server.model_status(WAI) == "downloading")
    download.release.set()
    finish(WAI)
    assert model_server.model_status(WAI) == "ready"
