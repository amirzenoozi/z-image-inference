from pydantic import BaseModel, Field, model_validator

from model_catalog import DEFAULT_MODEL, MODELS, ModelSpec

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

    def has_start_image(self) -> bool:
        return self.init_image is not None

    @model_validator(mode="after")
    def check_against_model(self) -> "GenerateRequest":
        spec = MODELS.get(self.model)
        if spec is None:
            raise ValueError(f"Unknown model: {self.model}")
        check_size(self.width, self.height, spec)
        if self.steps is not None and not 1 <= self.steps <= spec.max_steps:
            raise ValueError(f"steps must be between 1 and {spec.max_steps}")
        check_variation(self.has_start_image(), self.change, spec)
        check_face_lock(self.face_image is not None, self.face_strength, spec)
        return self


def check_variation(has_start_image: bool, change: float | None, spec: ModelSpec) -> None:
    if has_start_image != (change is not None):
        raise ValueError("A variation needs both a start image and how much to change it")
    if has_start_image and not spec.supports_variations:
        raise ValueError(f"{spec.label} can't start from an image; pick another model or remove the start image")


def check_face_lock(has_face_image: bool, face_strength: float | None, spec: ModelSpec) -> None:
    if has_face_image != (face_strength is not None):
        raise ValueError("A face lock needs both a face image and its strength")
    if has_face_image and not spec.supports_face_lock:
        raise ValueError(f"{spec.label} can't lock a face; use WAI-Illustrious or Anime Desire")


def check_size(width: int, height: int, spec: ModelSpec) -> None:
    for side in (width, height):
        if not MIN_SIDE <= side <= spec.max_side or side % SIDE_STEP:
            raise ValueError(
                f"width and height must be multiples of {SIDE_STEP} between {MIN_SIDE} and {spec.max_side}"
            )
