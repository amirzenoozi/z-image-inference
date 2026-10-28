import io

import pytest
from PIL import Image
from pydantic import ValidationError

from image_edits import CropBox, EditOutsideImage, EditRecipe, apply_edits

RED, GREEN, BLUE, WHITE = (255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 255)


def quarters_png() -> bytes:
    """40×20: red top-left, green top-right, blue bottom-left, white bottom-right."""
    image = Image.new("RGB", (40, 20))
    for colour, box in [(RED, (0, 0, 20, 10)), (GREEN, (20, 0, 40, 10)), (BLUE, (0, 10, 20, 20)), (WHITE, (20, 10, 40, 20))]:
        image.paste(colour, box)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def corners(png: bytes) -> tuple[tuple[int, int], list[tuple[int, int, int]]]:
    """Size, then the colours at the top-left, top-right, bottom-left and bottom-right."""
    image = Image.open(io.BytesIO(png)).convert("RGB")
    w, h = image.size
    return (w, h), [image.getpixel(point) for point in [(1, 1), (w - 2, 1), (1, h - 2), (w - 2, h - 2)]]


@pytest.mark.parametrize(
    ("recipe", "size", "colours"),
    [
        (EditRecipe(quarter_turns=1), (20, 40), [BLUE, RED, WHITE, GREEN]),
        (EditRecipe(quarter_turns=2), (40, 20), [WHITE, BLUE, GREEN, RED]),
        (EditRecipe(quarter_turns=3), (20, 40), [GREEN, WHITE, RED, BLUE]),
        (EditRecipe(flip_horizontal=True), (40, 20), [GREEN, RED, WHITE, BLUE]),
        (EditRecipe(flip_vertical=True), (40, 20), [BLUE, WHITE, RED, GREEN]),
        (EditRecipe(crop=CropBox(x=20, y=0, width=20, height=20)), (20, 20), [GREEN, GREEN, WHITE, WHITE]),
    ],
)
def test_each_edit_moves_the_pixels_as_expected(recipe: EditRecipe, size: tuple[int, int], colours: list[tuple[int, int, int]]) -> None:
    png, width, height = apply_edits(quarters_png(), recipe)
    assert (width, height) == size
    assert corners(png) == (size, colours)


def test_turns_and_flips_come_before_the_crop() -> None:
    # Turned clockwise the image is 20×40 with blue, red over white, green; the crop takes its top half
    recipe = EditRecipe(quarter_turns=1, flip_horizontal=True, crop=CropBox(x=0, y=0, width=20, height=20))
    png, width, height = apply_edits(quarters_png(), recipe)
    assert corners(png) == ((20, 20), [RED, BLUE, RED, BLUE])


def test_a_crop_outside_the_image_is_refused() -> None:
    with pytest.raises(EditOutsideImage):
        apply_edits(quarters_png(), EditRecipe(crop=CropBox(x=30, y=0, width=20, height=20)))
    # Turned, the image is only 20 wide
    with pytest.raises(EditOutsideImage):
        apply_edits(quarters_png(), EditRecipe(quarter_turns=1, crop=CropBox(x=0, y=0, width=40, height=20)))


@pytest.mark.parametrize(
    "recipe",
    [
        {},
        {"quarter_turns": 4},
        {"quarter_turns": -1},
        {"crop": {"x": 0, "y": 0, "width": 15, "height": 20}},
        {"crop": {"x": -1, "y": 0, "width": 20, "height": 20}},
    ],
)
def test_recipes_that_change_nothing_or_make_no_sense_are_refused(recipe: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        EditRecipe.model_validate(recipe)
