from pathlib import Path

import pytest

import model_server


class FakeZImage:
    """Stands in for mflux's ZImage: saving writes one file, or fails part-way when asked to."""

    fail_while_saving = False

    def __init__(self, quantize: int, model_path: str) -> None:
        self.source = Path(model_path)

    def save_model(self, base_path: str) -> None:
        Path(base_path).mkdir(parents=True)
        (Path(base_path) / "0.safetensors").write_text("weights")
        if self.fail_while_saving:
            raise RuntimeError("interrupted")


@pytest.fixture
def z_image_paths(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> tuple[Path, Path]:
    original, quantised = tmp_path / "Z-Image-Turbo", tmp_path / "zimage-q4"
    original.mkdir()
    (original / "model_index.json").write_text("{}")
    monkeypatch.setattr(model_server, "Z_IMAGE_PATH", original)
    monkeypatch.setattr(model_server, "Z_IMAGE_Q4_PATH", quantised)
    monkeypatch.setattr(model_server, "ensure_downloaded", lambda *args, **kwargs: None)
    monkeypatch.setattr(model_server, "ZImage", FakeZImage)
    FakeZImage.fail_while_saving = False
    return original, quantised


def test_builds_the_4bit_copy_then_removes_the_original(z_image_paths: tuple[Path, Path]) -> None:
    original, quantised = z_image_paths

    model_server.build_z_image_q4()

    assert (quantised / "0.safetensors").exists()
    assert not original.exists()
    assert not quantised.with_name("zimage-q4.building").exists()


def test_an_interrupted_build_leaves_no_copy_and_keeps_the_original(z_image_paths: tuple[Path, Path]) -> None:
    original, quantised = z_image_paths
    FakeZImage.fail_while_saving = True

    with pytest.raises(RuntimeError):
        model_server.build_z_image_q4()

    assert not quantised.exists()
    assert original.exists()

    FakeZImage.fail_while_saving = False
    model_server.build_z_image_q4()
    assert (quantised / "0.safetensors").exists()
