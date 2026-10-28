import io
import gc
import json
import shutil
import asyncio
import base64
import random
from collections.abc import Callable
from concurrent.futures import Future, ThreadPoolExecutor
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import mlx.core as mx
import torch
import uvicorn
from diffusers import AutoencoderKLFlux2, DPMSolverMultistepScheduler, EulerAncestralDiscreteScheduler, StableDiffusionXLPipeline
from fastapi import FastAPI, HTTPException
from huggingface_hub import snapshot_download
from mflux.models.z_image.variants.z_image import ZImage
from optimum.quanto import freeze, qint8, quantization_map, quantize, requantize
from PIL import Image
from safetensors import safe_open
from safetensors.torch import load_file, save_file
from pydantic import BaseModel
from transformers import AutoConfig, AutoModel, AutoTokenizer

from generation_request import MAX_SEED, GenerateRequest
from model_catalog import ANIME_DESIRE, DEFAULT_MODEL, MODELS, MOSS_IMAGE, WAI_ILLUSTRIOUS, Z_IMAGE, ModelSpec
from moss_pipeline import MOSSImagePipeline, MOSSImageScheduler, MOSSImageTransformer


MODELS_DIR = Path(__file__).parent / "models"
HF_CACHE_DIR = MODELS_DIR / ".hf-cache"
Z_IMAGE_PATH = MODELS_DIR / "Z-Image-Turbo"
Z_IMAGE_Q4_PATH = MODELS_DIR / "zimage-q4"
WAI_ILLUSTRIOUS_PATH = MODELS_DIR / "waiNSFWIllustrious_v120"
# The repo's "fp16" files are full precision too, so fetch only one set
WAI_ILLUSTRIOUS_FILES = ["*.json", "*.txt", "*.fp16.safetensors"]
# Stored as float32 upstream but run in float16; the VAE stays float32 because it decodes in float32
WAI_FLOAT16_COMPONENTS = ["unet", "text_encoder", "text_encoder_2"]
ANIME_DESIRE_PATH = MODELS_DIR / "anime-desire-illustrious"
ANIME_DESIRE_FILE = "anime-2d-ill_v3.fp16.safetensors"
# A single-file checkpoint needs the standard SDXL configs to load; kept in models/ like everything else
SDXL_CONFIG_REPO = "stabilityai/stable-diffusion-xl-base-1.0"
SDXL_CONFIG_PATH = MODELS_DIR / "sdxl-base-config"
SDXL_CONFIG_FILES = ["model_index.json", "*/*.json", "*/*.txt"]
MOSS_IMAGE_PATH = MODELS_DIR / "moss-image-nsfw"
MOSS_IMAGE_MODEL_PATH = MOSS_IMAGE_PATH / "merged-model"
# 8-bit copy of the 16 GB text encoder: 9.4 GB, 7 GB less memory and faster, with near-identical images
MOSS_TEXT_ENCODER_Q8_PATH = MOSS_IMAGE_PATH / "text_encoder-q8"
QUANTO_MAP_FILE = "quanto_qmap.json"
# Only the merged model; its pipeline code is vendored in moss_pipeline.py
MOSS_IMAGE_FILES = ["merged-model/**/*.json", "merged-model/**/*.jinja", "merged-model/**/*.safetensors"]
QUANTIZE_BITS = 4


@dataclass(frozen=True)
class Job:
    prompt: str
    negative_prompt: str
    width: int
    height: int
    steps: int
    guidance: float
    seed: int


ImageGenerator = Callable[[Job], Image.Image]


def to_job(req: GenerateRequest) -> Job:
    spec = MODELS[req.model]
    return Job(
        prompt=with_trigger_word(req.prompt, spec),
        negative_prompt=req.negative_prompt,
        width=req.width,
        height=req.height,
        steps=req.steps or spec.default_steps,
        guidance=spec.default_guidance if req.guidance is None else req.guidance,
        seed=random.randint(0, MAX_SEED) if req.seed is None else req.seed,
    )


