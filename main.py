import io
import base64
import itertools
from collections.abc import Iterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
load_dotenv()

import openai
import requests
import uvicorn
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.responses import PlainTextResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image
from pydantic import BaseModel, Field, model_validator

import history_store
from generation_request import MAX_PROMPT_LENGTH, MAX_SEED, MIN_SIDE, SIDE_STEP, GenerateRequest
from grok_client import GrokClient
from history_store import HistoryItem, NewImage
from model_catalog import MODEL_CATEGORIES, MODELS, ModelSpec
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

EXAMPLE_PROMPTS: list[str] = [
    'A man and his poodle wearing matching outfits at a dog show, indoor lighting, an audience in the background.',
    'Moody, low-key portrait of an elegant Chinese woman in a dark room. A strong beam of light passes through a gobo and casts a sharp lightning-bolt-shaped shadow across her face, lighting exactly one eye. High contrast, crisp light-to-shadow transition, mysterious atmosphere, Leica colour tones.',
    'A medium-shot phone selfie of a young East Asian woman with long black hair taking a mirror selfie in a brightly lit elevator. She wears a black off-the-shoulder crop top with a white floral pattern and dark jeans. Her head is tilted slightly and her lips are pursed in a playful kiss, very cute. She holds a dark grey smartphone in her right hand, partly covering her face, with the rear camera facing the mirror.',
    "Young Chinese woman in red Hanfu, intricate embroidery. Impeccable makeup, red floral forehead pattern. Elaborate high bun, golden phoenix headdress, red flowers, beads. Holds round folding fan with lady, trees, bird. Neon lightning-bolt lamp (⚡️), bright yellow glow, above extended left palm. Soft-lit outdoor night background, silhouetted tiered pagoda (Xi'an Giant Wild Goose Pagoda), blurred colorful distant lights.",
    'A vertical digital illustration depicting a serene and majestic Chinese landscape, rendered in a style reminiscent of traditional Shanshui painting but with a modern, clean aesthetic. The scene is dominated by towering, steep cliffs in various shades of blue and teal, which frame a central valley. In the distance, layers of mountains fade into a light blue and white mist, creating a strong sense of atmospheric perspective and depth. A calm, turquoise river flows through the center of the composition, with a small, traditional Chinese boat, possibly a sampan, navigating its waters. The boat has a bright yellow canopy and a red hull, and it leaves a gentle wake behind it. It carries several indistinct figures of people. Sparse vegetation, including green trees and some bare-branched trees, clings to the rocky ledges and peaks. The overall lighting is soft and diffused, casting a tranquil glow over the entire scene. Centered in the image is overlaid text. At the top of the text block is a small, red, circular seal-like logo containing stylized characters. Below it, in a smaller, black, sans-serif font, are the words \'Zao-Xiang * East Beauty & West Fashion * Z-Image\'. Directly beneath this, in a larger, elegant black serif font, is the word \'SHOW & SHARE CREATIVITY WITH THE WORLD\'. Among them, there are "SHOW & SHARE", "CREATIVITY", and "WITH THE WORLD"',
]

grok_client = GrokClient()


class ModelInfo(BaseModel):
    id: str
    repo_id: str
    label: str
    description: str
    speed_hint: str
    category: str
    download_gb: float
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

    @classmethod
    def from_spec(cls, spec: ModelSpec) -> "ModelInfo":
        width, height = spec.default_size
        return cls(
            id=spec.id, repo_id=spec.repo_id, label=spec.label, description=spec.description, speed_hint=spec.speed_hint, category=spec.category, download_gb=spec.download_gb,
            default_steps=spec.default_steps, max_steps=spec.max_steps, max_side=spec.max_side,
            default_width=width, default_height=height, uses_guidance=spec.uses_guidance,
            default_guidance=spec.default_guidance, default_negative_prompt=spec.default_negative_prompt,
            trigger_word=spec.trigger_word, prompt_style=spec.prompt_style,
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
    examples: list[str]
    chat_available: bool
    limits: Limits


ModelStatus = Literal["ready", "queued", "downloading", "missing", "failed"]


class ModelStatusReport(BaseModel):
    server_running: bool
    models: dict[str, ModelStatus]


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


@app.get("/api/catalog")
def catalog() -> Catalog:
    return Catalog(
        models=[ModelInfo.from_spec(spec) for spec in MODELS.values()],
        model_categories=[ModelCategoryInfo(id=key, label=label) for key, label in MODEL_CATEGORIES.items()],
        resolutions=[ResolutionInfo(**preset.to_dict()) for preset in PRESETS],
        categories=list(CATEGORIES),
        examples=EXAMPLE_PROMPTS,
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
        return ModelStatusReport(server_running=False, models={})
    return ModelStatusReport(server_running=True, models=resp.json())


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
