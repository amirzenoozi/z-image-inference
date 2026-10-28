import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from pathlib import Path

from model_catalog import DEFAULT_MODEL

DB_PATH = Path(__file__).parent / "history.db"
COLUMNS = "id, prompt, negative_prompt, seed, width, height, steps, guidance, model, created_at, duration_seconds"
# Columns added after the first release, with the value existing rows get
ADDED_COLUMNS: dict[str, str] = {
    # Rows saved before models could be switched all came from the default model
    "model": f"TEXT NOT NULL DEFAULT '{DEFAULT_MODEL.id}'",
    "negative_prompt": "TEXT NOT NULL DEFAULT ''",
    "guidance": "REAL",
    # Rows saved before render times were recorded have none
    "duration_seconds": "REAL",
}


@dataclass(frozen=True)
class HistoryItem:
    id: int
    prompt: str
    negative_prompt: str
    seed: int
    width: int
    height: int
    steps: int
    guidance: float | None
    model: str
    created_at: str
    duration_seconds: float | None

    def to_dict(self) -> dict[str, str | int | float | None]:
        return asdict(self)


# The ages "Clean up" offers: images older than this many days can be deleted together
CLEANUP_AGES_DAYS = (7, 30, 90)


@dataclass(frozen=True)
class AgeCount:
    days: int
    count: int


@dataclass(frozen=True)
class HistorySummary:
    total: int
    bytes: int
    older_than: list[AgeCount]


@dataclass(frozen=True)
class NewImage:
    png: bytes
    prompt: str
    negative_prompt: str
    seed: int
    width: int
    height: int
    steps: int
    guidance: float | None
    model: str
    duration_seconds: float


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
        add_missing_columns(conn)


def add_missing_columns(conn: sqlite3.Connection) -> None:
    existing = {row[1] for row in conn.execute("PRAGMA table_info(images)")}
    for name, definition in ADDED_COLUMNS.items():
        if name not in existing:
            conn.execute(f"ALTER TABLE images ADD COLUMN {name} {definition}")


def to_item(row: tuple[int, str | None, str, int, int, int, int, float | None, str, str, float | None]) -> HistoryItem:
    id_, prompt, negative_prompt, seed, width, height, steps, guidance, model, created_at, duration_seconds = row
    return HistoryItem(id_, prompt or "", negative_prompt, seed, width, height, steps, guidance, model, created_at, duration_seconds)


def add(image: NewImage) -> HistoryItem:
    with connection() as conn:
        cursor = conn.execute(
            """INSERT INTO images (image_data, prompt, negative_prompt, seed, width, height, steps, guidance, model, duration_seconds)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (image.png, image.prompt, image.negative_prompt, image.seed, image.width, image.height,
             image.steps, image.guidance, image.model, image.duration_seconds),
        )
        row = conn.execute(f"SELECT {COLUMNS} FROM images WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return to_item(row)


def page(offset: int, limit: int) -> tuple[list[HistoryItem], int]:
    """Newest first; also returns the total count so callers know whether more remain."""
    with connection() as conn:
        rows = conn.execute(
            f"SELECT {COLUMNS} FROM images ORDER BY id DESC LIMIT ? OFFSET ?", (limit, offset)
        ).fetchall()
        total = conn.execute("SELECT COUNT(*) FROM images").fetchone()[0]
    return [to_item(row) for row in rows], total


def image_png(item_id: int) -> bytes | None:
    with connection() as conn:
        row = conn.execute("SELECT image_data FROM images WHERE id = ?", (item_id,)).fetchone()
    return row[0] if row else None


def delete(item_id: int) -> bool:
    with connection() as conn:
        return conn.execute("DELETE FROM images WHERE id = ?", (item_id,)).rowcount > 0


def clear() -> None:
    with connection() as conn:
        conn.execute("DELETE FROM images")
    compact()


def older_than(days: int) -> tuple[str, str]:
    return "created_at < datetime('now', ?)", f"-{days} days"


def summary() -> HistorySummary:
    with connection() as conn:
        total = conn.execute("SELECT COUNT(*) FROM images").fetchone()[0]
        counts = []
        for days in CLEANUP_AGES_DAYS:
            condition, age = older_than(days)
            counts.append(AgeCount(days, conn.execute(f"SELECT COUNT(*) FROM images WHERE {condition}", (age,)).fetchone()[0]))
    return HistorySummary(total, DB_PATH.stat().st_size, counts)


def delete_older_than(days: int) -> int:
    condition, age = older_than(days)
    with connection() as conn:
        deleted = conn.execute(f"DELETE FROM images WHERE {condition}", (age,)).rowcount
    compact()
    return deleted


def compact() -> None:
    """SQLite keeps the space of deleted images in the file until it is rebuilt."""
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("VACUUM")
    finally:
        conn.close()
