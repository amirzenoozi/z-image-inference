"""The JSON prompt the browser's prompt builder writes (frontend/src/lib/promptBuilder/spec.ts), saved with each image.

Only its shape and size are checked here: the browser checks each value against the builder's options and writes the
text sent to the model, and the safety rules run on that text, as for any prompt.
"""
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

SPEC_VERSION = 1

Text = Annotated[str, StringConstraints(max_length=1000)]
Choices = Annotated[list[Text], Field(max_length=30)]


class Section(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Subject(Section):
    who: Text | None = None
    age: Text | None = None
    ethnicity: Text | None = None
    description: Text | None = None


class Appearance(Section):
    eyes: Text | None = None
    expression: Text | None = None
    makeup: Choices | None = None
    skin_tone: Text | None = None
    skin_details: Choices | None = None
    extra: Text | None = None


class Hair(Section):
    color: Text | None = None
    style: Text | None = None
    length: Text | None = None


class Body(Section):
    type: Text | None = None
    height: Text | None = None
    bust: Text | None = None
    hips: Text | None = None
    muscles: Text | None = None
    abs: Text | None = None
    chest: Text | None = None
    body_hair: Text | None = None
    facial_hair: Choices | None = None
    tattoos: Choices | None = None
    piercings: Choices | None = None
    extra: Text | None = None


class Anatomy(Section):
    penis: Text | None = None
    nipples: Text | None = None
    pubic_hair: Text | None = None
    bulge: Text | None = None


class Content(Section):
    nudity: Text | None = None
    intimacy: Choices | None = None
    explicit_details: Choices | None = None


class Pose(Section):
    pose: Text | None = None
    explicit_action: Text | None = None
    action: Text | None = None


class Scene(Section):
    type: Text | None = None
    environment: Text | None = None
    time: Text | None = None
    weather: Text | None = None


class Lighting(Section):
    setup: Text | None = None
    more: Choices | None = None
    custom: Text | None = None


class Camera(Section):
    style: Text | None = None
    shot: Text | None = None
    angle: Text | None = None
    lens: Text | None = None
    depth_of_field: Text | None = None


class Finish(Section):
    mood: Text | None = None
    grading: Text | None = None
    realism: Choices | None = None


class Details(Section):
    extra: Text | None = None
    negative: Text | None = None


class Garment(Section):
    item: Text
    color: Text | None = None


class Outfit(Section):
    top: Garment | None = None
    bottom: Garment | None = None
    lingerie_top: Garment | None = None
    lingerie_bottom: Garment | None = None
    outerwear: Garment | None = None
    shoes: Garment | None = None
    accessories: Annotated[list[Text], Field(max_length=3)] | None = None
    details: Text | None = None


class PromptSpec(Section):
    version: Literal[1]
    purpose: Annotated[str, StringConstraints(max_length=100)]
    subject: Subject | None = None
    appearance: Appearance | None = None
    hair: Hair | None = None
    body: Body | None = None
    anatomy: Anatomy | None = None
    outfit: Outfit | None = None
    content: Content | None = None
    pose: Pose | None = None
    scene: Scene | None = None
    lighting: Lighting | None = None
    camera: Camera | None = None
    finish: Finish | None = None
    details: Details | None = None

    def to_json(self) -> str:
        return self.model_dump_json(exclude_none=True)
