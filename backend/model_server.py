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
import tempfile
from collections.abc import Callable
from concurrent.futures import Future, ThreadPoolExecutor
from contextlib import asynccontextmanager, contextmanager
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import mlx.core as mx
import requests
import torch
import uvicorn
from compel import CompelForSDXL
from diffusers import AutoencoderKLFlux2, DPMSolverMultistepScheduler, EulerAncestralDiscreteScheduler, StableDiffusionXLImg2ImgPipeline, StableDiffusionXLPipeline
from fastapi import FastAPI, HTTPException, Response
from huggingface_hub import get_token, snapshot_download
from mflux.models.common.config.config import Config
from mflux.models.common.config.model_config import ModelConfig
from mflux.models.flux.variants.txt2img.flux import Flux1
from mflux.models.z_image.variants.z_image import ZImage
from optimum.quanto import freeze, qint8, quantization_map, quantize, requantize
from PIL import Image, ImageOps
from safetensors import safe_open
from safetensors.torch import load_file, save_file
from pydantic import BaseModel
from transformers import AutoConfig, AutoModel, AutoTokenizer

from generation_request import MAX_SEED, GenerateRequest
from i18n import t
from prompt_weights import a1111_to_compel
from model_catalog import ADDONS, ANIME_DESIRE, DEFAULT_MODEL, FLUX_DEV, MODELS, AddonSpec, Source, applied_addons, with_trigger_words, MOSS_IMAGE, REALVIS_XL, WAI_ILLUSTRIOUS, Z_IMAGE, ModelSpec, Z_IMAGE_LEVELS, compression_enabled, runs_compressed, z_image_bits
from moss_pipeline import MOSSImagePipeline, MOSSImageScheduler, MOSSImageTransformer
from paths import MODELS_DIR


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
REALVIS_XL_PATH = MODELS_DIR / "RealVisXL_V5.0"
# Its float16 copies are the files it runs; the full-precision set would double the download for nothing
REALVIS_XL_FILES = ["*.json", "*.txt", "*.fp16.safetensors"]
FLUX_DEV_PATH = MODELS_DIR / "FLUX.1-dev"
# The 4-bit copy it always runs: about 10 GB in memory, against 24 GB for the original
FLUX_Q4_PATH = MODELS_DIR / "flux-dev-q4"
# The diffusers folders mflux reads; the repo's single-file checkpoint repeats them
FLUX_DEV_FILES = ["model_index.json", "scheduler/*", "text_encoder/*", "text_encoder_2/*", "tokenizer/*", "tokenizer_2/*", "transformer/*", "vae/*"]


# Everything that can be downloaded and removed: models and the add-ons that go over them
Downloadable = ModelSpec | AddonSpec
ENTRIES: dict[str, Downloadable] = {**MODELS, **ADDONS}


def lora_path(addon: AddonSpec) -> Path:
    return MODELS_DIR / f"lora-{addon.id}"


def source_of(entry: Downloadable) -> Source:
    return entry.source if isinstance(entry, AddonSpec) else "huggingface"


def base_of(entry: Downloadable) -> str | None:
    """The model an add-on needs; a model needs none."""
    return entry.base_model_id if isinstance(entry, AddonSpec) else None


def lora_arguments(addons: tuple[AddonSpec, ...]) -> dict[str, object]:
    """The add-ons, applied while generating: merged in, they would turn quantised layers 8-bit."""
    paths = [lora_path(addon) / addon.lora_file for addon in addons]
    if not paths:
        return {}
    return {"lora_paths": [str(path) for path in paths], "lora_scales": [addon.scale for addon in addons], "bake_lora": False}


# The face lock for the SDXL models: IP-Adapter plus-face and the image encoder it reads faces with
FACE_LOCK = "face-lock"
FACE_LOCK_REPO = "h94/IP-Adapter"
FACE_LOCK_PATH = MODELS_DIR / "ip-adapter"
FACE_LOCK_WEIGHTS = "ip-adapter-plus-face_sdxl_vit-h.safetensors"
FACE_LOCK_FILES = ["models/image_encoder/config.json", "models/image_encoder/model.safetensors", f"sdxl_models/{FACE_LOCK_WEIGHTS}"]
FACE_LOCK_BYTES = 3_376_000_000


