import io
from json import dumps
import base64
import sqlite3
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path

import pytest
import requests
from fastapi.testclient import TestClient
from PIL import Image

import history_store
import main


def png_bytes(width: int = 64, height: int = 64) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), "red").save(buffer, format="PNG")
    return buffer.getvalue()


@dataclass
class FakeModelServer:
    """Stands in for requests.post to the model server."""

    status: int = 200
    body: dict[str, object] | None = None
    error: Exception | None = None
    calls: list[dict[str, object]] = field(default_factory=list)

    def post(self, url: str, json: dict[str, object], timeout: float) -> requests.Response:
        self.calls.append(json)
        if self.error:
            raise self.error
        resp = requests.Response()
        resp.status_code = self.status
        body = self.body if self.body is not None else {
            "image_base64": base64.b64encode(png_bytes()).decode(), "seed": 1234, "model": json["model"],
        }
        resp._content = dumps(body).encode()
        return resp


@dataclass
class FakeGrok:
    available: bool = True
    chunks: list[str] = field(default_factory=lambda: ["A detailed ", "prompt"])
    error: Exception | None = None
    received: list[list[dict[str, str]]] = field(default_factory=list)

    def chat_stream(self, messages: list[dict[str, str]]) -> Iterator[str]:
        self.received.append(messages)
        if self.error:
            raise self.error
        yield from self.chunks


@pytest.fixture
def model_server(monkeypatch: pytest.MonkeyPatch) -> FakeModelServer:
    server = FakeModelServer()
    monkeypatch.setattr(main.requests, "post", server.post)
    return server


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setattr(history_store, "DB_PATH", tmp_path / "history.db")
    with TestClient(main.app) as test_client:
        yield test_client


def generate(client: TestClient, **overrides: object) -> requests.Response:
    body: dict[str, object] = {"model": "z-image-turbo", "prompt": "a cat", "width": 512, "height": 512, "steps": 9}
    return client.post("/api/generate", json={**body, **overrides})


def test_catalog_lists_models_resolutions_and_limits(client: TestClient) -> None:
    data = client.get("/api/catalog").json()
    assert [model["id"] for model in data["models"]] == ["z-image-turbo", "wai-illustrious", "moss-image-nsfw"]
    assert len(data["resolutions"]) == 28
    assert data["categories"] == ["square", "portrait", "landscape", "widescreen"]
    assert {r["category"] for r in data["resolutions"]} == set(data["categories"])
    assert data["limits"]["side_step"] == 16
    assert {model["id"]: model["prompt_style"] for model in data["models"]}["wai-illustrious"] == "tags"


def test_generate_rejects_invalid_settings_without_calling_the_model_server(
    client: TestClient, model_server: FakeModelServer
) -> None:
    assert generate(client, steps=30).status_code == 422
    assert generate(client, model="wai-illustrious", width=1536, height=1024).status_code == 422
    assert generate(client, width=500).status_code == 422
    assert generate(client, prompt="").status_code == 422
    assert model_server.calls == []


def test_generate_saves_to_history_and_serves_the_image(client: TestClient, model_server: FakeModelServer) -> None:
    item = generate(client).json()

    assert item["seed"] == 1234
    assert item["guidance"] is None
    assert client.get("/api/history").json()["items"] == [item]
    full = client.get(f"/api/history/{item['id']}/image")
    assert full.headers["content-type"] == "image/png"
    assert full.content == png_bytes()
    thumb = client.get(f"/api/history/{item['id']}/image?thumb=true")
    assert thumb.headers["content-type"] == "image/webp"


def test_generate_stores_the_model_default_guidance(client: TestClient, model_server: FakeModelServer) -> None:
    item = generate(client, model="wai-illustrious", width=1024, height=1024, steps=None).json()
    assert item["guidance"] == 7.0
    assert item["steps"] == 28


def test_generate_reports_a_stopped_model_server(client: TestClient, model_server: FakeModelServer) -> None:
    model_server.error = requests.ConnectionError()
    resp = generate(client)
    assert resp.status_code == 503
    assert "model_server.py" in resp.json()["detail"]
    assert client.get("/api/history").json()["total"] == 0


