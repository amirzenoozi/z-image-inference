import io
import base64
import itertools
import threading
from collections.abc import Iterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Literal

from dotenv import load_dotenv
load_dotenv()

import openai
import requests
import uvicorn
from datetime import date

from fastapi import Depends, FastAPI, HTTPException, Path as PathParam, Query, Response
from fastapi.responses import FileResponse, PlainTextResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, TypeAdapter, model_validator

import character_store
import history_export
import nsfw_detector
from character_store import Character, CharacterUpdate, DuplicateName, MissingImage, NewCharacter
from image_edits import EditOutsideImage, EditRecipe, apply_edits
import history_store
from generation_request import JOB_ID_PATTERN, MAX_PROMPT_LENGTH, MAX_SEED, MIN_SIDE, SIDE_STEP, GenerateRequest
from grok_client import GrokClient
from palette import PaletteColour
from history_store import CLEANUP_AGES_DAYS, HistoryFilter, HistoryItem, HistorySummary, NewImage
from model_catalog import MODEL_CATEGORIES, MODELS, ModelSpec, kept_gb, speed_hint
from resolutions import CATEGORIES, PRESETS, Category

MODEL_SERVER_URL = "http://127.0.0.1:8000"
# Long enough for a first-time model download or a switch between models
REQUEST_TIMEOUT = 900
FRONTEND_DIST = Path(__file__).parent / "frontend" / "dist"
THUMBNAIL_SIDE = 384
MAX_PAGE_SIZE = 100
MAX_SEARCH_LENGTH = 200
MAX_CHAT_MESSAGES = 50
# History images never change: ids are not reused after a delete
IMMUTABLE = {"Cache-Control": "private, max-age=31536000, immutable"}

# Each model's example prompts; edit the file and reload the page to change them
EXAMPLE_PROMPTS_FILE = Path(__file__).parent / "example_prompts.json"
ExamplePrompt = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_PROMPT_LENGTH)]
EXAMPLE_PROMPTS = TypeAdapter(dict[str, list[ExamplePrompt]])
# The prompt builder's purposes; the builder checks the steps and options against its own lists
PROMPT_MODES_FILE = Path(__file__).parent / "prompt_modes.json"

grok_client = GrokClient()


class ModelInfo(BaseModel):
    id: str
    repo_id: str
    label: str
    description: str
    speed_hint: str
    category: str
    download_gb: float
    kept_gb: float
    default_steps: int
    max_steps: int
    max_side: int
    default_width: int
    default_height: int
    uses_guidance: bool
    default_guidance: float
    default_negative_prompt: str
    trigger_word: str
    prompt_style: Literal["prose", "tags"]
    supports_variations: bool
    supports_face_lock: bool
    examples: list[str]

    @classmethod
    def from_spec(cls, spec: ModelSpec, examples: list[str]) -> "ModelInfo":
        width, height = spec.default_size
        return cls(
            id=spec.id, repo_id=spec.repo_id, label=spec.label, description=spec.description, speed_hint=speed_hint(spec), category=spec.category, download_gb=spec.download_gb, kept_gb=kept_gb(spec),
            default_steps=spec.default_steps, max_steps=spec.max_steps, max_side=spec.max_side,
            default_width=width, default_height=height, uses_guidance=spec.uses_guidance,
            default_guidance=spec.default_guidance, default_negative_prompt=spec.default_negative_prompt,
            trigger_word=spec.trigger_word, prompt_style=spec.prompt_style, supports_variations=spec.supports_variations,
            supports_face_lock=spec.supports_face_lock, examples=examples,
        )


class ResolutionInfo(BaseModel):
    width: int
    height: int
    ratio: str
    category: str
    tier: str


class Limits(BaseModel):
    min_side: int = MIN_SIDE
    side_step: int = SIDE_STEP
    max_seed: int = MAX_SEED
    max_prompt_length: int = MAX_PROMPT_LENGTH


class ModelCategoryInfo(BaseModel):
    id: str
    label: str


class ModeFocus(BaseModel):
    model_config = ConfigDict(extra="forbid")

    opening: str = ""
    cues: str = ""
    tags: list[str] = []


class BuilderMode(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9-]*$")]
    label: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
    description: str = ""
    content: Literal["safe", "everyday", "suggestive", "explicit"] = "everyday"
    focus: ModeFocus = ModeFocus()
    steps: list[str] = Field(min_length=1)
    defaults: dict[str, str] = {}
    options: dict[str, list[str]] = {}
    emphasis: list[str] = []
    weights: dict[str, Annotated[float, Field(ge=0.5, le=2)]] = {}


