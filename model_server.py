import io
import gc
import asyncio
import base64
import random
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path

import mlx.core as mx
import torch
import uvicorn
from diffusers import AutoencoderKLFlux2, EulerAncestralDiscreteScheduler, StableDiffusionXLPipeline
from fastapi import FastAPI
from huggingface_hub import snapshot_download
from mflux.models.z_image.variants.z_image import ZImage
from PIL import Image
from pydantic import BaseModel, Field, model_validator
from transformers import AutoModel, AutoTokenizer

from model_catalog import DEFAULT_MODEL, MODELS, MOSS_IMAGE, WAI_ILLUSTRIOUS, Z_IMAGE, ModelSpec
from moss_pipeline import MOSSImagePipeline, MOSSImageScheduler, MOSSImageTransformer


MODELS_DIR = Path(__file__).parent / "models"
HF_CACHE_DIR = MODELS_DIR / ".hf-cache"
Z_IMAGE_PATH = MODELS_DIR / "Z-Image-Turbo"
Z_IMAGE_Q4_PATH = MODELS_DIR / "zimage-q4"
WAI_ILLUSTRIOUS_PATH = MODELS_DIR / "waiNSFWIllustrious_v120"
# The repo's "fp16" files are full precision too, so fetch only one set
WAI_ILLUSTRIOUS_FILES = ["*.json", "*.txt", "*.fp16.safetensors"]
MOSS_IMAGE_PATH = MODELS_DIR / "moss-image-nsfw"
MOSS_IMAGE_MODEL_PATH = MOSS_IMAGE_PATH / "merged-model"
# Only the merged model; its pipeline code is vendored in moss_pipeline.py
MOSS_IMAGE_FILES = ["merged-model/**/*.json", "merged-model/**/*.jinja", "merged-model/**/*.safetensors"]
QUANTIZE_BITS = 4
MIN_SIDE = 256
MAX_SEED = 2**32 - 1


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


class GenerateRequest(BaseModel):
    model: str = DEFAULT_MODEL.id
    prompt: str = Field(min_length=1, max_length=4000)
    negative_prompt: str = Field(default="", max_length=2000)
    width: int = 1024
    height: int = 1024
    steps: int | None = None
    guidance: float | None = Field(default=None, ge=0, le=20)
    seed: int | None = Field(default=None, ge=0, le=MAX_SEED)

    @model_validator(mode="after")
    def check_against_model(self) -> "GenerateRequest":
        spec = MODELS.get(self.model)
        if spec is None:
            raise ValueError(f"Unknown model: {self.model}")
        check_size(self.width, self.height, spec)
        if self.steps is not None and not 1 <= self.steps <= spec.max_steps:
            raise ValueError(f"steps must be between 1 and {spec.max_steps}")
        return self

    def to_job(self) -> Job:
        spec = MODELS[self.model]
        return Job(
            prompt=with_trigger_word(self.prompt, spec),
            negative_prompt=self.negative_prompt,
            width=self.width,
            height=self.height,
            steps=self.steps or spec.default_steps,
            guidance=spec.default_guidance if self.guidance is None else self.guidance,
            seed=random.randint(0, MAX_SEED) if self.seed is None else self.seed,
        )


class GenerateResponse(BaseModel):
    image_base64: str
    seed: int
    model: str


def check_size(width: int, height: int, spec: ModelSpec) -> None:
    for side in (width, height):
        if not MIN_SIDE <= side <= spec.max_side or side % 16:
            raise ValueError(f"width and height must be multiples of 16 between {MIN_SIDE} and {spec.max_side}")


def with_trigger_word(prompt: str, spec: ModelSpec) -> str:
    if not spec.trigger_word or spec.trigger_word in prompt:
        return prompt
    return f"{spec.trigger_word}, {prompt}"


def ensure_downloaded(spec: ModelSpec, path: Path, allow_patterns: list[str] | None = None) -> None:
    # The marker is written last, so an interrupted download resumes on the next load
    marker = path / ".download-complete"
    if marker.exists():
        return
    print(f"Downloading {spec.repo_id} to {path}...")
    snapshot_download(spec.repo_id, local_dir=path, cache_dir=HF_CACHE_DIR, allow_patterns=allow_patterns)
    marker.touch()


def load_z_image() -> ImageGenerator:
    if not Z_IMAGE_Q4_PATH.exists():
        ensure_downloaded(Z_IMAGE, Z_IMAGE_PATH)
        print(f"Creating {QUANTIZE_BITS}-bit model at {Z_IMAGE_Q4_PATH}...")
        ZImage(quantize=QUANTIZE_BITS, model_path=str(Z_IMAGE_PATH)).save_model(str(Z_IMAGE_Q4_PATH))
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


def load_wai_illustrious() -> ImageGenerator:
    ensure_downloaded(WAI_ILLUSTRIOUS, WAI_ILLUSTRIOUS_PATH, WAI_ILLUSTRIOUS_FILES)
    pipe = StableDiffusionXLPipeline.from_pretrained(
        WAI_ILLUSTRIOUS_PATH,
        torch_dtype=torch.float16,
        variant="fp16",
        use_safetensors=True,
    )
    pipe.scheduler = EulerAncestralDiscreteScheduler.from_config(pipe.scheduler.config)
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


@torch.no_grad()
def encode_moss_prompts(prompt: str, negative_prompt: str) -> MossEmbeddings:
    """Mirrors MOSSImagePipeline.encode_prompt, with the text encoder loaded only for this call."""
    tokenizer = AutoTokenizer.from_pretrained(MOSS_IMAGE_MODEL_PATH / "tokenizer")
    encoder = AutoModel.from_pretrained(MOSS_IMAGE_MODEL_PATH / "text_encoder", dtype=torch.bfloat16)
    encoder.eval().to(torch.device("mps"))
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
        ensure_downloaded(MOSS_IMAGE, MOSS_IMAGE_PATH, MOSS_IMAGE_FILES)
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
}

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
    await asyncio.get_running_loop().run_in_executor(model_thread, use_model, DEFAULT_MODEL.id)
    yield


app = FastAPI(lifespan=lifespan)


@app.post("/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest) -> GenerateResponse:
    job = req.to_job()
    png = await asyncio.get_running_loop().run_in_executor(model_thread, generate_png, req.model, job)
    return GenerateResponse(image_base64=base64.b64encode(png).decode("utf-8"), seed=job.seed, model=req.model)


@app.get("/health")
def health() -> dict[str, str | None]:
    return {"status": "ok", "loaded_model": loaded_model_id}


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
