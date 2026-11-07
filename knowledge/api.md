# API

This file lists every HTTP endpoint of the web app (`backend/main.py`, port 7860) with its request, response, headers and errors. A shorter section at the end covers the model server's internal endpoints (`backend/model_server.py`, port 8000), which only the web app calls.

## General rules

- **Every entry point is public input.** The web app has no login, and with `APP_HOST=0.0.0.0` anyone on the network can call it. Each endpoint checks its own arguments (Pydantic models and `Query`/`Path` limits) and the safety rules on the server, whatever the browser sends. The browser's own checks (the adult-content word lock, the age safeguard in the prompt builder, `characterProblem`) are not security.
- **Validation errors** answer `422` with FastAPI's usual body: `{"detail": [{"loc": [...], "msg": "...", ...}]}`. Errors raised by the code answer `{"detail": "<message>"}`, with the message in the app's language (`backend/i18n.py`, `backend/locales/<code>.json`).
- **Adult content.** While `ADULT_CONTENT` is off (`backend/adult_content.py`), the catalog leaves out adult purposes, models and add-ons, History hides sensitive images (`check_shown`, `hide_sensitive` forced on), and every render is kept safe for work. With it on, the browser sends `safe_only` and `hide_sensitive` while its own lock is on. See [safety.md](safety.md).
- **Generation limits** shared with the model server live in `backend/generation_request.py`: `MIN_SIDE` 256, `SIDE_STEP` 16, `MAX_SEED` 2^32 − 1, `MAX_PROMPT_LENGTH` 4000, `MAX_NEGATIVE_PROMPT_LENGTH` 2000, `JOB_ID_PATTERN` (a lower-case UUID), change 0.1 to 0.9, face strength 0.1 to 1.0.
- **Model server errors** reach the browser as follows: model server not running `503` (`modelServerDown`); no answer within 900 seconds (`REQUEST_TIMEOUT`) `504`; for renders, its `409`, `422` and `503` are passed on with its message and any other failure becomes `502`.

## Catalog and settings

### `GET /api/catalog`

Everything the UI needs to start. Read fresh on every call, so edits to `example_prompts.json`, `prompt_modes.json` and `custom_clothes.json` show after a page reload.

Response (`Catalog`):

