# System overview

Z-Image-Inference makes images with local models on a Mac with Apple Silicon. You use it through a React interface in the browser. Everything runs on your Mac: the only things that leave it are Grok chat messages (when `CHAT_PROVIDER=grok`) and model downloads.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Your Mac (Apple Silicon)                                                     │
│                                                                              │
│  Browser ──▶ main.py (port 7860) ──HTTP──▶ model_server.py (port 8000)       │
│              web app + /api                one model at a time, on           │
│              React UI (frontend/dist)      model_thread (MLX or MPS):        │
│              history.db (SQLite)           Z-Image-Turbo, FLUX.1-dev (MLX)   │
│              image classifier (CPU)        WAI-Illustrious, Anime Desire,    │
│                │            │              RealVisXL (SDXL), MOSS-Image      │
│                │            │                                                │
│                │            └──stdin/stdout──▶ laya_worker.py (child process)│
│                │                               Laya, decision model (CPU)    │
│                ▼                                                             │
│              Chat: Ollama (local, port 11434) or Grok API (xAI, online)      │
└──────────────────────────────────────────────────────────────────────────────┘
```

## The two servers

All Python code is in `backend/`. The app is two processes, started separately (`make model-server` and `make app`).

**`backend/model_server.py`** (port 8000) loads one model at a time and generates images. All model work runs on one thread, `model_thread`, because MLX only works on the thread that created it. So renders are handled one at a time, and switching models unloads the previous one first. Downloads run on their own thread (`download_thread`), so a download never blocks rendering with a model that is already there. Only the web app talks to it; it listens on `127.0.0.1` only.

**`backend/main.py`** (port 7860) is the web app. It serves the built UI from `frontend/dist`, offers the `/api/*` endpoints, keeps History, characters and saved chats in `history.db`, and forwards renders, progress and model actions to the model server. It listens on `APP_HOST` (`127.0.0.1` by default).

Keeping the models in their own process means the web app stays responsive during a long render, and a model crash or restart never takes History down. Both servers check every render with the same rules (`backend/generation_request.py`), so a bad size, step count or variation is refused before any rendering starts.

## Helper processes

| Helper | Runs where | What it does |
|--------|-----------|--------------|
| Ollama | its own service (`brew services start ollama`), port 11434 | Runs the local chat model when `CHAT_PROVIDER=ollama`. The model loads with a chat and unloads `OLLAMA_KEEP_ALIVE` after the last message. See [chat.md](chat.md). |
| Laya (`backend/laya_worker.py`) | a child process of the web app, started by `backend/decision_model.py` | A small decision model on the CPU. It checks each chat question for nudity while adult content is locked, and answers `POST /api/decide`. The process starts for a task and ends after it (or after `DECISION_KEEP_ALIVE` seconds), which gives all its memory back. See [decision-model.md](decision-model.md). |
| Image classifier (`backend/nsfw_detector.py`) | inside the web app, on a background thread, on the CPU | Checks each saved image for nudity, to mark it sensitive and to enforce the safe-for-work rules. Loaded once at start; images saved before it was ready are checked afterwards. See [safety.md](safety.md). |

The CPU helpers leave the GPU to the image models. The Ollama chat model does use the GPU, so chatting during a render slows both down (see [performance.md](performance.md)).

## Where data lives

The code is in `backend/` and `frontend/`; the data stays at the project root, found through `backend/paths.py` (`PROJECT_DIR`, `MODELS_DIR`, `FRONTEND_DIST`), so moving the code never moves the data.

| Path | What | In git |
|------|------|--------|
| `models/` | Downloaded models, one folder each, plus the add-on LoRAs, the face lock (`ip-adapter/`), the image classifier (`nsfw-detector/`) and Laya (`laya/`) | no |
| `history.db` | SQLite: images, characters, saved chats and Laya's decisions. See [database.md](database.md). | no |
| `logs/` | `model_server.log` and `web_app.log`, rotating. See [logging.md](logging.md). | no |
| `.env` | Settings and keys, copied once from `.env.example`. See [configuration.md](configuration.md). | no |
| `example_prompts.json`, `prompt_modes.json`, `custom_clothes.json`, `sample_characters.json` | Files you can edit: example prompts, the prompt builder's purposes, your own clothes, the sample characters | yes |
| `frontend/dist` | The built UI that `main.py` serves | no |

Settings you change in Create are kept in the browser (local storage), not on the server.

## Web app API

The main groups of `/api` endpoints are:

- **Catalog**: `GET /api/catalog` (models, add-ons, resolutions, purposes, examples, chat and language).
- **Renders**: `POST /api/generate`, with progress and cancel under `/api/jobs/{id}`.
- **Models**: status, download and remove under `/api/models`.
- **History**: list, sets, export, summary, clean-up, image, palette, favourite, sensitive, edits and delete under `/api/history`.
- **Characters**: under `/api/characters`, including the uploaded face photo.
- **Chat and decisions**: `POST /api/chat` (streamed) and `POST /api/decide` (Laya).
- **Adult lock**: `POST /api/adult-content/word`.

Every endpoint, with its parameters and answers, is in [api.md](api.md). The model server's own endpoints (`/generate`, `/jobs/{id}`, `/models/...`, `/health`) are for the web app only.

## Main flows

### A render, from Generate to History

1. The browser builds the request (`frontend/src/lib/renderRequest`): the text prompt, written from the JSON prompt when there is one, plus model, size, steps, seed, add-ons, strengths, an optional `character_id`, `source_image_id` and, while the browser's adult lock is on, `safe_only`. It also starts polling `GET /api/jobs/{id}/progress`.
2. `POST /api/generate` in `main.py` reads the character and decides if the render must be kept safe for work (`safe_render_for`: a character with an uploaded face photo, or adult content locked). If so, it refuses adult models and sensitive prompts or start images, adds safe negatives and drops adult add-ons.
3. The web app loads the start image (for a variation) and the character's face image (for the face lock) from the database itself; the browser can never send image data.
4. It posts the request to the model server's `/generate`. The model server answers 503 if the model or an add-on is not downloaded (or is downloading), loads the model with exactly the add-ons the prompt uses (`use_model`, reloading only when the set changes), and renders on `model_thread`, reporting each step for the progress bar.
5. Back in the web app, the image classifier checks the result. A safe render with nudity (or with the check not ready) is discarded. Otherwise the image is saved to History as lossless WebP with its settings, JSON prompt, add-ons, character, A/B set and render time, and linked to the chat answer it came from, if any.
6. The browser shows the new History item; a notification appears if the tab is in the background.

### A chat question

1. The browser sends `POST /api/chat` with the conversation, the saved `conversation_id` and `parent_id`, and `safe_only` when its lock is on.
2. `main.py` checks a chat is set up (`ready_chat` in `backend/chat_client.py`); if not, it answers 503.
3. If adult content is locked (`ADULT_CONTENT=off`, or `safe_only`) and `DECISION_MODEL` is not `off`, Laya starts loading at once (`preload`), so its start overlaps saving the question.
4. The question is saved as a new exchange (`backend/chat_store.py`).
5. While locked, Laya's nudity task answers for the question. Its decision is saved with the exchange (`backend/decision_store.py`). A probability at or above `DECISION_NUDITY_REFUSE_AT` refuses the question (422, "refused by the safety check"); Laya failing refuses it too (503, the check fails closed). Either way the chat model never sees the question, and the answer carries an `X-Decision-Trace-Id` header to find it in the logs.
6. Otherwise the question goes to Ollama or Grok, with the provider's system prompt (`backend/system_prompts.py`), and the answer streams back as plain text. The `X-Chat-Conversation-Id` and `X-Chat-Exchange-Id` headers say where it is saved.
7. When the stream ends, the answer is saved as complete, failed or stopped, with its timings. A new conversation is titled in a background thread.
8. The browser puts the answer in the prompt box and generates an image at once, linked to that exchange.

More in [chat.md](chat.md) and [decision-model.md](decision-model.md).

### A model download

1. In the model dialog, **Download** calls `POST /api/models/{id}/download`, which the web app forwards to the model server.
2. The model server checks the download can go ahead (`download_problem`: free space, a Hugging Face token for FLUX.1-dev, a Civitai key for Civitai add-ons) and queues it on `download_thread`. One download runs at a time; an add-on also fetches its base model when missing.
3. Files go into the model's folder in `models/`. A finished download writes a `.download-complete` marker; one-time builds (quantised or float16 copies) are written to a `.building` folder and renamed when complete (`build_once`).
4. The dialog polls `GET /api/models/status` for progress. While a model downloads, a render with it answers 503 with a message.
5. Once ready, the model can be chosen at once, without a restart. **Remove** (`DELETE /api/models/{id}`) deletes its folders.

More in [models.md](models.md).

## Technical notes

- **Z-Image-Turbo** runs with mflux on MLX, from an 8-bit copy by default (see [Models](models.md#z-image-turbo-level)). Its progress comes from mflux's step callback, after MLX has actually computed each step.
- **FLUX.1-dev** runs with mflux on MLX, always from a 4-bit copy built once.
- **WAI-Illustrious, Anime Desire and RealVisXL** run with diffusers on MPS in float16, with the VAE decoding in float32 to avoid overflow. Their prompts are encoded with [Compel](https://github.com/damian0815/compel), which applies `(tag:1.3)` weights and encodes long prompts in 77-token chunks instead of cutting them off; `backend/prompt_weights.py` rewrites the usual weight syntax into Compel's.
- **MOSS-Image**'s pipeline is vendored in `backend/moss_pipeline.py`, with a fix for MPS (which has no float64) and a per-step callback for progress and cancelling. Its text encoder and image model take turns in memory, and the last prompt's embeddings are kept.
- **Add-ons** are LoRAs loaded at a marker strength and set per render, so a strength change needs no reload; only a change in the set of add-ons reloads the model.
- **Variations** send the start image from History to the model server, cropped to the shape being made and resized. Z-Image-Turbo passes it to mflux as `image_strength = 1 − change`; the SDXL models use an image-to-image pipeline built from the loaded model, so it costs no extra memory, with the start image encoded in float32.
- **Edits** (rotate, flip, crop) are previewed in the browser with CSS and applied on save by Pillow (`backend/image_edits.py`), from the original image, at full quality.
- **Seeds** use a CPU random generator for the SDXL models, so they are reproducible.
