import io
import os

from dotenv import load_dotenv
load_dotenv()

import gc
import json
import shutil
import asyncio
import base64
import random
import time
import uuid
from collections.abc import Callable
from concurrent.futures import Future, ThreadPoolExecutor
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import mlx.core as mx
import torch
import uvicorn
from compel import CompelForSDXL
from diffusers import AutoencoderKLFlux2, DPMSolverMultistepScheduler, EulerAncestralDiscreteScheduler, StableDiffusionXLPipeline
from fastapi import FastAPI, HTTPException, Response
from huggingface_hub import snapshot_download
from mflux.models.z_image.variants.z_image import ZImage
from optimum.quanto import freeze, qint8, quantization_map, quantize, requantize
from PIL import Image
from safetensors import safe_open
from safetensors.torch import load_file, save_file
from pydantic import BaseModel
from transformers import AutoConfig, AutoModel, AutoTokenizer

from generation_request import MAX_SEED, GenerateRequest
from prompt_weights import a1111_to_compel
from model_catalog import ANIME_DESIRE, DEFAULT_MODEL, MODELS, MOSS_IMAGE, WAI_ILLUSTRIOUS, Z_IMAGE, ModelSpec, Z_IMAGE_LEVELS, compression_enabled, runs_compressed, z_image_bits
from moss_pipeline import MOSSImagePipeline, MOSSImageScheduler, MOSSImageTransformer


MODELS_DIR = Path(__file__).parent / "models"
HF_CACHE_DIR = MODELS_DIR / ".hf-cache"
Z_IMAGE_PATH = MODELS_DIR / "Z-Image-Turbo"


def z_image_quantized_path(bits: int) -> Path:
    """Each level gets its own folder beside the kept original."""
    return MODELS_DIR / f"zimage-q{bits}"


WAI_ILLUSTRIOUS_PATH = MODELS_DIR / "waiNSFWIllustrious_v120"
# The repo's "fp16" files are full precision too, so fetch only one set
WAI_ILLUSTRIOUS_FILES = ["*.json", "*.txt", "*.fp16.safetensors"]
# Stored as float32 upstream but run in float16; the VAE stays float32 because it decodes in float32
WAI_FLOAT16_COMPONENTS = ["unet", "text_encoder", "text_encoder_2"]
# Its original weights are float32; once rewritten as float16 they no longer count as the originals
WAI_UNET_FILE = Path("unet") / "diffusion_pytorch_model.fp16.safetensors"
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


@dataclass(frozen=True)
class Job:
    prompt: str
    negative_prompt: str
    width: int
    height: int
    steps: int
    guidance: float
    seed: int


JobPhase = Literal["waiting", "loading", "encoding", "generating", "finishing"]


class JobCancelled(Exception):
    pass


@dataclass
class JobProgress:
    """Where a generation is, read by GET /jobs/{id}; cancelling takes effect at the next phase or step."""

    total: int
    phase: JobPhase = "waiting"
    step: int = 0
    cancelled: bool = False

    def enter(self, phase: JobPhase) -> None:
        self.check_cancelled()
        self.phase = phase

    def step_done(self, step: int) -> None:
        self.step = step
        if step >= self.total:
            self.phase = "finishing"
        self.check_cancelled()

    def check_cancelled(self) -> None:
        if self.cancelled:
            raise JobCancelled()


ImageGenerator = Callable[[Job, JobProgress], Image.Image]


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
    # Rendering only: waiting for the model thread and loading the model are not counted
    seconds: float


@dataclass(frozen=True)
class RenderedImage:
    png: bytes
    seconds: float


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


def build_z_image_quantized(bits: int, target: Path) -> None:
    """Quantise Z-Image once into `target`. The original is kept, to compare against and rebuild from."""
    ensure_downloaded(Z_IMAGE.repo_id, Z_IMAGE_PATH)
    if target.exists():
        return
    print(f"Creating {bits}-bit model at {target}...")
    # Built beside the final folder and renamed when complete, so an interrupted build is never used
    building = target.with_name(f"{target.name}.building")
    shutil.rmtree(building, ignore_errors=True)
    ZImage(quantize=bits, model_path=str(Z_IMAGE_PATH)).save_model(str(building))
    building.rename(target)


def z_image_model_path() -> Path:
    bits = z_image_bits()
    if bits is None:
        return Z_IMAGE_PATH
    target = z_image_quantized_path(bits)
    build_z_image_quantized(bits, target)
    return target


