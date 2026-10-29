import io
import random
import sqlite3
from pathlib import Path

import pytest
from PIL import Image

import history_store
from history_store import NewImage
from image_codec import encode_for_storage, is_webp, media_type, to_png


def encoded(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def photo(mode: str = "RGB", size: tuple[int, int] = (96, 64)) -> Image.Image:
    """Noise with a gradient, so it compresses like a picture rather than a flat colour."""
    noise = Image.frombytes("RGB", size, random.Random(1).randbytes(size[0] * size[1] * 3))
    return Image.blend(noise, Image.linear_gradient("L").resize(size).convert("RGB"), 0.9).convert(mode)


@pytest.mark.parametrize("mode", ["RGB", "P"])
def test_storing_keeps_every_pixel(mode: str) -> None:
    source = photo(mode)
    stored = encode_for_storage(encoded(source))

    assert is_webp(stored)
    assert Image.open(io.BytesIO(stored)).convert("RGB").tobytes() == source.convert("RGB").tobytes()


def test_real_transparency_is_kept_and_an_opaque_alpha_channel_is_dropped() -> None:
    clear = photo("RGBA")
    clear.putpixel((0, 0), (10, 20, 30, 0))
    opaque = photo("RGBA")

    kept = Image.open(io.BytesIO(encode_for_storage(encoded(clear))))
    dropped = Image.open(io.BytesIO(encode_for_storage(encoded(opaque))))

    assert kept.mode == "RGBA" and kept.convert("RGBA").tobytes() == clear.tobytes()
    assert dropped.mode == "RGB"


def test_a_16_bit_image_stays_png_rather_than_lose_precision() -> None:
    deep = encoded(Image.linear_gradient("L").resize((96, 64)).convert("I;16"))
    assert encode_for_storage(deep) == deep


def test_reading_back_gives_a_png_with_the_same_pixels() -> None:
    png = encoded(photo())
    stored = encode_for_storage(png)

    assert media_type(stored) == "image/webp" and media_type(png) == "image/png"
    assert to_png(png) == png
    back = to_png(stored)
    assert back.startswith(b"\x89PNG")
    assert Image.open(io.BytesIO(back)).tobytes() == Image.open(io.BytesIO(png)).tobytes()


@pytest.fixture
def database(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(history_store, "DB_PATH", tmp_path / "history.db")
    history_store.init_db()


def new_image(png: bytes) -> NewImage:
    return NewImage(png=png, prompt="a fox", negative_prompt="", seed=1, width=96, height=64, steps=9, guidance=None, model="z-image-turbo", duration_seconds=1.0)


def test_history_stores_webp_and_still_hands_out_png(database: None) -> None:
    png = encoded(photo())
    item = history_store.add(new_image(png))

    assert is_webp(history_store.stored_image(item.id) or b"")
    assert Image.open(io.BytesIO(history_store.image_png(item.id) or b"")).tobytes() == Image.open(io.BytesIO(png)).tobytes()


def test_a_row_saved_as_png_before_webp_still_reads(database: None) -> None:
    png = encoded(photo())
    item = history_store.add(new_image(png))
    with sqlite3.connect(history_store.DB_PATH) as conn:
        conn.execute("UPDATE images SET image_data = ? WHERE id = ?", (png, item.id))

    assert history_store.stored_image(item.id) == png
    assert history_store.image_png(item.id) == png
