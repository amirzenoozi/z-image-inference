import base64
import io
import sys
from collections.abc import Iterator
from json import dumps
from pathlib import Path
from types import SimpleNamespace

import pytest
import requests
from fastapi.testclient import TestClient
from PIL import Image
from pydantic import ValidationError

import character_store
import history_store
import main
import model_server
import nsfw_detector
import video_engine
import video_store
from generation_request import VideoRequest
from history_store import NewImage
from model_catalog import video_size

MP4 = b"\x00\x00\x00\x18ftypmp42" + bytes(range(256)) * 4


def png(width: int = 64, height: int = 64) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), "red").save(buffer, format="PNG")
    return buffer.getvalue()


def clip() -> video_engine.Clip:
    return video_engine.Clip(mp4=MP4, poster=png(), middle=png())


# -- The request and the clip's size ---------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("fields", "message"),
    [({"seconds": 3}, "2, 4 seconds"), ({"seconds": 2, "width": 500}, "multiples of 64"), ({"seconds": 2, "height": 1024}, "multiples of 64")],
)
def test_a_video_request_keeps_to_the_lengths_and_sizes_the_model_makes(fields: dict[str, int], message: str) -> None:
    with pytest.raises(ValidationError, match=message):
        VideoRequest(prompt="she smiles", **fields)


@pytest.mark.parametrize(("image", "clip_size"), [((1024, 1024), (512, 512)), ((768, 1344), (320, 512)), ((1344, 768), (512, 320))])
def test_a_clip_keeps_the_image_shape_with_its_longer_side_at_512(image: tuple[int, int], clip_size: tuple[int, int]) -> None:
    assert video_size(*image) == clip_size


# -- Running the engine -----------------------------------------------------------------------------------------------


def python(code: str) -> list[str]:
    return [sys.executable, "-c", code]


def test_the_engine_reports_when_it_starts_decoding_and_finishes(tmp_path: Path) -> None:
    decoding: list[bool] = []
    video_engine.run_engine(python("print('[Decoding video + audio + muxing] ...', flush=True)"), tmp_path, lambda: False, lambda: decoding.append(True))
    assert decoding == [True]


def test_a_cancelled_engine_is_stopped(tmp_path: Path) -> None:
    with pytest.raises(video_engine.EngineCancelled):
        video_engine.run_engine(python("import time; time.sleep(30)"), tmp_path, lambda: True, lambda: None)


def test_a_failed_engine_says_why(tmp_path: Path) -> None:
    with pytest.raises(video_engine.EngineFailed, match="out of memory"):
        video_engine.run_engine(python("import sys; print('out of memory'); sys.exit(1)"), tmp_path, lambda: False, lambda: None)


# -- The model server's video job -------------------------------------------------------------------------------------