@dataclass(frozen=True)
class Job:
    prompt: str
    negative_prompt: str
    width: int
    height: int
    steps: int
    guidance: float
    seed: int
    # For a variation: the start image at the size being made, and how much to change it (0 to 1)
    start_image: Image.Image | None = None
    change: float | None = None
    # For a face lock: the character's face image, and how strongly to hold it (0 to 1)
    face_image: Image.Image | None = None
    face_strength: float | None = None


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


def decode_start_image(data: str, width: int, height: int) -> Image.Image:
    """The start image cropped to the shape being made, centred, and resized to its size, so it is never stretched."""
    try:
        image = Image.open(io.BytesIO(base64.b64decode(data, validate=True))).convert("RGB")
    except (ValueError, OSError):
        raise HTTPException(422, t("startImageUnreadable"))
    return ImageOps.fit(image, (width, height), Image.Resampling.LANCZOS)


def decode_face_image(data: str) -> Image.Image:
    """The face image as it is; the image encoder crops and resizes it itself."""
    try:
        return Image.open(io.BytesIO(base64.b64decode(data, validate=True))).convert("RGB")
    except (ValueError, OSError):
        raise HTTPException(422, t("faceImageUnreadable"))


def to_job(req: GenerateRequest, addons: tuple[AddonSpec, ...]) -> Job:
    spec = MODELS[req.model]
    start_image = decode_start_image(req.init_image, req.width, req.height) if req.init_image else None
    return Job(
        prompt=with_trigger_words(with_trigger_word(req.prompt, spec), list(addons)),
        negative_prompt=req.negative_prompt,
        width=req.width,
        height=req.height,
        steps=req.steps or spec.default_steps,
        guidance=spec.default_guidance if req.guidance is None else req.guidance,
        seed=random.randint(0, MAX_SEED) if req.seed is None else req.seed,
        start_image=start_image,
        change=req.change,
        face_image=decode_face_image(req.face_image) if req.face_image else None,
        face_strength=req.face_strength,
    )


class GenerateResponse(BaseModel):
    image_base64: str
    seed: int
    model: str
    # Rendering only: waiting for the model thread and loading the model are not counted
    seconds: float
    # The add-ons used: those switched on whose keywords the prompt mentions
    addons: list[str] = []


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


def build_once(target: Path, build: Callable[[Path], None]) -> None:
    """Run a one-time build into `target`, unless it is there already."""
    if target.exists():
        return
    print(f"Creating {target}...")
    # Built beside the final folder and renamed when complete, so an interrupted build is never used
    building = target.with_name(f"{target.name}.building")
    shutil.rmtree(building, ignore_errors=True)
    build(building)
    building.rename(target)


def build_z_image_quantized(bits: int, target: Path) -> None:
    """Quantise Z-Image once into `target`. The original is kept, to compare against and rebuild from."""
    ensure_downloaded(Z_IMAGE.repo_id, Z_IMAGE_PATH)
    build_once(target, lambda building: ZImage(quantize=bits, model_path=str(Z_IMAGE_PATH)).save_model(str(building)))


def build_flux_q4() -> None:
    """Quantise FLUX.1-dev to 4 bits once; the original is kept to rebuild from."""
    ensure_downloaded(FLUX_DEV.repo_id, FLUX_DEV_PATH, FLUX_DEV_FILES)
    build_once(FLUX_Q4_PATH, lambda building: Flux1(quantize=4, model_path=str(FLUX_DEV_PATH), model_config=ModelConfig.dev()).save_model(str(building)))


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

    def call_in_loop(self, t: int, seed: int, prompt: str, latents: mx.array, config: Config, time_steps: object) -> None:
        # MLX computes lazily: evaluating here finishes the step before it is reported
        mx.eval(latents)
        # A variation starts part-way through the steps; progress counts only the ones it runs
        self.progress.total = config.num_inference_steps - config.init_time_step
        self.progress.step_done(t + 1 - config.init_time_step)


@contextmanager
def start_image_file(image: Image.Image | None) -> Iterator[str | None]:
    """mflux reads a start image from a file, so a variation's is written to a temporary one."""
    if image is None:
        yield None
        return
    with tempfile.NamedTemporaryFile(suffix=".png") as file:
        image.save(file, format="PNG")
        file.flush()
        yield file.name


