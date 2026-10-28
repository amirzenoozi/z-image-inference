"""The language of the app's messages, set by APP_LANGUAGE in .env (English when unset or unknown).

Messages live in locales/<code>.json, flat keys with {placeholders}; English is the source every other language must
match, which tests/test_i18n.py checks. Prompts sent to the models are never translated: they understand English best.
"""

import json
import os
from functools import cache
from pathlib import Path

LOCALES_DIR = Path(__file__).parent / "locales"
DEFAULT_LANGUAGE = "en"
LANGUAGES = ("en", "nl", "it", "fr", "de", "es", "pt")


@cache
def language() -> str:
    code = os.environ.get("APP_LANGUAGE", DEFAULT_LANGUAGE).strip().lower()
    if code not in LANGUAGES:
        print(f"APP_LANGUAGE={code!r} is not one of {', '.join(LANGUAGES)}; using English.")
        return DEFAULT_LANGUAGE
    return code


@cache
def messages(code: str) -> dict[str, str]:
    return json.loads((LOCALES_DIR / f"{code}.json").read_text(encoding="utf-8"))


def t(key: str, **params: object) -> str:
    """The message in the app's language, falling back to English for a key a translation lacks."""
    template = messages(language()).get(key) or messages(DEFAULT_LANGUAGE)[key]
    return template.format(**params)
