import json
import zipfile
from collections.abc import Iterator
from tempfile import SpooledTemporaryFile

import history_store
from history_store import HistoryFilter, HistoryItem

# A larger export moves from memory to a temporary file on disk
IN_MEMORY_LIMIT = 64 * 1024 * 1024
CHUNK_SIZE = 1024 * 1024


def file_stem(item: HistoryItem) -> str:
    return f"{item.id:04d}-{item.model}-{item.seed}"


def describe(item: HistoryItem) -> str:
    """The text file beside each image: its prompts, then its settings."""
    lines = [
        "Prompt:", item.prompt, "",
        "Negative prompt:", item.negative_prompt or "(none)", "",
        f"Model: {item.model}",
        f"Size: {item.width}×{item.height}",
        f"Steps: {item.steps}",
        f"Seed: {item.seed}",
    ]
    if item.guidance is not None:
        lines.append(f"Guidance: {item.guidance}")
    if item.duration_seconds is not None:
        lines.append(f"Render time: {item.duration_seconds} s")
    lines.append(f"Created: {item.created_at} UTC")
    return "\n".join(lines) + "\n"


def build_zip(filters: HistoryFilter) -> SpooledTemporaryFile[bytes]:
    archive: SpooledTemporaryFile[bytes] = SpooledTemporaryFile(max_size=IN_MEMORY_LIMIT)
    details = []
    with zipfile.ZipFile(archive, "w") as zip_file:
        for item, png in history_store.images(filters):
            # PNGs are already compressed; compressing them again only costs time
            zip_file.writestr(f"{file_stem(item)}.png", png, compress_type=zipfile.ZIP_STORED)
            zip_file.writestr(f"{file_stem(item)}.txt", describe(item), compress_type=zipfile.ZIP_DEFLATED)
            details.append(item.to_dict())
        zip_file.writestr("history.json", json.dumps(details, indent=2, ensure_ascii=False), compress_type=zipfile.ZIP_DEFLATED)
    archive.seek(0)
    return archive


def chunks(archive: SpooledTemporaryFile[bytes]) -> Iterator[bytes]:
    with archive:
        while chunk := archive.read(CHUNK_SIZE):
            yield chunk
