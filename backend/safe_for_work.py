"""The rules for a render that must be safe for work: a character whose face is an uploaded photo, or adult content locked.

A photo can show a real person, so nothing sexual may be made with it; locked adult content (adult_content.py) allows
nothing adult either. The web app enforces this for every such render, whatever the browser sends: a prompt or start
image that is sensitive is refused, safe-for-work terms are added to the negative prompt, and a result the image check
finds nudity in is discarded, never saved. `name` is the character's for an uploaded face, None for the lock; the
messages give that reason.
"""

from sensitive import sensitive_word
from i18n import t

SAFE_NEGATIVE = "nsfw, nude, naked, nudity, topless, nipples, lingerie, underwear, see-through, cleavage"


class NotSafeForWork(ValueError):
    pass


def check_prompt(prompt: str, name: str | None) -> None:
    word = sensitive_word(prompt)
    if word:
        raise NotSafeForWork(t("sfwPrompt", name=name, word=word) if name else t("lockedPrompt", word=word))


def check_start_image(sensitive: bool, name: str | None) -> None:
    if sensitive:
        raise NotSafeForWork(t("sfwStartImage", name=name) if name else t("lockedStartImage"))


def check_image_check_ready(nsfw_check_ready: bool, name: str | None) -> None:
    if not nsfw_check_ready:
        raise NotSafeForWork(t("sfwCheckNotReady") if name else t("lockedCheckNotReady"))


def with_safe_negative(negative_prompt: str) -> str:
    """The negative prompt with each safe-for-work term it doesn't have yet, so terms already there aren't repeated."""
    terms = [term.strip() for term in negative_prompt.split(",") if term.strip()]
    present = {term.lower() for term in terms}
    return ", ".join(terms + [term for term in SAFE_NEGATIVE.split(", ") if term not in present])


def check_result(nsfw: bool | None, name: str | None) -> None:
    """None means the image could not be checked, which counts as not safe."""
    if nsfw is not False:
        raise NotSafeForWork(t("sfwDiscarded", name=name) if name else t("lockedDiscarded"))