| Field | Meaning |
|---|---|
| `models` | One `ModelInfo` per model in `MODELS` (`backend/model_catalog.py`); adult models only while `ADULT_CONTENT` is on. Holds id, repo, page link, label, description, speed hint, category, download and kept size (GB), default and maximum steps, maximum side, default size, guidance use and default, default negative prompt, trigger word, `prompt_style` (`prose` or `tags`), `supports_variations`, `supports_face_lock`, `examples`, `adult`, and `addons` (adult add-ons only while on). |
| `model_categories` | `{id, label}` for each model category |
| `resolutions` | Presets from `backend/resolutions.py`: `{width, height, ratio, category, tier}` |
| `categories` | `square`, `portrait`, `landscape`, `widescreen` |
| `chat_available`, `chat_name` | Whether the chat is set up (`chat_client.ready_chat()`), and who answers (`Grok`, or the Ollama model's name, `Ollama` until one is set) |
| `limits` | `{min_side, side_step, max_seed, max_prompt_length}` |
| `builder_modes` | The purposes from `prompt_modes.json`, checked by `BuilderMode` (extra keys refused); adult purposes only while on |
| `language` | `APP_LANGUAGE` |
| `adult_content` | `{available, word_lock}`: `ADULT_CONTENT` is on, and `ADULT_UNLOCK_WORD` is set |
| `custom_clothes`, `custom_clothes_problems` | The user's own clothes from `custom_clothes.json`, and a message for each entry left out |

Errors: `500` when `example_prompts.json` names an unknown model or fails its checks, when `prompt_modes.json` is broken or has duplicate ids, or when `Z_IMAGE_BITS` is invalid (it is read for the kept sizes).

### `POST /api/adult-content/word`

Checks whether the keys typed in the app end with the hidden word, so the word itself never reaches the browser.

- Body: `{"typed": string}`, at most 200 characters.
- Response: `{"match": bool}`. Always `false` while `ADULT_CONTENT` is off or `ADULT_UNLOCK_WORD` is empty. Compared with `hmac.compare_digest`.

## Generation and jobs

### `POST /api/generate`

Renders one image through the model server and saves it to History.

Body (`WebGenerateRequest`, which extends `GenerateRequest`):

| Field | Type and limits | Meaning |
|---|---|---|
| `model` | string, a key of `MODELS`; default `z-image-turbo` | Unknown id: `422` |
| `prompt` | 1 to 4000 characters | The text the model renders |
| `negative_prompt` | up to 2000 characters, default `""` | |
| `width`, `height` | default 1024; 256 to the model's `max_side`, multiples of 16 | |
| `steps` | 1 to the model's `max_steps`, or null for the default | |
| `guidance` | 0 to 20, or null for the default; ignored by models without guidance | |
| `seed` | 0 to 4294967295, or null for random | |
| `job_id` | lower-case UUID, optional | Chosen by the browser to follow and cancel the render |
| `change` | 0.1 to 0.9 | Required with `source_image_id`, and only with it |
| `addons` | up to 10 ids, no repeats | Optional add-ons of this model (`kind: optional`) |
| `strengths` | up to 10 entries, `{addon_id: number}` | Slider add-ons of this model, each within its `SliderRange` |
| `source_image_id` | int, optional | A variation's start image in History; the model must have `supports_variations` |
| `character_id` | int, optional | The character it is made for; its face is locked on models with `supports_face_lock` |
| `prompt_spec` | `PromptSpec` (`backend/prompt_spec.py`), optional | The JSON prompt the text came from; only its shape is checked, and it is saved with the image |
| `safe_only` | bool, default false | The browser's adult lock is on: keep the render safe for work |
| `set_id`, `set_label` | UUID, and 1 to 200 characters | An A/B test's set; both or neither (`setNeedsBoth`) |
| `chat_exchange_id` | int ≥ 1, optional | The chat answer the prompt came from |
| `init_image`, `face_image`, `face_strength` | must be null | The web app loads the start and face images itself; image data from the browser is refused with `422` |

What it does (`generate`, `render_and_save`):

1. Loads the character (`404 characterGone` if missing) and checks the chat exchange exists (`422 chatAnswerNotFound`).
2. Decides whether the render must be safe for work (`safe_render_for`): the character's face is an uploaded photo, or adult content is locked (`ADULT_CONTENT` off, or `safe_only`). If so, `check_safe_request` refuses an adult model (only for the lock), a prompt with a sensitive word, a sensitive start image, and any render while the image check (`backend/nsfw_detector.py`) is not loaded yet. It then adds safe negatives and drops adult add-ons.
3. Loads the start image (`404 startImageGone`) and the face (uploaded photo, or the character's `face_id` image; a face image deleted meanwhile just leaves out the face lock).
4. Calls the model server's `/generate`, then checks the result with the image classifier. In a safe render, a result with nudity, or one that could not be checked, is discarded (`422`).
5. Saves the image (see [database.md](database.md)) and, with `chat_exchange_id`, links it to that exchange (the first image stays linked).

Response: the saved `HistoryItem` (below).

Errors: `422` validation or safe-for-work refusal (the message may quote the prompt word or name the character, so only the character id is logged); `404` character or start image gone; `409` cancelled; `503` model server down, or the model, an add-on or the face lock adapter is still downloading or not downloaded (the model server's message says which); `504` model server too slow; `502` model server failed.

### `GET /api/jobs/{job_id}/progress`

`job_id` must match `JOB_ID_PATTERN` (else `422`). Response: `{"phase": "waiting" | "loading" | "encoding" | "generating" | "finishing", "step": int, "total": int}`. Errors: `404 noSuchJob` when no such render is running or waiting (passed on from the model server); `503` model server down. Timeout 5 seconds.

### `POST /api/jobs/{job_id}/cancel`

Asks the running render to stop at its next step. Answers `204`; the matching `POST /api/generate` then answers `409`. Errors as for progress.

## History

`HistoryItem` (the shape every History endpoint returns): `id`, `prompt`, `negative_prompt`, `seed`, `width`, `height`, `steps`, `guidance` (null for models without guidance), `model`, `created_at` (UTC, `YYYY-MM-DD HH:MM:SS`), `duration_seconds` (null for edits and old rows), `favourite`, `edited_from`, `varied_from`, `change`, `character_id`, `face_from`, `sensitive`, `addons` (list of ids), `prompt_spec` (JSON text or null), `strengths` (object), `set_id`, `set_label`. See [database.md](database.md) for each column.

**Shared filters** (`history_filter`), used by the list, position and export:

| Query | Limits | Meaning |
|---|---|---|
| `model` | a key of `MODELS` (else `422 unknownModel`) | One model's images |
| `q` | up to 200 characters, trimmed | Prompt contains the text (SQL `LIKE`, `%` and `_` match themselves) |
| `favourites` | bool | Starred images only |
| `ratio` | `square`, `portrait`, `landscape`, `widescreen` | Shape, as the resolution picker groups sizes |
| `character` | int ≥ 1 | One character's images |
| `hide_sensitive` | bool | Leave out sensitive images; forced on while `ADULT_CONTENT` is off |

**Single-image rule** (`check_shown`): an id that does not exist, or a sensitive image while `ADULT_CONTENT` is off, answers `404 imageNotFound`. The palette, edits, favourite, sensitive, image and download endpoints apply it. Path ids that are not integers answer `422`.

| Method and path | What it does | Request | Response | Errors |
|---|---|---|---|---|
| `GET /api/history` | A page, newest first | `offset` ≥ 0 (default 0), `limit` 1 to 100 (default 30), filters | `{items: HistoryItem[], total}` (`total` counts the filtered rows) | `422` |
| `GET /api/history/{item_id}/position` | An image and its place in the filtered list, so a link can open it | filters | `{item, index, total}` (`index` = how many newer images match) | `404` gone or filtered out |
| `GET /api/history/sets/{set_id}` | An A/B test's images, oldest first | `set_id` UUID; `hide_sensitive` | `HistoryItem[]`, at most 100 | `422` bad id |
| `GET /api/history/export` | The filtered images as a zip, streamed | filters | `application/zip`, `Content-Disposition: attachment; filename="z-image-history-<date>.zip"`; each image as `<id>-<model>-<seed>.png` (id padded to 4 digits) with a `.txt` of prompts and settings, plus `history.json` | `422` |
| `GET /api/history/summary` | Storage use and what Clean up would delete | | `{total, bytes, older_than: [{days, count}]}` for 7, 30 and 90 days; `bytes` is the size of `history.db`; `older_than` leaves favourites out | |
| `GET /api/history/{item_id}/palette` | The main colours, worked out and saved on first call | | Up to 6 `{hex, share}`, most used first | `404` |
| `POST /api/history/{item_id}/edits` | Saves a turned, flipped or cropped copy as a new image | `EditRecipe` (`backend/image_edits.py`): `quarter_turns` 0 to 3, `flip_horizontal`, `flip_vertical`, `crop` `{x ≥ 0, y ≥ 0, width ≥ 16, height ≥ 16}` in pixels after turns and flips; must change something | `201` with the new `HistoryItem` (`edited_from` set, the original's flag, add-ons, strengths and JSON prompt kept) | `404`; `422` nothing changed, or crop outside the image |
| `PUT /api/history/{item_id}/favourite` | Star or unstar | `{"favourite": bool}` | `HistoryItem` | `404` |
| `PUT /api/history/{item_id}/sensitive` | Set the sensitive flag by hand; the background check never changes it after this | `{"sensitive": bool}` | `HistoryItem` | `404` |
| `GET /api/history/{item_id}/image` | The image as stored, for showing | `thumb` bool | WebP or PNG (by its first bytes); with `thumb=true` a WebP at most 384 px per side, quality 85. Header `Cache-Control: private, max-age=31536000, immutable` (ids are never reused) | `404` |
| `GET /api/history/{item_id}/download` | Always a PNG | | `image/png`, `Content-Disposition: attachment; filename="z-image-<id>-<seed>.png"`, same cache header | `404` |
| `DELETE /api/history/{item_id}` | Deletes one image | | `204` | `404` if it does not exist. It does not apply `check_shown`. |
| `DELETE /api/history` | Deletes every image, favourites included, then compacts the file (`VACUUM`). Characters and chats are kept. | | `204` | |
| `DELETE /api/history/older-than/{days}` | Clean up: deletes non-favourite images older than `days`, then compacts | `days` must be 7, 30 or 90 (`CLEANUP_AGES_DAYS`) | `{"deleted": int}` | `422` other values |

Note: `GET /api/history/summary` counts every image, sensitive ones included, even while `ADULT_CONTENT` is off.

## Characters

`Character` response: `id`, `name`, `traits` (the builder's identity choices, `CharacterTraits` in `backend/character_store.py`), `cover_id` (the chosen cover if it still exists, else the newest image of the character, else null), `seed`, `image_count`, `face_id` (null once that image is deleted), `face_strength`, `cover_sensitive`, `face_sensitive`, `face_uploaded`.

Body rules (extra keys refused with `422`):

- `name`: trimmed, 1 to 40 characters, unique ignoring case.
- `traits`: each text up to 300 characters; list fields (`skinDetails`, `makeupMore`, `facialHairMore`, `tattoos`, `piercings`) up to 20 items of 100 characters; `strengths` up to 10 slider add-on ids, each within its range (`characterStrength`).
- `seed`: 0 to 2^32 − 1. `face_strength`: 0.1 to 1.0 (default 0.6).
- `face_upload`: a base64 image, up to 14,000,000 characters. It is decoded, converted to RGB and stored as a PNG no larger than 1024 px per side; anything unreadable is `422 badPhoto`. `face_id` and `face_upload` together is `422 oneFace`.
- The age of a character is checked only in the browser (`characterProblem`), not here.

| Method and path | What it does | Response | Errors |
|---|---|---|---|
| `GET /api/characters` | All characters, by name ignoring case | `Character[]` | |
| `POST /api/characters` | Creates one (`NewCharacter`: `name`, `traits` required; `cover_id`, `seed`, `face_id`, `face_strength`, `face_upload` optional) | `201` `Character` | `409` name taken; `422` cover or face image not in History, bad photo, both faces |
| `PATCH /api/characters/{character_id}` | Changes only the fields sent (`CharacterUpdate`). Null clears `cover_id`, `seed`, `face_id` or `face_upload`, and is ignored for `name`, `traits` and `face_strength`. Setting one kind of face clears the other. | `Character` | `404`; `409`; `422` as above |
| `GET /api/characters/{character_id}/face-upload` | The uploaded face photo | `image/png`, or a WebP thumbnail with `thumb=true`; `Cache-Control: no-cache`, since a new upload uses the same address | `404 noUploadedFace` (no photo, or no such character) |
| `DELETE /api/characters/{character_id}` | Deletes it; its images are kept, unlinked | `204` | `404` |

## Chat

### `POST /api/chat`

Turns a description into a prompt. Streams the answer of Grok or the Ollama model (`backend/chat_client.py`) as plain text.

Body (`ChatRequest`):

| Field | Limits | Meaning |
|---|---|---|
| `messages` | 1 to 50 items of `{role: "user" \| "assistant", content}`, content 1 to 4000 characters; the last must be from the user (`lastMessageFromUser`) | The conversation so far |
| `conversation_id` | int ≥ 1, optional | The saved conversation to continue; none starts a new one |
| `parent_id` | int ≥ 1, optional | The exchange this follows: the last answer, or the one before an edited question. Must belong to the same conversation. |
| `safe_only` | bool, default false | The browser's adult lock is on |

What it does:

1. Refuses with `503 chatUnavailable` when no chat is set up (`ready_chat()`).
2. Saves the question as a new exchange with status `streaming` (`chat_store.start`). An unknown conversation or a parent from elsewhere is `422 chatNotFound`.
3. While adult content is locked (`ADULT_CONTENT` off, or `safe_only`) and `DECISION_MODEL` is not `off`, Laya's nudity task checks the last question first (`check_question`), and the decision is saved in `decision_tasks`. A refusal ends the exchange as `refused` and answers `422 questionRefused`. If Laya cannot run, the check fails closed: the exchange ends as `failed` and the answer is `503 decisionUnavailable`. Both carry `X-Decision-Trace-Id`. With `DECISION_MODEL=off` no check runs, even while locked.
4. Pulls the first piece of the answer before replying, so a stopped Ollama, a missing model or a bad key becomes `502` with the provider's message (exchange saved as `failed`).
5. Streams the rest. When the stream ends the answer is saved as `complete`, as `failed` (an error mid-stream; the stream then breaks off), or as `stopped` (the browser left; the part received is kept). A new conversation is then titled in a background thread.

Response: `200`, `text/plain; charset=utf-8`, streamed. Headers: `X-Chat-Conversation-Id` and `X-Chat-Exchange-Id`, to send back as `conversation_id` and `parent_id`, and as `chat_exchange_id` on the next `POST /api/generate`.

There is no endpoint yet to read, list or delete saved chats (`chat_store.conversation` exists but is not served).

## Decision model

### `POST /api/decide`

Asks Laya (`backend/decision_model.py`) typed questions about a text. Nothing is saved; the log has the trace id but not the text.

Body (`DecideRequest`):

- `text`: 1 to 4000 characters.
- `questions`: 1 to 10 entries, keyed by an id matching `^\w{1,40}$`. Each `DecisionQuestion` (extra keys refused):
  - `type`: `choice`, `score` or `noul` (yes or no).
  - `instructions`: 1 to 500 characters.
  - `criteria`: for `choice`, an object of 2 to 20 named criteria; for `score`, a list of 2 to 20 levels in order; for `noul`, optional, and if given an object with exactly the keys `true` and `false`. Each name and text is 1 to 200 characters.

Response (`DecideResponse`): `{"trace_id": str, "decide_ms": int, "answers": {question_id: answer}}`, where an answer is `{"probability": float}` for `noul`, `{"choice": name, "probabilities": {...}}` for `choice`, and `{"score": level, "probabilities": {...}}` for `score`.

Errors: `422` validation; `503 decisionOff` while `DECISION_MODEL=off`; `502 decisionUnavailable` when Laya cannot load or answer, with `X-Decision-Trace-Id` naming the log lines. The first call downloads Laya (about 800 MB) and each call waits behind any other Laya task.

## Models

| Method and path | What it does | Response | Errors |
|---|---|---|---|
| `GET /api/models/status` | Every model's and add-on's download state, from the model server (3 second timeout) | `{server_running, models: {id: {status, size_bytes}}, free_bytes}`; `status` is `ready`, `queued`, `downloading`, `missing` or `failed`; `size_bytes` is what is on disk (during a download, what has arrived). With the model server down: `server_running: false`, `models: {}`, `free_bytes: null`. | none |
| `POST /api/models/{model_id}/download` | Starts a download in the background (one at a time). An add-on fetches its base model too. Does nothing if already ready or under way. | `{status, size_bytes}` | `404` id not in `MODELS` or `ADDONS`; `400` FLUX.1-dev without a Hugging Face token, or a Civitai add-on without `CIVITAI_TOKEN`; `507` not enough free space; `503` model server down |
| `DELETE /api/models/{model_id}` | Unloads it if loaded and deletes its files (an add-on: only its LoRA) | `204` | `404`; `409` while it downloads; `503` |

These endpoints do not look at `ADULT_CONTENT`: adult models can be listed and downloaded through the API while it is off, though they cannot be used.

## UI routes

- With `frontend/dist` built, `GET /history`, `/history/`, `/characters` and `/characters/` serve `index.html`, and everything else under `/` is served from `frontend/dist` (`StaticFiles`, `html=True`).
- Without a build, `GET /` answers `503` with a plain-text hint to build the UI.
- FastAPI's own `/docs` and `/openapi.json` are not switched off, so they also list these endpoints.

## Model server (internal, port 8000)

Bound to `127.0.0.1` only, whatever `APP_HOST` says. Only the web app should call it. All model work runs on one thread (`model_thread`), so renders queue.

| Method and path | What it does | Errors |
|---|---|---|
| `POST /generate` | Body: `GenerateRequest`, with `init_image` and `face_image` as base64 PNG. Applies add-ons per render (`applied_addons`: optional ones mentioned in the prompt, automatic ones when downloaded, sliders with a strength). Response `{image_base64, seed, model, seconds, addons, strengths}`; `seconds` counts rendering only. | `503` model, add-on or face lock adapter not ready (starts the face lock download on first use); `409` cancelled; `422` validation, or a start or face image it cannot read |
| `GET /jobs/{job_id}` | `{phase, step, total}` of a running or waiting job | `404 noSuchJob` |
| `POST /jobs/{job_id}/cancel` | Marks it cancelled; it stops at the next step | `404` |
| `GET /models/status` | `{models: {id: {status, size_bytes}}, free_bytes}` | |
| `POST /models/{model_id}/download` | As above, with the token and free-space checks | `404`, `400`, `507` |
| `DELETE /models/{model_id}` | Unload and remove, on the model thread | `404`, `409` |
| `GET /health` | `{"status": "ok", "loaded_model": id or null}` | |

On start the model server queues the default model's download and loads it if it is already there.
