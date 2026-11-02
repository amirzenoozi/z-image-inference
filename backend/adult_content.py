"""The first of adult content's two locks: ADULT_CONTENT in .env, enforced here for every caller.

Off (the default), the web app leaves the 18+ purposes, the adult models and add-ons and the sensitive History
images out of everything it serves, and keeps every render safe for work. On, the browser adds its own lock on top:
the hidden word in ADULT_UNLOCK_WORD, typed in the app, shows or hides the content in that browser.
"""
import hmac
import os


def enabled() -> bool:
    return os.environ.get("ADULT_CONTENT", "").strip().lower() == "on"


def unlock_word() -> str:
    return os.environ.get("ADULT_UNLOCK_WORD", "").strip()


def ends_with_unlock_word(typed: str) -> bool:
    """Whether the keys typed end with the hidden word; the browser sends what was typed, so the word never reaches it."""
    word = unlock_word()
    if not enabled() or not word:
        return False
    return hmac.compare_digest(typed[-len(word):].encode(), word.encode())


def hidden(sensitive: bool) -> bool:
    """A sensitive image or prompt is never served while adult content is off."""
    return sensitive and not enabled()
