import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

import model_server

from generation_request import GenerateRequest
from model_catalog import ADDONS, applied_addons, with_trigger_words

TATTOO = ADDONS["tattoo"]


@pytest.mark.parametrize(
    ("enabled", "prompt", "used"),
    [
        (["tattoo"], "a woman with a dragon tattoo on her back", True),
        (["tattoo"], "Tattooed arms, a man at the bar", True),
        (["tattoo"], "TATTOOS everywhere", True),
        (["tattoo"], "a woman on a beach at sunset", False),
        (["tattoo"], "a tattooist at work", False),
        ([], "a woman with a dragon tattoo on her back", False),
    ],
)
def test_an_addon_is_used_only_when_switched_on_and_the_prompt_asks_for_it(enabled: list[str], prompt: str, used: bool) -> None:
    assert applied_addons(enabled, prompt) == ([TATTOO] if used else [])


def test_the_trigger_phrase_is_added_only_when_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    other = type(TATTOO)(**{**TATTOO.__dict__, "trigger_word": "t4tt", "keywords": ("ink",)})
    assert with_trigger_words("a tattoo of a rose", [TATTOO]) == "a tattoo of a rose"
    assert with_trigger_words("fresh ink on the arm", [other]) == "t4tt, fresh ink on the arm"
    assert with_trigger_words("a rose", []) == "a rose"


@pytest.mark.parametrize(
    ("model", "addons", "message"),
    [
        ("z-image-turbo", ["wings"], "wings"),
        ("wai-illustrious", ["tattoo"], "tattoo"),
        ("z-image-turbo", ["tattoo", "tattoo"], "once"),
    ],
)
def test_a_request_may_only_switch_on_addons_of_its_model_once(model: str, addons: list[str], message: str) -> None:
    with pytest.raises(ValidationError, match=message):
        GenerateRequest(model=model, prompt="a tattoo", width=1024, height=1024, addons=addons)


@pytest.fixture
def renders(monkeypatch: pytest.MonkeyPatch) -> list[tuple[tuple[object, ...], object]]:
    """Renders on the model server, recorded instead of run: the add-ons each was given, and its job."""
    recorded: list[tuple[tuple[object, ...], object]] = []
    monkeypatch.setattr(model_server, "generate_png", lambda model_id, addons, job, progress: recorded.append((addons, job)) or model_server.RenderedImage(b"png", 1.0))
    monkeypatch.setattr(model_server, "model_status", lambda model_id: "ready")
    return recorded


def render(prompt: str, addons: list[str]) -> dict[str, object]:
    resp = TestClient(model_server.app).post("/generate", json={"model": "z-image-turbo", "prompt": prompt, "width": 512, "height": 512, "addons": addons})
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_a_render_uses_a_switched_on_addon_only_when_the_prompt_mentions_it(renders: list[tuple[tuple[object, ...], object]]) -> None:
    assert render("a man with tattooed arms", ["tattoo"])["addons"] == ["tattoo"]
    assert render("a man on a beach", ["tattoo"])["addons"] == []
    assert render("a man with tattooed arms", [])["addons"] == []

    assert [addons for addons, _ in renders] == [(TATTOO,), (), ()]


def test_an_addon_that_is_not_downloaded_is_explained_rather_than_skipped(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(model_server, "model_status", lambda model_id: "missing" if model_id == "tattoo" else "ready")
    resp = TestClient(model_server.app).post("/generate", json={"model": "z-image-turbo", "prompt": "a tattoo", "width": 512, "height": 512, "addons": ["tattoo"]})

    assert resp.status_code == 503
    assert "Tattoo" in resp.json()["detail"]