class GenerateResponse(BaseModel):
    image_base64: str
    seed: int
    model: str


def with_trigger_word(prompt: str, spec: ModelSpec) -> str:
    if not spec.trigger_word or spec.trigger_word in prompt:
        return prompt
    return f"{spec.trigger_word}, {prompt}"


def download_marker(path: Path) -> Path:
    # Written last, so an interrupted download counts as missing and resumes next time
    return path / ".download-complete"


def ensure_downloaded(repo_id: str, path: Path, allow_patterns: list[str] | None = None) -> None:
    marker = download_marker(path)
    if marker.exists():
        return
    print(f"Downloading {repo_id} to {path}...")
    snapshot_download(repo_id, local_dir=path, cache_dir=HF_CACHE_DIR, allow_patterns=allow_patterns)
    marker.touch()


def build_z_image_q4() -> None:
    """Quantise Z-Image to 4-bit once, then delete the 31 GB original, which nothing else uses."""
    ensure_downloaded(Z_IMAGE.repo_id, Z_IMAGE_PATH)
    print(f"Creating {QUANTIZE_BITS}-bit model at {Z_IMAGE_Q4_PATH}...")
    # Built beside the final folder and renamed when complete, so an interrupted build is never used
    building = Z_IMAGE_Q4_PATH.with_name(f"{Z_IMAGE_Q4_PATH.name}.building")
    shutil.rmtree(building, ignore_errors=True)
    ZImage(quantize=QUANTIZE_BITS, model_path=str(Z_IMAGE_PATH)).save_model(str(building))
    building.rename(Z_IMAGE_Q4_PATH)
    shutil.rmtree(Z_IMAGE_PATH)


def load_z_image() -> ImageGenerator:
    if not Z_IMAGE_Q4_PATH.exists():
        build_z_image_q4()
    model = ZImage(model_path=str(Z_IMAGE_Q4_PATH))

    def generate(job: Job) -> Image.Image:
        return model.generate_image(
            seed=job.seed,
            prompt=job.prompt,
            num_inference_steps=job.steps,
            height=job.height,
            width=job.width,
        ).image

    return generate


def has_float32(file: Path) -> bool:
    with safe_open(file, "pt") as weights:
        return any(weights.get_slice(name).get_dtype() == "F32" for name in weights.keys())


def store_as_float16(path: Path, components: list[str]) -> None:
    """Rewrite float32 weights as float16 once, halving their size without changing what the model computes."""
    for file in (f for name in components for f in (path / name).glob("*.safetensors")):
        if not has_float32(file):
            continue
        print(f"Storing {file.relative_to(path)} as float16...")
        tensors = {name: t.to(torch.float16) if t.dtype == torch.float32 else t for name, t in load_file(file).items()}
        temporary = file.with_suffix(".tmp")
        save_file(tensors, temporary, metadata={"format": "pt"})
        temporary.replace(file)


def load_wai_illustrious() -> ImageGenerator:
    ensure_downloaded(WAI_ILLUSTRIOUS.repo_id, WAI_ILLUSTRIOUS_PATH, WAI_ILLUSTRIOUS_FILES)
    store_as_float16(WAI_ILLUSTRIOUS_PATH, WAI_FLOAT16_COMPONENTS)
    pipe = StableDiffusionXLPipeline.from_pretrained(
        WAI_ILLUSTRIOUS_PATH,
        torch_dtype=torch.float16,
        variant="fp16",
        use_safetensors=True,
    )
    pipe.scheduler = EulerAncestralDiscreteScheduler.from_config(pipe.scheduler.config)
    return sdxl_generator(pipe)


def download_anime_desire() -> None:
    ensure_downloaded(SDXL_CONFIG_REPO, SDXL_CONFIG_PATH, SDXL_CONFIG_FILES)
    ensure_downloaded(ANIME_DESIRE.repo_id, ANIME_DESIRE_PATH, [ANIME_DESIRE_FILE])


