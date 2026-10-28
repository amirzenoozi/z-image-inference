import os
from dataclasses import dataclass
from typing import Literal


ModelCategory = Literal["photo", "anime"]

# Display order and labels of the categories in the model dialog
MODEL_CATEGORIES: dict[ModelCategory, str] = {"photo": "Photorealistic", "anime": "Anime & illustration"}


@dataclass(frozen=True)
class ModelSpec:
    id: str
    label: str
    repo_id: str
    description: str
    speed_hint: str
    category: ModelCategory
    # Size of the original download, and what stays on disk after compression (MODEL_COMPRESSION=on)
    download_gb: float
    compressed_gb: float
    default_steps: int
    max_steps: int
    max_side: int
    default_size: tuple[int, int]
    uses_guidance: bool
    default_guidance: float = 0.0
    default_negative_prompt: str = ""
    trigger_word: str = ""
    # Speed when the original, uncompressed files are used, if it differs
    original_speed_hint: str | None = None
    # How the model reads prompts best: natural sentences or comma-separated tags
    prompt_style: Literal["prose", "tags"] = "prose"


Z_IMAGE = ModelSpec(
    id="z-image-turbo",
    label="Z-Image-Turbo",
    repo_id="Tongyi-MAI/Z-Image-Turbo",
    description="Fast photorealistic images with sharp text rendering.",
    speed_hint="~10 s at 512, ~50 s at 1024",
    category="photo",
    download_gb=31,
    compressed_gb=5.9,
    original_speed_hint="~12 min per image on 24 GB (swaps)",
    default_steps=9,
    max_steps=20,
    max_side=1536,
    default_size=(368, 640),
    uses_guidance=False,
)

WAI_ILLUSTRIOUS = ModelSpec(
    id="wai-illustrious",
    label="WAI-NSFW-Illustrious v12 (SDXL)",
    repo_id="votepurchase/waiNSFWIllustrious_v120",
    description="SDXL anime and illustration styles; uses a negative prompt.",
    speed_hint="~40 s at 1024",
    category="anime",
    download_gb=13,
    compressed_gb=7.1,
    default_steps=28,
    max_steps=50,
    max_side=1216,
    default_size=(1024, 1024),
    uses_guidance=True,
    default_guidance=7.0,
    prompt_style="tags",
    default_negative_prompt=(
        "nsfw, (low quality, worst quality:1.2), very displeasing, 3d, watermark, signature, ugly, poorly drawn"
    ),
)

MOSS_IMAGE = ModelSpec(
    id="moss-image-nsfw",
    label="MOSS-Image NSFW",
    repo_id="axiomofmind/Moss-image-nsfw-uncensored-lora",
    description="Photorealistic adult content from MOSS-Image with a merged LoRA.",
    speed_hint="~2 min at 512, ~7 min at 1024",
    category="photo",
    download_gb=26,
    compressed_gb=19.9,
    default_steps=30,
    max_steps=50,
    max_side=1024,
    default_size=(1024, 1024),
    uses_guidance=True,
    default_guidance=3.0,
    trigger_word="moss_xvstyle",
)

ANIME_DESIRE = ModelSpec(
    id="anime-desire",
    label="Anime Desire (Illustrious SDXL)",
    repo_id="AI-Porn/anime-desire-illustrious",
    description="SDXL anime and hentai styles; knows many characters and Danbooru tags.",
    speed_hint="~45–60 s at 1024",
    category="anime",
    download_gb=6.9,
    compressed_gb=6.9,
    default_steps=30,
    max_steps=50,
    max_side=1216,
    default_size=(1024, 1024),
    uses_guidance=True,
    default_guidance=4.0,
    default_negative_prompt=(
        "(worst quality, low quality:1.2), lowres, bad anatomy, bad hands, extra fingers, "
        "watermark, signature, text, blurry, jpeg artifacts"
    ),
    prompt_style="tags",
)

def compression_enabled() -> bool:
    """MODEL_COMPRESSION=on keeps 4-bit, 8-bit and float16 copies instead of the original files (off by default)."""
    return os.environ.get("MODEL_COMPRESSION", "off").strip().lower() == "on"


def kept_gb(spec: ModelSpec) -> float:
    return spec.compressed_gb if compression_enabled() else spec.download_gb


def speed_hint(spec: ModelSpec) -> str:
    return spec.speed_hint if compression_enabled() or spec.original_speed_hint is None else spec.original_speed_hint


MODELS: dict[str, ModelSpec] = {spec.id: spec for spec in (Z_IMAGE, WAI_ILLUSTRIOUS, MOSS_IMAGE, ANIME_DESIRE)}
DEFAULT_MODEL = Z_IMAGE