@pytest.fixture
def server(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(model_server, "model_status", lambda model_id: "ready")
    monkeypatch.setattr(video_engine, "missing_tools", lambda: [])
    monkeypatch.setattr(model_server, "release_memory", lambda: None)
    return TestClient(model_server.app)


def video_body(**overrides: object) -> dict[str, object]:
    return {"prompt": "she smiles", "seconds": 2, "image": base64.b64encode(png()).decode(), "width": 512, "height": 512, "seed": 7, **overrides}


def test_a_video_job_frees_the_image_model_and_returns_the_clip(server: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    asked: list[tuple[str, int, tuple[int, int], int]] = []
    monkeypatch.setattr(model_server, "loaded_model_id", "z-image-turbo")
    monkeypatch.setattr(model_server, "loaded_generator", lambda job, progress: None)
    monkeypatch.setattr(video_engine, "make_clip", lambda image, prompt, seconds, size, seed, cache, cancelled, on_decoding: asked.append((prompt, seconds, size, seed)) or clip())

    resp = server.post("/videos", json=video_body())

    assert resp.status_code == 200
    assert base64.b64decode(resp.json()["video_base64"]) == MP4
    assert asked == [("she smiles", 2, (512, 512), 7)]
    assert model_server.loaded_model_id is None


@pytest.mark.parametrize(
    ("error", "status", "message"),
    [(video_engine.EngineCancelled(), 409, "Cancelled"), (video_engine.EngineFailed("out of memory"), 500, "out of memory")],
)
def test_a_cancelled_or_failed_video_is_reported(server: TestClient, monkeypatch: pytest.MonkeyPatch, error: Exception, status: int, message: str) -> None:
    def fail(*args: object, **kwargs: object) -> video_engine.Clip:
        raise error

    monkeypatch.setattr(video_engine, "make_clip", fail)
    resp = server.post("/videos", json=video_body())
    assert resp.status_code == status
    assert message.lower() in resp.json()["detail"].lower()


def test_no_video_without_the_model_or_the_tools(server: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(video_engine, "missing_tools", lambda: ["ffmpeg"])
    assert "brew install ffmpeg" in server.post("/videos", json=video_body()).json()["detail"]
    assert "brew install ffmpeg" in (model_server.download_problem("ltx-video") or "")

    monkeypatch.setattr(model_server, "model_status", lambda model_id: "missing")
    assert server.post("/videos", json=video_body()).status_code == 503


# -- The web app: making, listing, playing and deleting videos -------------------------------------------------------


class FakeVideoServer:
    """Stands in for requests.post to the model server's /videos."""

    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    def post(self, url: str, json: dict[str, object], timeout: float) -> requests.Response:
        self.calls.append(json)
        resp = requests.Response()
        resp.status_code = 200
        body = {"video_base64": base64.b64encode(MP4).decode(), "poster_base64": base64.b64encode(png()).decode(),
                "middle_base64": base64.b64encode(png()).decode(), "seed": 7, "seconds": 74.2}
        resp._content = dumps(body).encode()
        return resp


@pytest.fixture
def app(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[tuple[TestClient, FakeVideoServer]]:
    monkeypatch.setattr(history_store, "DB_PATH", tmp_path / "history.db")
    fake = FakeVideoServer()
    monkeypatch.setattr(main.requests, "post", fake.post)
    with TestClient(main.app) as client:
        yield client, fake


def saved_image(width: int = 1024, height: int = 768, sensitive: bool = False, character_id: int | None = None) -> int:
    return history_store.add(NewImage(
        png=png(width, height), prompt="a woman on a beach", negative_prompt="", seed=1, width=width, height=height, steps=9,
        guidance=None, model="z-image-turbo", duration_seconds=1.0, sensitive=sensitive, character_id=character_id,
    )).id


def test_a_video_is_made_from_a_history_image_and_saved_as_a_video(app: tuple[TestClient, FakeVideoServer]) -> None:
    client, server = app
    image_id = saved_image()

    video = client.post(f"/api/history/{image_id}/videos", json={"prompt": "waves roll in", "seconds": 4}).json()

    sent = server.calls[0]
    assert (sent["width"], sent["height"], sent["seconds"]) == (512, 384, 4)
    assert Image.open(io.BytesIO(base64.b64decode(str(sent["image"])))).size == (1024, 768)
    assert (video["image_id"], video["prompt"], video["seconds"], video["seed"]) == (image_id, "waves roll in", 4, 7)
    assert client.get(f"/api/history/{image_id}/videos").json() == [video]
    assert client.get("/api/history").json()["total"] == 1


def test_a_video_plays_in_parts_so_safari_can_stream_it(app: tuple[TestClient, FakeVideoServer]) -> None:
    client, _ = app
    video_id = client.post(f"/api/history/{saved_image()}/videos", json={"prompt": "waves", "seconds": 2}).json()["id"]

    whole = client.get(f"/api/videos/{video_id}/video")
    part = client.get(f"/api/videos/{video_id}/video", headers={"Range": "bytes=10-19"})
    rest = client.get(f"/api/videos/{video_id}/video", headers={"Range": "bytes=1000-"})

    assert (whole.status_code, whole.headers["content-type"], whole.content) == (200, "video/mp4", MP4)
    assert (part.status_code, part.headers["content-range"], part.content) == (206, f"bytes 10-19/{len(MP4)}", MP4[10:20])
    assert rest.content == MP4[1000:]
    assert client.get(f"/api/videos/{video_id}/poster?thumb=true").headers["content-type"] == "image/webp"
    assert client.get(f"/api/videos/{video_id}/download").headers["content-disposition"].endswith(f'video-{video_id}.mp4"')


def test_deleting_a_video_or_its_image_removes_it(app: tuple[TestClient, FakeVideoServer]) -> None:
    client, _ = app
    image_id = saved_image()
    first = client.post(f"/api/history/{image_id}/videos", json={"prompt": "waves", "seconds": 2}).json()["id"]
    second = client.post(f"/api/history/{image_id}/videos", json={"prompt": "wind", "seconds": 2}).json()["id"]

    assert client.delete(f"/api/videos/{first}").status_code == 204
    assert [video["id"] for video in client.get(f"/api/history/{image_id}/videos").json()] == [second]
    client.delete(f"/api/history/{image_id}")
    assert video_store.item(second) is None
    assert client.get(f"/api/videos/{second}/video").status_code == 404


def test_a_video_is_blurred_when_its_image_or_prompt_is_sensitive(app: tuple[TestClient, FakeVideoServer]) -> None:
    client, _ = app
    plain = client.post(f"/api/history/{saved_image()}/videos", json={"prompt": "waves", "seconds": 2}).json()
    from_sensitive = client.post(f"/api/history/{saved_image(sensitive=True)}/videos", json={"prompt": "waves", "seconds": 2}).json()
    nude_prompt = client.post(f"/api/history/{saved_image()}/videos", json={"prompt": "she undresses, nude", "seconds": 2}).json()
    assert (plain["sensitive"], from_sensitive["sensitive"], nude_prompt["sensitive"]) == (False, True, True)


def test_an_uploaded_face_keeps_its_videos_safe_for_work(app: tuple[TestClient, FakeVideoServer], monkeypatch: pytest.MonkeyPatch) -> None:
    client, server = app
    monkeypatch.setattr(character_store, "character", lambda character_id: SimpleNamespace(name="Ava", face_uploaded=True))
    monkeypatch.setattr(nsfw_detector, "is_ready", lambda: True)
    image_id = saved_image(character_id=3)

    refused = client.post(f"/api/history/{image_id}/videos", json={"prompt": "she undresses, nude", "seconds": 2})
    assert refused.status_code == 422 and server.calls == []

    monkeypatch.setattr(nsfw_detector, "is_nsfw", lambda image: True)
    discarded = client.post(f"/api/history/{image_id}/videos", json={"prompt": "she smiles", "seconds": 2})
    assert discarded.status_code == 422
    assert client.get(f"/api/history/{image_id}/videos").json() == []


def test_a_missing_image_or_video_is_not_found(app: tuple[TestClient, FakeVideoServer]) -> None:
    client, _ = app
    assert client.post("/api/history/99/videos", json={"prompt": "waves", "seconds": 2}).status_code == 404
    assert client.get("/api/history/99/videos").status_code == 404
    assert client.delete("/api/videos/99").status_code == 404