PROMPT_MODES = TypeAdapter(list[BuilderMode])


class Catalog(BaseModel):
    models: list[ModelInfo]
    model_categories: list[ModelCategoryInfo]
    resolutions: list[ResolutionInfo]
    categories: list[str]
    chat_available: bool
    limits: Limits
    builder_modes: list[BuilderMode]


ModelStatus = Literal["ready", "queued", "downloading", "missing", "failed"]


class JobState(BaseModel):
    phase: Literal["waiting", "loading", "encoding", "generating", "finishing"]
    step: int
    total: int


class ModelState(BaseModel):
    status: ModelStatus
    size_bytes: int


class ModelStatusReport(BaseModel):
    server_running: bool
    models: dict[str, ModelState]
    free_bytes: int | None


class HistoryPage(BaseModel):
    items: list[HistoryItem]
    total: int


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=MAX_PROMPT_LENGTH)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=MAX_CHAT_MESSAGES)

    @model_validator(mode="after")
    def ends_with_user(self) -> "ChatRequest":
        if self.messages[-1].role != "user":
            raise ValueError("the last message must be from the user")
        return self


# Images checked per database read; the check runs one image at a time
IMAGE_CHECK_BATCH = 20


def check_unchecked_images() -> None:
    """Loads the sensitive-image check (downloading it once), then checks every image saved before it was ready."""
    try:
        nsfw_detector.load()
    except Exception as error:  # A failed download or load leaves the prompt words as the only check, as before
        print(f"The sensitive-image check could not start: {error}")
        return
    while ids := history_store.unchecked_image_ids(IMAGE_CHECK_BATCH):
        for item_id in ids:
            history_store.record_image_check(item_id, image_is_nsfw(item_id))


def image_is_nsfw(item_id: int) -> bool:
    png = history_store.image_png(item_id)
    try:
        return png is not None and bool(nsfw_detector.is_nsfw(png))
    except Exception as error:  # An image the classifier can't read keeps what its prompt said
        print(f"Image #{item_id} could not be checked: {error}")
        return False


def start_image_checks() -> None:
    """Runs in the background, so the app starts at once; images saved meanwhile are checked when it is ready."""
    threading.Thread(target=check_unchecked_images, name="image-checks", daemon=True).start()


@asynccontextmanager
async def lifespan(app: FastAPI):
    history_store.init_db()
    character_store.add_samples_once()
    start_image_checks()
    yield


app = FastAPI(title="Z-Image Inference", lifespan=lifespan)


def example_prompts() -> dict[str, list[str]]:
    prompts = EXAMPLE_PROMPTS.validate_json(EXAMPLE_PROMPTS_FILE.read_bytes())
    unknown = prompts.keys() - MODELS.keys()
    if unknown:
        raise ValueError(f"{EXAMPLE_PROMPTS_FILE.name} lists unknown models: {', '.join(sorted(unknown))}")
    return prompts


def prompt_modes() -> list[BuilderMode]:
    modes = PROMPT_MODES.validate_json(PROMPT_MODES_FILE.read_bytes())
    ids = [mode.id for mode in modes]
    if not modes or len(set(ids)) != len(ids):
        raise ValueError(f"{PROMPT_MODES_FILE.name} needs at least one mode, each with its own id")
    return modes


@app.get("/api/catalog")
def catalog() -> Catalog:
    examples = example_prompts()
    return Catalog(
        models=[ModelInfo.from_spec(spec, examples.get(spec.id, [])) for spec in MODELS.values()],
        model_categories=[ModelCategoryInfo(id=key, label=label) for key, label in MODEL_CATEGORIES.items()],
        resolutions=[ResolutionInfo(**preset.to_dict()) for preset in PRESETS],
        categories=list(CATEGORIES),
        chat_available=grok_client.available,
        limits=Limits(),
        builder_modes=prompt_modes(),
    )


def model_server_detail(resp: requests.Response) -> str:
    """Turn the model server's error, a message or a list of validation errors, into one readable line."""
    try:
        errors = resp.json()["detail"]
        if isinstance(errors, str):
            return errors
        return "; ".join(str(error.get("msg", error)) for error in errors)
    except (ValueError, KeyError, TypeError, AttributeError):
        return resp.text or "Invalid request"


