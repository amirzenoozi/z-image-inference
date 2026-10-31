import pytest
from fastapi.testclient import TestClient

import history_store
import nsfw_detector
from history_store import NewImage
from test_web_app import FakeModelServer, client, generate, model_server, png_bytes  # noqa: F401 (fixtures used by name)
from video_store import NewVideo
import video_store


def adult_content_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ADULT_CONTENT", "off")


def saved(prompt: str, sensitive: bool) -> int:
    return history_store.add(NewImage(
        png=png_bytes(), prompt=prompt, negative_prompt="", seed=1, width=64, height=64, steps=9, guidance=None,
        model="z-image-turbo", duration_seconds=1.0, sensitive=sensitive,
    )).id


def safe_check_ready(monkeypatch: pytest.MonkeyPatch, nsfw: bool = False) -> None:
    monkeypatch.setattr(nsfw_detector, "is_ready", lambda: True)
    monkeypatch.setattr(nsfw_detector, "is_nsfw", lambda png: nsfw)


# -- The catalog -------------------------------------------------------------------------------------------------------


def test_with_adult_content_on_the_catalog_has_everything_and_marks_what_is_adult(client: TestClient) -> None:
    catalog = client.get("/api/catalog").json()

    assert catalog["adult_content"] == {"available": True, "word_lock": False}
    adult_models = {model["id"] for model in catalog["models"] if model["adult"]}
    assert adult_models == {"wai-illustrious", "moss-image-nsfw", "anime-desire"}
    assert any(addon["adult"] for model in catalog["models"] for addon in model["addons"])
    assert {"glamour", "faceless", "explicit"} <= {mode["id"] for mode in catalog["builder_modes"]}


def test_with_adult_content_off_the_catalog_has_nothing_adult(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    adult_content_off(monkeypatch)
    catalog = client.get("/api/catalog").json()

    assert catalog["adult_content"]["available"] is False
    assert not [model["id"] for model in catalog["models"] if model["adult"]]
    assert not [addon["id"] for model in catalog["models"] for addon in model["addons"] if addon["adult"]]
    assert not {"glamour", "faceless", "explicit"} & {mode["id"] for mode in catalog["builder_modes"]}


# -- The hidden word -----------------------------------------------------------------------------------------------------


def test_the_hidden_word_matches_the_end_of_what_was_typed(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ADULT_UNLOCK_WORD", "peach")
    check = lambda typed: client.post("/api/adult-content/word", json={"typed": typed}).json()["match"]  # noqa: E731

    assert client.get("/api/catalog").json()["adult_content"]["word_lock"] is True
    assert check("xyzpeach") is True
    assert (check("peac"), check("peaches"), check("PEACH")) == (False, False, False)
    adult_content_off(monkeypatch)
    assert check("peach") is False


# -- History -------------------------------------------------------------------------------------------------------------


def test_sensitive_images_are_hidden_while_adult_content_is_off(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    plain, sensitive = saved("a cat", False), saved("nude", True)
    clip = video_store.add(NewVideo(image_id=plain, mp4=b"mp4", poster=png_bytes(), prompt="she undresses", seconds=2, width=64, height=64, seed=1, duration_seconds=1, sensitive=True))
    assert client.get("/api/history").json()["total"] == 2
    assert client.get("/api/history?hide_sensitive=true").json()["total"] == 1

    adult_content_off(monkeypatch)

    assert [item["id"] for item in client.get("/api/history").json()["items"]] == [plain]
    assert client.get(f"/api/history/{sensitive}/image").status_code == 404
    assert client.get(f"/api/history/{sensitive}/download").status_code == 404
    assert client.get(f"/api/history/{plain}/videos").json() == []
    assert client.get(f"/api/videos/{clip.id}/video").status_code == 404


# -- Rendering -----------------------------------------------------------------------------------------------------------


@pytest.mark.parametrize("lock", ["env", "browser"])
def test_a_locked_render_is_kept_safe(client: TestClient, model_server: FakeModelServer, monkeypatch: pytest.MonkeyPatch, lock: str) -> None:
    if lock == "env":
        adult_content_off(monkeypatch)
    safe_only = {"safe_only": lock == "browser"}
    safe_check_ready(monkeypatch)

    refused = generate(client, prompt="a nude woman", **safe_only)
    assert refused.status_code == 422 and "Adult content is locked" in refused.json()["detail"]
    assert "for adult content" in generate(client, model="wai-illustrious", width=1024, height=1024, steps=None, **safe_only).json()["detail"]
    assert model_server.calls == []

    assert generate(client, addons=["tattoo", "turbo-pussy"], **safe_only).status_code == 200
    assert model_server.calls[0]["addons"] == ["tattoo"]
    assert "nudity" in str(model_server.calls[0]["negative_prompt"])

    safe_check_ready(monkeypatch, nsfw=True)
    discarded = generate(client, **safe_only)
    assert discarded.status_code == 422 and "discarded" in discarded.json()["detail"]
    assert client.get("/api/history").json()["total"] == 1


def test_an_unlocked_render_is_not_held_back(client: TestClient, model_server: FakeModelServer) -> None:
    assert generate(client, prompt="a nude woman", addons=["turbo-pussy"]).status_code == 200
    assert model_server.calls[0]["addons"] == ["turbo-pussy"]
