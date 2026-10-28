import base64
import io
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import history_store
import main
import nsfw_detector
from test_characters import use_samples
from test_web_app import FakeModelServer, generate


def photo(width: int = 2000, height: int = 1500) -> str:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), "tan").save(buffer, format="JPEG")
    return base64.b64encode(buffer.getvalue()).decode()


@pytest.fixture
def server(monkeypatch: pytest.MonkeyPatch) -> FakeModelServer:
    fake = FakeModelServer()
    monkeypatch.setattr(main.requests, "post", fake.post)
    return fake


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, server: FakeModelServer) -> Iterator[TestClient]:
    monkeypatch.setattr(history_store, "DB_PATH", tmp_path / "history.db")
    use_samples(tmp_path, monkeypatch, [])
    # The image check is ready and finds nothing, unless a test says otherwise
    monkeypatch.setattr(nsfw_detector, "is_ready", lambda: True)
    monkeypatch.setattr(nsfw_detector, "is_nsfw", lambda png: False)
    with TestClient(main.app) as test_client:
        yield test_client


def uploaded(client: TestClient) -> dict[str, object]:
    return client.post("/api/characters", json={"name": "Me", "traits": {"who": "man", "age": "30s"}, "face_upload": photo()}).json()


def sdxl(client: TestClient, **overrides: object) -> dict[str, object]:
    return generate(client, model="wai-illustrious", width=1024, height=1024, steps=28, **overrides)


def test_an_uploaded_photo_is_stored_small_and_served_back(client: TestClient) -> None:
    me = uploaded(client)
    assert (me["face_uploaded"], me["face_id"]) == (True, None)

    stored = Image.open(io.BytesIO(client.get(f"/api/characters/{me['id']}/face-upload").content))
    assert (stored.format, max(stored.size)) == ("PNG", 1024)
    assert client.get(f"/api/characters/{me['id']}/face-upload?thumb=true").headers["content-type"] == "image/webp"


@pytest.mark.parametrize("face_upload", ["not base64!", base64.b64encode(b"just text").decode()])
def test_an_unreadable_photo_is_refused(client: TestClient, face_upload: str) -> None:
    resp = client.post("/api/characters", json={"name": "Me", "traits": {}, "face_upload": face_upload})
    assert resp.status_code == 422
    assert client.get("/api/characters").json() == []


def test_a_character_has_one_face_at_a_time(client: TestClient) -> None:
    me = uploaded(client)
    image = sdxl(client).json()

    from_history = client.patch(f"/api/characters/{me['id']}", json={"face_id": image["id"]}).json()
    assert (from_history["face_id"], from_history["face_uploaded"]) == (image["id"], False)
    back = client.patch(f"/api/characters/{me['id']}", json={"face_upload": photo()}).json()
    assert (back["face_id"], back["face_uploaded"]) == (None, True)
    assert client.patch(f"/api/characters/{me['id']}", json={"face_id": image["id"], "face_upload": photo()}).status_code == 422
    assert client.patch(f"/api/characters/{me['id']}", json={"face_upload": None}).json()["face_uploaded"] is False


def test_renders_lock_the_uploaded_face_with_safe_negatives(client: TestClient, server: FakeModelServer) -> None:
    me = uploaded(client)
    item = sdxl(client, character_id=me["id"], negative_prompt="lowres").json()

    sent = server.calls[-1]
    assert isinstance(sent["face_image"], str)
    assert sent["negative_prompt"].startswith("lowres, nsfw, nude, naked")
    assert (item["face_from"], item["negative_prompt"]) == (None, sent["negative_prompt"])


@pytest.mark.parametrize("prompt", ["a nude man on a beach", "1boy, explicit, uncensored", "a sensual boudoir photo"])
def test_a_sensitive_prompt_is_refused_before_rendering(client: TestClient, server: FakeModelServer, prompt: str) -> None:
    me = uploaded(client)
    resp = sdxl(client, character_id=me["id"], prompt=prompt)

    assert resp.status_code == 422
    assert "must be safe for work" in resp.json()["detail"]
    assert server.calls == []


def test_a_result_with_nudity_is_discarded_not_saved(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    me = uploaded(client)
    monkeypatch.setattr(nsfw_detector, "is_nsfw", lambda png: True)

    resp = sdxl(client, character_id=me["id"], prompt="a man in a raincoat")

    assert resp.status_code == 422
    assert "it was discarded" in resp.json()["detail"]
    assert client.get("/api/history").json()["total"] == 0


def test_nothing_is_rendered_while_the_image_check_is_not_ready(client: TestClient, server: FakeModelServer, monkeypatch: pytest.MonkeyPatch) -> None:
    me = uploaded(client)
    monkeypatch.setattr(nsfw_detector, "is_ready", lambda: False)

    resp = sdxl(client, character_id=me["id"])

    assert (resp.status_code, server.calls) == (422, [])
    assert "image check is still starting" in resp.json()["detail"]


def test_a_variation_of_a_sensitive_image_is_refused(client: TestClient, server: FakeModelServer) -> None:
    me = uploaded(client)
    nude = sdxl(client, prompt="a nude statue").json()
    server.calls.clear()

    resp = sdxl(client, character_id=me["id"], source_image_id=nude["id"], change=0.5)

    assert (resp.status_code, server.calls) == (422, [])


def test_the_rules_apply_to_every_model_but_only_to_characters_with_an_uploaded_face(client: TestClient) -> None:
    me = uploaded(client)
    ava = client.post("/api/characters", json={"name": "Ava", "traits": {}}).json()

    assert generate(client, character_id=me["id"], prompt="a nude man").status_code == 422
    assert generate(client, character_id=ava["id"], prompt="a nude woman").status_code == 200


def test_safe_negative_terms_are_added_once() -> None:
    from safe_for_work import with_safe_negative

    assert with_safe_negative("") == "nsfw, nude, naked, nudity, topless, nipples, lingerie, underwear, see-through, cleavage"
    assert with_safe_negative("lowres, NSFW, nude, blurry") == "lowres, NSFW, nude, blurry, naked, nudity, topless, nipples, lingerie, underwear, see-through, cleavage"
