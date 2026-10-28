# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Z-Image-Inference runs image generation models locally on Apple Silicon, with a React UI. It is two processes:

- **`model_server.py`** (port 8000): loads one model at a time and generates images. All model work runs on one thread (`model_thread`), because MLX only works on the thread that created it.
- **`main.py`** (port 7860): FastAPI web app. Serves the built UI from `frontend/dist` and the `/api/*` endpoints (catalog, generate, history, chat, model status), and keeps history in `history.db`.

## Commands

```bash
uv sync                                          # Python dependencies
cd frontend && npm ci && npm run build           # build the UI (needed before main.py serves it)
uv run python model_server.py                    # model server
uv run python main.py                            # web app at http://127.0.0.1:7860
cd frontend && npm run dev                       # UI with live reload; proxies /api to main.py

uv run pytest                                    # backend tests
cd frontend && npm test                          # frontend tests (Vitest)
cd frontend && npx tsc -b && npx oxlint src      # type-check and lint
```

## Models

Defined once in `model_catalog.py` (shared by the UI and the server); loaders and downloads live in `model_server.py`. Files go in `models/` (not in git).

By default the original files are kept and run; `MODEL_COMPRESSION=on` in `.env` switches to the compressed copies below (`compression_enabled()` in `model_catalog.py`).

| Model | Engine | Compressed (`MODEL_COMPRESSION=on`) |
|-------|--------|-----------|
| Z-Image-Turbo (default) | mflux (MLX), 4-bit | `models/zimage-q4/`; the original download is deleted after the 4-bit copy is built |
| WAI-NSFW-Illustrious v12 (SDXL) | diffusers on MPS, float16; VAE decodes in float32 | `models/waiNSFWIllustrious_v120/`, rewritten from float32 to float16 once |
| Anime Desire (Illustrious SDXL) | diffusers on MPS, float16, single-file checkpoint loaded with the SDXL configs in `models/sdxl-base-config/` | `models/anime-desire-illustrious/` |
| MOSS-Image NSFW | diffusers on MPS, bfloat16; pipeline vendored in `moss_pipeline.py` | `models/moss-image-nsfw/`; text encoder kept 8-bit (optimum-quanto) in `text_encoder-q8/` |

- Only the default model downloads at start; the user downloads (`POST /models/{id}/download`, checked for free space) and removes (`DELETE /models/{id}`, files listed in `MODEL_FOLDERS`) the others from the model dialog. Downloads run one at a time in the background (`download_thread`) and finish with a `.download-complete` marker; `/generate` answers 503 with a message while a model downloads, and `/models/status` reports progress.
- One-time builds (4-bit, float16, 8-bit) write to a `.building` folder and rename it when complete.
- MOSS-Image's text encoder and image model do not fit in memory together, so they take turns; the last prompt's embeddings are cached.

## Code layout

- `generation_request.py`: request model and checks, shared by the web app and the model server.
- `resolutions.py`: resolution presets with category (square, portrait, landscape, widescreen) and size tier.
- `history_store.py`: SQLite history; images are stored as PNG data in the database.
- `frontend/src/`: React + TypeScript + Tailwind v4. `lib/` holds logic (settings, API client, prompt builder), `components/` the UI.
- `frontend/src/lib/promptBuilder/`: the prompt builder, ported from ComfyUI Photoreal Prompt Builder (see `THIRD_PARTY_NOTICES.md`). `data.ts` is generated from upstream; `parity.json` holds upstream outputs that the tests compare against.

## Rules to keep

- Explicit, nudity and lingerie prompts in the prompt builder require "Who" and an adult age range, and are refused if any free text suggests a minor (`minorTermIn` in `build.ts`). Keep this when changing the builder.
- Only one model is loaded at a time; switching models unloads the previous one first.
- Device is Apple MPS/MLX; the code assumes Apple Silicon and does not run usefully in Docker or on CPU.
