import pytest

import i18n
import main
import nsfw_detector


@pytest.fixture(autouse=True)
def no_image_check(monkeypatch: pytest.MonkeyPatch) -> None:
    """Tests never download or run the real classifier; the image check is off unless a test fakes it."""
    monkeypatch.setattr(main, "start_image_checks", lambda: None)
    monkeypatch.setattr(nsfw_detector, "is_nsfw", lambda png: None)


@pytest.fixture(autouse=True)
def english(monkeypatch: pytest.MonkeyPatch) -> None:
    """Tests check English messages, whatever APP_LANGUAGE your .env sets."""
    monkeypatch.delenv("APP_LANGUAGE", raising=False)
    i18n.language.cache_clear()
