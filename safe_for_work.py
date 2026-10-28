"""The rules for a character whose face is an uploaded photo: its images must be safe for work.

A photo can show a real person, so nothing sexual may be made with it. The web app enforces this for every render of
such a character, whatever the browser sends: a prompt or start image that is sensitive is refused, safe-for-work
terms are added to the negative prompt, and a result the image check finds nudity in is discarded, never saved.
"""

from sensitive import sensitive_word

SAFE_NEGATIVE = "nsfw, nude, naked, nudity, topless, nipples, lingerie, underwear, see-through, cleavage"


class NotSafeForWork(ValueError):
    pass


def check_prompt(prompt: str, name: str) -> None:
    word = sensitive_word(prompt)
    if word:
        raise NotSafeForWork(f"{name}'s face is an uploaded photo, so images of {name} must be safe for work. Remove “{word}” from the prompt.")


def check_start_image(sensitive: bool, name: str) -> None:
    if sensitive:
        raise NotSafeForWork(f"{name}'s face is an uploaded photo, so a variation of a sensitive image can't be made for {name}.")


def check_image_check_ready(nsfw_check_ready: bool) -> None:
    if not nsfw_check_ready:
        raise NotSafeForWork("The image check is still starting, and images of a character with an uploaded face can't be saved without it. Try again in a moment.")


def with_safe_negative(negative_prompt: str) -> str:
    """The negative prompt with each safe-for-work term it doesn't have yet, so terms already there aren't repeated."""
    terms = [term.strip() for term in negative_prompt.split(",") if term.strip()]
    present = {term.lower() for term in terms}
    return ", ".join(terms + [term for term in SAFE_NEGATIVE.split(", ") if term not in present])


def check_result(nsfw: bool | None, name: str) -> None:
    """None means the image could not be checked, which counts as not safe."""
    if nsfw is not False:
        raise NotSafeForWork(f"The image of {name} came out with nudity, so it was discarded. Images of a character with an uploaded face are kept safe for work.")
