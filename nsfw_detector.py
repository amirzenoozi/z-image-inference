import io
import threading
from pathlib import Path

from huggingface_hub import snapshot_download
from PIL import Image
from transformers import ImageClassificationPipeline, pipeline

# A small image classifier (ViT, Apache 2.0) that tells nudity and sexual content from normal images
DETECTOR_REPO = "Falconsai/nsfw_image_detection"
DETECTOR_PATH = Path(__file__).parent / "models" / "nsfw-detector"
DETECTOR_FILES = ["config.json", "preprocessor_config.json", "model.safetensors"]
NSFW_LABEL = "nsfw"
# The share of its confidence above which an image counts as sensitive
NSFW_THRESHOLD = 0.5

_lock = threading.Lock()
_classifier: ImageClassificationPipeline | None = None


def download_marker() -> Path:
    # Written last, so an interrupted download counts as missing and resumes next time
    return DETECTOR_PATH / ".download-complete"


def load() -> None:
    """Downloads the classifier once, then loads it on the CPU, leaving the GPU to the image models."""
    global _classifier
    if not download_marker().exists():
        print(f"Downloading the sensitive-image check ({DETECTOR_REPO})...")
        snapshot_download(DETECTOR_REPO, local_dir=DETECTOR_PATH, allow_patterns=DETECTOR_FILES)
        download_marker().touch()
    classifier: ImageClassificationPipeline = pipeline("image-classification", model=str(DETECTOR_PATH), device="cpu")
    with _lock:
        _classifier = classifier


def is_ready() -> bool:
    with _lock:
        return _classifier is not None


def is_nsfw(png: bytes) -> bool | None:
    """Whether the image shows nudity or sexual content; None while the classifier is not loaded yet."""
    with _lock:
        classifier = _classifier
    if classifier is None:
        return None
    image = Image.open(io.BytesIO(png)).convert("RGB")
    scores = {result["label"]: result["score"] for result in classifier(image)}
    return scores.get(NSFW_LABEL, 0.0) >= NSFW_THRESHOLD
