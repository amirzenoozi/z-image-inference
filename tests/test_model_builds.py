from pathlib import Path

import pytest

import model_server


class FakeZImage:
    """Stands in for mflux's ZImage: saving writes one file, or fails part-way when asked to."""

    fail_while_saving = False
    built: list[int] = []

    def __init__(self, quantize: int, model_path: str) -> None:
        self.bits = quantize
        self.source = Path(model_path)

    def save_model(self, base_path: str) -> None:
        FakeZImage.built.append(self.bits)
        Path(base_path).mkdir(parents=True)
        (Path(base_path) / "0.safetensors").write_text(f"{self.bits}-bit weights")
        if self.fail_while_saving:
            raise RuntimeError("interrupted")


@pytest.fixture
def original(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "Z-Image-Turbo"
    path.mkdir()
    (path / "model_index.json").write_text("{}")
    monkeypatch.setattr(model_server, "Z_IMAGE_PATH", path)
    monkeypatch.setattr(model_server, "ensure_downloaded", lambda *args, **kwargs: None)
    monkeypatch.setattr(model_server, "ZImage", FakeZImage)
    FakeZImage.fail_while_saving = False
    FakeZImage.built = []
    return path


def test_builds_a_quantised_copy_and_keeps_the_original(original: Path, tmp_path: Path) -> None:
    target = tmp_path / "zimage-q8"

    model_server.build_z_image_quantized(8, target)

    assert (target / "0.safetensors").read_text() == "8-bit weights"
    assert original.exists()
    assert not target.with_name("zimage-q8.building").exists()


def test_an_existing_copy_is_not_rebuilt(original: Path, tmp_path: Path) -> None:
    target = tmp_path / "zimage-q8"
    model_server.build_z_image_quantized(8, target)
    model_server.build_z_image_quantized(8, target)
    assert FakeZImage.built == [8]


def test_an_interrupted_build_leaves_no_copy(original: Path, tmp_path: Path) -> None:
    target = tmp_path / "zimage-q4"
    FakeZImage.fail_while_saving = True

    with pytest.raises(RuntimeError):
        model_server.build_z_image_quantized(4, target)

    assert not target.exists()
    assert original.exists()

    FakeZImage.fail_while_saving = False
    model_server.build_z_image_quantized(4, target)
    assert (target / "0.safetensors").exists()
