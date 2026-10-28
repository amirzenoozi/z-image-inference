"""Build Z-Image-Turbo at a quantisation level and compare it with the original.

    uv run python backend/tools/z_image_levels.py build --bits 8
    uv run python backend/tools/z_image_levels.py compare --bits 8

Stop the model server first: the original alone needs about 20 GB of memory. Results go to comparisons/z-image/.
"""
import gc
import sys
import json
import time
import argparse
from dataclasses import dataclass
from pathlib import Path

import mlx.core as mx
import numpy as np
from PIL import Image

# The backend modules sit one folder up, in backend/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from mflux.models.z_image.variants.z_image import ZImage  # noqa: E402
from model_server import Z_IMAGE_LEVELS, Z_IMAGE_PATH, build_z_image_quantized, z_image_quantized_path  # noqa: E402
from paths import PROJECT_DIR  # noqa: E402

OUT_DIR = PROJECT_DIR / "comparisons" / "z-image"
SEED = 42
STEPS = 9
PROMPTS: dict[str, str] = {
    "portrait": "Portrait photo of an adult woman in a red coat on a rainy Tokyo street at night, neon reflections on the wet pavement",
    "text": 'A minimalist poster on a concrete wall with the words "SLOW COFFEE" in bold black letters above a small steaming cup, soft daylight',
}


@dataclass
class Run:
    label: str
    load_seconds: float
    seconds_per_image: float
    peak_gb: float
    images: dict[str, Image.Image]


def generate_all(label: str, model_path: Path, size: int) -> Run:
    mx.reset_peak_memory()
    started = time.perf_counter()
    model = ZImage(model_path=str(model_path))
    load_seconds = time.perf_counter() - started
    images, durations = {}, []
    for name, prompt in PROMPTS.items():
        started = time.perf_counter()
        images[name] = model.generate_image(seed=SEED, prompt=prompt, num_inference_steps=STEPS, width=size, height=size).image
        durations.append(time.perf_counter() - started)
        print(f"  {label} {name}: {durations[-1]:.0f}s", flush=True)
    peak_gb = mx.get_peak_memory() / 1e9
    del model
    gc.collect()
    mx.clear_cache()
    return Run(label, load_seconds, sum(durations) / len(durations), peak_gb, images)


def difference(original: Image.Image, other: Image.Image) -> dict[str, float]:
    a, b = (np.asarray(image.convert("RGB"), dtype=np.float64) for image in (original, other))
    mse = float(((a - b) ** 2).mean())
    return {"mean_abs_difference": float(np.abs(a - b).mean()), "psnr_db": 10 * np.log10(255**2 / mse) if mse else float("inf")}


def side_by_side(original: Run, other: Run, size: int) -> Image.Image:
    grid = Image.new("RGB", (size * 2, size * len(PROMPTS)), "white")
    for row, name in enumerate(PROMPTS):
        grid.paste(original.images[name], (0, row * size))
        grid.paste(other.images[name], (size, row * size))
    return grid


def write_report(original: Run, other: Run, bits: int, size: int) -> dict[str, object]:
    folder = OUT_DIR / f"original-vs-q{bits}-{size}px"
    folder.mkdir(parents=True, exist_ok=True)
    for run in (original, other):
        for name, image in run.images.items():
            image.save(folder / f"{run.label}-{name}.png")
    side_by_side(original, other, size).save(folder / "side-by-side.png")
    report = {
        "bits": bits,
        "size": size,
        "runs": {run.label: {"load_seconds": round(run.load_seconds, 1), "seconds_per_image": round(run.seconds_per_image, 1), "peak_gb": round(run.peak_gb, 1)} for run in (original, other)},
        "difference_from_original": {name: difference(original.images[name], other.images[name]) for name in PROMPTS},
    }
    (folder / "report.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    print(f"Saved to {folder}")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("action", choices=["build", "compare"])
    parser.add_argument("--bits", type=int, choices=Z_IMAGE_LEVELS, required=True)
    parser.add_argument("--size", type=int, default=1024)
    args = parser.parse_args()
    target = z_image_quantized_path(args.bits)
    if args.action == "build":
        build_z_image_quantized(args.bits, target)
        print(f"Built {target}")
        return
    if not target.exists():
        sys.exit(f"{target} does not exist yet; run the build action first")
    original = generate_all("original", Z_IMAGE_PATH, args.size)
    quantized = generate_all(f"q{args.bits}", target, args.size)
    write_report(original, quantized, args.bits, args.size)


if __name__ == "__main__":
    main()
