import io
import asyncio
import base64
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from huggingface_hub import snapshot_download
from pydantic import BaseModel
from mflux.models.z_image.variants.z_image import ZImage


MODELS_DIR = Path(__file__).parent / "models"
REPO_ID = "Tongyi-MAI/Z-Image-Turbo"
ORIGINAL_PATH = MODELS_DIR / "Z-Image-Turbo"
MODEL_PATH = MODELS_DIR / "zimage-q4"
QUANTIZE_BITS = 4

pipe: ZImage | None = None
# MLX streams belong to the thread that created them, so all model work runs on this one thread
model_thread = ThreadPoolExecutor(max_workers=1)


def quantize_and_save() -> None:
    # Resumes a partial download and keeps files already in place
    print(f"Downloading {REPO_ID} to {ORIGINAL_PATH}...")
    snapshot_download(REPO_ID, local_dir=ORIGINAL_PATH, cache_dir=MODELS_DIR / ".hf-cache")
    print(f"Creating {QUANTIZE_BITS}-bit model at {MODEL_PATH}...")
    ZImage(quantize=QUANTIZE_BITS, model_path=str(ORIGINAL_PATH)).save_model(str(MODEL_PATH))


def load_model() -> ZImage:
    global pipe
    if pipe is None:
        if not MODEL_PATH.exists():
            quantize_and_save()
        print("Loading model...")
        pipe = ZImage(model_path=str(MODEL_PATH))
        print("Model loaded!")
    return pipe


@asynccontextmanager
async def lifespan(app: FastAPI):
    await asyncio.get_running_loop().run_in_executor(model_thread, load_model)
    yield


app = FastAPI(lifespan=lifespan)


class GenerateRequest(BaseModel):
    prompt: str
    width: int = 1024
    height: int = 1024
    steps: int = 8
    seed: int = -1


class GenerateResponse(BaseModel):
    image_base64: str
    seed: int


def generate_png(req: GenerateRequest) -> bytes:
    image = load_model().generate_image(
        seed=req.seed,
        prompt=req.prompt,
        num_inference_steps=req.steps,
        height=req.height,
        width=req.width,
    ).image

    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


@app.post("/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest) -> GenerateResponse:
    png = await asyncio.get_running_loop().run_in_executor(model_thread, generate_png, req)
    image_base64 = base64.b64encode(png).decode("utf-8")
    return GenerateResponse(image_base64=image_base64, seed=req.seed)


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": pipe is not None}


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
