"""Clothes the user adds in custom_clothes.json at the project root, read on every catalog request.

Each entry is offered in the prompt builder's outfit menus like a built-in item. A broken entry is left out and named
in `problems`, so a typo never stops the app; the browser also leaves out one whose value repeats a built-in item.
Adult entries are left out while adult content is off (adult_content.py).
"""
import json
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationError, model_validator

import adult_content
import i18n
import paths

CUSTOM_CLOTHES_FILE = paths.PROJECT_DIR / "custom_clothes.json"

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
Language = Annotated[str, StringConstraints(pattern=r"^[a-z]{2}$")]
# Slots an adult item can be in: lingerie tops and bottoms, and accessories worn over lingerie
ADULT_SLOTS = ("top", "bottom", "accessory")


class CustomGarment(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True, serialize_by_alias=True)

    # The English name written into the prompt and the JSON prompt
    value: Name
    # What the menu shows: one text, or one per language code
    title: Name | dict[Language, Name]
    prompt: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=600)]
    tags: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] = ""
    slot: Literal["top", "bottom", "outerwear", "shoes", "accessory"]
    # A dress or jumpsuit, worn on top, also covers the bottom
    covers: Literal["both"] | None = None
    group: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
    wearer: Literal["woman", "man", "anyone"] = Field("anyone", alias="for")
    adult: bool = False

    @model_validator(mode="after")
    def check_slot(self) -> "CustomGarment":
        if self.covers == "both" and self.slot != "top":
            raise ValueError(i18n.t("customCoversNeedsTop"))
        if self.adult and self.slot not in ADULT_SLOTS:
            raise ValueError(i18n.t("customAdultSlot"))
        return self


class CustomClothes(BaseModel):
    items: list[CustomGarment] = []
    problems: list[str] = []


def entry_problem(number: int, entry: object, error: ValidationError) -> str:
    value = entry.get("value", "?") if isinstance(entry, dict) else "?"
    reasons = "; ".join(f"{'.'.join(map(str, problem['loc']))}: {problem['msg']}" if problem["loc"] else problem["msg"] for problem in error.errors())
    return i18n.t("customEntryProblem", number=number, value=value, reasons=reasons)


def load() -> CustomClothes:
    if not CUSTOM_CLOTHES_FILE.exists():
        return CustomClothes()
    try:
        entries = json.loads(CUSTOM_CLOTHES_FILE.read_text())
    except (OSError, ValueError) as error:
        return CustomClothes(problems=[i18n.t("customFileUnreadable", error=str(error))])
    if not isinstance(entries, list):
        return CustomClothes(problems=[i18n.t("customFileNotList")])
    clothes = CustomClothes()
    seen: set[str] = set()
    for number, entry in enumerate(entries, 1):
        try:
            garment = CustomGarment.model_validate(entry)
        except ValidationError as error:
            clothes.problems.append(entry_problem(number, entry, error))
            continue
        if garment.value.casefold() in seen:
            clothes.problems.append(i18n.t("customDuplicate", value=garment.value))
            continue
        seen.add(garment.value.casefold())
        if adult_content.enabled() or not garment.adult:
            clothes.items.append(garment)
    return clothes
