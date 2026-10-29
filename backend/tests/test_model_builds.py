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


@pytest.mark.parametrize(("setting", "folder"), [(None, "zimage-q8"), ("4", "zimage-q4"), ("original", "Z-Image-Turbo")])
def test_z_image_runs_the_level_chosen_in_z_image_bits(original: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, setting: str | None, folder: str) -> None:
    monkeypatch.setattr(model_server, "MODELS_DIR", tmp_path)
    monkeypatch.delenv("Z_IMAGE_BITS", raising=False)
    if setting is not None:
        monkeypatch.setenv("Z_IMAGE_BITS", setting)

    assert model_server.z_image_model_path() == tmp_path / folder
    assert (tmp_path / folder).exists()
    assert original.exists()


def test_an_unknown_z_image_level_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("Z_IMAGE_BITS", "2")
    with pytest.raises(ValueError, match="Z_IMAGE_BITS"):
        model_server.z_image_model_path()


class FakeFlux:
    """Stands in for mflux's Flux1, recording how each one was made."""

    made: list[dict[str, object]] = []

    def __init__(self, **kwargs: object) -> None:
        FakeFlux.made.append(kwargs)
        self.callbacks = type("Callbacks", (), {"register": lambda self, reporter: None})()

    def save_model(self, base_path: str) -> None:
        Path(base_path).mkdir(parents=True)


def test_a_flux_lora_model_builds_the_4_bit_copy_once_and_applies_its_lora_while_generating(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(model_server, "Flux1", FakeFlux)
    monkeypatch.setattr(model_server, "ensure_downloaded", lambda *args, **kwargs: None)
    monkeypatch.setattr(model_server, "FLUX_Q4_PATH", tmp_path / "flux-dev-q4")
    monkeypatch.setattr(model_server, "MODELS_DIR", tmp_path)
    FakeFlux.made = []
    spec = model_server.MODELS["flux-asian-nudity"]

    model_server.load_flux(spec)
    model_server.load_flux(spec)

    built, *loaded = FakeFlux.made
    assert built["quantize"] == 4
    assert len(loaded) == 2
    assert loaded[0]["model_path"] == str(tmp_path / "flux-dev-q4")
    assert loaded[0]["lora_paths"] == [str(tmp_path / "lora-flux-asian-nudity" / "asian-nudity-2.safetensors")]
    assert loaded[0]["bake_lora"] is False



def test_z_image_loads_with_the_addons_a_render_uses_and_reloads_only_when_they_change(original: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    made: list[dict[str, object]] = []

    class RecordingZImage(FakeFlux):
        def __init__(self, **kwargs: object) -> None:
            made.append(kwargs)
            super().__init__(**kwargs)

    monkeypatch.setattr(model_server, "ZImage", RecordingZImage)
    monkeypatch.setattr(model_server, "MODELS_DIR", tmp_path)
    monkeypatch.setattr(model_server, "release_memory", lambda: None)
    monkeypatch.setattr(model_server, "loaded_generator", None)
    monkeypatch.setattr(model_server, "loaded_model_id", None)
    monkeypatch.setattr(model_server, "loaded_addons", ())
    monkeypatch.setenv("Z_IMAGE_BITS", "original")
    tattoo = (model_server.ADDONS["tattoo"],)

    model_server.use_model("z-image-turbo", tattoo)
    model_server.use_model("z-image-turbo", tattoo)
    model_server.use_model("z-image-turbo")

    with_tattoo, plain = made
    assert with_tattoo["lora_paths"] == [str(tmp_path / "lora-tattoo" / "tattoo-z.safetensors")]
    assert with_tattoo["bake_lora"] is False
    assert "lora_paths" not in plain
