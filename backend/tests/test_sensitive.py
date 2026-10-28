import sqlite3
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import history_store
import main
import nsfw_detector
from sensitive import is_sensitive
from test_characters import use_samples
from test_web_app import FakeModelServer, generate


@pytest.mark.parametrize(
    "prompt",
    ["An explicit adult photograph of a woman", "1girl, solo, (completely nude:1.3)", "A sensual glamour photograph", "wearing LINGERIE", "topless on the beach"],
)
def test_nudity_and_sexual_words_mark_a_prompt(prompt: str) -> None:
    assert is_sensitive(prompt)


@pytest.mark.parametrize("prompt", ["A red fox in the snow", "explicitly labelled jars in a kitchen", "a pub in Sussex", "a woman in a raincoat"])
def test_everyday_prompts_are_not_marked(prompt: str) -> None:
    assert not is_sensitive(prompt)


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setattr(history_store, "DB_PATH", tmp_path / "history.db")
    monkeypatch.setattr(main.requests, "post", FakeModelServer().post)
    use_samples(tmp_path, monkeypatch, [])
    with TestClient(main.app) as test_client:
        yield test_client


def test_new_images_are_marked_from_their_prompt_and_can_be_changed_by_hand(client: TestClient) -> None:
    nude = generate(client, prompt="a nude woman on a bed").json()
    fox = generate(client, prompt="a red fox").json()
    assert (nude["sensitive"], fox["sensitive"]) == (True, False)

    assert client.put(f"/api/history/{fox['id']}/sensitive", json={"sensitive": True}).json()["sensitive"] is True
    assert client.put(f"/api/history/{nude['id']}/sensitive", json={"sensitive": False}).json()["sensitive"] is False
    assert [item["sensitive"] for item in client.get("/api/history").json()["items"]] == [True, False]
    assert client.put("/api/history/999/sensitive", json={"sensitive": True}).status_code == 404


def test_an_edited_copy_keeps_the_flag_set_by_hand(client: TestClient) -> None:
    fox = generate(client, prompt="a red fox").json()
    client.put(f"/api/history/{fox['id']}/sensitive", json={"sensitive": True})
    recipe = {"quarter_turns": 1, "flip_horizontal": False, "flip_vertical": False, "crop": None}

    assert client.post(f"/api/history/{fox['id']}/edits", json=recipe).json()["sensitive"] is True


def test_a_character_card_knows_when_its_cover_or_face_is_sensitive(client: TestClient) -> None:
    nude = generate(client, prompt="a nude woman").json()
    fox = generate(client, prompt="a red fox").json()
    ava = client.post("/api/characters", json={"name": "Ava", "traits": {}, "cover_id": nude["id"], "face_id": fox["id"]}).json()

    assert (ava["cover_sensitive"], ava["face_sensitive"]) == (True, False)


def test_images_from_before_the_flag_are_checked_once_on_start(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    db = tmp_path / "history.db"
    with sqlite3.connect(db) as conn:
        conn.execute("CREATE TABLE images (id INTEGER PRIMARY KEY AUTOINCREMENT, image_data BLOB NOT NULL, prompt TEXT, seed INTEGER, "
                     "width INTEGER, height INTEGER, steps INTEGER, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
        conn.executemany("INSERT INTO images (image_data, prompt, seed, width, height, steps) VALUES (x'00', ?, 1, 512, 512, 9)", [("a naked man",), ("a cat",)])
    monkeypatch.setattr(history_store, "DB_PATH", db)

    history_store.init_db()
    history_store.set_sensitive(2, True)
    history_store.init_db()

    assert [item.sensitive for item in history_store.page(0, 10)[0]] == [True, True]


def test_a_new_image_the_classifier_finds_nsfw_is_marked_whatever_its_prompt(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(nsfw_detector, "is_nsfw", lambda png: True)
    assert generate(client, prompt="a girl under the rain").json()["sensitive"] is True

    monkeypatch.setattr(nsfw_detector, "is_nsfw", lambda png: False)
    assert generate(client, prompt="a red fox").json()["sensitive"] is False
    assert generate(client, prompt="a nude woman").json()["sensitive"] is True


def test_images_saved_before_the_check_was_ready_are_checked_in_the_background(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    rain = generate(client, prompt="a girl under the rain").json()
    fox = generate(client, prompt="a red fox").json()
    hand = generate(client, prompt="a nude statue").json()
    client.put(f"/api/history/{hand['id']}/sensitive", json={"sensitive": False})
    assert rain["sensitive"] is False

    monkeypatch.setattr(nsfw_detector, "load", lambda: None)
    monkeypatch.setattr(nsfw_detector, "is_nsfw", lambda png: True)
    flagged = {rain["id"]}
    monkeypatch.setattr(main, "image_is_nsfw", lambda item_id: item_id in flagged)
    main.check_unchecked_images()

    items = {item["id"]: item["sensitive"] for item in client.get("/api/history").json()["items"]}
    assert items == {rain["id"]: True, fox["id"]: False, hand["id"]: False}
    assert history_store.unchecked_image_ids(10) == []


def test_a_check_that_cannot_start_leaves_the_prompt_words_in_charge(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    generate(client, prompt="a red fox")

    def broken() -> None:
        raise OSError("no network")

    monkeypatch.setattr(nsfw_detector, "load", broken)
    main.check_unchecked_images()

    assert len(history_store.unchecked_image_ids(10)) == 1