class RenderedImage(BaseModel):
    """The model server's answer to /generate."""

    image_base64: str
    seed: int
    seconds: float


def request_image(req: GenerateRequest) -> RenderedImage:
    try:
        resp = requests.post(f"{MODEL_SERVER_URL}/generate", json=req.model_dump(), timeout=REQUEST_TIMEOUT)
    except requests.ConnectionError:
        raise HTTPException(503, "The model server is not running. Start it with: uv run python model_server.py")
    except requests.Timeout:
        raise HTTPException(504, "The model server took too long. A first-time model download may still be running.")
    if resp.status_code in (409, 422, 503):
        # 409 means the user cancelled it; 503 that the model is still downloading, which its message says
        raise HTTPException(resp.status_code, model_server_detail(resp))
    if not resp.ok:
        raise HTTPException(502, f"The model server failed ({resp.status_code}). Check its terminal for details.")
    return RenderedImage.model_validate(resp.json())


def guidance_used(req: GenerateRequest, spec: ModelSpec) -> float | None:
    if not spec.uses_guidance:
        return None
    return spec.default_guidance if req.guidance is None else req.guidance


class WebGenerateRequest(GenerateRequest):
    """What the browser sends: a variation names its start image in History instead of sending the image."""

    source_image_id: int | None = None
    # The character the image is made for; it is linked to the image, the prompt is left as written
    character_id: int | None = None
    # The web app loads the start image and the face image itself; image data from the browser is refused
    init_image: None = None
    face_image: None = None
    face_strength: None = None

    def has_start_image(self) -> bool:
        return self.source_image_id is not None


def start_image_fields(req: WebGenerateRequest) -> dict[str, str]:
    if req.source_image_id is None:
        return {}
    png = history_store.image_png(req.source_image_id)
    if png is None:
        raise HTTPException(404, "The start image is no longer in History; remove it and try again")
    return {"init_image": base64.b64encode(png).decode()}


def face_lock_of(req: WebGenerateRequest) -> tuple[int, float] | None:
    """The face image and strength to lock, when the character has a face image and the model can use it."""
    character = character_store.character(req.character_id) if req.character_id is not None else None
    if character is None or character.face_id is None or not MODELS[req.model].supports_face_lock:
        return None
    return character.face_id, character.face_strength


def face_lock_fields(face_lock: tuple[int, float] | None) -> dict[str, str | float]:
    if face_lock is None:
        return {}
    face_id, strength = face_lock
    png = history_store.image_png(face_id)
    # The face image was checked a moment ago; deleted since, the render goes ahead without it
    return {} if png is None else {"face_image": base64.b64encode(png).decode(), "face_strength": strength}


def model_server_request(req: WebGenerateRequest, face_lock: tuple[int, float] | None) -> GenerateRequest:
    """The request for the model server, with a variation's start image and the character's face loaded from History."""
    fields = req.model_dump(exclude={"source_image_id", "character_id"})
    return GenerateRequest(**fields | start_image_fields(req) | face_lock_fields(face_lock))


def check_character(character_id: int | None) -> None:
    if character_id is not None and character_store.character(character_id) is None:
        raise HTTPException(404, "That character no longer exists; pick another one and try again")


@app.post("/api/generate")
def generate(req: WebGenerateRequest) -> HistoryItem:
    check_character(req.character_id)
    face_lock = face_lock_of(req)
    server_request = model_server_request(req, face_lock)
    rendered = request_image(server_request)
    spec = MODELS[req.model]
    png = base64.b64decode(rendered.image_base64)
    # The image itself is checked too, since a model can make nudity the prompt doesn't ask for
    nsfw = nsfw_detector.is_nsfw(png)
    return history_store.add(NewImage(
        png=png, prompt=req.prompt, negative_prompt=req.negative_prompt, seed=rendered.seed,
        width=req.width, height=req.height, steps=req.steps or spec.default_steps,
        guidance=guidance_used(req, spec), model=req.model, duration_seconds=rendered.seconds,
        varied_from=req.source_image_id, change=req.change, character_id=req.character_id,
        face_from=face_lock[0] if face_lock and server_request.face_image else None,
        sensitive=True if nsfw else None, image_checked=nsfw is not None,
    ))


