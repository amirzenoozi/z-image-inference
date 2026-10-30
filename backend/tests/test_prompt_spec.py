import json

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

import paths
from prompt_spec import PromptSpec
from test_web_app import FakeModelServer, client, generate, model_server  # noqa: F401 (fixtures used by name)

# The same example the frontend's spec.test.ts reads, so the two sides agree on the shape
EXAMPLE: dict[str, object] = json.loads((paths.PROJECT_DIR / "frontend/src/test/promptSpecExample.json").read_text())


def test_the_example_json_prompt_has_the_shape_the_server_accepts() -> None:
    assert json.loads(PromptSpec.model_validate(EXAMPLE).to_json()) == EXAMPLE


@pytest.mark.parametrize(
    "change",
    [{"version": 2}, {"colour": "red"}, {"hair": {"colour": "red"}}, {"outfit": {"accessories": ["Anklet"] * 4}}, {"outfit": {"top": {"color": "red"}}}],
)
def test_a_json_prompt_of_another_shape_is_refused(change: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        PromptSpec.model_validate({**EXAMPLE, **change})


def test_the_json_prompt_is_saved_with_the_image_and_kept_by_an_edited_copy(client: TestClient, model_server: FakeModelServer) -> None:
    item = generate(client, prompt="A fitness photograph of an adult woman.", prompt_spec=EXAMPLE).json()

    assert json.loads(item["prompt_spec"]) == EXAMPLE
    assert "prompt_spec" not in model_server.calls[0]
    recipe = {"quarter_turns": 1, "flip_horizontal": False, "flip_vertical": False, "crop": None}
    assert client.post(f"/api/history/{item['id']}/edits", json=recipe).json()["prompt_spec"] == item["prompt_spec"]


def test_a_prompt_written_as_text_has_no_json_prompt(client: TestClient, model_server: FakeModelServer) -> None:
    assert generate(client).json()["prompt_spec"] is None


def test_a_bad_json_prompt_is_refused_before_rendering(client: TestClient, model_server: FakeModelServer) -> None:
    assert generate(client, prompt_spec={**EXAMPLE, "version": 2}).status_code == 422
    assert model_server.calls == []
