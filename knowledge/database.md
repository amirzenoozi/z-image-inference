# Database

This file describes `history.db`, the SQLite database at the project root that holds History, characters, saved chats and Laya's decisions. It lists every table and column, how the tables link, how older databases are upgraded, how images are stored, and what cleanup deletes.

## Overview

- **File:** `history.db` at the project root (`DB_PATH` in `backend/history_store.py`), git-ignored together with SQLite's `history.db-*` journal files and the `history.db.bak` backup.
- **Who uses it:** only the web app (`backend/main.py`). The model server never opens it.
- **Created and upgraded** on every web app start by `history_store.init_db()` (called from `lifespan` in `main.py`), then `character_store.add_samples_once()`.
- **Connections:** each call opens its own connection (`history_store.connection()`), commits when the block ends and closes. `character_store.py`, `chat_store.py` and `decision_store.py` use the same helper. No `PRAGMA` is set, so SQLite's defaults apply: the default rollback journal (not WAL), and **foreign keys are not enforced**. The `REFERENCES` clauses document the links but SQLite does not check them.
- **Times** are written by `DEFAULT CURRENT_TIMESTAMP`, which is UTC in the form `YYYY-MM-DD HH:MM:SS`. The export labels them UTC (`backend/history_export.py`), and the image viewer adds `Z` before converting them to local time (`HistoryViewer`).
- **Ids** are `INTEGER PRIMARY KEY AUTOINCREMENT`, so a deleted id is never reused. The image endpoints rely on this for their year-long cache header.

## Tables

### `images`

One row per History image. The first six columns after `id` come from the first release; the rest were added later through `ADDED_COLUMNS`.

