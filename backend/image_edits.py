import io

from PIL import Image
from pydantic import BaseModel, Field, model_validator

from i18n import t

# A crop smaller than this on either side is almost certainly a slip of the mouse
MIN_CROP_SIDE = 16
# Clockwise quarter turns, as Pillow's transposes
TURNS = {1: Image.Transpose.ROTATE_270, 2: Image.Transpose.ROTATE_180, 3: Image.Transpose.ROTATE_90}


class CropBox(BaseModel):
    """In pixels of the image after its turns and flips."""

    x: int = Field(ge=0)
    y: int = Field(ge=0)
    width: int = Field(ge=MIN_CROP_SIDE)
    height: int = Field(ge=MIN_CROP_SIDE)


class EditRecipe(BaseModel):
    """Applied in this order: quarter turns clockwise, flips, then the crop."""

    quarter_turns: int = Field(default=0, ge=0, le=3)
    flip_horizontal: bool = False
    flip_vertical: bool = False
    crop: CropBox | None = None

    @model_validator(mode="after")
    def changes_something(self) -> "EditRecipe":
        if not (self.quarter_turns or self.flip_horizontal or self.flip_vertical or self.crop):
            raise ValueError(t("editChangesNothing"))
        return self


class EditOutsideImage(ValueError):
    pass


def apply_edits(png: bytes, recipe: EditRecipe) -> tuple[bytes, int, int]:
    """The edited image as PNG, with its new width and height."""
    image = Image.open(io.BytesIO(png))
    if recipe.quarter_turns:
        image = image.transpose(TURNS[recipe.quarter_turns])
    if recipe.flip_horizontal:
        image = image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    if recipe.flip_vertical:
        image = image.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    if recipe.crop:
        image = crop(image, recipe.crop)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue(), image.width, image.height


def crop(image: Image.Image, box: CropBox) -> Image.Image:
    if box.x + box.width > image.width or box.y + box.height > image.height:
        raise EditOutsideImage(t("cropOutside", width=image.width, height=image.height))
    return image.crop((box.x, box.y, box.x + box.width, box.y + box.height))
