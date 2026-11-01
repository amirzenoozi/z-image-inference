import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import custom_clothes
from test_web_app import client  # noqa: F401 (fixture used by name)

DRESS = {
    "value": "Lace keyhole mini dress", "title": {"en": "Lace keyhole mini dress", "nl": "Kanten minijurk"}, "prompt": "sleeveless lace mini dress",
    "slot": "top", "covers": "both", "group": "Dresses", "for": "woman",
}


@pytest.fixture
def clothes_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    path = tmp_path / "custom_clothes.json"
    monkeypatch.setattr(custom_clothes, "CUSTOM_CLOTHES_FILE", path)
    return lambda content: path.write_text(content if isinstance(content, str) else json.dumps(content))


def served(client: TestClient) -> tuple[list[dict[str, object]], list[str]]:
    catalog = client.get("/api/catalog").json()
    return catalog["custom_clothes"], catalog["custom_clothes_problems"]


def test_no_file_means_no_custom_clothes(client: TestClient, clothes_file) -> None:
    assert served(client) == ([], [])


def test_the_shipped_file_is_valid() -> None:
    assert custom_clothes.load().problems == []


def test_each_entry_is_served_with_its_defaults(client: TestClient, clothes_file) -> None:
    clothes_file([DRESS])
    items, problems = served(client)
    assert problems == []
    assert items == [{**DRESS, "tags": "", "adult": False}]


@pytest.mark.parametrize(
    ("entry", "reason"),
    [
        ({**DRESS, "slot": "shoes"}, "only for an item in the top slot"),
        ({**DRESS, "covers": None, "slot": "shoes", "adult": True}, "Only a top, bottom or accessory can be adult"),
        ({**DRESS, "colour": "red"}, "colour"),
        ({key: value for key, value in DRESS.items() if key != "prompt"}, "prompt"),
    ],
)
def test_a_broken_entry_is_left_out_and_named(client: TestClient, clothes_file, entry: dict[str, object], reason: str) -> None:
    clothes_file([entry, {**DRESS, "value": "Second dress"}])
    items, problems = served(client)
    assert [item["value"] for item in items] == ["Second dress"]
    assert len(problems) == 1 and "entry 1" in problems[0] and reason in problems[0]


def test_a_repeated_value_or_a_broken_file_is_named(client: TestClient, clothes_file) -> None:
    clothes_file([DRESS, {**DRESS, "value": "lace keyhole MINI dress"}])
    items, problems = served(client)
    assert len(items) == 1 and "more than once" in problems[0]
    clothes_file("[{ not json")
    assert served(client)[0] == [] and "can't be read" in served(client)[1][0]
    clothes_file({"value": "x"})
    assert "must be a list" in served(client)[1][0]


def test_adult_clothes_are_left_out_while_adult_content_is_off(client: TestClient, clothes_file, monkeypatch: pytest.MonkeyPatch) -> None:
    clothes_file([DRESS, {**DRESS, "value": "Satin teddy", "adult": True}])
    assert [item["value"] for item in served(client)[0]] == ["Lace keyhole mini dress", "Satin teddy"]
    monkeypatch.setenv("ADULT_CONTENT", "off")
    assert [item["value"] for item in served(client)[0]] == ["Lace keyhole mini dress"]
