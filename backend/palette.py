import io
from dataclasses import dataclass

from PIL import Image

PALETTE_SIZE = 6
# Colours are counted on a small copy: enough to find the main colours, and fast
SAMPLE_SIDE = 64


@dataclass(frozen=True)
class PaletteColour:
    hex: str
    # Fraction of the image this colour covers, from 0 to 1
    share: float


def extract_palette(png: bytes) -> list[PaletteColour]:
    """The image's main colours, most used first."""
    image = Image.open(io.BytesIO(png)).convert("RGB")
    image.thumbnail((SAMPLE_SIDE, SAMPLE_SIDE), Image.Resampling.BOX)
    reduced = image.quantize(colors=PALETTE_SIZE, method=Image.Quantize.MEDIANCUT)
    rgb = reduced.getpalette() or []
    counts = sorted(reduced.getcolors() or [], reverse=True)
    pixels = sum(count for count, _ in counts)
    return [
        PaletteColour(hex="#{:02X}{:02X}{:02X}".format(*rgb[index * 3 : index * 3 + 3]), share=round(count / pixels, 3))
        for count, index in counts
    ]