class MfluxStepReporter:
    """mflux in-loop callback that reports each finished step to the current job."""

    def __init__(self) -> None:
        self.progress = JobProgress(total=0)

    def call_in_loop(self, t: int, seed: int, prompt: str, latents: mx.array, config: object, time_steps: object) -> None:
        # MLX computes lazily: evaluating here finishes the step before it is reported
        mx.eval(latents)
        self.progress.step_done(t + 1)


def load_z_image() -> ImageGenerator:
    model = ZImage(model_path=str(z_image_model_path()))
    reporter = MfluxStepReporter()
    model.callbacks.register(reporter)

    def generate(job: Job, progress: JobProgress) -> Image.Image:
        reporter.progress = progress
        progress.enter("generating")
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


def wai_has_original_weights() -> bool:
    unet = WAI_ILLUSTRIOUS_PATH / WAI_UNET_FILE
    return unet.exists() and has_float32(unet)


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
    if compression_enabled():
        store_as_float16(WAI_ILLUSTRIOUS_PATH, WAI_FLOAT16_COMPONENTS)
    # Runs in float16 either way; the original files are float32
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


def diffusers_step_callback(progress: JobProgress) -> Callable[[object, int, object, dict[str, torch.Tensor]], dict[str, torch.Tensor]]:
    def on_step_end(pipe: object, step: int, timestep: object, callback_kwargs: dict[str, torch.Tensor]) -> dict[str, torch.Tensor]:
        progress.step_done(step + 1)
        return callback_kwargs

    return on_step_end


def sdxl_conditioning(compel: CompelForSDXL, prompt: str, negative_prompt: str) -> dict[str, torch.Tensor]:
    """Prompt embeddings that honour "(tag:1.3)" weights and go past CLIP's 77 tokens instead of cutting the rest off."""
    conditioning = compel(a1111_to_compel(prompt), negative_prompt=a1111_to_compel(negative_prompt))
    embeds = {
        "prompt_embeds": conditioning.embeds,
        "pooled_prompt_embeds": conditioning.pooled_embeds,
        "negative_prompt_embeds": conditioning.negative_embeds,
        "negative_pooled_prompt_embeds": conditioning.negative_pooled_embeds,
    }
    if not negative_prompt.strip():
        # SDXL uses zeros for an empty negative prompt (force_zeros_for_empty_prompt), not the encoding of ""
        embeds["negative_prompt_embeds"] = torch.zeros_like(conditioning.embeds)
        embeds["negative_pooled_prompt_embeds"] = torch.zeros_like(conditioning.pooled_embeds)
    return embeds


def sdxl_generator(pipe: StableDiffusionXLPipeline) -> ImageGenerator:
    pipe.to(torch.device("mps"))
    pipe.vae.to(dtype=torch.float32)
    compel = CompelForSDXL(pipe)

    def generate(job: Job, progress: JobProgress) -> Image.Image:
        progress.enter("generating")
        # A CPU generator is more stable than an MPS one
        generator = torch.Generator("cpu").manual_seed(job.seed)
        with torch.inference_mode():
            latents = pipe(
                **sdxl_conditioning(compel, job.prompt, job.negative_prompt),
                width=job.width,
                height=job.height,
                num_inference_steps=job.steps,
                guidance_scale=job.guidance,
                generator=generator,
                output_type="latent",
                callback_on_step_end=diffusers_step_callback(progress),
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
    if not compression_enabled():
        return AutoModel.from_pretrained(MOSS_IMAGE_MODEL_PATH / "text_encoder", dtype=torch.bfloat16).eval()
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

    def __call__(self, job: Job, progress: JobProgress) -> Image.Image:
        prompts = (job.prompt, job.negative_prompt)
        if prompts != self.prompts or self.embeddings is None:
            progress.enter("encoding")
            self.pipe = None
            release_memory()
            self.embeddings = encode_moss_prompts(*prompts)
            self.prompts = prompts
            release_memory()
        if self.pipe is None:
            progress.enter("loading")
            self.pipe = load_moss_image_pipe()
        progress.enter("generating")
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
            on_step=progress.step_done,
        ).images[0]


LOADERS: dict[str, Callable[[], ImageGenerator]] = {
    Z_IMAGE.id: load_z_image,
    WAI_ILLUSTRIOUS.id: load_wai_illustrious,
    MOSS_IMAGE.id: MossImageGenerator,
    ANIME_DESIRE.id: load_anime_desire,
}

def download_z_image() -> None:
    # Compressed copies are kept beside the original, so levels can be compared
    ensure_downloaded(Z_IMAGE.repo_id, Z_IMAGE_PATH)


