from pydantic import BaseModel, Field, model_validator

from model_catalog import DEFAULT_MODEL, MODELS, ModelSpec

MIN_SIDE = 256
SIDE_STEP = 16
MAX_SEED = 2**32 - 1
MAX_PROMPT_LENGTH = 4000
MAX_NEGATIVE_PROMPT_LENGTH = 2000
JOB_ID_PATTERN = r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"


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

    @model_validator(mode="after")
    def check_against_model(self) -> "GenerateRequest":
        spec = MODELS.get(self.model)
        if spec is None:
            raise ValueError(f"Unknown model: {self.model}")
        check_size(self.width, self.height, spec)
        if self.steps is not None and not 1 <= self.steps <= spec.max_steps:
            raise ValueError(f"steps must be between 1 and {spec.max_steps}")
        return self


def check_size(width: int, height: int, spec: ModelSpec) -> None:
    for side in (width, height):
        if not MIN_SIDE <= side <= spec.max_side or side % SIDE_STEP:
            raise ValueError(
                f"width and height must be multiples of {SIDE_STEP} between {MIN_SIDE} and {spec.max_side}"
            )
