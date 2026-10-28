# Z-Image Inference on Apple Silicon

> Run Z-Image-Turbo, two SDXL anime models and MOSS-Image locally on your Mac with two commands.

This project runs image generation models natively on Apple Silicon behind a simple web interface. You pick the model for each image from a dropdown:

| Model | Engine | Best for |
|-------|--------|----------|
| [Z-Image-Turbo](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo) from Tongyi Lab | [mflux](https://github.com/filipstrand/mflux) (MLX), 4-bit | Photorealistic images and text rendering |
| [WAI-NSFW-Illustrious v12](https://huggingface.co/votepurchase/waiNSFWIllustrious_v120) (SDXL) | diffusers on MPS, float16 | Anime and illustration styles |
| [Anime Desire](https://huggingface.co/AI-Porn/anime-desire-illustrious) (Illustrious SDXL) | diffusers on MPS, float16 | Anime and hentai styles, Danbooru tags |
| [MOSS-Image NSFW](https://huggingface.co/axiomofmind/Moss-image-nsfw-uncensored-lora) (MOSS-Image with a merged LoRA) | diffusers on MPS, bfloat16 image model, 8-bit text encoder | Photorealistic adult content; slow |

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   Your Mac (Apple Silicon)                                   │
│                                                              │
│   ┌─────────────┐      ┌──────────────────────────────────┐  │
│   │  React UI   │ HTTP │     FastAPI Model Server         │  │
│   │  + web API  │─────▶│   Z-Image-Turbo (MLX, 4-bit)     │  │
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
- **Fast on Apple Silicon**: Z-Image-Turbo runs as a 4-bit MLX model, so it fits in memory without swapping
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

On the first run the server downloads Z-Image-Turbo (about 31 GB) into `models/Z-Image-Turbo/`, builds a 4-bit copy (5.5 GB) in `models/zimage-q4/`, then deletes the download. Later starts load the 4-bit copy in a few seconds.

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

When the model server starts, it queues every model that is not downloaded yet and fetches them one at a time in the background, Z-Image-Turbo first; you can generate with any model that is already ready meanwhile. Each card shows **Queued for download**, **Downloading** or **Download failed** until the model is ready, and choosing a model that is not ready tells you so straight away. Each card also links to the model's page on **Hugging Face**.

Choosing another model (with **Change** next to the selected one) resets steps and guidance to that model's defaults. Your prompt, seed, size and negative prompt are kept where the model allows them, and its recommended size and negative prompt are offered in one click. The server keeps one model in memory at a time and swaps when a request asks for the other one, which takes about 10 seconds.

The first image from WAI-Illustrious downloads it (about 13 GB) into `models/waiNSFWIllustrious_v120/` and stores it in float16 (6.6 GB), the precision it runs in anyway.

The first image from MOSS-Image downloads it (about 26 GB) into `models/moss-image-nsfw/` and replaces its text encoder with an 8-bit copy, leaving 18.5 GB. Each image takes minutes rather than seconds; see [Performance](#performance).

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

## Performance

Measured on an Apple M5 with 24 GB of memory:

| Model | 512x512 | 1024x1024 |
|-------|---------|-----------|
| Z-Image-Turbo, 9 steps | about 10s | about 48s |
| WAI-Illustrious, 28 steps | | about 40s |
| Anime Desire, 30 steps | | about 45-60s |
| MOSS-Image, 30 steps | about 2 min | about 7 min |

Switching models takes about 10 seconds. A MOSS-Image request with a new prompt adds about 20 seconds to run its text encoder; repeating the last prompt with a new seed or size skips that.

## System Requirements

| Component | Tested on |
|-----------|-----------|
| Chip | Apple M5 |
| Memory | 24 GB |
| Storage | about 38 GB for all four models (up to 60 GB free during first downloads) |

## Technical Notes

- **Z-Image-Turbo** runs as a 4-bit MLX model built from the original weights. In bfloat16 it needs about 20 GB, which does not fit beside macOS on a 24 GB Mac.
- **WAI-Illustrious** runs in float16 on MPS, with the VAE decoding in float32 to avoid overflow. Its upstream files are float32, so the server rewrites them as float16 once: half the size, identical images.
- **MOSS-Image**'s text encoder is stored and run in 8-bit with [optimum-quanto](https://github.com/huggingface/optimum-quanto): 9.4 GB instead of 16 GB, 10 GB of memory instead of 17 GB, three times faster to encode, and near-identical images. It and the bfloat16 image model (10 GB) take turns in memory. Its pipeline code is vendored in `moss_pipeline.py` with one fix for MPS, which has no float64.
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
