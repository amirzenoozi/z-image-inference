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
            "image_base64": base64.b64encode(png_bytes()).decode(), "seed": 1234, "model": json["model"], "seconds": 52.3,
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
    assert [model["id"] for model in data["models"]] == ["z-image-turbo", "wai-illustrious", "moss-image-nsfw", "anime-desire"]
    assert len(data["resolutions"]) == 28
    assert data["categories"] == ["square", "portrait", "landscape", "widescreen"]
    assert {r["category"] for r in data["resolutions"]} == set(data["categories"])
    assert data["limits"]["side_step"] == 16
    assert {model["id"]: model["prompt_style"] for model in data["models"]}["wai-illustrious"] == "tags"
    assert data["models"][0]["repo_id"] == "Tongyi-MAI/Z-Image-Turbo"
    category_ids = [category["id"] for category in data["model_categories"]]
    assert category_ids == ["photo", "anime"]
    assert {model["category"] for model in data["models"]} == set(category_ids)


def test_catalog_gives_each_model_its_examples_from_the_examples_file(client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    examples = tmp_path / "example_prompts.json"
    examples.write_text(dumps({"z-image-turbo": ["  A red fox in the snow  "], "wai-illustrious": ["1girl, adult woman, kimono"]}))
    monkeypatch.setattr(main, "EXAMPLE_PROMPTS_FILE", examples)

    models = {model["id"]: model["examples"] for model in client.get("/api/catalog").json()["models"]}

    assert models["z-image-turbo"] == ["A red fox in the snow"]
    assert models["wai-illustrious"] == ["1girl, adult woman, kimono"]
    assert models["moss-image-nsfw"] == []


def test_the_shipped_examples_file_is_valid() -> None:
    examples = main.example_prompts()
    assert set(examples) == set(main.MODELS)
    assert all(examples.values())


@pytest.mark.parametrize("content", [{"no-such-model": ["a cat"]}, {"z-image-turbo": [""]}, {"z-image-turbo": ["x" * 5000]}])
def test_a_broken_examples_file_is_refused(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, content: dict[str, list[str]]) -> None:
    examples = tmp_path / "example_prompts.json"
    examples.write_text(dumps(content))
    monkeypatch.setattr(main, "EXAMPLE_PROMPTS_FILE", examples)

    with pytest.raises(ValueError):
        main.example_prompts()


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
    assert item["duration_seconds"] == 52.3
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
    assert (item.model, item.negative_prompt, item.guidance, item.duration_seconds, total) == ("z-image-turbo", "", None, None, 1)


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


def test_generate_passes_on_that_a_model_is_not_ready(client: TestClient, model_server: FakeModelServer) -> None:
    model_server.status = 503
    model_server.body = {"detail": "MOSS-Image NSFW is not downloaded. Download it from the model list first."}
    resp = generate(client)
    assert resp.status_code == 503
    assert resp.json()["detail"] == "MOSS-Image NSFW is not downloaded. Download it from the model list first."


def fake_response(status: int, body: object) -> requests.Response:
    resp = requests.Response()
    resp.status_code = status
    resp._content = dumps(body).encode()
    return resp


def test_model_status_reports_the_model_server(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    report = {"models": {"z-image-turbo": {"status": "ready", "size_bytes": 5}}, "free_bytes": 99}
    monkeypatch.setattr(main.requests, "get", lambda url, timeout: fake_response(200, report))
    assert client.get("/api/models/status").json() == {"server_running": True, **report}

    def stopped(url: str, timeout: float) -> requests.Response:
        raise requests.ConnectionError()

    monkeypatch.setattr(main.requests, "get", stopped)
    assert client.get("/api/models/status").json() == {"server_running": False, "models": {}, "free_bytes": None}


def test_model_actions_are_forwarded_with_the_model_servers_answer(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, str]] = []

    def model_server_says(status: int, body: object):
        def call(method: str, url: str, timeout: float) -> requests.Response:
            calls.append((method, url))
            return fake_response(status, body)
        return call

    monkeypatch.setattr(main.requests, "request", model_server_says(200, {"status": "queued", "size_bytes": 0}))
    assert client.post("/api/models/wai-illustrious/download").json() == {"status": "queued", "size_bytes": 0}
    assert calls[-1] == ("POST", "http://127.0.0.1:8000/models/wai-illustrious/download")

    monkeypatch.setattr(main.requests, "request", model_server_says(507, {"detail": "Not enough disk space: free about 2.0 GB more, then try again."}))
    resp = client.post("/api/models/wai-illustrious/download")
    assert (resp.status_code, resp.json()["detail"]) == (507, "Not enough disk space: free about 2.0 GB more, then try again.")

    monkeypatch.setattr(main.requests, "request", model_server_says(204, None))
    assert client.delete("/api/models/wai-illustrious").status_code == 204
    assert calls[-1] == ("DELETE", "http://127.0.0.1:8000/models/wai-illustrious")


def test_model_actions_reject_unknown_models_before_calling_the_server(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main.requests, "request", lambda *args, **kwargs: pytest.fail("must not reach the model server"))
    assert client.post("/api/models/not-a-model/download").status_code == 404
    assert client.delete("/api/models/not-a-model").status_code == 404


JOB = "11111111-2222-4333-8444-555555555555"


def test_job_progress_and_cancel_are_forwarded(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, str]] = []

    def model_server_says(status: int, body: object):
        def call(method: str, url: str, timeout: float) -> requests.Response:
            calls.append((method, url))
            return fake_response(status, body)
        return call

    monkeypatch.setattr(main.requests, "request", model_server_says(200, {"phase": "generating", "step": 4, "total": 9}))
    assert client.get(f"/api/jobs/{JOB}/progress").json() == {"phase": "generating", "step": 4, "total": 9}
    assert calls[-1] == ("GET", f"http://127.0.0.1:8000/jobs/{JOB}")

    monkeypatch.setattr(main.requests, "request", model_server_says(204, None))
    assert client.post(f"/api/jobs/{JOB}/cancel").status_code == 204
    assert calls[-1] == ("POST", f"http://127.0.0.1:8000/jobs/{JOB}/cancel")

    monkeypatch.setattr(main.requests, "request", model_server_says(404, {"detail": "No such job; it may have finished"}))
    assert client.get(f"/api/jobs/{JOB}/progress").status_code == 404


