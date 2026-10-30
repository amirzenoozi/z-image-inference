import os
import re
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

Source = Literal["huggingface", "civitai"]


@dataclass(frozen=True)
class AddonSpec:
    """A LoRA the user switches on over a base model. It is applied only when the prompt asks for what it adds."""

    id: str
    label: str
    description: str
    base_model_id: str
    # A Hugging Face repo, or for Civitai its model id, with the file fetched from `download_url`
    repo_id: str
    source: Source
    download_url: str
    lora_file: str
    download_gb: float
    trigger_word: str
    # Whole words, in any case, that mean the prompt asks for it
    keywords: tuple[str, ...]
    # How strongly the LoRA applies; some authors recommend less than full strength
    scale: float = 1.0

    def matches(self, prompt: str) -> bool:
        pattern = r"\b(?:" + "|".join(map(re.escape, self.keywords)) + r")\b"
        return re.search(pattern, prompt, re.IGNORECASE) is not None


TATTOO_ADDON = AddonSpec(
    id="tattoo",
    label="Tattoo",
    description="More and bolder tattoos on the body.",
    base_model_id=Z_IMAGE.id,
    repo_id="2178484",
    source="civitai",
    download_url="https://civitai.com/api/download/models/2453120?fileId=2343903",
    lora_file="tattoo-z.safetensors",
    download_gb=0.17,
    trigger_word="tattoo",
    keywords=("tattoo", "tattoos", "tattooed"),
)

def civitai_addon(addon_id: str, label: str, description: str, model_id: int, version_id: int, file_id: int, size_gb: float, trigger: str, keywords: tuple[str, ...], scale: float = 1.0) -> AddonSpec:
    """A Z-Image-Turbo LoRA from Civitai: its model page, and the download link of the version picked."""
    return AddonSpec(
        id=addon_id, label=label, description=description, base_model_id=Z_IMAGE.id, repo_id=str(model_id), source="civitai",
        download_url=f"https://civitai.com/api/download/models/{version_id}?fileId={file_id}", lora_file=f"{addon_id}.safetensors",
        download_gb=size_gb, trigger_word=trigger, keywords=keywords, scale=scale,
    )


Z_IMAGE_CIVITAI_ADDONS = (
    civitai_addon("disney-style", "Definitive Disney Studios - STYLE", "Disney and Pixar 3D animation style.", 404277, 2494747, 2382803, 0.17, "DisneyIZT", ("disney", "pixar", "cartoon")),
    civitai_addon("turbo-pussy", "Turbo Pussy Z", "More detailed, natural-looking vulvas.", 2178383, 2639284, 2527219, 0.17, "", ("pussy", "vagina", "vulva")),
    civitai_addon("asian-mix", "[Z Image Turbo] Asian Mix Lora", "East Asian women's faces and looks.", 2185778, 3231694, 3114056, 0.34, "Asian woman", ("asian", "japanese", "korean", "chinese")),
    civitai_addon("neon-noir", "Neon Noir Style", "A dark, neon-lit noir style.", 1152256, 2666905, 2553686, 0.17, "neon_horror_noir_style", ("neon", "noir")),
    civitai_addon("cum-on-body", "Z-image cum on body", "Cum on the body.", 2178509, 2453150, 2343929, 0.17, "cum on body", ("cum", "semen")),
    civitai_addon("amateur-nude-selfies", "Amateur Nude Selfies", "Amateur-looking nude phone selfies.", 2271699, 2556997, 2445412, 0.17, "amat_nude", ("selfie", "selfies")),
    civitai_addon("hyper-futa", "Hyper Futa", "Women with penises, in more sizes.", 2196169, 2500617, 2388656, 0.17, "futa", ("futa", "futanari")),
    # Its author recommends starting at 0.8
    civitai_addon("squirt-queen", "PornMaster Squirt Queen Z-image", "Squirting.", 2186843, 2462300, 2350841, 0.17, "", ("squirt", "squirting", "squirts"), scale=0.8),
)

# The two FLUX.1-dev LoRAs were models of their own before add-ons; their ids, and so their folders, are kept
FLUX_CREATE_NSFW_ADDON = AddonSpec(
    id="flux-create-nsfw",
    label="create-nsfw",
    description="Nude photos.",
    base_model_id=FLUX_DEV.id,
    repo_id="Bigfawg6669/create-nsfw",
    source="huggingface",
    download_url="",
    lora_file="lora.safetensors",
    download_gb=0.69,
    trigger_word="",
    keywords=("nsfw", "nude", "naked", "topless"),
)

