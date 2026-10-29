"""How History stores images: lossless WebP, about 30% smaller than PNG with the same pixels.

Rows saved before this are PNG; the format is told apart by the first bytes, so no column records it.
"""
import io

from PIL import Image

# Measured on real History images: within 1% of method 6's size, in half the time
WEBP_METHOD = 4
# WebP holds 8 bits per channel; anything deeper (16-bit PNG) stays PNG rather than lose precision
EIGHT_BIT_MODES = {"1", "L", "LA", "P", "PA", "RGB", "RGBA"}


def is_webp(data: bytes) -> bool:
    return data[:4] == b"RIFF" and data[8:12] == b"WEBP"


def media_type(data: bytes) -> str:
    return "image/webp" if is_webp(data) else "image/png"


def pixels(image: Image.Image) -> Image.Image:
    """The image as RGB, or RGBA when it has real transparency; an alpha channel that is fully opaque says nothing."""
    rgba = image.convert("RGBA")
    return rgba if rgba.getchannel("A").getextrema()[0] < 255 else image.convert("RGB")


def encode_for_storage(png: bytes) -> bytes:
    """Lossless WebP of the image, or the PNG unchanged when the WebP would not be smaller or not pixel-identical."""
    image = Image.open(io.BytesIO(png))
    if image.mode not in EIGHT_BIT_MODES:
        return png
    source = pixels(image)
    buffer = io.BytesIO()
    source.save(buffer, "WEBP", lossless=True, method=WEBP_METHOD, exact=True)
    webp = buffer.getvalue()
    if len(webp) >= len(png):
        return png
    decoded = Image.open(io.BytesIO(webp)).convert(source.mode)
    return webp if decoded.tobytes() == source.tobytes() else png


def to_png(stored: bytes) -> bytes:
    """A stored image as PNG: a PNG comes back as it is, a WebP is converted with its pixels unchanged."""
    if not is_webp(stored):
        return stored
    buffer = io.BytesIO()
    Image.open(io.BytesIO(stored)).save(buffer, "PNG")
    return buffer.getvalue()
