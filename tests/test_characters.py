from collections.abc import Iterator
from pathlib import Path

import pytest
import requests
from fastapi.testclient import TestClient

import history_store
import main
from test_web_app import FakeModelServer, generate

AVA = {"name": "Ava", "traits": {"who": "woman", "age": "late 20s", "hairColor": "auburn", "tattoos": ["wrist tattoo"]}}


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setattr(history_store, "DB_PATH", tmp_path / "history.db")
    monkeypatch.setattr(main.requests, "post", FakeModelServer().post)
    with TestClient(main.app) as test_client:
        yield test_client


def create(client: TestClient, **overrides: object) -> requests.Response:
    return client.post("/api/characters", json={**AVA, **overrides})


def test_a_character_is_listed_with_its_traits(client: TestClient) -> None:
    created = create(client).json()

    assert create(client, name=" Bea ").status_code == 201
    listed = client.get("/api/characters").json()

    assert [character["name"] for character in listed] == ["Ava", "Bea"]
    assert listed[0] == created
    assert created["traits"]["hairColor"] == "auburn"
    assert created["traits"]["tattoos"] == ["wrist tattoo"]
    assert (created["cover_id"], created["seed"], created["image_count"]) == (None, None, 0)


@pytest.mark.parametrize(
    "overrides",
    [{"name": ""}, {"name": "x" * 41}, {"traits": {"wings": "yes"}}, {"seed": -1}, {"cover_id": 99}],
)
def test_a_character_with_bad_details_is_refused(client: TestClient, overrides: dict[str, object]) -> None:
    assert create(client, **overrides).status_code == 422
    assert client.get("/api/characters").json() == []


def test_names_are_unique_ignoring_case(client: TestClient) -> None:
    create(client)
    bea = create(client, name="Bea").json()

    assert create(client, name="ava").status_code == 409
    assert client.patch(f"/api/characters/{bea['id']}", json={"name": "AVA"}).status_code == 409


def test_images_made_for_a_character_are_linked_counted_and_filtered(client: TestClient) -> None:
    ava = create(client).json()
    linked = generate(client, character_id=ava["id"]).json()
    generate(client)

    assert linked["character_id"] == ava["id"]
    [listed] = client.get("/api/characters").json()
    assert (listed["image_count"], listed["cover_id"]) == (1, linked["id"])
    assert [item["id"] for item in client.get(f"/api/history?character={ava['id']}").json()["items"]] == [linked["id"]]


def test_generating_for_a_missing_character_is_refused_before_rendering(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    server = FakeModelServer()
    monkeypatch.setattr(main.requests, "post", server.post)

    assert generate(client, character_id=7).status_code == 404
    assert server.calls == []


def test_the_character_is_not_sent_to_the_model_server(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    server = FakeModelServer()
    monkeypatch.setattr(main.requests, "post", server.post)
    ava = create(client).json()

    generate(client, character_id=ava["id"])

    assert "character_id" not in server.calls[-1]


def test_an_edited_copy_keeps_the_character(client: TestClient) -> None:
    ava = create(client).json()
    item = generate(client, character_id=ava["id"]).json()
    recipe = {"quarter_turns": 1, "flip_horizontal": False, "flip_vertical": False, "crop": None}

    assert client.post(f"/api/history/{item['id']}/edits", json=recipe).json()["character_id"] == ava["id"]


def test_updating_changes_only_what_is_sent(client: TestClient) -> None:
    ava = create(client, seed=42).json()
    cover = generate(client).json()

    renamed = client.patch(f"/api/characters/{ava['id']}", json={"name": "Ava Rose", "cover_id": cover["id"]}).json()
    assert (renamed["name"], renamed["seed"], renamed["cover_id"], renamed["traits"]) == ("Ava Rose", 42, cover["id"], ava["traits"])

    cleared = client.patch(f"/api/characters/{ava['id']}", json={"seed": None, "traits": {"who": "woman", "age": "30s"}}).json()
    assert (cleared["seed"], cleared["traits"]["age"], cleared["traits"]["hairColor"]) == (None, "30s", "")
    assert client.patch("/api/characters/99", json={"name": "Nobody"}).status_code == 404


def test_a_deleted_cover_falls_back_to_the_newest_image(client: TestClient) -> None:
    ava = create(client).json()
    first = generate(client, character_id=ava["id"]).json()
    cover = generate(client).json()
    client.patch(f"/api/characters/{ava['id']}", json={"cover_id": cover["id"]})

    client.delete(f"/api/history/{cover['id']}")

    assert client.get("/api/characters").json()[0]["cover_id"] == first["id"]


def test_deleting_a_character_keeps_its_images(client: TestClient) -> None:
    ava = create(client).json()
    item = generate(client, character_id=ava["id"]).json()

    assert client.delete(f"/api/characters/{ava['id']}").status_code == 204
    assert client.delete(f"/api/characters/{ava['id']}").status_code == 404

    [kept] = client.get("/api/history").json()["items"]
    assert (kept["id"], kept["character_id"]) == (item["id"], None)