| Column | Type | Null / default | Meaning and writer |
|---|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | | |
| `image_data` | BLOB | NOT NULL | The image: lossless WebP, or PNG for older rows (see below). Written by `history_store.add`, replaced only by `store_as_webp` (the recompress tool). |
| `prompt` | TEXT | nullable | The prompt text sent to the model. Read as `""` when null. |
| `seed` | INTEGER | nullable | The seed used (the model server's, when random) |
| `width`, `height` | INTEGER | nullable | Size in pixels. An edited copy has its new size. |
| `steps` | INTEGER | nullable | Steps used: the request's, or the model's default |
| `created_at` | TIMESTAMP | `CURRENT_TIMESTAMP` | When it was saved, UTC |
| `model` | TEXT | NOT NULL, default `z-image-turbo` | Model id. Old rows got the default model. On start, `move_to_base_models` rewrites rows of models that became add-ons (`MODELS_NOW_ADDONS`) to their base model with that add-on. |
| `negative_prompt` | TEXT | NOT NULL, default `''` | As sent to the model server, so it includes the safe-for-work terms added to a safe render |
| `guidance` | REAL | nullable | Guidance used; null for models without guidance |
| `duration_seconds` | REAL | nullable | Render time from the model server; null for edits and rows from before it was recorded |
| `favourite` | INTEGER | NOT NULL, default 0 | 1 when starred (`set_favourite`). Clean up keeps favourites. |
| `palette` | TEXT | nullable | JSON list of `{hex, share}`, worked out on the first `GET /api/history/{id}/palette` and saved. Not in `COLUMNS`, so not part of `HistoryItem`. |
| `edited_from` | INTEGER | nullable | The image this was turned, flipped or cropped from (`POST /api/history/{id}/edits`) |
| `varied_from` | INTEGER | nullable | A variation's start image (`source_image_id`) |
| `change` | REAL | nullable | How much the variation changed it, 0.1 to 0.9 |
| `character_id` | INTEGER | nullable | The character it was made for. Set to null when the character is deleted. |
| `face_from` | INTEGER | nullable | The History image whose face was locked; null for no face lock or an uploaded photo |
| `sensitive` | INTEGER | nullable in the schema; always 0 or 1 after start | Blurred in lists, hidden while adult content is off. See "Sensitive flag" below. |
| `image_checked` | INTEGER | NOT NULL, default 0 | 1 once the image classifier has looked at it, or the flag was set by hand |
| `addons` | TEXT | NOT NULL, default `''` | Add-on ids the render used, comma-separated |
| `prompt_spec` | TEXT | nullable | The JSON prompt the text was written from (`PromptSpec.to_json()`, `backend/prompt_spec.py`); null for a typed prompt |
| `strengths` | TEXT | NOT NULL, default `'{}'` | Slider add-on strengths as a JSON object by add-on id |
| `set_id` | TEXT | nullable | An A/B test's set id (a UUID made by the browser) |
| `set_label` | TEXT | nullable | What this image of the set tried, such as "Weight -2" |

An edited copy keeps its original's `prompt`, `negative_prompt`, `seed`, `steps`, `guidance`, `model`, `character_id`, `sensitive`, `addons`, `prompt_spec` and `strengths`, and is saved with `image_checked = 1`. It does not keep `set_id` or `set_label`.

**Sensitive flag** (`sensitive`, `image_checked`):

1. On save, `sensitive` is 1 if the image classifier found nudity; otherwise it comes from the prompt's words (`is_sensitive` in `backend/sensitive.py`). `image_checked` is 1 when the classifier gave an answer (it gives none while not loaded yet).
2. On start, `mark_unchecked_images` sets `sensitive` from the prompt for rows where it is null (rows from before the column existed).
3. A background thread (`check_unchecked_images` in `main.py`) checks rows with `image_checked = 0`, 20 at a time, oldest first. `record_image_check` only ever raises the flag (`MAX(sensitive, ?)`), and only on rows still unchecked.
4. `PUT /api/history/{id}/sensitive` sets the flag and `image_checked = 1`, so the background check never changes a value set by hand.

### `characters`

| Column | Type | Null / default | Meaning and writer |
|---|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | | |
| `name` | TEXT | NOT NULL, UNIQUE, `COLLATE NOCASE` | 1 to 40 characters, unique ignoring case. A clash raises `DuplicateName` (`409`). |
| `traits` | TEXT | NOT NULL | JSON of `CharacterTraits` (the builder's identity choices and slider `strengths`) |
| `cover_id` | INTEGER | nullable | The chosen cover image. If it no longer exists, reads fall back to the newest image with this `character_id`. |
| `seed` | INTEGER | nullable | A saved seed |
| `created_at` | TIMESTAMP | `CURRENT_TIMESTAMP` | UTC |
| `face_id` | INTEGER | nullable (added later) | The History image whose face SDXL renders keep. Reads return null once that image is gone. |
| `face_strength` | REAL | NOT NULL, default 0.6 (added later) | Face lock strength, 0.1 to 1.0 |
| `face_upload` | BLOB | nullable (added later) | An uploaded face photo, stored as PNG at most 1024 px per side. A character with one has every image kept safe for work. Setting `face_id` clears it, and the other way round. |

Read-only values in the `Character` response are worked out by subqueries in `character_store.SELECT`: `image_count`, `cover_sensitive`, `face_sensitive` and `face_uploaded`. Deleting a character sets `images.character_id` to null for its images, then deletes the row.

### `app_state`

| Column | Type | Meaning |
|---|---|---|
| `key` | TEXT PRIMARY KEY | The name of a one-time step |
| `value` | TEXT NOT NULL | Currently always `'1'` |

The only key so far is `sample_characters_added`: `add_samples_once` adds the characters in `sample_characters.json` once per database (`INSERT OR IGNORE`, so a taken name is skipped), then records the key. Deleted samples do not come back.

### `chat_conversations`

Written by `backend/chat_store.py`.

| Column | Type | Null / default | Meaning |
|---|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | | Sent to the browser as `X-Chat-Conversation-Id` |
| `title` | TEXT | nullable | Written once by a background thread after the first complete answer (`title_conversation`, best effort): the model's first line, quotes stripped, at most 80 characters. Only set while still null. |
| `created_at` | TIMESTAMP | `CURRENT_TIMESTAMP` | UTC |

### `chat_exchanges`

One question and its answer. Index `chat_exchanges_by_conversation` on `conversation_id`.

| Column | Type | Null / default | Meaning |
|---|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | | Sent as `X-Chat-Exchange-Id` |
| `conversation_id` | INTEGER | NOT NULL, references `chat_conversations(id)` | |
| `parent_id` | INTEGER | nullable, references `chat_exchanges(id)` | The exchange this one follows; null for a first question or an edit of it. Must be in the same conversation (`check_parent`). |
| `question` | TEXT | NOT NULL | The last user message, saved before the answer streams |
| `answer` | TEXT | NOT NULL, default `''` | The full answer, or the part received before it failed or stopped |
| `created_at` | TIMESTAMP | `CURRENT_TIMESTAMP` | UTC |
| `first_words_ms` | INTEGER | nullable | Time to the first piece of the answer |
| `total_ms` | INTEGER | nullable | Total time |
| `provider` | TEXT | NOT NULL | `grok` or `ollama` |
| `model` | TEXT | NOT NULL | The provider's model name |
| `system_prompt_id` | TEXT | NOT NULL | First 12 hex characters of the SHA-256 of the system prompt, so answers from before and after a prompt change can be told apart |
| `status` | TEXT | NOT NULL | `streaming` while it runs, then `complete`, `failed`, `stopped` (the browser left) or `refused` (Laya refused it, so the chat model was never asked) |
| `error` | TEXT | nullable | The reason for a failure, never the conversation or a key |
| `sensitive` | INTEGER | NOT NULL, default 0 | From the question and answer's words, set when the exchange ends |
| `history_id` | INTEGER | nullable | The first image generated from this answer (`chat_exchange_id` on `POST /api/generate`) |

**Append-only rule.** An exchange is inserted when its question is sent and completed once: `chat_store.finish` updates only rows still `streaming`, and `link_image` only sets `history_id` while it is null. Editing a question never changes the old row; it adds a new exchange whose `parent_id` is the exchange before it, so both branches are kept.

### `decision_tasks`

Laya's decisions on chat questions, written by `backend/decision_store.py` from `check_question` in `main.py`. `POST /api/decide` saves nothing here.

| Column | Type | Null / default | Meaning |
|---|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | | |
| `trace_id` | TEXT | NOT NULL, UNIQUE | The task's trace id (a UUID), also in the log lines and the `X-Decision-Trace-Id` header |
| `task` | TEXT | NOT NULL | The task name, such as `nudity` (`backend/decision_tasks.py`) |
| `task_version` | TEXT | NOT NULL | 12 hex characters fingerprinting the task's questions and thresholds, so results from before and after a change can be told apart |
| `chat_exchange_id` | INTEGER | NOT NULL, references `chat_exchanges(id)` | The question it decided on. The question text stays in `chat_exchanges`. |
| `outcome` | TEXT | NOT NULL | `pass`, `refuse` or `error` |
| `answers` | TEXT | NOT NULL | JSON of each question's probability, such as `{"nudity": 0.04}`; `{}` for an error |
| `decide_ms` | INTEGER | nullable | How long Laya took to answer; null for an error |
| `created_at` | TIMESTAMP | `CURRENT_TIMESTAMP` | UTC |

## How tables link

```
characters.id      ◀── images.character_id        (cleared when the character is deleted)
images.id          ◀── characters.cover_id, characters.face_id
images.id          ◀── images.edited_from, images.varied_from, images.face_from
images.set_id          groups an A/B test's images (no table of its own)
images.id          ◀── chat_exchanges.history_id
chat_conversations.id ◀── chat_exchanges.conversation_id
chat_exchanges.id  ◀── chat_exchanges.parent_id
chat_exchanges.id  ◀── decision_tasks.chat_exchange_id
```

None of these are enforced, and deleting an image clears none of them. `edited_from`, `varied_from`, `face_from`, `cover_id`, `face_id` and `history_id` can point at an image that no longer exists. Character reads hide this (the cover and face subqueries check the image exists); for the image columns, callers must expect a missing image.

## Upgrading older databases

`init_db` runs `CREATE TABLE IF NOT EXISTS` for every table, then `add_missing_columns(conn, table, columns)`: it reads `PRAGMA table_info` and runs `ALTER TABLE ... ADD COLUMN` for each column in the map that is missing. `ADDED_COLUMNS` covers `images` and `ADDED_CHARACTER_COLUMNS` covers `characters`; each definition's default is what existing rows get. The chat and decision tables have no such map yet: they were created with all their columns, so a new column for them needs one.

To add a column: add it to the right map with a comment, to `COLUMNS`, `Row`, `to_item` and `HistoryItem` (for `images`), and to the insert in `add`. Columns are never removed or renamed.

Two data steps also run on each start: `mark_unchecked_images` and `move_to_base_models` (both above).

## Image storage

`backend/image_codec.py`:

- New images are stored as **lossless WebP** (`encode_for_storage`, method 4, `exact=True`), about 30% smaller than PNG with the same pixels. Fully opaque alpha is dropped; real transparency is kept.
- The PNG is kept instead when the WebP is not smaller, when decoding the WebP does not give identical pixels, or when the image is deeper than 8 bits per channel.
- No column records the format: `is_webp` looks at the first bytes (`RIFF....WEBP`). Rows saved before WebP are PNG.
- `history_store.image_png` always hands out PNG (`to_png`), used for downloads, the export, edits, start images, face images and the classifier. `stored_image` returns the bytes as stored, used by `GET /api/history/{id}/image`.

### `backend/tools/recompress_history.py`

Converts older PNG rows to WebP.

```bash
uv run python backend/tools/recompress_history.py --dry-run   # count the PNG rows
uv run python backend/tools/recompress_history.py             # convert them
```

- Stop the web app first, so nothing writes meanwhile.
- It finds PNG rows by their first bytes (`png_image_ids`), takes a consistent copy to `history.db.bak` first (`--no-backup` skips it), converts each row on its own (`store_as_webp`, pixel-checked, PNG kept when WebP is not better), then runs `VACUUM`.
- `--limit N` converts at most N rows. Stopping and running again is safe.

## Cleanup and what it leaves

| Action | Deletes | Leaves |
|---|---|---|
| `DELETE /api/history/{id}` | That image row | Everything that points at it (see above). No `VACUUM`. |
| `DELETE /api/history/older-than/{days}` (7, 30, 90) | Images with `created_at < now − days` and `favourite = 0`, then `VACUUM` | Favourites, characters, chats, decisions |
| `DELETE /api/history` | Every image, favourites included, then `VACUUM` | Characters (their cover and face fall back to null), `app_state`, chats and decisions |

Clearing History leaves chats alone; they will get their own controls. `VACUUM` rebuilds the file, since SQLite otherwise keeps the space of deleted rows. `GET /api/history/summary` reports the file size from disk.
