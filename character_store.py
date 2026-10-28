import json
import sqlite3
from pathlib import Path
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, TypeAdapter

from generation_request import MAX_FACE_STRENGTH, MAX_SEED, MIN_FACE_STRENGTH
from history_store import connection

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
TraitText = Annotated[str, StringConstraints(max_length=300)]
TraitList = Annotated[list[Annotated[str, StringConstraints(max_length=100)]], Field(max_length=20)]
Seed = Annotated[int, Field(ge=0, le=MAX_SEED)]
FaceStrength = Annotated[float, Field(ge=MIN_FACE_STRENGTH, le=MAX_FACE_STRENGTH)]
DEFAULT_FACE_STRENGTH = 0.6


class CharacterTraits(BaseModel):
    """The prompt builder's identity choices, named as the builder names them; it checks the values against its own options."""

    model_config = ConfigDict(extra="forbid")

    who: TraitText = ""
    age: TraitText = ""
    ethnicity: TraitText = ""
    subject: TraitText = ""
    eyeColor: TraitText = ""
    makeup: TraitText = ""
    skinTone: TraitText = ""
    skinDetails: TraitList = []
    appearanceExtra: TraitText = ""
    hairColor: TraitText = ""
    hairstyle: TraitText = ""
    hairLength: TraitText = ""
    bodyType: TraitText = ""
    height: TraitText = ""
    bust: TraitText = ""
    hips: TraitText = ""
    tattoos: TraitList = []
    piercings: TraitList = []
    bodyExtra: TraitText = ""


