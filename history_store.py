import io
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

from model_catalog import DEFAULT_MODEL

DB_PATH = Path(__file__).parent / "history.db"
COLUMNS = "id, image_data, prompt, seed, width, height, steps, model"


@dataclass(frozen=True)
class HistoryItem:
    id: int
    image: Image.Image
    prompt: str
    seed: int
    width: int
    height: int
    steps: int
    model: str


@contextmanager
def connection() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(DB_PATH)
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def init_db() -> None:
    with connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                image_data BLOB NOT NULL,
                prompt TEXT,
                seed INTEGER,
                width INTEGER,
                height INTEGER,
                steps INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        add_model_column(conn)


def add_model_column(conn: sqlite3.Connection) -> None:
    columns = {row[1] for row in conn.execute("PRAGMA table_info(images)")}
    if "model" not in columns:
        # Rows saved before models could be switched all came from the default model
        conn.execute(f"ALTER TABLE images ADD COLUMN model TEXT NOT NULL DEFAULT '{DEFAULT_MODEL.id}'")


Row = tuple[int, bytes, str | None, int, int, int, int, str]


def to_item(row: Row) -> HistoryItem:
    id_, image_data, prompt, seed, width, height, steps, model = row
    return HistoryItem(id_, Image.open(io.BytesIO(image_data)), prompt or "", seed, width, height, steps, model)


def add(image: Image.Image, prompt: str, seed: int, width: int, height: int, steps: int, model: str) -> None:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    with connection() as conn:
        conn.execute(
            "INSERT INTO images (image_data, prompt, seed, width, height, steps, model) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (buffer.getvalue(), prompt, seed, width, height, steps, model),
        )


def recent(limit: int) -> list[HistoryItem]:
    with connection() as conn:
        rows = conn.execute(f"SELECT {COLUMNS} FROM images ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return [to_item(row) for row in rows]


def get(item_id: int) -> HistoryItem | None:
    with connection() as conn:
        row = conn.execute(f"SELECT {COLUMNS} FROM images WHERE id = ?", (item_id,)).fetchone()
    return to_item(row) if row else None


def delete(item_id: int) -> None:
    with connection() as conn:
        conn.execute("DELETE FROM images WHERE id = ?", (item_id,))


def clear() -> None:
    with connection() as conn:
        conn.execute("DELETE FROM images")
