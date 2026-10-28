import re

# Brackets already converted are written as these, so the next pass does not convert them again
OPEN, CLOSE = "\x00", "\x01"
# The innermost unescaped (…) group, with an optional ":weight" at its end
ROUND_GROUP = re.compile(r"(?<!\\)\(([^()]*?)(?::\s*(-?\d+(?:\.\d+)?))?(?<!\\)\)")
# The innermost unescaped […] group; one holding "|" alternates prompts, which Compel cannot do, so it is left alone
SQUARE_GROUP = re.compile(r"(?<!\\)\[([^\[\]|]*?)(?<!\\)\]")
# Automatic1111's weights for brackets without a number
ROUND_WEIGHT = 1.1
SQUARE_WEIGHT = 0.9


def _weighted(text: str, weight: float) -> str:
    return f"{OPEN}{text}{CLOSE}{weight:g}"


def a1111_to_compel(prompt: str) -> str:
    """Rewrites Automatic1111 / ComfyUI weights, "(tag:1.3)", "(tag)" and "[tag]", in the "(tag)1.3" form Compel reads."""
    previous = None
    while previous != prompt:
        previous = prompt
        prompt = ROUND_GROUP.sub(lambda m: _weighted(m.group(1), float(m.group(2)) if m.group(2) else ROUND_WEIGHT), prompt)
        prompt = SQUARE_GROUP.sub(lambda m: _weighted(m.group(1), SQUARE_WEIGHT), prompt)
    return prompt.replace(OPEN, "(").replace(CLOSE, ")")