@app.get("/api/models/status")
def models_status() -> ModelStatusReport:
    try:
        resp = requests.get(f"{MODEL_SERVER_URL}/models/status", timeout=3)
        resp.raise_for_status()
    except requests.RequestException:
        return ModelStatusReport(server_running=False, models={}, free_bytes=None)
    return ModelStatusReport(server_running=True, **resp.json())


def model_server_call(method: str, model_id: str, path: str = "") -> requests.Response:
    """Forwards a model action, passing on the model server's status and message when it refuses."""
    if model_id not in MODELS:
        raise HTTPException(404, f"Unknown model: {model_id}")
    try:
        resp = requests.request(method, f"{MODEL_SERVER_URL}/models/{model_id}{path}", timeout=REQUEST_TIMEOUT)
    except requests.RequestException:
        raise HTTPException(503, "The model server is not running. Start it with: uv run python model_server.py")
    if not resp.ok:
        raise HTTPException(resp.status_code, model_server_detail(resp))
    return resp


@app.post("/api/models/{model_id}/download")
def download_model(model_id: str) -> ModelState:
    return ModelState(**model_server_call("POST", model_id, "/download").json())


@app.delete("/api/models/{model_id}", status_code=204)
def remove_model(model_id: str) -> None:
    model_server_call("DELETE", model_id)


JobId = Annotated[str, PathParam(pattern=JOB_ID_PATTERN)]


def job_call(method: str, job_id: str, path: str = "") -> requests.Response:
    try:
        resp = requests.request(method, f"{MODEL_SERVER_URL}/jobs/{job_id}{path}", timeout=5)
    except requests.RequestException:
        raise HTTPException(503, "The model server is not running. Start it with: uv run python model_server.py")
    if not resp.ok:
        raise HTTPException(resp.status_code, model_server_detail(resp))
    return resp


@app.get("/api/jobs/{job_id}/progress")
def job_progress(job_id: JobId) -> JobState:
    return JobState(**job_call("GET", job_id).json())


@app.post("/api/jobs/{job_id}/cancel", status_code=204)
def cancel_job(job_id: JobId) -> None:
    job_call("POST", job_id, "/cancel")


def history_filter(
    model: str | None = None,
    q: str = Query("", max_length=MAX_SEARCH_LENGTH),
    favourites: bool = False,
    ratio: Category | None = None,
    character: int | None = Query(None, ge=1),
) -> HistoryFilter:
    """History's filters from the query string, checked the same way wherever History is listed or exported."""
    if model is not None and model not in MODELS:
        raise HTTPException(422, f"Unknown model: {model}")
    return HistoryFilter(model=model, search=q.strip(), favourites_only=favourites, category=ratio, character_id=character)


@app.get("/api/history")
def history(
    offset: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=MAX_PAGE_SIZE),
    filters: HistoryFilter = Depends(history_filter),
) -> HistoryPage:
    items, total = history_store.page(offset, limit, filters)
    return HistoryPage(items=items, total=total)


