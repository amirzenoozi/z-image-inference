import io
import random
import sqlite3
from pathlib import Path

import pytest
from PIL import Image

import history_store
from history_store import NewImage
from image_codec import is_webp
from tools import recompress_history


def png_of(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def photo_png(seed: int) -> bytes:
    noise = Image.frombytes("RGB", (96, 64), random.Random(seed).randbytes(96 * 64 * 3))
    return png_of(Image.blend(noise, Image.linear_gradient("L").resize((96, 64)).convert("RGB"), 0.9))


@pytest.fixture
def old_history(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> dict[int, bytes]:
    """A History saved before WebP: two photos and a 16-bit image, all stored as PNG."""
    monkeypatch.setattr(history_store, "DB_PATH", tmp_path / "history.db")
    history_store.init_db()
    pngs = [photo_png(1), photo_png(2), png_of(Image.linear_gradient("L").resize((96, 64)).convert("I;16"))]
    stored = {}
    for png in pngs:
        item = history_store.add(NewImage(png=png, prompt="a fox", negative_prompt="", seed=1, width=96, height=64, steps=9, guidance=None, model="z-image-turbo", duration_seconds=1.0))
        stored[item.id] = png
    with sqlite3.connect(history_store.DB_PATH) as conn:
        conn.executemany("UPDATE images SET image_data = ? WHERE id = ?", [(png, item_id) for item_id, png in stored.items()])
    return stored


def stored_rows() -> dict[int, bytes]:
    with sqlite3.connect(history_store.DB_PATH) as conn:
        return dict(conn.execute("SELECT id, image_data FROM images"))


def test_a_dry_run_changes_nothing(old_history: dict[int, bytes]) -> None:
    assert recompress_history.main(["--dry-run"]) == 0

    assert stored_rows() == old_history
    assert not recompress_history.backup_path().exists()


def test_converts_every_png_it_can_with_the_same_pixels_after_a_backup(old_history: dict[int, bytes]) -> None:
    recompress_history.main([])

    rows = stored_rows()
    photos, deep = list(old_history)[:2], list(old_history)[2]
    for item_id in photos:
        assert is_webp(rows[item_id])
        assert Image.open(io.BytesIO(rows[item_id])).tobytes() == Image.open(io.BytesIO(old_history[item_id])).tobytes()
    assert rows[deep] == old_history[deep]
    with sqlite3.connect(recompress_history.backup_path()) as backup:
        assert dict(backup.execute("SELECT id, image_data FROM images")) == old_history


def test_running_again_changes_nothing(old_history: dict[int, bytes]) -> None:
    recompress_history.main(["--no-backup"])
    first = stored_rows()

    recompress_history.main(["--no-backup"])

    assert stored_rows() == first


def test_limit_converts_only_that_many(old_history: dict[int, bytes]) -> None:
    recompress_history.main(["--no-backup", "--limit", "1"])

    assert [is_webp(data) for data in stored_rows().values()] == [True, False, False]
