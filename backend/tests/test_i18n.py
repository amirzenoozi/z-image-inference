import json
import re
import string

import pytest

import i18n

PLACEHOLDER = re.compile(r"\{(\w+)\}")


def load(code: str) -> dict[str, str]:
    return json.loads((i18n.LOCALES_DIR / f"{code}.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("code", [code for code in i18n.LANGUAGES if code != "en"])
def test_every_language_has_every_message_with_the_same_placeholders(code: str) -> None:
    english, translated = load("en"), load(code)
    assert sorted(translated) == sorted(english)
    for key, text in translated.items():
        assert text.strip(), key
        assert sorted(PLACEHOLDER.findall(text)) == sorted(PLACEHOLDER.findall(english[key])), key


def test_every_message_formats() -> None:
    for key, text in load("en").items():
        names = [field for _, field, _, _ in string.Formatter().parse(text) if field]
        assert text.format(**{name: "x" for name in names}), key


@pytest.mark.parametrize(("setting", "expected"), [("nl", "nl"), (" DE ", "de"), ("xx", "en"), ("", "en")])
def test_the_language_comes_from_app_language(monkeypatch: pytest.MonkeyPatch, setting: str, expected: str) -> None:
    monkeypatch.setenv("APP_LANGUAGE", setting)
    i18n.language.cache_clear()
    try:
        assert i18n.language() == expected
    finally:
        i18n.language.cache_clear()
