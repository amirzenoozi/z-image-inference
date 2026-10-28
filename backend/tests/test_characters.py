import json
import sqlite3
from collections.abc import Iterator
from pathlib import Path

import pytest
import requests
from fastapi.testclient import TestClient

import character_store
import history_store
import main
from test_web_app import FakeModelServer, generate

AVA = {"name": "Ava", "traits": {"who": "woman", "age": "late 20s", "hairColor": "auburn", "tattoos": ["wrist tattoo"]}}


def use_samples(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, samples: list[dict[str, object]]) -> None:
    path = tmp_path / "sample_characters.json"
    path.write_text(json.dumps(samples))
    monkeypatch.setattr(character_store, "SAMPLE_CHARACTERS_FILE", path)


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setattr(history_store, "DB_PATH", tmp_path / "history.db")
    # Most tests start without characters; the sample tests below use the shipped ones
    use_samples(tmp_path, monkeypatch, [])
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


def test_a_character_keeps_several_makeup_and_facial_hair_picks_and_defaults_to_none(client: TestClient) -> None:
    traits = {"who": "man", "age": "30s", "facialHair": "moustache", "facialHairMore": ["stubble"]}
    created = client.post("/api/characters", json={"name": "Kai", "traits": traits}).json()

    assert (created["traits"]["facialHair"], created["traits"]["facialHairMore"]) == ("moustache", ["stubble"])
    assert create(client).json()["traits"]["makeupMore"] == []


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


def sdxl(client: TestClient, **overrides: object) -> requests.Response:
    return generate(client, model="wai-illustrious", width=1024, height=1024, steps=28, **overrides)


def test_sdxl_renders_of_a_character_with_a_face_send_it_and_record_it(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    server = FakeModelServer()
    monkeypatch.setattr(main.requests, "post", server.post)
    face = generate(client).json()
    ava = create(client, face_id=face["id"], face_strength=0.75).json()
    assert (ava["face_id"], ava["face_strength"]) == (face["id"], 0.75)

    item = sdxl(client, character_id=ava["id"]).json()

    sent = server.calls[-1]
    assert (sent["face_strength"], isinstance(sent["face_image"], str)) == (0.75, True)
    assert item["face_from"] == face["id"]


def test_models_that_cannot_lock_a_face_render_the_character_without_it(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    server = FakeModelServer()
    monkeypatch.setattr(main.requests, "post", server.post)
    face = generate(client).json()
    ava = create(client, face_id=face["id"]).json()

    item = generate(client, character_id=ava["id"]).json()

    assert server.calls[-1]["face_image"] is None
    assert (item["character_id"], item["face_from"]) == (ava["id"], None)


def test_the_browser_cannot_send_a_face_image(client: TestClient) -> None:
    assert sdxl(client, face_image="aGVsbG8=", face_strength=0.5).status_code == 422


def test_a_deleted_face_image_ends_the_face_lock(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    server = FakeModelServer()
    monkeypatch.setattr(main.requests, "post", server.post)
    face = generate(client).json()
    ava = create(client, face_id=face["id"]).json()
    client.delete(f"/api/history/{face['id']}")

    assert client.get("/api/characters").json()[0]["face_id"] is None
    assert sdxl(client, character_id=ava["id"]).json()["face_from"] is None
    assert server.calls[-1]["face_image"] is None


def test_the_face_image_can_be_set_and_cleared(client: TestClient) -> None:
    ava = create(client).json()
    face = generate(client).json()

    assert client.patch(f"/api/characters/{ava['id']}", json={"face_id": face["id"], "face_strength": 0.4}).json()["face_strength"] == 0.4
    assert client.patch(f"/api/characters/{ava['id']}", json={"face_id": 99}).status_code == 422
    assert client.patch(f"/api/characters/{ava['id']}", json={"face_id": None}).json()["face_id"] is None
    assert client.patch(f"/api/characters/{ava['id']}", json={"face_strength": 0}).status_code == 422


def test_characters_saved_before_the_face_lock_get_its_columns(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    db = tmp_path / "history.db"
    with sqlite3.connect(db) as conn:
        conn.execute("CREATE TABLE characters (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE, "
                     "traits TEXT NOT NULL, cover_id INTEGER, seed INTEGER, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
        conn.execute("INSERT INTO characters (name, traits) VALUES ('Ava', '{}')")
    monkeypatch.setattr(history_store, "DB_PATH", db)

    history_store.init_db()

    [ava] = character_store.all_characters()
    assert (ava.name, ava.face_id, ava.face_strength) == ("Ava", None, 0.6)


def start_app() -> None:
    with TestClient(main.app):
        pass


def test_the_sample_characters_are_added_on_the_first_start_only(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(history_store, "DB_PATH", tmp_path / "history.db")
    start_app()
    names = [character.name for character in character_store.all_characters()]
    assert names == ["Amara", "Elena", "Freya", "Ivy", "Jax", "Kai", "Mei", "Nova", "Ravi", "Ruby", "Sofia", "Tank", "Zara"]

    character_store.delete(character_store.all_characters()[0].id)
    start_app()

    assert [character.name for character in character_store.all_characters()] == names[1:]


def test_a_sample_whose_name_is_taken_is_skipped(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(history_store, "DB_PATH", tmp_path / "history.db")
    use_samples(tmp_path, monkeypatch, [{"name": "Mei", "traits": {"who": "woman", "age": "late 20s"}}, {"name": "Kai", "traits": {"who": "man", "age": "mid 20s"}}])
    history_store.init_db()
    character_store.create(character_store.NewCharacter(name="mei", traits=character_store.CharacterTraits(who="woman", age="50s")))

    character_store.add_samples_once()

    characters = {character.name: character.traits.age for character in character_store.all_characters()}
    assert characters == {"Kai": "mid 20s", "mei": "50s"}


@pytest.mark.parametrize(
    "samples",
    [[{"name": "Mei", "traits": {"wings": "yes"}}], [{"name": ""}], [{"name": "Mei", "traits": {}}, {"name": "MEI", "traits": {}}]],
)
def test_a_broken_samples_file_is_refused_and_adds_nothing(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, samples: list[dict[str, object]]) -> None:
    monkeypatch.setattr(history_store, "DB_PATH", tmp_path / "history.db")
    use_samples(tmp_path, monkeypatch, samples)
    history_store.init_db()

    with pytest.raises(ValueError):
        character_store.add_samples_once()
    assert character_store.all_characters() == []