def mflux_generator(model: ZImage | Flux1, uses_guidance: bool) -> ImageGenerator:
    reporter = MfluxStepReporter()
    model.callbacks.register(reporter)

    def generate(job: Job, progress: JobProgress) -> Image.Image:
        reporter.progress = progress
        progress.enter("generating")
        guidance = {"guidance": job.guidance} if uses_guidance else {}
        with start_image_file(job.start_image) as start_path:
            return model.generate_image(
                seed=job.seed,
                prompt=job.prompt,
                num_inference_steps=job.steps,
                height=job.height,
                width=job.width,
                image_path=start_path,
                # mflux's strength is how much of the start image to keep, the opposite of "change"
                image_strength=None if job.change is None else 1 - job.change,
                **guidance,
            ).image

    return generate


def load_z_image(addons: tuple[AddonSpec, ...] = ()) -> ImageGenerator:
    return mflux_generator(ZImage(model_path=str(z_image_model_path()), **lora_arguments(addons)), uses_guidance=False)


def load_flux(addons: tuple[AddonSpec, ...] = ()) -> ImageGenerator:
    """FLUX.1-dev always runs its 4-bit copy, with the add-ons a render uses."""
    build_flux_q4()
    model = Flux1(model_path=str(FLUX_Q4_PATH), model_config=ModelConfig.dev(), **lora_arguments(addons))
    return mflux_generator(model, uses_guidance=True)


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


def download_realvis_xl() -> None:
    ensure_downloaded(REALVIS_XL.repo_id, REALVIS_XL_PATH, REALVIS_XL_FILES)


def load_realvis_xl() -> ImageGenerator:
    download_realvis_xl()
    pipe = StableDiffusionXLPipeline.from_pretrained(REALVIS_XL_PATH, torch_dtype=torch.float16, variant="fp16", use_safetensors=True)
    # DPM++ 2M SDE Karras: close to the card's DPM++ SDE Karras at 30 steps, without the extra torchsde dependency
    pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config, algorithm_type="sde-dpmsolver++", use_karras_sigmas=True)
    return sdxl_generator(pipe)


SdxlPipeline = StableDiffusionXLPipeline | StableDiffusionXLImg2ImgPipeline


def diffusers_step_callback(progress: JobProgress) -> Callable[[SdxlPipeline, int, object, dict[str, torch.Tensor]], dict[str, torch.Tensor]]:
    def on_step_end(pipe: SdxlPipeline, step: int, timestep: object, callback_kwargs: dict[str, torch.Tensor]) -> dict[str, torch.Tensor]:
        # A variation runs only part of the steps; the pipeline knows how many
        progress.total = pipe.num_timesteps
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


def encode_in_float32(pipe: StableDiffusionXLPipeline, image: Image.Image) -> torch.Tensor:
    """A variation's start image as latents. Encoding it here keeps the VAE in float32: diffusers' own encoding
    switches the shared VAE back to float16 afterwards, which breaks decode_in_float32 on MPS."""
    pixels = pipe.image_processor.preprocess(image).to(device=pipe.vae.device, dtype=torch.float32)
    latents = pipe.vae.encode(pixels).latent_dist.mode() * pipe.vae.config.scaling_factor
    return latents.to(pipe.unet.dtype)


class SdxlPipes:
    """An SDXL pipeline, its image-to-image twin sharing the same weights, and the face lock when it is on.

    With IP-Adapter loaded, diffusers needs a face image for every render, so it is loaded for face-locked renders
    and unloaded for the others; it stays loaded between face-locked renders, which skips reloading it.
    """

    def __init__(self, pipe: StableDiffusionXLPipeline) -> None:
        self.pipe = pipe
        self.face_locked = False
        self.img2img = StableDiffusionXLImg2ImgPipeline(**pipe.components)

    def use_face_lock(self, on: bool) -> None:
        if on == self.face_locked:
            return
        if on:
            self.pipe.load_ip_adapter(
                str(FACE_LOCK_PATH), subfolder="sdxl_models", weight_name=FACE_LOCK_WEIGHTS, image_encoder_folder="models/image_encoder",
            )
        else:
            self.pipe.unload_ip_adapter()
            release_memory()
        self.face_locked = on
        # Rebuilt so it picks up the image encoder that loading or unloading the adapter adds or removes
        self.img2img = StableDiffusionXLImg2ImgPipeline(**self.pipe.components)