def load_anime_desire() -> ImageGenerator:
    download_anime_desire()
    pipe = StableDiffusionXLPipeline.from_single_file(
        ANIME_DESIRE_PATH / ANIME_DESIRE_FILE,
        config=str(SDXL_CONFIG_PATH),
        local_files_only=True,
        torch_dtype=torch.float16,
    )
    # The model card's DPM++ 3M SDE Karras sampler
    pipe.scheduler = DPMSolverMultistepScheduler.from_config(
        pipe.scheduler.config, algorithm_type="sde-dpmsolver++", solver_order=3, use_karras_sigmas=True,
    )
    return sdxl_generator(pipe)


def sdxl_generator(pipe: StableDiffusionXLPipeline) -> ImageGenerator:
    pipe.to(torch.device("mps"))
    pipe.vae.to(dtype=torch.float32)

    def generate(job: Job) -> Image.Image:
        # A CPU generator is more stable than an MPS one
        generator = torch.Generator("cpu").manual_seed(job.seed)
        with torch.inference_mode():
            latents = pipe(
                prompt=job.prompt,
                negative_prompt=job.negative_prompt or None,
                width=job.width,
                height=job.height,
                num_inference_steps=job.steps,
                guidance_scale=job.guidance,
                generator=generator,
                output_type="latent",
            ).images
            return decode_in_float32(pipe, latents)

    return generate


def decode_in_float32(pipe: StableDiffusionXLPipeline, latents: torch.Tensor) -> Image.Image:
    # The SDXL VAE overflows in float16, and diffusers' own upcast leaves some layers in float16 on MPS
    decoded = pipe.vae.decode(latents.to(torch.float32) / pipe.vae.config.scaling_factor).sample
    return pipe.image_processor.postprocess(decoded, output_type="pil")[0]


MossEmbeddings = tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]


def build_moss_text_encoder_q8() -> None:
    """Quantise the text encoder to 8-bit once, then delete the bfloat16 original to save 16 GB."""
    original = MOSS_IMAGE_MODEL_PATH / "text_encoder"
    if not original.exists():
        snapshot_download(MOSS_IMAGE.repo_id, local_dir=MOSS_IMAGE_PATH, cache_dir=HF_CACHE_DIR, allow_patterns=["merged-model/text_encoder/*"])
    print(f"Creating 8-bit text encoder at {MOSS_TEXT_ENCODER_Q8_PATH}...")
    encoder = AutoModel.from_pretrained(original, dtype=torch.bfloat16).eval()
    quantize(encoder, weights=qint8)
    freeze(encoder)
    # Built beside the final folder and renamed when complete, so an interrupted build is never used
    building = MOSS_TEXT_ENCODER_Q8_PATH.with_name(f"{MOSS_TEXT_ENCODER_Q8_PATH.name}.building")
    shutil.rmtree(building, ignore_errors=True)
    building.mkdir()
    encoder.config.save_pretrained(building)
    save_file(encoder.state_dict(), building / "model.safetensors")
    (building / QUANTO_MAP_FILE).write_text(json.dumps(quantization_map(encoder)))
    building.rename(MOSS_TEXT_ENCODER_Q8_PATH)
    shutil.rmtree(original)


def load_moss_text_encoder() -> torch.nn.Module:
    if not MOSS_TEXT_ENCODER_Q8_PATH.exists():
        build_moss_text_encoder_q8()
    with torch.device("meta"):
        encoder = AutoModel.from_config(AutoConfig.from_pretrained(MOSS_TEXT_ENCODER_Q8_PATH), dtype=torch.bfloat16)
    quantized_map = json.loads((MOSS_TEXT_ENCODER_Q8_PATH / QUANTO_MAP_FILE).read_text())
    requantize(encoder, load_file(MOSS_TEXT_ENCODER_Q8_PATH / "model.safetensors"), quantized_map, device=torch.device("cpu"))
    return encoder.eval()


