import pytest

import main
import nsfw_detector


@pytest.fixture(autouse=True)
def no_image_check(monkeypatch: pytest.MonkeyPatch) -> None:
    """Tests never download or run the real classifier; the image check is off unless a test fakes it."""
    monkeypatch.setattr(main, "start_image_checks", lambda: None)
    monkeypatch.setattr(nsfw_detector, "is_nsfw", lambda png: None)