def download_wai_illustrious() -> None:
    downloaded = download_marker(WAI_ILLUSTRIOUS_PATH).exists()
    if not compression_enabled() and downloaded and not wai_has_original_weights():
        # The float16 copies replaced the originals in place, so fetch the originals again
        shutil.rmtree(WAI_ILLUSTRIOUS_PATH)
    ensure_downloaded(WAI_ILLUSTRIOUS.repo_id, WAI_ILLUSTRIOUS_PATH, WAI_ILLUSTRIOUS_FILES)


def moss_text_encoder_complete() -> bool:
    """Every weight file the original text encoder's index lists is present."""
    index = MOSS_IMAGE_MODEL_PATH / "text_encoder" / "model.safetensors.index.json"
    if not index.exists():
        return False
    shards = set(json.loads(index.read_text())["weight_map"].values())
    return all((index.parent / shard).exists() for shard in shards)


def download_moss_image() -> None:
    ensure_downloaded(MOSS_IMAGE.repo_id, MOSS_IMAGE_PATH, MOSS_IMAGE_FILES)
    if compression_enabled():
        return
    if not moss_text_encoder_complete():
        # Fetches only the 16 GB original text encoder that the 8-bit copy replaced
        snapshot_download(MOSS_IMAGE.repo_id, local_dir=MOSS_IMAGE_PATH, cache_dir=HF_CACHE_DIR, allow_patterns=["merged-model/text_encoder/*"])
    shutil.rmtree(MOSS_TEXT_ENCODER_Q8_PATH, ignore_errors=True)


DOWNLOADERS: dict[str, Callable[[], None]] = {
    Z_IMAGE.id: download_z_image,
    WAI_ILLUSTRIOUS.id: download_wai_illustrious,
    MOSS_IMAGE.id: download_moss_image,
    ANIME_DESIRE.id: download_anime_desire,
}
GB = 1_000_000_000