class NewCharacter(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Name
    traits: CharacterTraits
    cover_id: int | None = None
    seed: Seed | None = None
    face_id: int | None = None
    face_strength: FaceStrength = DEFAULT_FACE_STRENGTH


class CharacterUpdate(BaseModel):
    """Only the fields sent change; send null to clear the cover, the seed or the face image."""

    model_config = ConfigDict(extra="forbid")

    name: Name | None = None
    traits: CharacterTraits | None = None
    cover_id: int | None = None
    seed: Seed | None = None
    face_id: int | None = None
    face_strength: FaceStrength | None = None


class Character(BaseModel):
    id: int
    name: str
    traits: CharacterTraits
    # The chosen cover, or else the character's newest image; null while it has none
    cover_id: int | None
    seed: int | None
    image_count: int
    # The History image whose face SDXL renders keep (IP-Adapter); null for none, or once that image is deleted
    face_id: int | None
    face_strength: float
    # Whether the cover and the face image are blurred in lists, as their History images are
    cover_sensitive: bool
    face_sensitive: bool


class SampleCharacter(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Name
    traits: CharacterTraits


# Added once to every database, so a first run starts with characters to try; deleted ones do not come back
SAMPLE_CHARACTERS_FILE = Path(__file__).parent / "sample_characters.json"
SAMPLE_CHARACTERS = TypeAdapter(list[SampleCharacter])
SAMPLES_ADDED = "sample_characters_added"


class DuplicateName(ValueError):
    pass


class MissingImage(ValueError):
    pass


COVER = "COALESCE((SELECT id FROM images WHERE id = c.cover_id), (SELECT MAX(id) FROM images WHERE character_id = c.id))"
SELECT = f"""
    SELECT c.id, c.name, c.traits, {COVER}, c.seed,
           (SELECT COUNT(*) FROM images WHERE character_id = c.id),
           (SELECT id FROM images WHERE id = c.face_id),
           c.face_strength,
           COALESCE((SELECT sensitive FROM images WHERE id = {COVER}), 0),
           COALESCE((SELECT sensitive FROM images WHERE id = c.face_id), 0)
    FROM characters c
"""


CharacterRow = tuple[int, str, str, int | None, int | None, int, int | None, float, int, int]


def to_character(row: CharacterRow) -> Character:
    id_, name, traits, cover_id, seed, image_count, face_id, face_strength, cover_sensitive, face_sensitive = row
    return Character(
        id=id_, name=name, traits=CharacterTraits.model_validate_json(traits), cover_id=cover_id, seed=seed, image_count=image_count,
        face_id=face_id, face_strength=face_strength, cover_sensitive=bool(cover_sensitive), face_sensitive=bool(face_sensitive),
    )


def all_characters() -> list[Character]:
    with connection() as conn:
        return [to_character(row) for row in conn.execute(f"{SELECT} ORDER BY c.name COLLATE NOCASE")]


def character(character_id: int) -> Character | None:
    with connection() as conn:
        row = conn.execute(f"{SELECT} WHERE c.id = ?", (character_id,)).fetchone()
    return to_character(row) if row else None


def check_image(conn: sqlite3.Connection, image_id: int | None, role: str) -> None:
    if image_id is not None and conn.execute("SELECT 1 FROM images WHERE id = ?", (image_id,)).fetchone() is None:
        raise MissingImage(f"The {role} image is not in History")


def create(new: NewCharacter) -> Character:
    try:
        with connection() as conn:
            check_image(conn, new.cover_id, "cover")
            check_image(conn, new.face_id, "face")
            cursor = conn.execute(
                "INSERT INTO characters (name, traits, cover_id, seed, face_id, face_strength) VALUES (?, ?, ?, ?, ?, ?)",
                (new.name, new.traits.model_dump_json(), new.cover_id, new.seed, new.face_id, new.face_strength),
            )
    except sqlite3.IntegrityError:
        raise DuplicateName(f"There is already a character called {new.name}")
    created = character(cursor.lastrowid or 0)
    assert created is not None
    return created


CLEARABLE = {"cover_id", "seed", "face_id"}


def changed_columns(changes: CharacterUpdate) -> dict[str, str | int | None]:
    """The columns to set: each field sent, where null clears the cover or seed and is ignored for the name and traits."""
    sent = changes.model_dump(include=changes.model_fields_set)
    columns = {key: value for key, value in sent.items() if key in CLEARABLE or value is not None}
    if "traits" in columns:
        columns["traits"] = json.dumps(columns["traits"])
    return columns


def update(character_id: int, changes: CharacterUpdate) -> Character | None:
    columns = changed_columns(changes)
    try:
        with connection() as conn:
            check_image(conn, changes.cover_id, "cover")
            check_image(conn, changes.face_id, "face")
            if columns:
                assignments = ", ".join(f"{column} = ?" for column in columns)
                conn.execute(f"UPDATE characters SET {assignments} WHERE id = ?", (*columns.values(), character_id))
    except sqlite3.IntegrityError:
        raise DuplicateName(f"There is already a character called {changes.name}")
    return character(character_id)


def delete(character_id: int) -> bool:
    """Its images are kept, no longer linked to it."""
    with connection() as conn:
        conn.execute("UPDATE images SET character_id = NULL WHERE character_id = ?", (character_id,))
        return conn.execute("DELETE FROM characters WHERE id = ?", (character_id,)).rowcount > 0


def sample_characters() -> list[SampleCharacter]:
    samples = SAMPLE_CHARACTERS.validate_json(SAMPLE_CHARACTERS_FILE.read_bytes())
    names = [sample.name.casefold() for sample in samples]
    if len(set(names)) != len(names):
        raise ValueError(f"{SAMPLE_CHARACTERS_FILE.name} gives two characters the same name")
    return samples


def add_samples_once() -> None:
    """Adds the sample characters the first time this database starts; a name already taken is skipped."""
    samples = sample_characters()
    with connection() as conn:
        if conn.execute("SELECT 1 FROM app_state WHERE key = ?", (SAMPLES_ADDED,)).fetchone():
            return
        conn.executemany(
            "INSERT OR IGNORE INTO characters (name, traits) VALUES (?, ?)",
            [(sample.name, sample.traits.model_dump_json()) for sample in samples],
        )
        conn.execute("INSERT INTO app_state (key, value) VALUES (?, '1')", (SAMPLES_ADDED,))
