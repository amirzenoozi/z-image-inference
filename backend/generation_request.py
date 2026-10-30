from pydantic import BaseModel, Field, model_validator

from i18n import t
from model_catalog import ADDONS, DEFAULT_MODEL, MODELS, VIDEO_MODEL, ModelSpec

MIN_SIDE = 256
SIDE_STEP = 16
MAX_SEED = 2**32 - 1
MAX_PROMPT_LENGTH = 4000
MAX_NEGATIVE_PROMPT_LENGTH = 2000
JOB_ID_PATTERN = r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
# How much a variation may change its start image, as a fraction
MIN_CHANGE = 0.1
MAX_CHANGE = 0.9
# How strongly a face lock holds the reference face; higher follows the prompt less
MIN_FACE_STRENGTH = 0.1
MAX_FACE_STRENGTH = 1.0


class GenerateRequest(BaseModel):
    """A generation request, checked against the chosen model's limits.

    Shared by the web app and the model server, so both enforce the same rules.
    """

    model: str = DEFAULT_MODEL.id
    prompt: str = Field(min_length=1, max_length=MAX_PROMPT_LENGTH)
    negative_prompt: str = Field(default="", max_length=MAX_NEGATIVE_PROMPT_LENGTH)
    width: int = 1024
    height: int = 1024
    steps: int | None = None
    guidance: float | None = Field(default=None, ge=0, le=20)
    seed: int | None = Field(default=None, ge=0, le=MAX_SEED)
    # Chosen by the browser, so it can follow and cancel the generation while it runs
    job_id: str | None = Field(default=None, pattern=JOB_ID_PATTERN)
    # For a variation: the start image as base64 PNG, which the web app loads from History, and how much to change it
    init_image: str | None = None
    change: float | None = Field(default=None, ge=MIN_CHANGE, le=MAX_CHANGE)
    # For a face lock: the character's face image as base64 PNG, which the web app loads from History, and its strength
    face_image: str | None = None
    face_strength: float | None = Field(default=None, ge=MIN_FACE_STRENGTH, le=MAX_FACE_STRENGTH)
    # Add-ons switched on for the model; each is applied only when the prompt mentions what it adds
    addons: list[str] = Field(default_factory=list, max_length=10)

    def has_start_image(self) -> bool:
        return self.init_image is not None

    @model_validator(mode="after")
    def check_against_model(self) -> "GenerateRequest":
        spec = MODELS.get(self.model)
        if spec is None:
            raise ValueError(t("unknownModel", model=self.model))
        check_size(self.width, self.height, spec)
        if self.steps is not None and not 1 <= self.steps <= spec.max_steps:
            raise ValueError(t("stepsRange", max_steps=spec.max_steps))
        check_variation(self.has_start_image(), self.change, spec)
        check_face_lock(self.face_image is not None, self.face_strength, spec)
        check_addons(self.addons, spec)
        return self


def check_variation(has_start_image: bool, change: float | None, spec: ModelSpec) -> None:
    if has_start_image != (change is not None):
        raise ValueError(t("variationNeedsBoth"))
    if has_start_image and not spec.supports_variations:
        raise ValueError(t("cannotStartFromImage", label=spec.label))


def check_face_lock(has_face_image: bool, face_strength: float | None, spec: ModelSpec) -> None:
    if has_face_image != (face_strength is not None):
        raise ValueError(t("faceLockNeedsBoth"))
    if has_face_image and not spec.supports_face_lock:
        able = ", ".join(model.label for model in MODELS.values() if model.supports_face_lock)
        raise ValueError(t("cannotLockFace", label=spec.label, able=able))


def check_addons(addons: list[str], spec: ModelSpec) -> None:
    for addon_id in addons:
        addon = ADDONS.get(addon_id)
        if addon is None or addon.base_model_id != spec.id:
            raise ValueError(t("unknownAddon", addon=addon_id, label=spec.label))
    if len(set(addons)) != len(addons):
        raise ValueError(t("addonTwice"))


def check_size(width: int, height: int, spec: ModelSpec) -> None:
    for side in (width, height):
        if not MIN_SIDE <= side <= spec.max_side or side % SIDE_STEP:
            raise ValueError(t("sizeRange", step=SIDE_STEP, min_side=MIN_SIDE, max_side=spec.max_side))


class VideoRequest(BaseModel):
    """A clip made from one image; shared by the web app and the model server, so both enforce the same rules."""

    prompt: str = Field(min_length=1, max_length=MAX_PROMPT_LENGTH)
    seconds: int
    seed: int | None = Field(default=None, ge=0, le=MAX_SEED)
    job_id: str | None = Field(default=None, pattern=JOB_ID_PATTERN)
    # The start image as base64 PNG, which the web app loads from History, and the clip's size
    image: str | None = None
    width: int = VIDEO_MODEL.max_side
    height: int = VIDEO_MODEL.max_side

    @model_validator(mode="after")
    def check_against_video_model(self) -> "VideoRequest":
        if self.seconds not in VIDEO_MODEL.frames:
            raise ValueError(t("videoLength", lengths=", ".join(map(str, VIDEO_MODEL.frames))))
        for side in (self.width, self.height):
            if side % 64 or not 64 <= side <= VIDEO_MODEL.max_side:
                raise ValueError(t("videoSize", max=VIDEO_MODEL.max_side))
        return self
