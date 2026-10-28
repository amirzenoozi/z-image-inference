import json
import sqlite3
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from generation_request import MAX_SEED
from history_store import connection

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
TraitText = Annotated[str, StringConstraints(max_length=300)]
TraitList = Annotated[list[Annotated[str, StringConstraints(max_length=100)]], Field(max_length=20)]
Seed = Annotated[int, Field(ge=0, le=MAX_SEED)]


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


class CharacterUpdate(BaseModel):
    """Only the fields sent change; send null to clear the cover or the seed."""

    model_config = ConfigDict(extra="forbid")

    name: Name | None = None
    traits: CharacterTraits | None = None
    cover_id: int | None = None
    seed: Seed | None = None


class Character(BaseModel):
    id: int
    name: str
    traits: CharacterTraits
    # The chosen cover, or else the character's newest image; null while it has none
    cover_id: int | None
    seed: int | None
    image_count: int


class DuplicateName(ValueError):
    pass


class MissingImage(ValueError):
    pass


SELECT = """
    SELECT c.id, c.name, c.traits,
           COALESCE((SELECT id FROM images WHERE id = c.cover_id),
                    (SELECT MAX(id) FROM images WHERE character_id = c.id)),
           c.seed,
           (SELECT COUNT(*) FROM images WHERE character_id = c.id)
    FROM characters c
"""


def to_character(row: tuple[int, str, str, int | None, int | None, int]) -> Character:
    id_, name, traits, cover_id, seed, image_count = row
    return Character(id=id_, name=name, traits=CharacterTraits.model_validate_json(traits), cover_id=cover_id, seed=seed, image_count=image_count)


def all_characters() -> list[Character]:
    with connection() as conn:
        return [to_character(row) for row in conn.execute(f"{SELECT} ORDER BY c.name COLLATE NOCASE")]


def character(character_id: int) -> Character | None:
    with connection() as conn:
        row = conn.execute(f"{SELECT} WHERE c.id = ?", (character_id,)).fetchone()
    return to_character(row) if row else None


def check_cover(conn: sqlite3.Connection, cover_id: int | None) -> None:
    if cover_id is not None and conn.execute("SELECT 1 FROM images WHERE id = ?", (cover_id,)).fetchone() is None:
        raise MissingImage("The cover image is not in History")


def create(new: NewCharacter) -> Character:
    try:
        with connection() as conn:
            check_cover(conn, new.cover_id)
            cursor = conn.execute(
                "INSERT INTO characters (name, traits, cover_id, seed) VALUES (?, ?, ?, ?)",
                (new.name, new.traits.model_dump_json(), new.cover_id, new.seed),
            )
    except sqlite3.IntegrityError:
        raise DuplicateName(f"There is already a character called {new.name}")
    created = character(cursor.lastrowid or 0)
    assert created is not None
    return created


CLEARABLE = {"cover_id", "seed"}


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
            check_cover(conn, changes.cover_id)
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
