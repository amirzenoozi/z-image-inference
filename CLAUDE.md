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

By default the original files are kept and run; `MODEL_COMPRESSION=on` in `.env` switches to the compressed copies below (`compression_enabled()` in `model_catalog.py`). Z-Image-Turbo is the exception: `Z_IMAGE_BITS` (`z_image_bits()`, default 8; 6, 5, 4, 3 or `original`) picks the quantised copy it runs, built into `models/zimage-q<bits>/` beside the original, which is always kept.

| Model | Engine | Compressed (`MODEL_COMPRESSION=on`) |
|-------|--------|-----------|
| Z-Image-Turbo (default) | mflux (MLX), 8-bit by default | Not affected; set by `Z_IMAGE_BITS` |
| WAI-NSFW-Illustrious v12 (SDXL) | diffusers on MPS, float16; VAE decodes in float32 | `models/waiNSFWIllustrious_v120/`, rewritten from float32 to float16 once |
| Anime Desire (Illustrious SDXL) | diffusers on MPS, float16, single-file checkpoint loaded with the SDXL configs in `models/sdxl-base-config/` | `models/anime-desire-illustrious/` |
| MOSS-Image NSFW | diffusers on MPS, bfloat16; pipeline vendored in `moss_pipeline.py` | `models/moss-image-nsfw/`; text encoder kept 8-bit (optimum-quanto) in `text_encoder-q8/` |

- Only the default model downloads at start; the user downloads (`POST /models/{id}/download`, checked for free space) and removes (`DELETE /models/{id}`, files listed in `MODEL_FOLDERS`) the others from the model dialog. Downloads run one at a time in the background (`download_thread`) and finish with a `.download-complete` marker; `/generate` answers 503 with a message while a model downloads, and `/models/status` reports progress.
- One-time builds (Z-Image levels, float16, 8-bit) write to a `.building` folder and rename it when complete.
- Variations (image-to-image): the web app loads the start image from History and sends it with `change` (0.1–0.9). Z-Image passes it to mflux as `image_strength = 1 − change`; the SDXL models use an img2img pipeline built from the loaded parts, with the start image encoded in float32 (`encode_in_float32`). MOSS-Image cannot (`supports_variations=False`).
- MOSS-Image's text encoder and image model do not fit in memory together, so they take turns; the last prompt's embeddings are cached.

## Code layout

- `generation_request.py`: request model and checks, shared by the web app and the model server.
- `resolutions.py`: resolution presets with category (square, portrait, landscape, widescreen) and size tier.
- `example_prompts.json`: each model's example prompts, keyed by model id and read on every catalog request. Keep every person in them clearly adult.
- `prompt_modes.json`: the prompt builder's purposes (steps, defaults, narrowed options, emphasis, tag weights), served in the catalog. `main.py` checks the shape; `promptBuilder/modes.ts` (`parseModes`) checks steps and options against the builder and leaves out a mode it cannot use.
- `history_store.py`: SQLite history; images are stored as PNG data in the database.
- `frontend/src/`: React + TypeScript + Tailwind v4. `lib/` holds logic (settings, API client, prompt builder), `components/` the UI.
- `frontend/src/lib/promptBuilder/`: the prompt builder. Its option lists (`data.ts`) are generated from ComfyUI Photoreal Prompt Builder (see `THIRD_PARTY_NOTICES.md`); `build.ts` holds the state and checks; `resolveFacts.ts` turns the choices into facts (`facts.ts`) within what the mode allows (`rules.ts`, `choicesFor`), which `prose.ts` writes as a detailed paragraph in the mode's emphasis order (Z-Image, MOSS-Image) and `tags.ts` as a tag list with the mode's weights (WAI, Anime Desire), chosen by the model's `prompt_style`. A step the mode hides contributes nothing.
- `image_edits.py`: rotate, flip and crop recipes, applied with Pillow when an edited copy is saved (`POST /api/history/{id}/edits`); the original image is never changed.
- `prompt_weights.py`: rewrites `(tag:1.3)` weights for Compel, which encodes SDXL prompts with weights and past 77 tokens (`sdxl_conditioning` in `model_server.py`).

## Rules to keep

- Explicit, nudity and lingerie prompts in the prompt builder require "Who" and an adult age range, and are refused if any free text suggests a minor (`minorTermIn` in `build.ts`). A mode that shows the Intimacy step is always adult (`isAdultMode` in `modes.ts`), so editing `prompt_modes.json` can never switch these checks off. Keep this when changing the builder.
- Only one model is loaded at a time; switching models unloads the previous one first.
- Icons come from `lucide-react`, never hand-drawn SVGs or text symbols; their size and line weight are set once (`.lucide` in `index.css`). A button that shows only an icon uses `IconButton`, which gives it its accessible name and a tooltip (with its keyboard shortcut, if it has one).
- Every dialog uses `Modal`: a header with the title and a close button, then the content, then its buttons passed as `actions`, under a divider, secondary action first and main action last. They are centred on their own, or on the right when a note (`actionsNote`) sits beside them on the left. A dialog with two columns (such as the image view) puts its actions at the bottom of the details column instead, under a divider, aligned right.
- Device is Apple MPS/MLX; the code assumes Apple Silicon and does not run usefully in Docker or on CPU.