@app.get("/api/history/export")
def export_history(filters: HistoryFilter = Depends(history_filter)) -> StreamingResponse:
    """The matching images as a zip: each PNG with a text file of its prompts and settings, and history.json."""
    filename = f"z-image-history-{date.today().isoformat()}.zip"
    return StreamingResponse(
        history_export.chunks(history_export.build_zip(filters)),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


class FavouriteUpdate(BaseModel):
    favourite: bool


@app.get("/api/history/{item_id}/palette")
def history_palette(item_id: int) -> list[PaletteColour]:
    colours = history_store.palette(item_id)
    if colours is None:
        raise HTTPException(404, "Image not found")
    return colours


@app.post("/api/history/{item_id}/edits", status_code=201)
def save_edit(item_id: int, recipe: EditRecipe) -> HistoryItem:
    """Saves the turned, flipped or cropped image as a new image; the original is never changed."""
    source = history_store.item(item_id)
    png = history_store.image_png(item_id)
    if source is None or png is None:
        raise HTTPException(404, "Image not found")
    try:
        edited, width, height = apply_edits(png, recipe)
    except EditOutsideImage as error:
        raise HTTPException(422, str(error))
    return history_store.add(NewImage(
        png=edited, prompt=source.prompt, negative_prompt=source.negative_prompt, seed=source.seed,
        width=width, height=height, steps=source.steps, guidance=source.guidance, model=source.model,
        duration_seconds=None, edited_from=source.id, character_id=source.character_id,
        # A cropped or turned copy keeps its original's flag, which may have been set by hand
        sensitive=source.sensitive, image_checked=True,
    ))


@app.put("/api/history/{item_id}/favourite")
def set_favourite(item_id: int, update: FavouriteUpdate) -> HistoryItem:
    item = history_store.set_favourite(item_id, update.favourite)
    if item is None:
        raise HTTPException(404, "Image not found")
    return item


class SensitiveUpdate(BaseModel):
    sensitive: bool


@app.put("/api/history/{item_id}/sensitive")
def set_sensitive(item_id: int, update: SensitiveUpdate) -> HistoryItem:
    item = history_store.set_sensitive(item_id, update.sensitive)
    if item is None:
        raise HTTPException(404, "Image not found")
    return item


def thumbnail(png: bytes) -> bytes:
    image = Image.open(io.BytesIO(png))
    image.thumbnail((THUMBNAIL_SIDE, THUMBNAIL_SIDE))
    buffer = io.BytesIO()
    image.save(buffer, format="WEBP", quality=85)
    return buffer.getvalue()


@app.get("/api/history/{item_id}/image")
def history_image(item_id: int, thumb: bool = False) -> Response:
    png = history_store.image_png(item_id)
    if png is None:
        raise HTTPException(404, "Image not found")
    if thumb:
        return Response(thumbnail(png), media_type="image/webp", headers=IMMUTABLE)
    return Response(png, media_type="image/png", headers=IMMUTABLE)


@app.delete("/api/history/{item_id}", status_code=204)
def delete_history_item(item_id: int) -> None:
    if not history_store.delete(item_id):
        raise HTTPException(404, "Image not found")


@app.delete("/api/history", status_code=204)
def clear_history() -> None:
    history_store.clear()


@app.get("/api/history/summary")
def history_summary() -> HistorySummary:
    return history_store.summary()


class Deleted(BaseModel):
    deleted: int


@app.delete("/api/history/older-than/{days}")
def delete_old_history(days: int) -> Deleted:
    if days not in CLEANUP_AGES_DAYS:
        raise HTTPException(422, f"days must be one of {', '.join(map(str, CLEANUP_AGES_DAYS))}")
    return Deleted(deleted=history_store.delete_older_than(days))


@app.get("/api/characters")
def list_characters() -> list[Character]:
    return character_store.all_characters()


@app.post("/api/characters", status_code=201)
def create_character(new: NewCharacter) -> Character:
    try:
        return character_store.create(new)
    except DuplicateName as error:
        raise HTTPException(409, str(error))
    except MissingImage as error:
        raise HTTPException(422, str(error))


@app.patch("/api/characters/{character_id}")
def update_character(character_id: int, changes: CharacterUpdate) -> Character:
    try:
        updated = character_store.update(character_id, changes)
    except DuplicateName as error:
        raise HTTPException(409, str(error))
    except MissingImage as error:
        raise HTTPException(422, str(error))
    if updated is None:
        raise HTTPException(404, "Character not found")
    return updated


@app.delete("/api/characters/{character_id}", status_code=204)
def delete_character(character_id: int) -> None:
    if not character_store.delete(character_id):
        raise HTTPException(404, "Character not found")


@app.post("/api/chat")
def chat(req: ChatRequest) -> StreamingResponse:
    """Stream Grok's rewritten prompt as plain text chunks."""
    if not grok_client.available:
        raise HTTPException(503, "Chat is unavailable: set XAI_API_KEY in .env")
    chunks = grok_client.chat_stream([message.model_dump() for message in req.messages])
    # Pull the first chunk here, so auth and connection errors become a proper error response
    try:
        first: Iterator[str] = iter([next(chunks, "")])
    except (openai.OpenAIError, ValueError) as e:
        raise HTTPException(502, f"Grok API error: {e}")
    return StreamingResponse(itertools.chain(first, chunks), media_type="text/plain; charset=utf-8")


if FRONTEND_DIST.exists():
    @app.get("/history", include_in_schema=False)
    @app.get("/history/", include_in_schema=False)
    @app.get("/characters", include_in_schema=False)
    @app.get("/characters/", include_in_schema=False)
    def history_view() -> FileResponse:
        """The UI's History and Characters views: the same page, which reads the view from the address."""
        return FileResponse(FRONTEND_DIST / "index.html")

    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
else:
    @app.get("/")
    def frontend_missing() -> PlainTextResponse:
        return PlainTextResponse("The UI is not built yet. Run: cd frontend && npm ci && npm run build", status_code=503)


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=7860)
