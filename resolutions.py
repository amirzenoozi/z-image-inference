from dataclasses import dataclass
from typing import Literal

Category = Literal["square", "portrait", "landscape", "widescreen"]
Tier = Literal["S", "M", "L", "XL"]

CATEGORIES: tuple[Category, ...] = ("square", "portrait", "landscape", "widescreen")
# Wider than 5:3 counts as widescreen
WIDESCREEN_RATIO = 1.7
# Upper megapixel bound of each tier; anything larger is XL
TIER_LIMITS: tuple[tuple[Tier, float], ...] = (("S", 0.4), ("M", 0.7), ("L", 1.3))


@dataclass(frozen=True)
class Resolution:
    width: int
    height: int
    ratio: str

    @property
    def category(self) -> Category:
        aspect = self.width / self.height
        if aspect == 1:
            return "square"
        if aspect < 1:
            return "portrait"
        return "widescreen" if aspect >= WIDESCREEN_RATIO else "landscape"

    @property
    def tier(self) -> Tier:
        megapixels = self.width * self.height / 1_000_000
        return next((tier for tier, limit in TIER_LIMITS if megapixels < limit), "XL")

    def to_dict(self) -> dict[str, str | int]:
        return {
            "width": self.width,
            "height": self.height,
            "ratio": self.ratio,
            "category": self.category,
            "tier": self.tier,
        }


PRESETS: tuple[Resolution, ...] = (
    Resolution(512, 512, "1:1"),
    Resolution(768, 768, "1:1"),
    Resolution(1024, 1024, "1:1"),
    Resolution(1280, 1280, "1:1"),
    Resolution(384, 512, "3:4"),
    Resolution(576, 768, "3:4"),
    Resolution(768, 1024, "3:4"),
    Resolution(1024, 1536, "2:3"),
    Resolution(384, 640, "3:5"),
    Resolution(576, 960, "3:5"),
    Resolution(768, 1280, "3:5"),
    Resolution(368, 640, "9:16"),
    Resolution(544, 960, "9:16"),
    Resolution(576, 1024, "9:16"),
    Resolution(720, 1280, "9:16"),
    Resolution(864, 1536, "9:16"),
    Resolution(512, 384, "4:3"),
    Resolution(768, 576, "4:3"),
    Resolution(1024, 768, "4:3"),
    Resolution(1536, 1024, "3:2"),
    Resolution(640, 384, "5:3"),
    Resolution(960, 576, "5:3"),
    Resolution(1280, 768, "5:3"),
    Resolution(640, 368, "16:9"),
    Resolution(960, 544, "16:9"),
    Resolution(1024, 576, "16:9"),
    Resolution(1280, 720, "16:9"),
    Resolution(1536, 864, "16:9"),
)
