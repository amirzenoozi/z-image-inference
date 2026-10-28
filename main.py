import io
import base64
import itertools
from collections.abc import Iterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Literal

from dotenv import load_dotenv
load_dotenv()

import openai
import requests
import uvicorn
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.responses import PlainTextResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image
from pydantic import BaseModel, Field, StringConstraints, TypeAdapter, model_validator

import history_store
from generation_request import MAX_PROMPT_LENGTH, MAX_SEED, MIN_SIDE, SIDE_STEP, GenerateRequest
from grok_client import GrokClient
from history_store import HistoryItem, NewImage
from model_catalog import MODEL_CATEGORIES, MODELS, ModelSpec, kept_gb, speed_hint
from resolutions import CATEGORIES, PRESETS

MODEL_SERVER_URL = "http://127.0.0.1:8000"
# Long enough for a first-time model download or a switch between models
REQUEST_TIMEOUT = 900
FRONTEND_DIST = Path(__file__).parent / "frontend" / "dist"
THUMBNAIL_SIDE = 384
MAX_PAGE_SIZE = 100
MAX_CHAT_MESSAGES = 50
# History images never change: ids are not reused after a delete
IMMUTABLE = {"Cache-Control": "private, max-age=31536000, immutable"}

# Each model's example prompts; edit the file and reload the page to change them
EXAMPLE_PROMPTS_FILE = Path(__file__).parent / "example_prompts.json"
ExamplePrompt = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_PROMPT_LENGTH)]
EXAMPLE_PROMPTS = TypeAdapter(dict[str, list[ExamplePrompt]])

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
    examples: list[str]

    @classmethod
    def from_spec(cls, spec: ModelSpec, examples: list[str]) -> "ModelInfo":
        width, height = spec.default_size
        return cls(
            id=spec.id, repo_id=spec.repo_id, label=spec.label, description=spec.description, speed_hint=speed_hint(spec), category=spec.category, download_gb=spec.download_gb, kept_gb=kept_gb(spec),
            default_steps=spec.default_steps, max_steps=spec.max_steps, max_side=spec.max_side,
            default_width=width, default_height=height, uses_guidance=spec.uses_guidance,
            default_guidance=spec.default_guidance, default_negative_prompt=spec.default_negative_prompt,
            trigger_word=spec.trigger_word, prompt_style=spec.prompt_style, examples=examples,
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


class Catalog(BaseModel):
    models: list[ModelInfo]
    model_categories: list[ModelCategoryInfo]
    resolutions: list[ResolutionInfo]
    categories: list[str]
    chat_available: bool
    limits: Limits


ModelStatus = Literal["ready", "queued", "downloading", "missing", "failed"]


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


@asynccontextmanager
async def lifespan(app: FastAPI):
    history_store.init_db()
    yield


app = FastAPI(title="Z-Image Inference", lifespan=lifespan)


def example_prompts() -> dict[str, list[str]]:
    prompts = EXAMPLE_PROMPTS.validate_json(EXAMPLE_PROMPTS_FILE.read_bytes())
    unknown = prompts.keys() - MODELS.keys()
    if unknown:
        raise ValueError(f"{EXAMPLE_PROMPTS_FILE.name} lists unknown models: {', '.join(sorted(unknown))}")
    return prompts


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


def request_image(req: GenerateRequest) -> tuple[bytes, int]:
    try:
        resp = requests.post(f"{MODEL_SERVER_URL}/generate", json=req.model_dump(), timeout=REQUEST_TIMEOUT)
    except requests.ConnectionError:
        raise HTTPException(503, "The model server is not running. Start it with: uv run python model_server.py")
    except requests.Timeout:
        raise HTTPException(504, "The model server took too long. A first-time model download may still be running.")
    if resp.status_code in (422, 503):
        # 503 means the model is still downloading; its message says so
        raise HTTPException(resp.status_code, model_server_detail(resp))
    if not resp.ok:
        raise HTTPException(502, f"The model server failed ({resp.status_code}). Check its terminal for details.")
    data = resp.json()
    return base64.b64decode(data["image_base64"]), int(data["seed"])


def guidance_used(req: GenerateRequest, spec: ModelSpec) -> float | None:
    if not spec.uses_guidance:
        return None
    return spec.default_guidance if req.guidance is None else req.guidance


@app.post("/api/generate")
def generate(req: GenerateRequest) -> HistoryItem:
    png, seed = request_image(req)
    spec = MODELS[req.model]
    return history_store.add(NewImage(
        png=png, prompt=req.prompt, negative_prompt=req.negative_prompt, seed=seed,
        width=req.width, height=req.height, steps=req.steps or spec.default_steps,
        guidance=guidance_used(req, spec), model=req.model,
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


@app.get("/api/history")
def history(offset: int = Query(0, ge=0), limit: int = Query(30, ge=1, le=MAX_PAGE_SIZE)) -> HistoryPage:
    items, total = history_store.page(offset, limit)
    return HistoryPage(items=items, total=total)


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
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
else:
    @app.get("/")
    def frontend_missing() -> PlainTextResponse:
        return PlainTextResponse("The UI is not built yet. Run: cd frontend && npm ci && npm run build", status_code=503)


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=7860)
