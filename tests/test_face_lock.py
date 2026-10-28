import base64
import io
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import model_server
from generation_request import GenerateRequest
from test_model_downloads import PLENTY, wait_until

WAI = "wai-illustrious"


def face_png() -> str:
    buffer = io.BytesIO()
    Image.new("RGB", (64, 80), "tan").save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode()


FACE_REQUEST = {"model": WAI, "prompt": "1girl", "width": 1024, "height": 1024, "face_image": face_png(), "face_strength": 0.6}


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"model": "z-image-turbo", "width": 1024, "height": 1024}, "can't lock a face"),
        ({"face_strength": None}, "needs both a face image and its strength"),
        ({"face_strength": 1.5}, "less than or equal to 1"),
    ],
)
def test_a_face_lock_is_refused_where_it_cannot_apply(overrides: dict[str, object], message: str) -> None:
    with pytest.raises(ValueError, match=message):
        GenerateRequest(**FACE_REQUEST | overrides)


@pytest.fixture
def face_lock_files(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Path]:
    path = tmp_path / "ip-adapter"
    monkeypatch.setattr(model_server, "FACE_LOCK_PATH", path)
    monkeypatch.setattr(model_server, "downloads", {})
    monkeypatch.setattr(model_server, "model_status", lambda model_id: "ready")
    monkeypatch.setattr(model_server, "free_bytes", lambda: PLENTY)
    yield path


def test_the_first_face_lock_downloads_its_files_once_then_renders(face_lock_files: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    def fake_download() -> None:
        calls.append("download")
        face_lock_files.mkdir(parents=True)
        model_server.download_marker(face_lock_files).touch()

    monkeypatch.setattr(model_server, "download_face_lock", fake_download)
    rendered: list[model_server.Job] = []
    monkeypatch.setattr(model_server, "generate_png", lambda model_id, job, progress: rendered.append(job) or model_server.RenderedImage(b"png", 1.0))
    client = TestClient(model_server.app)

    first = client.post("/generate", json=FACE_REQUEST)
    assert first.status_code == 503
    assert "Downloading the face lock files once" in first.json()["detail"]
    wait_until(lambda: model_server.download_marker(face_lock_files).exists())

    assert client.post("/generate", json=FACE_REQUEST).status_code == 200
    assert calls == ["download"]
    assert rendered[0].face_image is not None and rendered[0].face_image.size == (64, 80)
    assert rendered[0].face_strength == 0.6


def test_a_face_lock_needs_room_for_its_download(face_lock_files: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(model_server, "free_bytes", lambda: 1_000)
    resp = TestClient(model_server.app).post("/generate", json=FACE_REQUEST)
    assert resp.status_code == 503
    assert "free disk space" in resp.json()["detail"]
    assert model_server.downloads == {}


class FakePipe:
    """Records what the face lock asks of the SDXL pipeline."""

    def __init__(self) -> None:
        self.calls: list[str] = []
        self.components: dict[str, object] = {}

    def load_ip_adapter(self, *args: object, **kwargs: object) -> None:
        self.calls.append("load")

    def unload_ip_adapter(self) -> None:
        self.calls.append("unload")

    def set_ip_adapter_scale(self, scale: float) -> None:
        self.calls.append(f"scale {scale}")


def job(face: bool) -> model_server.Job:
    image = Image.new("RGB", (8, 8)) if face else None
    return model_server.Job(prompt="1girl", negative_prompt="", width=1024, height=1024, steps=1, guidance=5, seed=1, face_image=image, face_strength=0.7 if face else None)


def test_the_adapter_loads_for_face_locked_renders_only_and_stays_loaded_between_them(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(model_server, "StableDiffusionXLImg2ImgPipeline", lambda **components: object())
    monkeypatch.setattr(model_server, "release_memory", lambda: None)
    pipe = FakePipe()
    pipes = model_server.SdxlPipes(pipe)  # type: ignore[arg-type]  # a stand-in for the diffusers pipeline

    assert model_server.face_lock_arguments(pipes, job(face=False)) == {}
    first = model_server.face_lock_arguments(pipes, job(face=True))
    model_server.face_lock_arguments(pipes, job(face=True))
    model_server.face_lock_arguments(pipes, job(face=False))

    assert set(first) == {"ip_adapter_image"}
    assert pipe.calls == ["load", "scale 0.7", "scale 0.7", "unload"]
