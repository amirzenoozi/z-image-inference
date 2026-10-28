import json
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from pathlib import Path

from model_catalog import DEFAULT_MODEL
from palette import PaletteColour, extract_palette
from resolutions import CATEGORY_CONDITIONS, Category

DB_PATH = Path(__file__).parent / "history.db"
COLUMNS = "id, prompt, negative_prompt, seed, width, height, steps, guidance, model, created_at, duration_seconds, favourite, edited_from, varied_from, change, character_id, face_from"
# Columns added after the first release, with the value existing rows get
ADDED_COLUMNS: dict[str, str] = {
    # Rows saved before models could be switched all came from the default model
    "model": f"TEXT NOT NULL DEFAULT '{DEFAULT_MODEL.id}'",
    "negative_prompt": "TEXT NOT NULL DEFAULT ''",
    "guidance": "REAL",
    # Rows saved before render times were recorded have none
    "duration_seconds": "REAL",
    "favourite": "INTEGER NOT NULL DEFAULT 0",
    # Worked out the first time the image is opened
    "palette": "TEXT",
    # The image this one was cropped, turned or flipped from
    "edited_from": "INTEGER",
    # A variation's start image, and how much it was changed (0 to 1)
    "varied_from": "INTEGER",
    "change": "REAL",
    # The character the image was made for (characters table); cleared when the character is deleted
    "character_id": "INTEGER",
    # The image whose face it was locked to, for SDXL renders of a character with a face image
    "face_from": "INTEGER",
}
# Character columns added after characters were first released
ADDED_CHARACTER_COLUMNS: dict[str, str] = {
    # The History image whose face renders keep (IP-Adapter), and how strongly
    "face_id": "INTEGER",
    "face_strength": "REAL NOT NULL DEFAULT 0.6",
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
    favourite: bool
    edited_from: int | None
    varied_from: int | None
    change: float | None
    character_id: int | None
    face_from: int | None

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
class HistoryFilter:
    model: str | None = None
    # Text the prompt must contain, ignoring case
    search: str = ""
    favourites_only: bool = False
    # The image's shape, as the resolution picker groups sizes
    category: Category | None = None
    character_id: int | None = None

    def where(self) -> tuple[str, list[str | int]]:
        conditions: list[str] = []
        params: list[str | int] = []
        if self.character_id is not None:
            conditions.append("character_id = ?")
            params.append(self.character_id)
        if self.model:
            conditions.append("model = ?")
            params.append(self.model)
        if self.search:
            conditions.append("prompt LIKE ? ESCAPE '\\'")
            params.append(f"%{escape_like(self.search)}%")
        if self.favourites_only:
            conditions.append("favourite = 1")
        if self.category:
            conditions.append(f"({CATEGORY_CONDITIONS[self.category]})")
        return (f" WHERE {' AND '.join(conditions)}" if conditions else ""), params


def escape_like(text: str) -> str:
    """So % and _ typed in a search match themselves."""
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


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
    duration_seconds: float | None
    edited_from: int | None = None
    varied_from: int | None = None
    change: float | None = None
    character_id: int | None = None
    face_from: int | None = None


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
        add_missing_columns(conn, "images", ADDED_COLUMNS)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS characters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE COLLATE NOCASE,
                traits TEXT NOT NULL,
                cover_id INTEGER,
                seed INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        add_missing_columns(conn, "characters", ADDED_CHARACTER_COLUMNS)


def add_missing_columns(conn: sqlite3.Connection, table: str, columns: dict[str, str]) -> None:
    existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
    for name, definition in columns.items():
        if name not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")


Row = tuple[int, str | None, str, int, int, int, int, float | None, str, str, float | None, int, int | None, int | None, float | None, int | None, int | None]


def to_item(row: Row) -> HistoryItem:
    id_, prompt, negative_prompt, seed, width, height, steps, guidance, model, created_at, duration_seconds, favourite, *links = row
    edited_from, varied_from, change, character_id, face_from = links
    return HistoryItem(
        id_, prompt or "", negative_prompt, seed, width, height, steps, guidance, model, created_at, duration_seconds, bool(favourite),
        edited_from, varied_from, change, character_id, face_from,
    )


def add(image: NewImage) -> HistoryItem:
    with connection() as conn:
        cursor = conn.execute(
            """INSERT INTO images (image_data, prompt, negative_prompt, seed, width, height, steps, guidance, model, duration_seconds,
                                  edited_from, varied_from, change, character_id, face_from)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (image.png, image.prompt, image.negative_prompt, image.seed, image.width, image.height,
             image.steps, image.guidance, image.model, image.duration_seconds, image.edited_from, image.varied_from, image.change,
             image.character_id, image.face_from),
        )
        row = conn.execute(f"SELECT {COLUMNS} FROM images WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return to_item(row)


def page(offset: int, limit: int, filters: HistoryFilter = HistoryFilter()) -> tuple[list[HistoryItem], int]:
    """Newest first; also returns how many images match, so callers know whether more remain."""
    where, params = filters.where()
    with connection() as conn:
        rows = conn.execute(
            f"SELECT {COLUMNS} FROM images{where} ORDER BY id DESC LIMIT ? OFFSET ?", (*params, limit, offset)
        ).fetchall()
        total = conn.execute(f"SELECT COUNT(*) FROM images{where}", params).fetchone()[0]
    return [to_item(row) for row in rows], total


def images(filters: HistoryFilter) -> Iterator[tuple[HistoryItem, bytes]]:
    """Every matching image with its PNG, newest first, read one at a time so a large History is not held in memory."""
    where, params = filters.where()
    with connection() as conn:
        for row in conn.execute(f"SELECT {COLUMNS}, image_data FROM images{where} ORDER BY id DESC", params):
            yield to_item(row[:-1]), row[-1]


def palette(item_id: int) -> list[PaletteColour] | None:
    """The image's colour palette, worked out and saved the first time it is asked for; None if there is no such image."""
    with connection() as conn:
        row = conn.execute("SELECT palette FROM images WHERE id = ?", (item_id,)).fetchone()
    if row is None:
        return None
    if row[0] is not None:
        return [PaletteColour(**colour) for colour in json.loads(row[0])]
    png = image_png(item_id)
    if png is None:
        return None
    colours = extract_palette(png)
    with connection() as conn:
        conn.execute("UPDATE images SET palette = ? WHERE id = ?", (json.dumps([asdict(colour) for colour in colours]), item_id))
    return colours


def item(item_id: int) -> HistoryItem | None:
    with connection() as conn:
        row = conn.execute(f"SELECT {COLUMNS} FROM images WHERE id = ?", (item_id,)).fetchone()
    return to_item(row) if row else None


def set_favourite(item_id: int, favourite: bool) -> HistoryItem | None:
    with connection() as conn:
        conn.execute("UPDATE images SET favourite = ? WHERE id = ?", (int(favourite), item_id))
        row = conn.execute(f"SELECT {COLUMNS} FROM images WHERE id = ?", (item_id,)).fetchone()
    return to_item(row) if row else None


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
    """Images older than `days`, except favourites, which cleaning up keeps."""
    return "created_at < datetime('now', ?) AND favourite = 0", f"-{days} days"


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
