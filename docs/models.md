# Models

| Model | Engine | Best for |
|-------|--------|----------|
| [Z-Image-Turbo](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo) from Tongyi Lab (default) | [mflux](https://github.com/filipstrand/mflux) (MLX), 8-bit by default | Fast photorealistic images, including readable text |
| [WAI-NSFW-Illustrious v12](https://huggingface.co/votepurchase/waiNSFWIllustrious_v120) (SDXL) | diffusers on MPS, float16 | Anime and illustration styles |
| [Anime Desire](https://huggingface.co/AI-Porn/anime-desire-illustrious) (Illustrious SDXL) | diffusers on MPS, float16, single-file checkpoint | Anime and hentai styles, Danbooru tags |
| [MOSS-Image NSFW](https://huggingface.co/axiomofmind/Moss-image-nsfw-uncensored-lora) (MOSS-Image with a merged LoRA) | diffusers on MPS, bfloat16; pipeline vendored in `moss_pipeline.py` | Photorealistic adult content; slow |
| [RealVisXL V5.0](https://huggingface.co/SG161222/RealVisXL_V5.0) (SDXL) | diffusers on MPS, float16 | Photorealistic people, and the face lock in photo style |

All five are defined in one place, `model_catalog.py`, which both the web app and the model server read.

## Defaults

| Setting | Z-Image-Turbo | WAI-Illustrious | MOSS-Image | Anime Desire | RealVisXL |
|---------|---------------|-----------------|------------|--------------|-----------|
| Steps | 9 (up to 20) | 28 (up to 50) | 30 (up to 50) | 30 (up to 50) | 30 (up to 50) |
| Guidance (CFG) | not used | 7 | 3 | 4 | 5 |
| Sampler | | Euler Ancestral | | DPM++ 3M SDE Karras | DPM++ 2M SDE Karras |
| Negative prompt | not used | `nsfw, (low quality, worst quality:1.2), very displeasing, 3d, watermark, signature, ugly, poorly drawn` | empty | `(worst quality, low quality:1.2), lowres, bad anatomy, bad hands, extra fingers, watermark, signature, text, blurry, jpeg artifacts` | `bad hands, bad anatomy, ugly, deformed, (face asymmetry, eyes asymmetry, deformed eyes, deformed mouth, open mouth)` (the model card's) |
| Largest side | 1536 px | 1216 px | 1024 px | 1216 px | 1216 px |
| Prompt style | sentences | tags | sentences | tags | sentences |
| Prompt weights | no | yes | no | yes | yes |
| Variations | yes | yes | no | yes | yes |
| Face lock | no | yes | no | yes | yes, in photo style |

- WAI-Illustrious's default negative prompt starts with `nsfw` to keep results safe for work; the prompt builder removes it for explicit prompts.
- MOSS-Image needs its trigger word `moss_xvstyle`; the server adds it to prompts that lack it.

## Downloading and removing models

Only the default model, Z-Image-Turbo, downloads by itself, on the model server's first start. You choose which others to keep, in the model dialog (**Change** next to the selected model):

- **Download** fetches a model in the background, with a progress bar. One download runs at a time; the rest wait as **Queued**.
- **Remove** deletes a downloaded model and frees its space. The model in use cannot be removed.
- The dialog shows how much space the models use and how much is free. A download is refused with a clear message if there is not enough room for it and any one-time setup.
- A model can be selected once it is downloaded; no restart is needed. Each card links to the model's page on Hugging Face.

The server keeps one model in memory at a time and swaps when a request asks for another, which takes about 10 seconds.

Files go in `models/` (not in git). One-time builds (compressed copies) are written to a `.building` folder and renamed when complete, so an interrupted build is redone, never used half-finished.

## Download sizes

| Model | Original | Compressed (`MODEL_COMPRESSION=on`) |
|-------|----------|--------------------------------------|
| Z-Image-Turbo | 32.9 GB, always kept, plus the copy it runs (10.7 GB at 8-bit) | not affected; see [Z-Image-Turbo level](#z-image-turbo-level) |
| WAI-Illustrious | 13.9 GB | 7.1 GB |
| MOSS-Image NSFW | 27.2 GB | 19.9 GB |
| Anime Desire | 6.9 GB | 6.9 GB (already float16) |
| RealVisXL | 6.9 GB (only its float16 files are fetched) | same |
| Face lock (IP-Adapter, for the SDXL models) | 3.4 GB, downloaded on the first face-locked render, in `models/ip-adapter/` | same |

## Model compression

By default the app keeps and runs the original files of WAI-Illustrious, MOSS-Image and Anime Desire. To save disk space and run faster on a 24 GB Mac, set this in `.env` and restart the model server:

```
MODEL_COMPRESSION=on
```

The server then builds compressed copies from the originals once and deletes the originals:

| Model | What compression does |
|-------|-----------------------|
| WAI-Illustrious | float32 files rewritten as float16, the precision it runs in anyway. Identical images |
| MOSS-Image NSFW | text encoder kept in 8-bit with [optimum-quanto](https://github.com/huggingface/optimum-quanto): 9.4 GB, 10 GB of memory instead of 17 GB, three times faster to encode, near-identical images |
| Anime Desire | nothing; it is already float16 |

With compression off again, models that need their originals show as not downloaded until you download them in the model dialog, which also removes the compressed copies.

## Z-Image-Turbo level

Z-Image-Turbo has its own setting, `Z_IMAGE_BITS` in `.env`, separate from `MODEL_COMPRESSION`:

| `Z_IMAGE_BITS` | Runs |
|----------------|------|
| `8` (default) | the 8-bit copy, 10.7 GB |
| `6`, `5`, `4`, `3` | a smaller copy |
| `original` | the original files, 32.9 GB |

The chosen copy is built from the original on first load (about 12 seconds), into `models/zimage-q<bits>/`. The original is always kept, so you can switch at any time.

At 1024 × 1024, the 8-bit copy takes about 55 seconds instead of about 12 minutes, peaks at 11.7 GB of memory instead of 33 GB, and gives images that look the same as the original's, text included.

### Comparing levels

`backend/tools/z_image_levels.py` builds a level and compares it with the original, using the same prompts and seed: time per image, peak memory, pixel difference and a side-by-side image, saved in `comparisons/z-image/`. Stop the model server first, as the original needs about 20 GB of memory.

```bash
uv run python backend/tools/z_image_levels.py build --bits 8
uv run python backend/tools/z_image_levels.py compare --bits 8
```

## Licences

Each model has its own licence; check it before using its images. WAI-Illustrious is CreativeML OpenRAIL-M, which restricts some uses, and MOSS-Image is Apache 2.0. WAI-Illustrious and MOSS-Image are labelled "not for all audiences" on Hugging Face. [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) lists them all.
