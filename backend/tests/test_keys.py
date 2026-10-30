import pytest

import model_server
from grok_client import GrokClient
from paths import PROJECT_DIR


@pytest.mark.parametrize("value", ["", "   "])
def test_an_empty_key_counts_as_missing(monkeypatch: pytest.MonkeyPatch, value: str) -> None:
    """`.env.example` leaves keys empty, so an untouched copy must switch nothing on."""
    monkeypatch.setenv("XAI_API_KEY", value)
    monkeypatch.setenv("CIVITAI_TOKEN", value)
    monkeypatch.setattr(model_server, "is_downloaded", lambda model_id: model_id == "z-image-turbo")

    assert GrokClient().available is False
    assert "CIVITAI_TOKEN" in (model_server.download_problem("tattoo") or "")


def test_the_env_template_leaves_every_key_empty() -> None:
    lines = (PROJECT_DIR / ".env.example").read_text().splitlines()
    keys = {line.split("=", 1)[0]: line.split("=", 1)[1] for line in lines if "=" in line and not line.startswith("#")}
    assert {keys["XAI_API_KEY"], keys["HF_TOKEN"], keys["CIVITAI_TOKEN"]} == {""}