FLUX_ASIAN_NUDITY_ADDON = AddonSpec(
    id="flux-asian-nudity",
    label="asian-nudity-2",
    description="Nude photos of East Asian women.",
    base_model_id=FLUX_DEV.id,
    repo_id="inuptia/asian-nudity-2",
    source="huggingface",
    download_url="",
    lora_file="asian-nudity-2.safetensors",
    download_gb=0.04,
    trigger_word="4s14n",
    keywords=("asian", "japanese", "korean", "chinese"),
)

ADDONS: dict[str, AddonSpec] = {addon.id: addon for addon in (TATTOO_ADDON, *Z_IMAGE_CIVITAI_ADDONS, FLUX_CREATE_NSFW_ADDON, FLUX_ASIAN_NUDITY_ADDON)}

# Models that became add-ons of their base model: History's images made with them are moved over (history_store)
MODELS_NOW_ADDONS: dict[str, str] = {FLUX_CREATE_NSFW_ADDON.id: FLUX_DEV.id, FLUX_ASIAN_NUDITY_ADDON.id: FLUX_DEV.id}


def addons_for(model_id: str) -> list[AddonSpec]:
    return [addon for addon in ADDONS.values() if addon.base_model_id == model_id]


def applied_addons(enabled: list[str], prompt: str) -> list[AddonSpec]:
    """The add-ons a render uses: those switched on whose keywords the prompt mentions. The rule for every add-on."""
    return [ADDONS[addon_id] for addon_id in enabled if ADDONS[addon_id].matches(prompt)]


def with_trigger_words(prompt: str, addons: list[AddonSpec]) -> str:
    missing = [addon.trigger_word for addon in addons if addon.trigger_word.lower() not in prompt.lower()]
    return ", ".join([*missing, prompt])


def page_url(source: Source, repo_id: str) -> str:
    if source == "civitai":
        return f"https://civitai.com/models/{repo_id}"
    return f"https://huggingface.co/{repo_id}"


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
    return z_image_bits() is not None if spec.id == Z_IMAGE.id else compression_enabled()


def kept_gb(spec: ModelSpec) -> float:
    # Z-Image and FLUX.1-dev keep their originals beside the quantised copy they run
    if spec.id in (Z_IMAGE.id, FLUX_DEV.id):
        return spec.download_gb + (spec.compressed_gb if runs_compressed(spec) else 0)
    return spec.compressed_gb if runs_compressed(spec) else spec.download_gb


def speed_hint(spec: ModelSpec) -> str:
    return spec.speed_hint if runs_compressed(spec) or spec.original_speed_hint is None else spec.original_speed_hint


MODELS: dict[str, ModelSpec] = {spec.id: spec for spec in (
    Z_IMAGE, WAI_ILLUSTRIOUS, MOSS_IMAGE, ANIME_DESIRE, REALVIS_XL, FLUX_DEV,
)}
DEFAULT_MODEL = Z_IMAGE


@dataclass(frozen=True)
class VideoModelSpec:
    """The image-to-video model History uses. It runs in its own process and environment, since its pinned packages
    differ from the app's, and is downloaded and removed like a model."""

    id: str
    label: str
    download_gb: float
    # The engine (ltx-2-mlx) at the commit tested on this Mac, installed with uv into its own environment
    engine_repo: str
    engine_commit: str
    # The 4-bit weights, only the files the distilled image-to-video path reads
    weights_repo: str
    weights_files: tuple[str, ...]
    text_encoder_repo: str
    frame_rate: int
    # The clip's longer side; both sides must be multiples of 64
    max_side: int
    # Lengths offered in seconds, and the frames each takes (the model wants 8n + 1)
    frames: dict[int, int]


VIDEO_MODEL = VideoModelSpec(
    id="ltx-video",
    label="LTX-2.3 video (4-bit)",
    download_gb=29,
    engine_repo="https://github.com/dgrauet/ltx-2-mlx.git",
    engine_commit="895201df379b079c2154738bcf92005b7a371923",
    weights_repo="dgrauet/ltx-2.3-mlx-q4",
    weights_files=(
        "transformer-distilled.safetensors", "connector.safetensors", "vae_encoder.safetensors", "vae_decoder.safetensors",
        "audio_vae.safetensors", "vocoder.safetensors", "spatial_upscaler_x2_v1_1.safetensors", "spatial_upscaler_x2_v1_1_config.json",
        "config.json", "embedded_config.json", "quantize_config.json", "split_model.json",
    ),
    text_encoder_repo="mlx-community/gemma-3-12b-it-4bit",
    frame_rate=24,
    max_side=512,
    frames={2: 49, 4: 97},
)


def video_size(width: int, height: int) -> tuple[int, int]:
    """The clip's size for an image: its shape, the longer side at the model's limit, both sides multiples of 64."""
    scale = VIDEO_MODEL.max_side / max(width, height)
    snap = lambda side: max(64, round(side * scale / 64) * 64)
    return snap(width), snap(height)