@torch.no_grad()
def encode_moss_prompts(prompt: str, negative_prompt: str) -> MossEmbeddings:
    """Mirrors MOSSImagePipeline.encode_prompt, with the text encoder loaded only for this call."""
    tokenizer = AutoTokenizer.from_pretrained(MOSS_IMAGE_MODEL_PATH / "tokenizer")
    encoder = load_moss_text_encoder().to(torch.device("mps"))
    encoded: list[torch.Tensor] = []
    for text in (prompt, negative_prompt):
        formatted = tokenizer.apply_chat_template(
            [{"role": "user", "content": text}], tokenize=False, add_generation_prompt=True, enable_thinking=True,
        )
        inputs = tokenizer(formatted, return_tensors="pt", truncation=True, max_length=4096).to(encoder.device)
        hidden = encoder(**inputs, use_cache=False, return_dict=True).last_hidden_state
        encoded += [hidden.to("cpu"), torch.ones(hidden.shape[:2], dtype=torch.bool)]
    return encoded[0], encoded[1], encoded[2], encoded[3]


def load_moss_image_pipe() -> MOSSImagePipeline:
    transformer = MOSSImageTransformer.from_pretrained(MOSS_IMAGE_MODEL_PATH / "transformer", torch_dtype=torch.bfloat16)
    vae = AutoencoderKLFlux2.from_pretrained(MOSS_IMAGE_MODEL_PATH / "vae", torch_dtype=torch.float32)
    pipe = MOSSImagePipeline(transformer.eval(), MOSSImageScheduler(), None, None, vae.eval())
    return pipe.to(torch.device("mps"))


class MossImageGenerator:
    """The text encoder (17 GB) and the image model (10 GB) do not fit in memory together, so they take turns.

    The last prompt's embeddings are kept, so a new seed or size for the same prompt skips the text encoder.
    """

    def __init__(self) -> None:
        ensure_downloaded(MOSS_IMAGE.repo_id, MOSS_IMAGE_PATH, MOSS_IMAGE_FILES)
        self.pipe: MOSSImagePipeline | None = None
        self.prompts: tuple[str, str] | None = None
        self.embeddings: MossEmbeddings | None = None

    def __call__(self, job: Job) -> Image.Image:
        prompts = (job.prompt, job.negative_prompt)
        if prompts != self.prompts or self.embeddings is None:
            self.pipe = None
            release_memory()
            self.embeddings = encode_moss_prompts(*prompts)
            self.prompts = prompts
            release_memory()
        if self.pipe is None:
            self.pipe = load_moss_image_pipe()
        positive, positive_mask, negative, negative_mask = self.embeddings
        return self.pipe(
            prompt_embeds=positive,
            prompt_attention_mask=positive_mask,
            negative_prompt_embeds=negative,
            negative_prompt_attention_mask=negative_mask,
            height=job.height,
            width=job.width,
            num_inference_steps=job.steps,
            guidance_scale=job.guidance,
            generator=torch.Generator("cpu").manual_seed(job.seed),
        ).images[0]


LOADERS: dict[str, Callable[[], ImageGenerator]] = {
    Z_IMAGE.id: load_z_image,
    WAI_ILLUSTRIOUS.id: load_wai_illustrious,
    MOSS_IMAGE.id: MossImageGenerator,
    ANIME_DESIRE.id: load_anime_desire,
}

DOWNLOADERS: dict[str, Callable[[], None]] = {
    Z_IMAGE.id: lambda: ensure_downloaded(Z_IMAGE.repo_id, Z_IMAGE_PATH),
    WAI_ILLUSTRIOUS.id: lambda: ensure_downloaded(WAI_ILLUSTRIOUS.repo_id, WAI_ILLUSTRIOUS_PATH, WAI_ILLUSTRIOUS_FILES),
    MOSS_IMAGE.id: lambda: ensure_downloaded(MOSS_IMAGE.repo_id, MOSS_IMAGE_PATH, MOSS_IMAGE_FILES),
    ANIME_DESIRE.id: download_anime_desire,
}
DOWNLOAD_PATHS: dict[str, Path] = {
    Z_IMAGE.id: Z_IMAGE_PATH,
    WAI_ILLUSTRIOUS.id: WAI_ILLUSTRIOUS_PATH,
    MOSS_IMAGE.id: MOSS_IMAGE_PATH,
    ANIME_DESIRE.id: ANIME_DESIRE_PATH,
}

