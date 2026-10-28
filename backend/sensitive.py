import re

# Words that mark a prompt as nudity or sexual content; whole words only, so "explicitly" or "Sussex" don't count
SENSITIVE_WORDS = re.compile(
    r"\b(?:nude|nudes|naked|nudity|nsfw|explicit|uncensored|topless|bottomless|nipples?|areolae?|genitals?|vulva|pussy|penis|"
    r"sex|sexual|sexually|sexy|intercourse|erotic|porn\w*|orgasm\w*|masturbat\w*|lingerie|boudoir|sensual|hentai)\b",
    re.IGNORECASE,
)


def sensitive_word(prompt: str) -> str | None:
    """The first word that marks the prompt as sensitive, or None."""
    found = SENSITIVE_WORDS.search(prompt)
    return found.group(0) if found else None


def is_sensitive(prompt: str) -> bool:
    """Whether the History list blurs an image made from this prompt; the user can change it per image."""
    return sensitive_word(prompt) is not None