def test_job_ids_are_checked_before_calling_the_server(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main.requests, "request", lambda *args, **kwargs: pytest.fail("must not reach the model server"))
    assert client.get("/api/jobs/not-a-job/progress").status_code == 422
    assert client.post("/api/jobs/not-a-job/cancel").status_code == 422


def test_a_cancelled_generation_is_reported_as_cancelled(client: TestClient, model_server: FakeModelServer) -> None:
    model_server.status, model_server.body = 409, {"detail": "Cancelled"}

    resp = generate(client, job_id=JOB)

    assert (resp.status_code, resp.json()["detail"]) == (409, "Cancelled")
    assert model_server.calls[-1]["job_id"] == JOB
    assert client.get("/api/history").json()["total"] == 0


def backdate(item_id: int, days: int) -> None:
    with sqlite3.connect(history_store.DB_PATH) as conn:
        conn.execute("UPDATE images SET created_at = datetime('now', ?) WHERE id = ?", (f"-{days} days", item_id))


def test_history_summary_counts_images_by_age(client: TestClient, model_server: FakeModelServer) -> None:
    ids = [generate(client).json()["id"] for _ in range(3)]
    backdate(ids[0], 40)
    backdate(ids[1], 100)

    data = client.get("/api/history/summary").json()

    assert data["total"] == 3
    assert data["bytes"] == history_store.DB_PATH.stat().st_size
    assert data["older_than"] == [{"days": 7, "count": 2}, {"days": 30, "count": 2}, {"days": 90, "count": 1}]


def test_cleaning_up_deletes_only_older_images_and_shrinks_the_file(client: TestClient, model_server: FakeModelServer) -> None:
    model_server.body = {"image_base64": base64.b64encode(png_bytes(512, 512)).decode(), "seed": 1, "model": "z-image-turbo", "seconds": 1.0}
    ids = [generate(client).json()["id"] for _ in range(20)]
    for item_id in ids[:19]:
        backdate(item_id, 40)
    size_before = history_store.DB_PATH.stat().st_size

    resp = client.delete("/api/history/older-than/30")

    assert resp.json() == {"deleted": 19}
    assert [item["id"] for item in client.get("/api/history").json()["items"]] == [ids[-1]]
    assert history_store.DB_PATH.stat().st_size < size_before


def test_cleaning_up_accepts_only_the_offered_ages(client: TestClient) -> None:
    assert client.delete("/api/history/older-than/0").status_code == 422
    assert client.delete("/api/history/older-than/45").status_code == 422
