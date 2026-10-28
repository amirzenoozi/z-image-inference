# How it works

The app is two Python processes and a React interface, all on your Mac.

```
┌────────────────────────────────────────────────────────────────────┐
│ Your Mac (Apple Silicon)                                           │
│                                                                    │
│  Browser ──▶ main.py (port 7860)  ──HTTP──▶ model_server.py (8000) │
│              web app + /api              Z-Image-Turbo (MLX)       │
│              React UI (frontend/dist)    WAI-Illustrious (SDXL)    │
│              history.db (SQLite)         Anime Desire (SDXL)       │
│                   │                      MOSS-Image (two stages)   │
│                   ▼                                                │
│              Grok API (xAI), optional, for Chat with Grok          │
└────────────────────────────────────────────────────────────────────┘
```

## The two servers

**`model_server.py`** (port 8000) loads one model at a time and generates images. All model work runs on one thread (`model_thread`), because MLX only works on the thread that created it, so requests are handled one at a time. Downloads run on a separate thread, so a download never blocks generating with a model that is already there.

**`main.py`** (port 7860) is the web app. It serves the built UI from `frontend/dist`, offers the `/api` endpoints, and keeps History in `history.db`. It forwards generation, progress and model actions to the model server.

Both check every request with the same rules (`generation_request.py`), so a bad size, step count or variation is refused before any rendering starts.

## Web app API

| Endpoint | Purpose |
|----------|---------|
| `GET /api/catalog` | models, resolutions, limits and example prompts |
| `POST /api/generate` | render an image (or a variation, with `source_image_id` and `change`) and add it to History, linked to `character_id` if given; for the SDXL models, the character's face image is sent along for the face lock |
| `GET /api/jobs/{id}/progress`, `POST /api/jobs/{id}/cancel` | follow or cancel a running render |
| `GET /api/models/status`, `POST /api/models/{id}/download`, `DELETE /api/models/{id}` | model downloads and removal |
| `GET /api/history` | a page of History, with `model`, `q`, `ratio`, `character` and `favourites` filters |
| `GET /api/history/export` | the filtered History as a zip |
| `GET /api/history/summary`, `DELETE /api/history/older-than/{days}`, `DELETE /api/history` | storage use, Clean up and Delete all |
| `GET /api/history/{id}/image` | an image (`?thumb=true` for a small WebP) |
| `GET /api/history/{id}/palette` | its colour palette, worked out once and saved |
| `PUT /api/history/{id}/favourite` | star or unstar |
| `PUT /api/history/{id}/sensitive` | mark as sensitive (blurred in lists) or not |
| `POST /api/history/{id}/edits` | save a rotated, flipped or cropped copy |
| `DELETE /api/history/{id}` | delete one image |
| `GET /api/characters`, `POST /api/characters` | list or create characters |
| `PATCH /api/characters/{id}`, `DELETE /api/characters/{id}` | change a character (only the fields sent, including `face_upload`, a photo as base64), or delete it and keep its images |
| `GET /api/characters/{id}/face-upload` | a character's uploaded face photo (`?thumb=true` for a small WebP) |
| `POST /api/chat` | Chat with Grok, streamed |

The model server's own endpoints (`/generate`, `/jobs/{id}`, `/models/...`, `/health`) are for the web app only.

## Storage

- **History** is a SQLite database, `history.db`, with each image stored as PNG data alongside its settings, its render time, its colour palette, its favourite star where it came from (an edit or a variation) and the character it was made for. Characters are in the same database, in their own table. New columns are added to older databases automatically.
- **Models** are in `models/`, one folder each. Compressed copies are built into a `.building` folder and renamed when complete.
- **Settings** you change in Create are kept in the browser (local storage).

## Technical notes

- **Z-Image-Turbo** runs with mflux on MLX, from an 8-bit copy by default (see [Models](models.md#z-image-turbo-level)). Its progress is reported from mflux's step callback, after MLX has actually computed each step.
- **WAI-Illustrious, Anime Desire and RealVisXL** run with diffusers on MPS in float16, with the VAE decoding in float32 to avoid overflow. Their prompts are encoded with [Compel](https://github.com/damian0815/compel), which applies `(tag:1.3)` weights and encodes long prompts in 77-token chunks instead of cutting them off; `prompt_weights.py` rewrites the usual weight syntax into Compel's.
- **MOSS-Image**'s pipeline is vendored in `moss_pipeline.py`, with a fix for MPS (which has no float64) and a per-step callback for progress and cancelling. Its text encoder and image model take turns in memory, and the last prompt's embeddings are kept.
- **Variations** send the start image from History to the model server, cropped to the shape being made and resized. Z-Image-Turbo passes it to mflux as `image_strength = 1 − change`; the SDXL models use an image-to-image pipeline built from the loaded model, so it costs no extra memory, with the start image encoded in float32 by the app.
- **Edits** (rotate, flip, crop) are previewed in the browser with CSS and applied on save by Pillow, from the original PNG, at full quality.
- **Seeds** use a CPU random generator for the SDXL models, so they are reproducible.
