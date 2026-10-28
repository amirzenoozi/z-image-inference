import os
from dataclasses import dataclass, replace
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
    # Size of the original download, and of the compressed copy (Z-Image: its 8-bit copy, kept beside the original)
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
    # Whether the model can start from an image, for variations
    supports_variations: bool = True
    # Whether it can keep a character's face from a reference image (IP-Adapter, SDXL only)
    supports_face_lock: bool = False
    # A LoRA runs on another model's files: `repo_id` holds the LoRA, `base_model_id` the model it needs
    base_model_id: str | None = None
    lora_file: str = ""


Z_IMAGE = ModelSpec(
    id="z-image-turbo",
    label="Z-Image-Turbo",
    repo_id="Tongyi-MAI/Z-Image-Turbo",
    description="Fast photorealistic images with sharp text rendering.",
    speed_hint="~55 s at 1024",
    category="photo",
    download_gb=31,
    compressed_gb=10.7,
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
    supports_face_lock=True,
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
    # Its pipeline only starts from noise
    supports_variations=False,
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
    supports_face_lock=True,
)

REALVIS_XL = ModelSpec(
    id="realvisxl",
    label="RealVisXL V5.0 (SDXL)",
    repo_id="SG161222/RealVisXL_V5.0",
    description="SDXL photorealistic people; locks a character's face in photo style.",
    speed_hint="~45–60 s at 1024",
    category="photo",
    # Only the float16 files are fetched, the precision it runs in, so compression changes nothing
    download_gb=6.9,
    compressed_gb=6.9,
    default_steps=30,
    max_steps=50,
    max_side=1216,
    default_size=(1024, 1024),
    uses_guidance=True,
    default_guidance=5.0,
    # The model card's recommended negative prompt
    default_negative_prompt=(
        "bad hands, bad anatomy, ugly, deformed, (face asymmetry, eyes asymmetry, deformed eyes, deformed mouth, open mouth)"
    ),
    supports_face_lock=True,
)

FLUX_DEV = ModelSpec(
    id="flux-dev",
    label="FLUX.1-dev (4-bit)",
    repo_id="black-forest-labs/FLUX.1-dev",
    description="Detailed photorealistic images; slow, and needs a Hugging Face token to download.",
    speed_hint="a few minutes at 1024",
    category="photo",
    # The diffusers folders mflux reads; the 4-bit copy is built beside them once and always used
    download_gb=33.8,
    compressed_gb=9.6,
    default_steps=25,
    max_steps=50,
    max_side=1536,
    default_size=(1024, 1024),
    uses_guidance=True,
    default_guidance=3.5,
)

FLUX_CREATE_NSFW = replace(
    FLUX_DEV,
    id="flux-create-nsfw",
    label="FLUX.1-dev · create-nsfw",
    repo_id="Bigfawg6669/create-nsfw",
    description="FLUX.1-dev with the create-nsfw LoRA, for nude photos.",
    download_gb=0.69,
    compressed_gb=0.69,
    base_model_id=FLUX_DEV.id,
    lora_file="lora.safetensors",
)

FLUX_ASIAN_NUDITY = replace(
    FLUX_DEV,
    id="flux-asian-nudity",
    label="FLUX.1-dev · asian-nudity-2",
    repo_id="inuptia/asian-nudity-2",
    description="FLUX.1-dev with the asian-nudity-2 LoRA, for nude photos of East Asian women.",
    download_gb=0.04,
    compressed_gb=0.04,
    trigger_word="4s14n",
    base_model_id=FLUX_DEV.id,
    lora_file="asian-nudity-2.safetensors",
)


def compression_enabled() -> bool:
    """MODEL_COMPRESSION=on keeps 4-bit, 8-bit and float16 copies instead of the original files (off by default)."""
    return os.environ.get("MODEL_COMPRESSION", "off").strip().lower() == "on"


# Quantisation levels mflux supports for Z-Image-Turbo
Z_IMAGE_LEVELS = (8, 6, 5, 4, 3)


def z_image_bits() -> int | None:
    """Z_IMAGE_BITS picks the quantised copy Z-Image-Turbo runs (8 by default); "original" runs the original files, which are always kept."""
    value = os.environ.get("Z_IMAGE_BITS", "8").strip().lower()
    if value == "original":
        return None
    if value not in {str(bits) for bits in Z_IMAGE_LEVELS}:
        raise ValueError(f"Z_IMAGE_BITS must be original or one of {', '.join(map(str, Z_IMAGE_LEVELS))}, not {value!r}")
    return int(value)


def runs_compressed(spec: ModelSpec) -> bool:
    if spec.id == FLUX_DEV.id:
        return True
    if spec.base_model_id is not None:
        return False
    return z_image_bits() is not None if spec.id == Z_IMAGE.id else compression_enabled()


def kept_gb(spec: ModelSpec) -> float:
    # Z-Image and FLUX.1-dev keep their originals beside the quantised copy they run
    if spec.id in (Z_IMAGE.id, FLUX_DEV.id):
        return spec.download_gb + (spec.compressed_gb if runs_compressed(spec) else 0)
    return spec.compressed_gb if runs_compressed(spec) else spec.download_gb


def speed_hint(spec: ModelSpec) -> str:
    return spec.speed_hint if runs_compressed(spec) or spec.original_speed_hint is None else spec.original_speed_hint


MODELS: dict[str, ModelSpec] = {spec.id: spec for spec in (
    Z_IMAGE, WAI_ILLUSTRIOUS, MOSS_IMAGE, ANIME_DESIRE, REALVIS_XL, FLUX_DEV, FLUX_CREATE_NSFW, FLUX_ASIAN_NUDITY,
)}
DEFAULT_MODEL = Z_IMAGE