def face_lock_arguments(pipes: SdxlPipes, job: Job) -> dict[str, Image.Image]:
    pipes.use_face_lock(job.face_image is not None)
    if job.face_image is None or job.face_strength is None:
        return {}
    pipes.pipe.set_ip_adapter_scale(job.face_strength)
    return {"ip_adapter_image": job.face_image}


def sdxl_generator(pipe: StableDiffusionXLPipeline) -> ImageGenerator:
    pipe.to(torch.device("mps"))
    pipe.vae.to(dtype=torch.float32)
    compel = CompelForSDXL(pipe)
    pipes = SdxlPipes(pipe)

    def generate(job: Job, progress: JobProgress) -> Image.Image:
        progress.enter("generating")
        face = face_lock_arguments(pipes, job)
        # A CPU generator is more stable than an MPS one
        generator = torch.Generator("cpu").manual_seed(job.seed)
        with torch.inference_mode():
            common = {
                **sdxl_conditioning(compel, job.prompt, job.negative_prompt),
                **face,
                "num_inference_steps": job.steps,
                "guidance_scale": job.guidance,
                "generator": generator,
                "output_type": "latent",
                "callback_on_step_end": diffusers_step_callback(progress),
            }
            if job.start_image is None:
                latents = pipe(width=job.width, height=job.height, **common).images
            else:
                latents = pipes.img2img(image=encode_in_float32(pipe, job.start_image), strength=job.change, **common).images
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
    REALVIS_XL.id: load_realvis_xl,
    FLUX_DEV.id: load_flux,
}
# The models add-ons can go over, loaded with the add-ons a render uses
BASE_LOADERS: dict[str, Callable[[tuple[AddonSpec, ...]], ImageGenerator]] = {Z_IMAGE.id: load_z_image, FLUX_DEV.id: load_flux}


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


def download_flux_dev() -> None:
    ensure_downloaded(FLUX_DEV.repo_id, FLUX_DEV_PATH, FLUX_DEV_FILES)


def download_from_civitai(spec: AddonSpec) -> None:
    """Civitai serves a file from a download link that needs an API key; written to a .part file until complete."""
    folder = lora_path(spec)
    if download_marker(folder).exists():
        return
    folder.mkdir(parents=True, exist_ok=True)
    part = folder / f"{spec.lora_file}.part"
    headers = {"Authorization": f"Bearer {os.environ.get('CIVITAI_TOKEN', '').strip()}"}
    with requests.get(spec.download_url, headers=headers, stream=True, timeout=60) as resp:
        resp.raise_for_status()
        with part.open("wb") as file:
            for chunk in resp.iter_content(chunk_size=1 << 20):
                file.write(chunk)
    part.rename(folder / spec.lora_file)
    download_marker(folder).touch()


def download_addon(spec: AddonSpec) -> None:
    """The base model first, if it is missing, then the add-on's LoRA from wherever it is hosted."""
    DOWNLOADERS[spec.base_model_id]()
    if spec.source == "civitai":
        download_from_civitai(spec)
    else:
        ensure_downloaded(spec.repo_id, lora_path(spec), [spec.lora_file])


DOWNLOADERS: dict[str, Callable[[], None]] = {
    Z_IMAGE.id: download_z_image,
    WAI_ILLUSTRIOUS.id: download_wai_illustrious,
    MOSS_IMAGE.id: download_moss_image,
    ANIME_DESIRE.id: download_anime_desire,
    REALVIS_XL.id: download_realvis_xl,
    FLUX_DEV.id: download_flux_dev,
    **{addon.id: (lambda addon=addon: download_addon(addon)) for addon in ADDONS.values()},
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
    REALVIS_XL.id: [REALVIS_XL_PATH],
    FLUX_DEV.id: [FLUX_DEV_PATH, FLUX_Q4_PATH, MODELS_DIR / f"{FLUX_Q4_PATH.name}.building"],
    # A LoRA model removes only its LoRA; the base stays for the others
    **{addon.id: [lora_path(addon)] for addon in ADDONS.values()},
}

