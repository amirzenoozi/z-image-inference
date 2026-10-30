"""The image-to-video engine (ltx-2-mlx), run as its own process in its own environment.

Its pinned packages differ from the app's, so it is never imported here: it is installed with uv into its own folder
and called through its command line. Running it as a process also frees all its memory when a clip is done, and lets
a cancel stop it at once.
"""
import os
import shutil
import subprocess
import tempfile
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

from model_catalog import VIDEO_MODEL
from paths import MODELS_DIR

ENGINE_PATH = MODELS_DIR / "ltx-2-mlx"
WEIGHTS_PATH = MODELS_DIR / "ltx-2.3-mlx-q4"
# Written once `uv sync` has built the engine's environment, which can't be moved afterwards
ENGINE_READY = ".environment-ready"
REQUIRED_TOOLS = ("git", "uv", "ffmpeg")
# The engine prints this when it starts turning the result into frames, the last step
DECODING_MARKER = "[Decoding"
POLL_SECONDS = 0.5


class EngineCancelled(Exception):
    pass


class EngineFailed(Exception):
    pass


@dataclass(frozen=True)
class Clip:
    mp4: bytes
    # The first frame as PNG, shown before the video plays
    poster: bytes
    # A frame from the middle as PNG: the first is the start image, so the image check looks here for what the motion added
    middle: bytes


def missing_tools() -> list[str]:
    return [tool for tool in REQUIRED_TOOLS if shutil.which(tool) is None]


def run(command: list[str], cwd: Path | None = None) -> None:
    subprocess.run(command, cwd=cwd, check=True, capture_output=True)


def install_engine() -> None:
    """Clones the engine at the tested commit, then builds its environment in place."""
    if not ENGINE_PATH.exists():
        building = ENGINE_PATH.with_name(f"{ENGINE_PATH.name}.building")
        shutil.rmtree(building, ignore_errors=True)
        run(["git", "clone", "--quiet", VIDEO_MODEL.engine_repo, str(building)])
        run(["git", "checkout", "--quiet", VIDEO_MODEL.engine_commit], cwd=building)
        building.rename(ENGINE_PATH)
    if not (ENGINE_PATH / ENGINE_READY).exists():
        # The lock file pins every package to what was tested; the environment records its folder, so it is built in place
        run(["uv", "sync", "--frozen"], cwd=ENGINE_PATH)
        (ENGINE_PATH / ENGINE_READY).touch()


def engine_command(image: Path, output: Path, prompt: str, frames: int, width: int, height: int, seed: int) -> list[str]:
    return [
        "uv", "run", "--frozen", "--project", str(ENGINE_PATH), "ltx-2-mlx", "generate",
        "--prompt", prompt, "--image", str(image), "0", "1.0", "--distilled",
        "-f", str(frames), "--frame-rate", str(VIDEO_MODEL.frame_rate), "-H", str(height), "-W", str(width),
        "--seed", str(seed), "--model", str(WEIGHTS_PATH), "-o", str(output),
    ]


def run_engine(command: list[str], hf_cache: Path, cancelled: Callable[[], bool], on_decoding: Callable[[], None]) -> None:
    """Runs the engine until it finishes, stopping it if `cancelled` turns true; the text encoder comes from our cache."""
    env = {**os.environ, "HF_HUB_CACHE": str(hf_cache), "HF_HUB_OFFLINE": "1"}
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env)
    output: list[str] = []

    def read() -> None:
        for line in process.stdout or []:
            output.append(line)
            if DECODING_MARKER in line:
                on_decoding()

    reader = threading.Thread(target=read, daemon=True)
    reader.start()
    while process.poll() is None:
        if cancelled():
            process.terminate()
            process.wait(timeout=10)
            raise EngineCancelled()
        time.sleep(POLL_SECONDS)
    reader.join(timeout=5)
    if process.returncode != 0:
        raise EngineFailed("".join(output[-5:]).strip())


def frame_at(mp4: Path, seconds: float) -> bytes:
    return subprocess.run(
        ["ffmpeg", "-v", "error", "-ss", f"{seconds:.2f}", "-i", str(mp4), "-frames:v", "1", "-f", "image2", "-c:v", "png", "-"],
        check=True, capture_output=True,
    ).stdout


def make_clip(image: Image.Image, prompt: str, seconds: int, size: tuple[int, int], seed: int, hf_cache: Path,
              cancelled: Callable[[], bool], on_decoding: Callable[[], None]) -> Clip:
    """Animates `image` for `seconds`, at `size`; files go to a temporary folder that is removed afterwards."""
    width, height = size
    with tempfile.TemporaryDirectory() as folder:
        start, output = Path(folder) / "start.png", Path(folder) / "clip.mp4"
        image.convert("RGB").resize(size, Image.LANCZOS).save(start)
        run_engine(engine_command(start, output, prompt, VIDEO_MODEL.frames[seconds], width, height, seed), hf_cache, cancelled, on_decoding)
        return Clip(mp4=output.read_bytes(), poster=frame_at(output, 0), middle=frame_at(output, seconds / 2))
