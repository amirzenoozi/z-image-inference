import logging
from collections.abc import Iterator
from pathlib import Path

import pytest

import log_setup


@pytest.fixture
def logs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Path]:
    """configure() replaces the root logger's handlers, pytest's own included, so they are put back afterwards."""
    root = logging.getLogger()
    handlers, level = root.handlers[:], root.level
    monkeypatch.setattr(log_setup, "LOGS_DIR", tmp_path / "logs")
    yield tmp_path / "logs"
    for handler in root.handlers:
        handler.close()
    root.handlers[:] = handlers
    root.setLevel(level)


def test_lines_go_to_the_servers_log_file_with_a_timestamp_and_level(logs: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("LOG_LEVEL", raising=False)
    log_setup.configure("web_app")
    logging.getLogger("web_app").info("Saved image #7")
    logging.getLogger("web_app").debug("not at INFO")

    line, = (logs / "web_app.log").read_text().splitlines()
    assert line.endswith("INFO    web_app: Saved image #7")
    assert line[:4].isdigit()


def test_log_level_is_read_from_the_environment(logs: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LOG_LEVEL", " debug ")
    log_setup.configure("model_server")
    assert logging.getLogger().level == logging.DEBUG


def test_an_unknown_log_level_falls_back_to_info_and_says_so(logs: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LOG_LEVEL", "loud")
    log_setup.configure("model_server")
    assert logging.getLogger().level == logging.INFO
    assert "LOG_LEVEL='LOUD' is not one of DEBUG, INFO, WARNING, ERROR; using INFO." in (logs / "model_server.log").read_text()