DOWNLOAD_PATHS: dict[str, Path] = {
    Z_IMAGE.id: Z_IMAGE_PATH,
    WAI_ILLUSTRIOUS.id: WAI_ILLUSTRIOUS_PATH,
    MOSS_IMAGE.id: MOSS_IMAGE_PATH,
    ANIME_DESIRE.id: ANIME_DESIRE_PATH,
    REALVIS_XL.id: REALVIS_XL_PATH,
    FLUX_DEV.id: FLUX_DEV_PATH,
    **{addon.id: lora_path(addon) for addon in ADDONS.values()},
}

ModelStatus = Literal["ready", "queued", "downloading", "missing", "failed"]

# Downloads get their own thread, so generating with a downloaded model is never blocked by one
download_thread = ThreadPoolExecutor(max_workers=1)
downloads: dict[str, Future[None]] = {}


def is_downloaded(model_id: str) -> bool:
    """Whether the files the current mode needs are on disk (compressed copies, or the originals).

    Z-Image's original is always kept, and its quantised copy is built from it when the model loads. An add-on
    also needs its base model.
    """
    base = base_of(ENTRIES[model_id])
    if base is not None and not is_downloaded(base):
        return False
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


def download_face_lock() -> None:
    ensure_downloaded(FACE_LOCK_REPO, FACE_LOCK_PATH, FACE_LOCK_FILES)


def face_lock_problem() -> str | None:
    """Why a face-locked render can't run yet, starting the one-time download if it hasn't started; None once it can."""
    if download_marker(FACE_LOCK_PATH).exists():
        return None
    download = downloads.get(FACE_LOCK)
    if download is None or download.done():
        if free_bytes() < FACE_LOCK_BYTES:
            return t("faceLockNoSpace", gb=f"{FACE_LOCK_BYTES / 1e9:.1f}")
        downloads[FACE_LOCK] = download_thread.submit(download_face_lock)
    # Files arrive in the folder itself (partial ones under .cache), so its size is the progress
    done = folder_bytes([FACE_LOCK_PATH]) / 1e9
    return t("faceLockDownloading", done=f"{min(done, FACE_LOCK_BYTES / 1e9):.1f}", total=f"{FACE_LOCK_BYTES / 1e9:.1f}")


def not_ready_message(model_id: str) -> str:
    label = ENTRIES[model_id].label
    if model_status(model_id) in ("queued", "downloading"):
        return t("modelDownloading", label=label)
    return t("modelNotDownloaded", label=label)


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
    spec = ENTRIES[model_id]
    setup_gb = spec.compressed_gb if isinstance(spec, ModelSpec) and runs_compressed(spec) else 0
    own = int((spec.download_gb + setup_gb) * GB) - folder_bytes(MODEL_FOLDERS[model_id])
    base = base_of(spec)
    if base is None or is_downloaded(base):
        return own
    return own + space_needed_bytes(base)


def download_problem(model_id: str) -> str | None:
    """A download that would be refused for want of a key: FLUX.1-dev is gated on Hugging Face, and Civitai needs an API key."""
    spec = ENTRIES[model_id]
    needs_flux = FLUX_DEV.id in (model_id, base_of(spec)) and not is_downloaded(FLUX_DEV.id)
    if needs_flux and not get_token():
        return t("needsHfToken", label=FLUX_DEV.label)
    if source_of(spec) == "civitai" and not os.environ.get("CIVITAI_TOKEN", "").strip():
        return t("needsCivitaiToken", label=spec.label)
    return None


loaded_model_id: str | None = None
# The add-ons the loaded model was loaded with; another set means loading it again
loaded_addons: tuple[AddonSpec, ...] = ()
loaded_generator: ImageGenerator | None = None
# Generations that are running or waiting for the model thread, by job id
jobs: dict[str, JobProgress] = {}
# MLX streams belong to the thread that created them, so all model work runs on this one thread
model_thread = ThreadPoolExecutor(max_workers=1)


def release_memory() -> None:
    gc.collect()
    mx.clear_cache()
    torch.mps.empty_cache()


def is_loaded(model_id: str, addons: tuple[AddonSpec, ...]) -> bool:
    return loaded_generator is not None and (model_id, addons) == (loaded_model_id, loaded_addons)