# Everything a model keeps on disk, removed together when the user removes the model
MODEL_FOLDERS: dict[str, list[Path]] = {
    Z_IMAGE.id: [Z_IMAGE_PATH] + [
        path for bits in Z_IMAGE_LEVELS for path in (z_image_quantized_path(bits), MODELS_DIR / f"zimage-q{bits}.building")
    ],
    WAI_ILLUSTRIOUS.id: [WAI_ILLUSTRIOUS_PATH],
    MOSS_IMAGE.id: [MOSS_IMAGE_PATH],
    ANIME_DESIRE.id: [ANIME_DESIRE_PATH, SDXL_CONFIG_PATH],
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
    """Whether the files the current mode needs are on disk (compressed copies, or the originals).

    Z-Image's original is always kept, and its quantised copy is built from it when the model loads.
    """
    if compression_enabled():
        return download_marker(DOWNLOAD_PATHS[model_id]).exists()
    return download_marker(DOWNLOAD_PATHS[model_id]).exists() and not missing_original_parts(model_id)


def missing_original_parts(model_id: str) -> bool:
    """True when compression replaced part of a model's original files."""
    if model_id == WAI_ILLUSTRIOUS.id:
        return not wai_has_original_weights()
    if model_id == MOSS_IMAGE.id:
        return not moss_text_encoder_complete()
    return False


def model_status(model_id: str) -> ModelStatus:
    download = downloads.get(model_id)
    # A running download wins over files already on disk, which may still be incomplete
    if download is not None and not download.done():
        # Downloads run one at a time; the others wait their turn
        return "downloading" if download.running() else "queued"
    if is_downloaded(model_id):
        return "ready"
    return "missing" if download is None else "failed"


def start_download(model_id: str) -> None:
    if model_status(model_id) in ("missing", "failed"):
        downloads[model_id] = download_thread.submit(DOWNLOADERS[model_id])


def not_ready_message(model_id: str) -> str:
    label = MODELS[model_id].label
    if model_status(model_id) in ("queued", "downloading"):
        return f"{label} is still downloading. Try again when the model list shows it is ready."
    return f"{label} is not downloaded. Download it from the model list first."


def folder_bytes(paths: list[Path]) -> int:
    total = 0
    for path in paths:
        for root, _, files in os.walk(path):
            total += sum(os.path.getsize(os.path.join(root, name)) for name in files if not os.path.islink(os.path.join(root, name)))
    return total


def free_bytes() -> int:
    return shutil.disk_usage(MODELS_DIR if MODELS_DIR.exists() else MODELS_DIR.parent).free


def space_needed_bytes(model_id: str) -> int:
    # The download plus room for the one-time setup, which writes the compressed copy beside the originals
    spec = MODELS[model_id]
    setup_gb = spec.compressed_gb if runs_compressed(spec) else 0
    return int((spec.download_gb + setup_gb) * GB) - folder_bytes(MODEL_FOLDERS[model_id])


loaded_model_id: str | None = None
loaded_generator: ImageGenerator | None = None
# Generations that are running or waiting for the model thread, by job id
jobs: dict[str, JobProgress] = {}
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


def unload_and_remove(model_id: str) -> None:
    """Runs on the model thread, so it waits for any generation in progress to finish first."""
    global loaded_model_id, loaded_generator
    if loaded_model_id == model_id:
        loaded_model_id, loaded_generator = None, None
        release_memory()
    for path in MODEL_FOLDERS[model_id]:
        shutil.rmtree(path, ignore_errors=True)
    downloads.pop(model_id, None)


def generate_png(model_id: str, job: Job, progress: JobProgress) -> RenderedImage:
    progress.enter("loading" if model_id != loaded_model_id else "generating")
    generator = use_model(model_id)
    started = time.perf_counter()
    image = generator(job, progress)
    seconds = time.perf_counter() - started
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return RenderedImage(png=buffer.getvalue(), seconds=seconds)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Only the default model downloads by itself; the user chooses the others, to save disk space
    start_download(DEFAULT_MODEL.id)
    if is_downloaded(DEFAULT_MODEL.id):
        await asyncio.get_running_loop().run_in_executor(model_thread, use_model, DEFAULT_MODEL.id)
    yield


app = FastAPI(lifespan=lifespan)


@app.post("/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest) -> GenerateResponse:
    if model_status(req.model) != "ready":
        raise HTTPException(503, not_ready_message(req.model))
    job = to_job(req)
    job_id = req.job_id or str(uuid.uuid4())
    progress = jobs[job_id] = JobProgress(total=job.steps)
    try:
        rendered = await asyncio.get_running_loop().run_in_executor(model_thread, generate_png, req.model, job, progress)
    except JobCancelled:
        raise HTTPException(409, "Cancelled")
    finally:
        jobs.pop(job_id, None)
    return GenerateResponse(
        image_base64=base64.b64encode(rendered.png).decode("utf-8"), seed=job.seed, model=req.model, seconds=round(rendered.seconds, 1),
    )


class ModelState(BaseModel):
    status: ModelStatus
    # Bytes on disk now; while downloading, how much has arrived
    size_bytes: int


class ModelsReport(BaseModel):
    models: dict[str, ModelState]
    free_bytes: int


def known_model(model_id: str) -> str:
    if model_id not in MODELS:
        raise HTTPException(404, f"Unknown model: {model_id}")
    return model_id


@app.get("/models/status")
def models_status() -> ModelsReport:
    states = {
        model_id: ModelState(status=model_status(model_id), size_bytes=folder_bytes(MODEL_FOLDERS[model_id]))
        for model_id in MODELS
    }
    return ModelsReport(models=states, free_bytes=free_bytes())


@app.post("/models/{model_id}/download")
def download_model(model_id: str) -> ModelState:
    known_model(model_id)
    if model_status(model_id) in ("missing", "failed"):
        shortfall = space_needed_bytes(model_id) - free_bytes()
        if shortfall > 0:
            raise HTTPException(507, f"Not enough disk space: free about {shortfall / GB:.1f} GB more, then try again.")
        start_download(model_id)
    return ModelState(status=model_status(model_id), size_bytes=folder_bytes(MODEL_FOLDERS[model_id]))


@app.delete("/models/{model_id}", status_code=204)
async def remove_model(model_id: str) -> Response:
    known_model(model_id)
    if model_status(model_id) in ("queued", "downloading"):
        raise HTTPException(409, f"{MODELS[model_id].label} is downloading; remove it when the download has finished.")
    await asyncio.get_running_loop().run_in_executor(model_thread, unload_and_remove, model_id)
    return Response(status_code=204)


class JobState(BaseModel):
    phase: JobPhase
    step: int
    total: int


def running_job(job_id: str) -> JobProgress:
    progress = jobs.get(job_id)
    if progress is None:
        raise HTTPException(404, "No such job; it may have finished")
    return progress


@app.get("/jobs/{job_id}")
def job_state(job_id: str) -> JobState:
    progress = running_job(job_id)
    return JobState(phase=progress.phase, step=progress.step, total=progress.total)


@app.post("/jobs/{job_id}/cancel", status_code=204)
def cancel_job(job_id: str) -> Response:
    running_job(job_id).cancelled = True
    return Response(status_code=204)


@app.get("/health")
def health() -> dict[str, str | None]:
    return {"status": "ok", "loaded_model": loaded_model_id}


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
