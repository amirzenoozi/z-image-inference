"""Short clips made from History images, stored as MP4 in the same database, beside the images they came from."""
from dataclasses import asdict, dataclass

from history_store import connection

COLUMNS = "id, image_id, prompt, seconds, width, height, seed, duration_seconds, sensitive, created_at"


@dataclass(frozen=True)
class VideoItem:
    id: int
    image_id: int
    prompt: str
    seconds: int
    width: int
    height: int
    seed: int
    # How long rendering took
    duration_seconds: float
    sensitive: bool
    created_at: str

    def to_dict(self) -> dict[str, str | int | float | bool]:
        return asdict(self)


@dataclass(frozen=True)
class NewVideo:
    image_id: int
    mp4: bytes
    poster: bytes
    prompt: str
    seconds: int
    width: int
    height: int
    seed: int
    duration_seconds: float
    sensitive: bool


def init_db() -> None:
    with connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS videos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                image_id INTEGER NOT NULL,
                video_data BLOB NOT NULL,
                poster BLOB NOT NULL,
                prompt TEXT NOT NULL,
                seconds INTEGER NOT NULL,
                width INTEGER NOT NULL,
                height INTEGER NOT NULL,
                seed INTEGER NOT NULL,
                duration_seconds REAL NOT NULL,
                sensitive INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS videos_by_image ON videos (image_id)")
        # However an image is deleted (one, cleaning up, or all), its videos go with it
        conn.execute("""
            CREATE TRIGGER IF NOT EXISTS delete_videos_with_image AFTER DELETE ON images
            BEGIN DELETE FROM videos WHERE image_id = OLD.id; END
        """)


def to_item(row: tuple[int, int, str, int, int, int, int, float, int, str]) -> VideoItem:
    id_, image_id, prompt, seconds, width, height, seed, duration, sensitive, created_at = row
    return VideoItem(id_, image_id, prompt, seconds, width, height, seed, duration, bool(sensitive), created_at)


def add(video: NewVideo) -> VideoItem:
    with connection() as conn:
        cursor = conn.execute(
            """INSERT INTO videos (image_id, video_data, poster, prompt, seconds, width, height, seed, duration_seconds, sensitive)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (video.image_id, video.mp4, video.poster, video.prompt, video.seconds, video.width, video.height, video.seed,
             video.duration_seconds, int(video.sensitive)),
        )
        row = conn.execute(f"SELECT {COLUMNS} FROM videos WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return to_item(row)


def for_image(image_id: int) -> list[VideoItem]:
    """Newest first."""
    with connection() as conn:
        rows = conn.execute(f"SELECT {COLUMNS} FROM videos WHERE image_id = ? ORDER BY id DESC", (image_id,)).fetchall()
    return [to_item(row) for row in rows]


def item(video_id: int) -> VideoItem | None:
    with connection() as conn:
        row = conn.execute(f"SELECT {COLUMNS} FROM videos WHERE id = ?", (video_id,)).fetchone()
    return to_item(row) if row else None


def mp4(video_id: int) -> bytes | None:
    with connection() as conn:
        row = conn.execute("SELECT video_data FROM videos WHERE id = ?", (video_id,)).fetchone()
    return row[0] if row else None


def poster(video_id: int) -> bytes | None:
    with connection() as conn:
        row = conn.execute("SELECT poster FROM videos WHERE id = ?", (video_id,)).fetchone()
    return row[0] if row else None


def delete(video_id: int) -> bool:
    with connection() as conn:
        return conn.execute("DELETE FROM videos WHERE id = ?", (video_id,)).rowcount > 0
