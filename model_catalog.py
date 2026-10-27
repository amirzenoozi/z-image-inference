from dataclasses import dataclass


@dataclass(frozen=True)
class ModelSpec:
    id: str
    label: str
    repo_id: str
    default_steps: int
    max_steps: int
    max_side: int
    default_resolution: str
    uses_guidance: bool
    default_guidance: float = 0.0
    default_negative_prompt: str = ""


Z_IMAGE = ModelSpec(
    id="z-image-turbo",
    label="Z-Image-Turbo",
    repo_id="Tongyi-MAI/Z-Image-Turbo",
    default_steps=9,
    max_steps=20,
    max_side=1536,
    default_resolution="368x640 (9:16)",
    uses_guidance=False,
)

WAI_ILLUSTRIOUS = ModelSpec(
    id="wai-illustrious",
    label="WAI-NSFW-Illustrious v12 (SDXL)",
    repo_id="votepurchase/waiNSFWIllustrious_v120",
    default_steps=28,
    max_steps=50,
    max_side=1216,
    default_resolution="1024x1024 (1:1)",
    uses_guidance=True,
    default_guidance=7.0,
    default_negative_prompt=(
        "nsfw, (low quality, worst quality:1.2), very displeasing, 3d, watermark, signature, ugly, poorly drawn"
    ),
)

MODELS: dict[str, ModelSpec] = {spec.id: spec for spec in (Z_IMAGE, WAI_ILLUSTRIOUS)}
DEFAULT_MODEL = Z_IMAGE
