# Z-Image Inference on Apple Silicon

> Run Z-Image-Turbo, an SDXL anime model and MOSS-Image locally on your Mac with two commands.

This project runs image generation models natively on Apple Silicon behind a simple web interface. You pick the model for each image from a dropdown:

| Model | Engine | Best for |
|-------|--------|----------|
| [Z-Image-Turbo](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo) from Tongyi Lab | [mflux](https://github.com/filipstrand/mflux) (MLX), 4-bit | Photorealistic images and text rendering |
| [WAI-NSFW-Illustrious v12](https://huggingface.co/votepurchase/waiNSFWIllustrious_v120) (SDXL) | diffusers on MPS, float16 | Anime and illustration styles |
| [MOSS-Image NSFW](https://huggingface.co/axiomofmind/Moss-image-nsfw-uncensored-lora) (MOSS-Image with a merged LoRA) | diffusers on MPS, bfloat16 | Photorealistic adult content; slow |

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   Your Mac (Apple Silicon)                                   │
│                                                              │
│   ┌─────────────┐      ┌──────────────────────────────────┐  │
│   │   Gradio    │ HTTP │     FastAPI Model Server         │  │
│   │   Web UI    │─────▶│   Z-Image-Turbo (MLX, 4-bit)     │  │
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

- **Two models, switchable per image**: choose the model in the UI for each request
- **Fast on Apple Silicon**: Z-Image-Turbo runs as a 4-bit MLX model, so it fits in memory without swapping
- **Two input modes**
  - Chat Mode: describe the image in natural language and Grok writes the prompt
  - Direct Mode: full control with your own detailed prompt
- **Flexible resolutions** from 368px to 1536px in several aspect ratios
- **Reuse seed**: repeat a result with one click and tweak the prompt
- **History**: every image is saved to a local database, with its prompt, seed and model

## Quick Start

### Prerequisites

- macOS on Apple Silicon
- Python 3.12+
- [uv](https://github.com/astral-sh/uv) package manager

### Installation

```bash
git clone https://github.com/amirzenoozi/z-image-inference.git
cd z-image-inference
uv sync
```

### Run

**Step 1: start the model server**

```bash
uv run python model_server.py
```

On the first run the server downloads Z-Image-Turbo (about 31 GB) into `models/Z-Image-Turbo/` and builds a 4-bit copy (5.5 GB) in `models/zimage-q4/`. Later starts load the 4-bit copy in a few seconds.

**Step 2: in a new terminal, start the web UI**

```bash
uv run python main.py
```

Open http://127.0.0.1:7860 in your browser.

## Usage

### Direct Input Mode

1. Choose a **Model**
2. Go to the **Direct Input Prompt** tab and enter your prompt, or click one of the examples
3. Pick a resolution and adjust the steps
4. Click **Generate Image**

### Chat Mode (optional)

Requires an [xAI API key](https://x.ai/). The tab is hidden when no key is set.

1. Create a `.env` file with your key:
   ```
   XAI_API_KEY=your_api_key_here
   ```
2. Go to the **Chat Mode** tab and describe your image
3. Grok turns it into a detailed prompt, then the image is generated
4. Double-click one of your messages to edit it and generate again

### Switching models

Choosing a model resets the steps, resolution, guidance and negative prompt to that model's defaults. The server keeps one model in memory at a time and swaps when a request asks for the other one, which takes about 10 seconds.

The first image from WAI-Illustrious downloads it (about 13 GB) into `models/waiNSFWIllustrious_v120/`. This can take longer than the UI is willing to wait; if the request times out, wait for the download to finish in the server terminal and generate again.

The first image from MOSS-Image downloads it (about 26 GB) into `models/moss-image-nsfw/`. Each image takes minutes rather than seconds; see [Performance](#performance).

WAI-Illustrious and MOSS-Image are labelled "not for all audiences" on Hugging Face. WAI-Illustrious's default negative prompt starts with `nsfw` to keep results safe for work; its licence is CreativeML OpenRAIL-M, which restricts some uses. MOSS-Image is Apache 2.0, and the server adds its trigger word `moss_xvstyle` to prompts that lack it.

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `XAI_API_KEY` | No | xAI API key for Chat Mode prompt enhancement |

### Model defaults

| Setting | Z-Image-Turbo | WAI-Illustrious | MOSS-Image |
|---------|---------------|-----------------|------------|
| Steps | 9 (up to 20) | 28 (up to 50) | 30 (up to 50) |
| Guidance (CFG) | not used | 7 | 3 |
| Negative prompt | not used | `nsfw, (low quality, worst quality:1.2), very displeasing, 3d, watermark, signature, ugly, poorly drawn` | empty |
| Largest side | 1536px | 1216px | 1024px |

## Performance

Measured on an Apple M5 with 24 GB of memory:

| Model | 512x512 | 1024x1024 |
|-------|---------|-----------|
| Z-Image-Turbo, 9 steps | about 10s | about 48s |
| WAI-Illustrious, 28 steps | | about 40s |
| MOSS-Image, 30 steps | about 2 min | about 7 min |

Switching models takes about 10 seconds. A MOSS-Image request with a new prompt adds about 20 seconds to run its text encoder; repeating the last prompt with a new seed or size skips that.

## System Requirements

| Component | Tested on |
|-----------|-----------|
| Chip | Apple M5 |
| Memory | 24 GB |
| Storage | about 80 GB free for all three models |

## Technical Notes

- **Z-Image-Turbo** runs as a 4-bit MLX model built from the original weights. In bfloat16 it needs about 20 GB, which does not fit beside macOS on a 24 GB Mac.
- **WAI-Illustrious** runs in float16 on MPS, with the VAE decoding in float32 to avoid overflow.
- **MOSS-Image** needs 27 GB in bfloat16, so its text encoder (17 GB) and image model (10 GB) take turns in memory. Its pipeline code is vendored in `moss_pipeline.py` with one fix for MPS, which has no float64.
- All model work runs on one server thread, because MLX only works on the thread that created it. Requests are handled one at a time.
- Seeds use a CPU generator for SDXL, so they are reproducible.

## Project Structure

```
z-image-inference/
├── main.py              # Gradio web interface
├── model_server.py      # FastAPI inference server
├── model_catalog.py     # Model list and defaults, shared by the UI and the server
├── history_store.py     # Image history database
├── moss_pipeline.py     # Vendored MOSS-Image pipeline (Apache 2.0)
├── grok_client.py       # xAI Grok API client
├── pyproject.toml       # Project dependencies
├── models/              # Downloaded and quantised models (not in git)
└── history.db           # Generated images database (not in git)
```

## Troubleshooting

**The model server fails to start after an interrupted first run?**
- Delete `models/zimage-q4/` and start the server again to rebuild it

**Generation is very slow?**
- Close other memory-hungry apps; both models need most of a 24 GB Mac's memory

**Chat mode not showing?**
- Check that `XAI_API_KEY` is set in `.env` and that the key is valid

## Acknowledgements

- [Tongyi Lab](https://huggingface.co/Tongyi-MAI) for the Z-Image-Turbo model
- [WAI](https://civitai.com/) for the WAI-NSFW-Illustrious model
- [OpenMOSS](https://huggingface.co/OpenMOSS-Team) for MOSS-Image, and axiomofmind for the NSFW LoRA
- [mflux](https://github.com/filipstrand/mflux) for MLX inference
- [Hugging Face](https://huggingface.co/docs/diffusers) for the diffusers library
- [Gradio](https://gradio.app/) for the web interface framework
- [z-image-mps](https://github.com/ivanfioravanti/z-image-mps) for MPS optimisation inspiration

## Licence

Apache License 2.0. See [LICENSE](LICENSE) for details.
