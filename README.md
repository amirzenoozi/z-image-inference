# Z-Image Inference on Apple Silicon

> Run Z-Image-Turbo, two SDXL anime models and MOSS-Image locally on your Mac with two commands.

This project runs image generation models natively on Apple Silicon behind a simple web interface. You pick the model for each image from a dropdown:

| Model | Engine | Best for |
|-------|--------|----------|
| [Z-Image-Turbo](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo) from Tongyi Lab | [mflux](https://github.com/filipstrand/mflux) (MLX), 8-bit by default | Photorealistic images and text rendering |
| [WAI-NSFW-Illustrious v12](https://huggingface.co/votepurchase/waiNSFWIllustrious_v120) (SDXL) | diffusers on MPS, float16 | Anime and illustration styles |
| [Anime Desire](https://huggingface.co/AI-Porn/anime-desire-illustrious) (Illustrious SDXL) | diffusers on MPS, float16 | Anime and hentai styles, Danbooru tags |
| [MOSS-Image NSFW](https://huggingface.co/axiomofmind/Moss-image-nsfw-uncensored-lora) (MOSS-Image with a merged LoRA) | diffusers on MPS, bfloat16; 8-bit text encoder when compressed | Photorealistic adult content; slow |

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   Your Mac (Apple Silicon)                                   │
│                                                              │
│   ┌─────────────┐      ┌──────────────────────────────────┐  │
│   │  React UI   │ HTTP │     FastAPI Model Server         │  │
│   │  + web API  │─────▶│   Z-Image-Turbo (MLX)            │  │
│   │  (main.py)  │      │   WAI-Illustrious (SDXL, MPS)    │  │
│   └─────────────┘      │   MOSS-Image (MPS, two-stage)    │  │
│         │              │   (model_server.py)              │  │
│         │              └──────────────────────────────────┘  │
│         ▼                                                    │
│   ┌─────────────┐                                            │
│   │  Grok API   │  Optional: AI-powered prompt enhancement   │
│   │  (xAI)      │                                            │
│   └─────────────┘                                            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Features

- **Three models, chosen per image** from cards that show what each is for and how long it takes
- **Original or compressed models**: runs Z-Image-Turbo from an 8-bit copy and the other models from their original files by default; `MODEL_COMPRESSION=on` switches the others to smaller compressed copies, which are faster on a 24 GB Mac
- **A full settings panel**: model, prompt, negative prompt, resolution, steps, guidance and seed, all adjustable, remembered between visits and resettable to each model's defaults
- **Resolutions sorted into categories**: Square, Portrait, Landscape and Widescreen, each with S/M/L/XL sizes and a shape preview, plus a custom size that snaps to valid values
- **Two prompt modes**: write the prompt yourself, with a step-by-step **prompt builder** dialog to help, or chat with Grok and let it write a detailed one
- **Seed tools**: random or fixed, a dice button, and "use last seed" to repeat a result
- **History**: every image is saved with all its settings; reuse them in one click, download or delete

## Quick Start

### Prerequisites

- macOS on Apple Silicon
- Python 3.12+
- [uv](https://github.com/astral-sh/uv) package manager
- [Node.js](https://nodejs.org/) 20+ (to build the web UI)

### Installation

```bash
git clone https://github.com/amirzenoozi/z-image-inference.git
cd z-image-inference
uv sync
cd frontend && npm ci && npm run build && cd ..
```

### Run

**Step 1: start the model server**

```bash
uv run python model_server.py
```

On the first run the server downloads Z-Image-Turbo (about 33 GB) into `models/Z-Image-Turbo/`. When it first loads, it builds an 8-bit copy (10.7 GB, about 12 seconds) in `models/zimage-q8/` and runs that; the original is kept (see [Z-Image-Turbo level](#z-image-turbo-level)).

**Step 2: in a new terminal, start the web UI**

```bash
uv run python main.py
```

Open http://127.0.0.1:7860 in your browser.

## Usage

### Create

1. The sidebar shows the selected **model**; press **Change** to choose another from the model dialog, where models are grouped into **Photorealistic** and **Anime & illustration** tabs
2. Write a **prompt**, or choose one from **Examples**; models that use one also show a **negative prompt**
3. Choose a **resolution**: pick a category tab, then a size; sizes the model cannot make are greyed out with the reason
4. Adjust **steps**, **guidance** and **seed** if you like; **Reset to model defaults** undoes your changes
5. Press **Generate** (or ⌘/Ctrl + Enter). A timer shows how long it has been running

Your settings are remembered in the browser between visits.

### Prompt builder

Press **✨ Prompt builder** above the Write box to open a focused dialog that assembles a detailed photo prompt step by step, with a live preview beside it:

1. **Subject**: who (woman, man, couple, two women, two men), an adult age range, ethnicity and your own details
2. **Face & hair**: eye colour, expression, makeup, skin tone and details, hair length, colour and style
3. **Body**: body type, height, bust, hips and legs, tattoos and piercings
4. **Outfit**: tops, bottoms, lingerie, outerwear, shoes, a colour for each, accessories
5. **Pose & action**
6. **Intimacy (18+)**: nudity level (clothed, implied, topless, fully nude) and intimacy details; shown when explicit content is on
7. **Scene & light**: scene or your own environment, time of day, weather, lighting
8. **Camera**: photo style, shot type, angle, lens, depth of field
9. **Mood & finish**: mood, colour grading, realism details, extra details and negative terms

- **🎲 Surprise me** fills the main choices with random values you can then adjust; each choice can also be set to **Random**, and **Re-roll** picks new values for those
- **Use this prompt** puts the prompt and negative prompt into the Write box (replacing what is there); **Append to prompt** adds to it instead
- Explicit content, nudity and lingerie need "Who" and an adult age range, and the builder refuses details that suggest a minor
- It writes full sentences, which suit Z-Image-Turbo and MOSS-Image; WAI-Illustrious reads tags best, so it follows builder prompts less closely

### Chat with Grok (optional)

Requires an [xAI API key](https://x.ai/). The tab is disabled when no key is set.

1. Create a `.env` file with your key:
   ```
   XAI_API_KEY=your_api_key_here
   ```
2. Choose **Chat with Grok** and describe your image in plain words
3. Grok writes a detailed prompt, which becomes your prompt, and the image is generated
4. Edit one of your messages to branch from there and generate again

### History

The **History** tab shows every image, newest first. Open one to see its prompt and settings, **Reuse settings** to load them into the panel with the same seed, download it or delete it.

### Switching models

Only the default model, Z-Image-Turbo, downloads by itself. You choose which other models to keep, to save disk space: in the model dialog, **Download** fetches a model in the background with a progress bar (one download at a time; the rest wait as **Queued**), and **Remove** deletes a downloaded model to free its space. The dialog shows how much space the models use and how much is free, and a download is refused with a clear message if there is not enough room for it and its one-time setup. A model can only be selected once it is downloaded, the model in use cannot be removed, and no restart is needed. Each card also links to the model's page on **Hugging Face**.

Choosing another model (with **Change** next to the selected one) resets steps and guidance to that model's defaults. Your prompt, seed, size and negative prompt are kept where the model allows them, and its recommended size and negative prompt are offered in one click. The server keeps one model in memory at a time and swaps when a request asks for the other one, which takes about 10 seconds.

WAI-Illustrious and MOSS-Image are labelled "not for all audiences" on Hugging Face. WAI-Illustrious's default negative prompt starts with `nsfw` to keep results safe for work; its licence is CreativeML OpenRAIL-M, which restricts some uses. MOSS-Image is Apache 2.0, and the server adds its trigger word `moss_xvstyle` to prompts that lack it.

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `XAI_API_KEY` | No | xAI API key for Chat Mode prompt enhancement |

### Model defaults

| Setting | Z-Image-Turbo | WAI-Illustrious | MOSS-Image | Anime Desire |
|---------|---------------|-----------------|------------|--------------|
| Steps | 9 (up to 20) | 28 (up to 50) | 30 (up to 50) | 30 (up to 50) |
| Guidance (CFG) | not used | 7 | 3 | 4 |
| Sampler | | Euler Ancestral | | DPM++ 3M SDE Karras |
| Negative prompt | not used | `nsfw, (low quality, worst quality:1.2), very displeasing, 3d, watermark, signature, ugly, poorly drawn` | empty | `(worst quality, low quality:1.2), lowres, bad anatomy, bad hands, extra fingers, watermark, signature, text, blurry, jpeg artifacts` |
| Largest side | 1536px | 1216px | 1024px | 1216px |

### Model compression

By default the app keeps and runs the **original model files** from Hugging Face, except Z-Image-Turbo (see [below](#z-image-turbo-level)). To save disk space and run faster on a 24 GB Mac, set this in `.env` and restart the model server:

```
MODEL_COMPRESSION=on
```

The server then builds compressed copies from the originals once and deletes the originals; with it off again, models that need their originals show as not downloaded until you download them in the model dialog, which also removes the compressed copies.

| Model | Original | Compressed | What compression does |
|-------|----------|------------|-----------------------|
| WAI-Illustrious | 13.9 GB | 7.1 GB | float32 files rewritten as float16, the precision it runs in anyway. Identical images |
| MOSS-Image NSFW | 27.2 GB | 19.9 GB | Text encoder in 8-bit (optimum-quanto). Near-identical images |
| Anime Desire | 6.9 GB | 6.9 GB | Already float16; nothing to compress |
| **Total** | **48.0 GB** | **33.9 GB** | |

#### Z-Image-Turbo level

Z-Image-Turbo has its own setting, `Z_IMAGE_BITS` in `.env`, separate from `MODEL_COMPRESSION`. It runs the 8-bit copy by default; set `Z_IMAGE_BITS` to 6, 5, 4 or 3 for a smaller copy, or to `original` for the original files. The chosen copy is built from the original on first load, and the original (32.9 GB) is always kept.

At 1024x1024, the 8-bit copy takes about 55 seconds instead of about 12 minutes, peaks at 11.7 GB of memory instead of 33 GB, and gives images that look the same as the original's, text included.

#### Comparing Z-Image-Turbo compression levels

`tools/z_image_levels.py` builds Z-Image-Turbo at a chosen level (8, 6, 5, 4 or 3 bits) into `models/zimage-q<bits>/`, keeping the original, and compares it with the original using the same prompts and seed: time per image, peak memory, pixel difference and a side-by-side image, saved in `comparisons/z-image/`. Stop the model server first, as the original needs about 20 GB of memory.

```bash
uv run python tools/z_image_levels.py build --bits 8
uv run python tools/z_image_levels.py compare --bits 8
```

## Performance

Measured on an Apple M5 with 24 GB of memory:

| Model | 512x512 | 1024x1024 |
|-------|---------|-----------|
| Z-Image-Turbo, 9 steps, original | about 12 min | about 13 min |
| Z-Image-Turbo, 9 steps, 8-bit (default) | | about 55s |
| Z-Image-Turbo, 9 steps, 4-bit | about 10s | about 48s |
| WAI-Illustrious, 28 steps | | about 40s |
| Anime Desire, 30 steps | | about 45-60s |
| MOSS-Image, 30 steps | about 2 min | about 7 min |

Switching models takes about 10 seconds. A MOSS-Image request with a new prompt adds about 20 seconds to run its text encoder; repeating the last prompt with a new seed or size skips that.

## System Requirements

| Component | Tested on |
|-----------|-----------|
| Chip | Apple M5 |
| Memory | 24 GB |
| Storage | about 81 GB for all four originals, or 40 GB compressed (more free space is needed while compressing) |

## Technical Notes

- **Z-Image-Turbo** at full size needs about 20 GB of memory, which does not fit beside macOS on a 24 GB Mac: it swaps, so an image takes about 12 minutes and switching to another model afterwards can take as long again. The default 8-bit copy fits and takes under a minute at 1024x1024.
- **WAI-Illustrious** runs in float16 on MPS, with the VAE decoding in float32 to avoid overflow. Its upstream files are float32; with compression on, the server rewrites them as float16 once: half the size, identical images.
- **MOSS-Image**'s text encoder (16 GB) and image model (10 GB) take turns in memory. With compression on, the text encoder is kept in 8-bit with [optimum-quanto](https://github.com/huggingface/optimum-quanto): 9.4 GB, 10 GB of memory instead of 17 GB, three times faster to encode, and near-identical images. Its pipeline code is vendored in `moss_pipeline.py` with one fix for MPS, which has no float64.
- All model work runs on one server thread, because MLX only works on the thread that created it. Requests are handled one at a time.
- Seeds use a CPU generator for SDXL, so they are reproducible.

## Project Structure

```
z-image-inference/
├── main.py              # Web app: serves the UI and the /api endpoints
├── model_server.py      # FastAPI inference server
├── model_catalog.py     # Model list and defaults, shared by the UI and the server
├── generation_request.py # Request checks shared by the web app and the model server
├── resolutions.py       # Resolution presets with their categories and sizes
├── history_store.py     # Image history database
├── moss_pipeline.py     # Vendored MOSS-Image pipeline (Apache 2.0)
├── grok_client.py       # xAI Grok API client
├── frontend/            # React, TypeScript and Tailwind UI (Vite)
├── tests/               # Backend tests
├── tools/               # Z-Image compression level comparison
├── pyproject.toml       # Project dependencies
├── models/              # Downloaded and quantised models (not in git)
└── history.db           # Generated images database (not in git)
```

## Development

Run the UI with live reload while `main.py` and `model_server.py` are running:

```bash
cd frontend && npm run dev
```

Open the address Vite prints; it forwards `/api` to `main.py`.

Tests:

```bash
uv run pytest                  # backend
cd frontend && npm test        # frontend
```

## Troubleshooting

**The page says the UI is not built?**
- Run `cd frontend && npm ci && npm run build`, then reload


**A first run was interrupted?**
- Builds are written to a `.building` folder and renamed when complete, so an interrupted build is redone on the next start; delete any leftover `*.building` folder if you want the space back

**Generation is very slow?**
- Close other memory-hungry apps; both models need most of a 24 GB Mac's memory

**Chat mode not showing?**
- Check that `XAI_API_KEY` is set in `.env` and that the key is valid

## Acknowledgements

- [Tongyi Lab](https://huggingface.co/Tongyi-MAI) for the Z-Image-Turbo model
- [WAI](https://civitai.com/) for the WAI-NSFW-Illustrious model
- [OpenMOSS](https://huggingface.co/OpenMOSS-Team) for MOSS-Image, and axiomofmind for the NSFW LoRA
- [mflux](https://github.com/filipstrand/mflux) for MLX inference
- [ComfyUI Photoreal Prompt Builder](https://github.com/artokun/ComfyUI-Photoreal-Prompt-Builder) and its [NSFW module](https://github.com/artokun/ComfyUI-Photoreal-Prompt-Builder-NSFW) by artokun (MIT), which the prompt builder's options and wording are ported from
- [Hugging Face](https://huggingface.co/docs/diffusers) for the diffusers library
- [React](https://react.dev/), [Vite](https://vite.dev/) and [Tailwind CSS](https://tailwindcss.com/) for the web interface
- [z-image-mps](https://github.com/ivanfioravanti/z-image-mps) for MPS optimisation inspiration

## Licence

Apache License 2.0. See [LICENSE](LICENSE) for details, and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for included third-party code and the licences of the downloaded models.