ModelStatus = Literal["ready", "queued", "downloading", "missing", "failed"]

# Downloads get their own thread, so generating with a downloaded model is never blocked by one
download_thread = ThreadPoolExecutor(max_workers=1)
downloads: dict[str, Future[None]] = {}


def is_downloaded(model_id: str) -> bool:
    # Z-Image's 4-bit copy replaces its download, which is deleted once the copy is built
    if model_id == Z_IMAGE.id and Z_IMAGE_Q4_PATH.exists():
        return True
    return download_marker(DOWNLOAD_PATHS[model_id]).exists()


def model_status(model_id: str) -> ModelStatus:
    if is_downloaded(model_id):
        return "ready"
    download = downloads.get(model_id)
    if download is None:
        return "missing"
    if download.done():
        return "failed"
    # Downloads run one at a time; the others wait their turn
    return "downloading" if download.running() else "queued"


def start_download(model_id: str) -> None:
    if model_status(model_id) in ("missing", "failed"):
        downloads[model_id] = download_thread.submit(DOWNLOADERS[model_id])


def download_started_message(model_id: str) -> str:
    """Starts the download if needed and explains it, mentioning a previous failure."""
    spec = MODELS[model_id]
    previous = downloads.get(model_id)
    failure = previous.exception() if previous is not None and previous.done() else None
    start_download(model_id)
    message = (
        f"{spec.label} is downloading for first use (about {spec.download_gb:g} GB). "
        "Try again when it has finished; the model list shows its progress."
    )
    return f"The last download failed ({failure}) and has been restarted. {message}" if failure else message


loaded_model_id: str | None = None
loaded_generator: ImageGenerator | None = None
# MLX streams belong to the thread that created them, so all model work runs on this one thread
model_thread = ThreadPoolExecutor(max_workers=1)


def release_memory() -> None:
    gc.collect()
    mx.clear_cache()
    torch.mps.empty_cache()


def use_model(model_id: str) -> ImageGenerator:
    """Load the requested model, unloading the current one first: both do not fit in memory together."""
    global loaded_model_id, loaded_generator
    if model_id != loaded_model_id or loaded_generator is None:
        loaded_model_id, loaded_generator = None, None
        release_memory()
        print(f"Loading {MODELS[model_id].label}...")
        loaded_generator = LOADERS[model_id]()
        loaded_model_id = model_id
        print("Model loaded!")
    return loaded_generator


def generate_png(model_id: str, job: Job) -> bytes:
    image = use_model(model_id)(job)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Queue every missing model at start, default first, so each is ready before it is first chosen
    for model_id in sorted(MODELS, key=lambda model_id: model_id != DEFAULT_MODEL.id):
        start_download(model_id)
    if is_downloaded(DEFAULT_MODEL.id):
        await asyncio.get_running_loop().run_in_executor(model_thread, use_model, DEFAULT_MODEL.id)
    yield


app = FastAPI(lifespan=lifespan)


@app.post("/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest) -> GenerateResponse:
    if model_status(req.model) != "ready":
        raise HTTPException(503, download_started_message(req.model))
    job = to_job(req)
    png = await asyncio.get_running_loop().run_in_executor(model_thread, generate_png, req.model, job)
    return GenerateResponse(image_base64=base64.b64encode(png).decode("utf-8"), seed=job.seed, model=req.model)


@app.get("/models/status")
def models_status() -> dict[str, ModelStatus]:
    return {model_id: model_status(model_id) for model_id in MODELS}


@app.get("/health")
def health() -> dict[str, str | None]:
    return {"status": "ok", "loaded_model": loaded_model_id}


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
