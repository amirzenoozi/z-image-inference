import json
import sqlite3
from pathlib import Path
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import asdict, dataclass

from image_codec import encode_for_storage, is_webp, to_png
from model_catalog import DEFAULT_MODEL, MODELS_NOW_ADDONS
from palette import PaletteColour, extract_palette
from paths import PROJECT_DIR
from resolutions import CATEGORY_CONDITIONS, Category
from sensitive import is_sensitive

DB_PATH = PROJECT_DIR / "history.db"
COLUMNS = "id, prompt, negative_prompt, seed, width, height, steps, guidance, model, created_at, duration_seconds, favourite, edited_from, varied_from, change, character_id, face_from, sensitive, addons, prompt_spec"
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
    # Blurred in the list: worked out from the prompt (rows from before it existed are checked at start), changeable per image
    "sensitive": "INTEGER",
    # Whether the image itself has been checked for nudity (nsfw_detector.py); unchecked ones are checked in the background
    "image_checked": "INTEGER NOT NULL DEFAULT 0",
    # The add-ons the render used (model_catalog.ADDONS ids), comma-separated; empty for none
    "addons": "TEXT NOT NULL DEFAULT ''",
    # The JSON prompt the text was written from (prompt_spec.py); NULL for a prompt written as text
    "prompt_spec": "TEXT",
}
# Character columns added after characters were first released
ADDED_CHARACTER_COLUMNS: dict[str, str] = {
    # The History image whose face renders keep (IP-Adapter), and how strongly
    "face_id": "INTEGER",
    "face_strength": "REAL NOT NULL DEFAULT 0.6",
    # An uploaded face photo (PNG) used instead of a History image; it keeps the character's images safe for work
    "face_upload": "BLOB",
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
    sensitive: bool
    addons: list[str]
    prompt_spec: str | None

    def to_dict(self) -> dict[str, str | int | float | list[str] | None]:
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
    # None works it out from the prompt; an edited copy passes its original's, which may have been set by hand
    sensitive: bool | None = None
    # Whether the image itself was checked already (its result is in `sensitive`), so the background check skips it
    image_checked: bool = False
    # The add-ons the render used; an edited copy keeps its original's
    addons: tuple[str, ...] = ()
    # The JSON prompt the text was written from, as JSON text
    prompt_spec: str | None = None


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
        mark_unchecked_images(conn)
        move_to_base_models(conn)
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
        # One-time steps already done for this database, such as adding the sample characters
        conn.execute("CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)")


def mark_unchecked_images(conn: sqlite3.Connection) -> None:
    """Images saved before the sensitive flag existed get it from their prompt, once."""
    unchecked = conn.execute("SELECT id, prompt FROM images WHERE sensitive IS NULL").fetchall()
    conn.executemany("UPDATE images SET sensitive = ? WHERE id = ?", [(int(is_sensitive(prompt or "")), id_) for id_, prompt in unchecked])


def move_to_base_models(conn: sqlite3.Connection) -> None:
    """Images made with a model that is now an add-on become images of its base model, made with that add-on."""
    for addon_id, base_id in MODELS_NOW_ADDONS.items():
        conn.execute("UPDATE images SET model = ?, addons = ? WHERE model = ?", (base_id, addon_id, addon_id))


def add_missing_columns(conn: sqlite3.Connection, table: str, columns: dict[str, str]) -> None:
    existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
    for name, definition in columns.items():
        if name not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")


Row = tuple[int, str | None, str, int, int, int, int, float | None, str, str, float | None, int, int | None, int | None, float | None, int | None, int | None, int, str, str | None]


def to_item(row: Row) -> HistoryItem:
    id_, prompt, negative_prompt, seed, width, height, steps, guidance, model, created_at, duration_seconds, favourite, *links = row
    edited_from, varied_from, change, character_id, face_from, sensitive, addons, prompt_spec = links
    return HistoryItem(
        id_, prompt or "", negative_prompt, seed, width, height, steps, guidance, model, created_at, duration_seconds, bool(favourite),
        edited_from, varied_from, change, character_id, face_from, bool(sensitive), [addon for addon in addons.split(",") if addon],
        prompt_spec,
    )


def add(image: NewImage) -> HistoryItem:
    with connection() as conn:
        cursor = conn.execute(
            """INSERT INTO images (image_data, prompt, negative_prompt, seed, width, height, steps, guidance, model, duration_seconds,
                                  edited_from, varied_from, change, character_id, face_from, sensitive, image_checked, addons, prompt_spec)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (encode_for_storage(image.png), image.prompt, image.negative_prompt, image.seed, image.width, image.height,
             image.steps, image.guidance, image.model, image.duration_seconds, image.edited_from, image.varied_from, image.change,
             image.character_id, image.face_from, int(is_sensitive(image.prompt) if image.sensitive is None else image.sensitive),
             int(image.image_checked), ",".join(image.addons), image.prompt_spec),
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
            yield to_item(row[:-1]), to_png(row[-1])


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


def set_sensitive(item_id: int, sensitive: bool) -> HistoryItem | None:
    """Set by hand, it wins: the image counts as checked, so the background check never changes it."""
    with connection() as conn:
        conn.execute("UPDATE images SET sensitive = ?, image_checked = 1 WHERE id = ?", (int(sensitive), item_id))
        row = conn.execute(f"SELECT {COLUMNS} FROM images WHERE id = ?", (item_id,)).fetchone()
    return to_item(row) if row else None


def unchecked_image_ids(limit: int) -> list[int]:
    """Images the background check has not looked at yet, oldest first."""
    with connection() as conn:
        return [row[0] for row in conn.execute("SELECT id FROM images WHERE image_checked = 0 ORDER BY id LIMIT ?", (limit,))]


def record_image_check(item_id: int, nsfw: bool) -> None:
    """The check only ever adds the flag: an image the prompt marked stays marked, and one set by hand is not touched."""
    with connection() as conn:
        conn.execute(
            "UPDATE images SET sensitive = MAX(sensitive, ?), image_checked = 1 WHERE id = ? AND image_checked = 0", (int(nsfw), item_id),
        )


def stored_image(item_id: int) -> bytes | None:
    """The image as stored: lossless WebP, or PNG for rows saved before WebP (image_codec.py)."""
    with connection() as conn:
        row = conn.execute("SELECT image_data FROM images WHERE id = ?", (item_id,)).fetchone()
    return row[0] if row else None


def image_png(item_id: int) -> bytes | None:
    stored = stored_image(item_id)
    return None if stored is None else to_png(stored)


def png_image_ids() -> list[int]:
    """Images still stored as PNG, saved before History stored WebP."""
    with connection() as conn:
        return [row[0] for row in conn.execute("SELECT id FROM images WHERE hex(substr(image_data, 1, 4)) = '89504E47' ORDER BY id")]


def store_as_webp(item_id: int) -> int:
    """Re-stores one PNG image as lossless WebP, pixel-checked; returns the bytes saved, 0 if it was left as it was."""
    with connection() as conn:
        row = conn.execute("SELECT image_data FROM images WHERE id = ?", (item_id,)).fetchone()
        if row is None or is_webp(row[0]):
            return 0
        stored = encode_for_storage(row[0])
        if stored == row[0]:
            return 0
        conn.execute("UPDATE images SET image_data = ? WHERE id = ?", (stored, item_id))
    return len(row[0]) - len(stored)


def backup(target: Path) -> None:
    """A consistent copy of the whole database, safe to take while it is in use."""
    source, copy = sqlite3.connect(DB_PATH), sqlite3.connect(target)
    try:
        source.backup(copy)
    finally:
        copy.close()
        source.close()


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
