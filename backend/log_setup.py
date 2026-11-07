"""One log setup for both servers: timestamped lines on the terminal and in a rotating file in logs/.

Logs never hold prompt text, character names, images, tokens or the unlock word: only ids, settings and timings.
"""

import logging
import os
from logging.handlers import RotatingFileHandler

from paths import PROJECT_DIR

LOGS_DIR = PROJECT_DIR / "logs"
LEVELS = ("DEBUG", "INFO", "WARNING", "ERROR")
DEFAULT_LEVEL = "INFO"
LINE_FORMAT = "%(asctime)s %(levelname)-7s %(name)s: %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"
MAX_FILE_BYTES = 5_000_000
OLD_FILES_KEPT = 3


def configure(server: str) -> None:
    """Sends every log line, Uvicorn's included (run it with log_config=None), to the terminal and logs/<server>.log."""
    requested = os.environ.get("LOG_LEVEL", DEFAULT_LEVEL).strip().upper()
    level = requested if requested in LEVELS else DEFAULT_LEVEL
    LOGS_DIR.mkdir(exist_ok=True)
    log_file = RotatingFileHandler(LOGS_DIR / f"{server}.log", maxBytes=MAX_FILE_BYTES, backupCount=OLD_FILES_KEPT, encoding="utf-8")
    handlers: list[logging.Handler] = [logging.StreamHandler(), log_file]
    formatter = logging.Formatter(LINE_FORMAT, DATE_FORMAT)
    for handler in handlers:
        handler.setFormatter(formatter)
    logging.basicConfig(level=level, handlers=handlers, force=True)
    if requested != level:
        logging.getLogger(__name__).warning("LOG_LEVEL=%r is not one of %s; using %s.", requested, ", ".join(LEVELS), DEFAULT_LEVEL)