def use_model(model_id: str, addons: tuple[AddonSpec, ...] = ()) -> ImageGenerator:
    """Load the requested model with its add-ons, unloading the current one first: both do not fit in memory together."""
    global loaded_model_id, loaded_addons, loaded_generator
    if not is_loaded(model_id, addons):
        loaded_model_id, loaded_addons, loaded_generator = None, (), None
        release_memory()
        print(f"Loading {MODELS[model_id].label}{''.join(f' + {addon.label}' for addon in addons)}...")
        loaded_generator = BASE_LOADERS[model_id](addons) if addons else LOADERS[model_id]()
        loaded_model_id, loaded_addons = model_id, addons
        print("Model loaded!")
    return loaded_generator


def unload_and_remove(model_id: str) -> None:
    """Runs on the model thread, so it waits for any generation in progress to finish first."""
    global loaded_model_id, loaded_addons, loaded_generator
    if model_id in (loaded_model_id, *(addon.id for addon in loaded_addons)):
        loaded_model_id, loaded_addons, loaded_generator = None, (), None
        release_memory()
    for path in MODEL_FOLDERS[model_id]:
        shutil.rmtree(path, ignore_errors=True)
    downloads.pop(model_id, None)


def generate_png(model_id: str, addons: tuple[AddonSpec, ...], job: Job, progress: JobProgress) -> RenderedImage:
    progress.enter("generating" if is_loaded(model_id, addons) else "loading")
    generator = use_model(model_id, addons)
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
    if req.face_image is not None and (problem := face_lock_problem()):
        raise HTTPException(503, problem)
    addons = tuple(applied_addons(req.addons, req.prompt))
    for addon in addons:
        if model_status(addon.id) != "ready":
            raise HTTPException(503, not_ready_message(addon.id))
    job = to_job(req, addons)
    job_id = req.job_id or str(uuid.uuid4())
    progress = jobs[job_id] = JobProgress(total=job.steps)
    try:
        rendered = await asyncio.get_running_loop().run_in_executor(model_thread, generate_png, req.model, addons, job, progress)
    except JobCancelled:
        raise HTTPException(409, t("cancelled"))
    finally:
        jobs.pop(job_id, None)
    return GenerateResponse(
        image_base64=base64.b64encode(rendered.png).decode("utf-8"), seed=job.seed, model=req.model, seconds=round(rendered.seconds, 1),
        addons=[addon.id for addon in addons],
    )


class ModelState(BaseModel):
    status: ModelStatus
    # Bytes on disk now; while downloading, how much has arrived
    size_bytes: int


class ModelsReport(BaseModel):
    models: dict[str, ModelState]
    free_bytes: int


def known_model(model_id: str) -> str:
    """A model or an add-on, which download and remove the same way."""
    if model_id not in ENTRIES:
        raise HTTPException(404, t("unknownModel", model=model_id))
    return model_id


@app.get("/models/status")
def models_status() -> ModelsReport:
    states = {
        model_id: ModelState(status=model_status(model_id), size_bytes=folder_bytes(MODEL_FOLDERS[model_id]))
        for model_id in ENTRIES
    }
    return ModelsReport(models=states, free_bytes=free_bytes())


@app.post("/models/{model_id}/download")
def download_model(model_id: str) -> ModelState:
    known_model(model_id)
    if model_status(model_id) in ("missing", "failed"):
        problem = download_problem(model_id)
        if problem:
            raise HTTPException(400, problem)
        shortfall = space_needed_bytes(model_id) - free_bytes()
        if shortfall > 0:
            raise HTTPException(507, t("notEnoughSpace", gb=f"{shortfall / GB:.1f}"))
        start_download(model_id)
    return ModelState(status=model_status(model_id), size_bytes=folder_bytes(MODEL_FOLDERS[model_id]))


@app.delete("/models/{model_id}", status_code=204)
async def remove_model(model_id: str) -> Response:
    known_model(model_id)
    if model_status(model_id) in ("queued", "downloading"):
        raise HTTPException(409, t("removeWhileDownloading", label=ENTRIES[model_id].label))
    await asyncio.get_running_loop().run_in_executor(model_thread, unload_and_remove, model_id)
    return Response(status_code=204)


class JobState(BaseModel):
    phase: JobPhase
    step: int
    total: int


def running_job(job_id: str) -> JobProgress:
    progress = jobs.get(job_id)
    if progress is None:
        raise HTTPException(404, t("noSuchJob"))
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