def test_generate_passes_on_the_model_server_validation_message(
    client: TestClient, model_server: FakeModelServer
) -> None:
    model_server.status = 422
    model_server.body = {"detail": [{"msg": "Value error, steps must be between 1 and 20"}]}
    resp = generate(client)
    assert resp.status_code == 422
    assert resp.json()["detail"] == "Value error, steps must be between 1 and 20"


def test_history_pages_newest_first(client: TestClient, model_server: FakeModelServer) -> None:
    ids = [generate(client, prompt=f"image {n}").json()["id"] for n in range(3)]

    first = client.get("/api/history?offset=0&limit=2").json()
    second = client.get("/api/history?offset=2&limit=2").json()

    assert [item["id"] for item in first["items"]] == ids[::-1][:2]
    assert [item["id"] for item in second["items"]] == ids[:1]
    assert first["total"] == 3
    assert client.get("/api/history?limit=1000").status_code == 422


def test_delete_and_clear_history(client: TestClient, model_server: FakeModelServer) -> None:
    first, second = (generate(client).json()["id"] for _ in range(2))

    assert client.delete(f"/api/history/{first}").status_code == 204
    assert client.delete(f"/api/history/{first}").status_code == 404
    assert client.get(f"/api/history/{first}/image").status_code == 404
    assert [item["id"] for item in client.get("/api/history").json()["items"]] == [second]

    assert client.delete("/api/history").status_code == 204
    assert client.get("/api/history").json() == {"items": [], "total": 0}


def test_old_history_rows_gain_the_new_columns(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    db = tmp_path / "old.db"
    with sqlite3.connect(db) as conn:
        conn.execute("""CREATE TABLE images (id INTEGER PRIMARY KEY AUTOINCREMENT, image_data BLOB NOT NULL,
            prompt TEXT, seed INTEGER, width INTEGER, height INTEGER, steps INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
        conn.execute("INSERT INTO images (image_data, prompt, seed, width, height, steps) VALUES (x'00', 'old', 1, 512, 512, 8)")
    monkeypatch.setattr(history_store, "DB_PATH", db)

    history_store.init_db()

    [item], total = history_store.page(0, 10)
    assert (item.model, item.negative_prompt, item.guidance, total) == ("z-image-turbo", "", None, 1)


def test_chat_streams_the_rewritten_prompt(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    grok = FakeGrok()
    monkeypatch.setattr(main, "grok_client", grok)

    resp = client.post("/api/chat", json={"messages": [{"role": "user", "content": "a cat"}]})

    assert resp.status_code == 200
    assert resp.text == "A detailed prompt"
    assert grok.received == [[{"role": "user", "content": "a cat"}]]


def test_chat_errors(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    grok = FakeGrok(available=False)
    monkeypatch.setattr(main, "grok_client", grok)
    user_message = {"messages": [{"role": "user", "content": "a cat"}]}
    assert client.post("/api/chat", json=user_message).status_code == 503

    grok.available, grok.error = True, ValueError("bad key")
    resp = client.post("/api/chat", json=user_message)
    assert resp.status_code == 502
    assert "bad key" in resp.json()["detail"]

    ends_with_assistant = {"messages": [{"role": "user", "content": "a"}, {"role": "assistant", "content": "b"}]}
    assert client.post("/api/chat", json=ends_with_assistant).status_code == 422


def test_generate_passes_on_that_a_model_is_still_downloading(client: TestClient, model_server: FakeModelServer) -> None:
    model_server.status = 503
    model_server.body = {"detail": "MOSS-Image NSFW is downloading for first use (about 26 GB)."}
    resp = generate(client)
    assert resp.status_code == 503
    assert resp.json()["detail"] == "MOSS-Image NSFW is downloading for first use (about 26 GB)."


def test_model_status_reports_the_model_server(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def running(url: str, timeout: float) -> requests.Response:
        resp = requests.Response()
        resp.status_code = 200
        resp._content = dumps({"z-image-turbo": "ready", "moss-image-nsfw": "downloading"}).encode()
        return resp

    monkeypatch.setattr(main.requests, "get", running)
    assert client.get("/api/models/status").json() == {
        "server_running": True, "models": {"z-image-turbo": "ready", "moss-image-nsfw": "downloading"},
    }

    def stopped(url: str, timeout: float) -> requests.Response:
        raise requests.ConnectionError()

    monkeypatch.setattr(main.requests, "get", stopped)
    assert client.get("/api/models/status").json() == {"server_running": False, "models": {}}
