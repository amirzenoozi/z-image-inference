# Chat

The chat turns a plain description into a detailed image prompt, written by Grok (xAI) or by a local model through Ollama. Every question and answer is saved in `history.db`, and the image made right after an answer is linked to it.

## Overview

| Part | File |
|------|------|
| Providers, streaming, errors | `backend/chat_client.py` |
| System prompts | `backend/system_prompts.py` |
| Endpoint, saving the reply, titles, logging | `backend/main.py` (`chat`, `saved_reply`, `record_reply`, `title_conversation`) |
| Saved chats | `backend/chat_store.py`, tables in `backend/history_store.py` |
| Nudity check while locked | `check_question` in `backend/main.py`; see [safety.md](safety.md) and [decision-model.md](decision-model.md) |
| UI | `frontend/src/pages/create/SettingsPanel/components/ChatPanel/`, `streamChat` in `frontend/src/api/index.ts`, types in `frontend/src/types/index.ts` |

## Providers (`backend/chat_client.py`)

`CHAT_PROVIDER` in `.env` picks the provider: `grok` (the default) or `ollama`. Any other value logs a warning (`CHAT_PROVIDER=... is not grok or ollama; chat is off.`) and turns the chat off.

Both clients follow the `ChatClient` protocol: `name` (shown in the app), `provider` and `model` (saved with each exchange), `system_prompt`, `available`, and `chat_stream(messages, system_prompt)`, which yields the reply in pieces.

### `GrokClient`

- Model `grok-4-1-fast-non-reasoning`, through the OpenAI SDK at `https://api.x.ai/v1`, streamed.
- Available when `XAI_API_KEY` is set.
- An `openai.OpenAIError` becomes a `ChatError` whose reason is the error's type name.

### `OllamaClient`

- Settings: `OLLAMA_MODEL` (required; empty means not available), `OLLAMA_URL` (default `http://127.0.0.1:11434`), `OLLAMA_KEEP_ALIVE` (default `2m`).
- `name` is the model's name, or `Ollama` until one is set.
- It posts to Ollama's **native** `/api/chat` with `stream: true` and `keep_alive`, and reads one JSON object per line (`piece_of`).
- **Why the native API:** only it takes `keep_alive`, which makes Ollama unload the model after that idle time, so it holds no memory between chats. The OpenAI-compatible endpoint has no such field.
- `keep_alive_value`: Ollama reads a bare number as seconds but a string only with a unit, so `0` and `300` are sent as numbers and `2m` or `30s` as strings. `0` unloads at once.
- Timeouts: 5 s to connect, 120 s for the first words (the model may be loading).
- Errors: connection refused gives `ollamaNotRunning` (reason `Ollama is not running`); a 404 gives `ollamaModelMissing` (reason `model not downloaded`); another bad status gives reason `status <code>`; an `error` inside the stream gives reason `error in the stream`.

### `ChatError` and `ready_chat`

- `ChatError(message, reason)`: the message is shown to the user; the reason is logged and saved, and never contains the conversation or a key.
- `chat_client()` builds the client `CHAT_PROVIDER` picks. `ready_chat()` returns it only when `available`, else `None`. It is the one check shared by the catalog (`chat_available`, plus `chat_name` from `chat_client()`) and `POST /api/chat` (503 `chatUnavailable` when `None`).

## System prompts (`backend/system_prompts.py`)

| Constant | Used for | Shape |
|----------|----------|-------|
| `GROK` | Grok's chats | Long and demanding: a "visionary artist" persona with a strict workflow (lock in the core elements, reason out a solution when needed, add aesthetic detail, quote every text element), ending with `User prompt: ` |
| `OLLAMA` | the local model's chats | Seven short, direct lines: one detailed visual description, keep every subject and detail, add composition and lighting, text only when asked and in double quotes, output only the prompt |
| `TITLE` | a new conversation's title, for either provider | "Write a short title, at most six words, for this image idea. Output only the title: no quotes, no full stop, nothing else." |

**Why the local prompt is short:** a small local model copies a long prompt's steps into its answer (for example "Quantity: one. Generate reasoning: ..."), and that answer then became the image prompt. A short, direct prompt avoids it. Grok follows the long one well.

Each exchange records which system prompt it used as `system_prompt_id`: the first 12 hex characters of the prompt's SHA-256 (`chat_store.system_prompt_id`).

## The endpoint (`POST /api/chat`)

Request (`ChatRequest` in `backend/main.py`):

| Field | Rule |
|-------|------|
| `messages` | 1 to 50 messages, each `role` `user` or `assistant` and `content` of 1 to 4000 characters; the last must be from the user |
| `conversation_id` | the saved conversation this continues, or `null` to start one |
| `parent_id` | the exchange this follows (the last answer, or the one before an edited question), or `null` |
| `safe_only` | the browser's adult lock is on; turns on the Laya check |

Steps:

1. `ready_chat()`, or 503.
2. If adult content is locked and Laya is on: `decision_model.runner.preload()`.
3. `start_exchange` saves the question (`chat_store.start`) with status `streaming`. An unknown conversation or a parent from another conversation is a 422.
4. If locked: `check_question`, which can end the exchange as `refused` (422) or `failed` (503). See [safety.md](safety.md).
5. Logs `Chat with <name>: <n> message(s), exchange #<id> in conversation #<id>`.
6. Pulls the first piece **before** answering, so a stopped Ollama, a missing model or a bad key becomes a proper 502 (the exchange is saved as `failed`).
7. Returns a `StreamingResponse` of plain text (`text/plain; charset=utf-8`) with headers `X-Chat-Conversation-Id` and `X-Chat-Exchange-Id`.

### `saved_reply` and `record_reply`

`saved_reply` passes each piece on as it comes and keeps them. When the stream ends it builds an `Outcome`:

- `complete`: the whole answer, the time to the first words and the total.
- `failed`: a `ChatError` mid-stream; the part that arrived is kept, with the reason.
- `stopped`: the browser left before the end (the generator was closed); the part that arrived is kept.

`record_reply` saves the outcome (`chat_store.finish`) and logs it: `Chat with <name> answered <n> characters in <s>s (first words after <s>s)`, or a warning `Chat with <name> <status> after <n> characters (<reason or "the browser left">)`. The text itself is never logged. A complete answer in a new conversation starts the title (below).

## Saved chats (`backend/chat_store.py`)

Two tables in `history.db`, created in `backend/history_store.py`:

- `chat_conversations`: `id`, `title` (nullable), `created_at`.
- `chat_exchanges`: `id`, `conversation_id`, `parent_id`, `question`, `answer`, `created_at`, `first_words_ms`, `total_ms`, `provider`, `model`, `system_prompt_id`, `status`, `error`, `sensitive`, `history_id`. Indexed by `conversation_id`.

Decisions Laya made on a question are in `decision_tasks`, linked by `chat_exchange_id` ([decision-model.md](decision-model.md)).

### Statuses

| Status | Meaning |
|--------|---------|
| `streaming` | saved when the question is sent; the answer has not ended |
| `complete` | the whole answer arrived |
| `failed` | the chat failed (before or during the answer), or the Laya check could not run |
| `stopped` | the browser left before the end; the part that arrived is kept |
| `refused` | a decision task refused the question, so the chat model was never asked |

### Append-only, with branches

- `start` creates the exchange before the answer streams, so it has an id to send back.
- `finish` completes it once: its `UPDATE` only applies `WHERE status = 'streaming'`, so an ended exchange never changes. It also sets `sensitive` from the question and answer words (`is_sensitive`, see [safety.md](safety.md)).
- Editing an earlier question sends a new question whose `parent_id` is the exchange before it. Both branches are kept. `check_parent` refuses a parent from another conversation.
- `conversation(id)` returns a conversation with every exchange, oldest first, branches included. Today only the tests read saved chats: no endpoint lists or reopens them yet, and clearing History leaves them alone.

### Titles

After the first complete answer in a new conversation, `start_titling` runs `title_conversation` in a daemon thread (`chat-title`), so the chat never waits. It asks the same chat client with `system_prompts.TITLE` and the first question. `set_title` keeps the first line, strips quotes, `*` and `#`, cuts it to 80 characters, and sets it only while the title is still empty. Any failure is logged as `Could not title conversation #<id> (<reason>)` and leaves it untitled (best effort).

### Image links

The image made right after an answer is linked to that exchange:

- The browser sends `chat_exchange_id` with that one render (`POST /api/generate`).
- `check_chat_answer` refuses an id that is not saved (422, a stale tab or a made-up id).
- After saving, `chat_store.link_image` sets `chat_exchanges.history_id`; the first image made stays linked.

## The UI

- **`ChatPanel`** (`frontend/src/pages/create/SettingsPanel/components/ChatPanel/index.tsx`): the Chat tab in Create's settings. It shows a note with the model's name (`chat_name` from the catalog), the messages, a text box (Mod+Enter sends), and Clear chat. Sending waits while an image is generating. An error shows with a retry. A user message can be edited, which sends the conversation up to it with the new text ("Save & regenerate").
- **`parentOf`** picks the last saved answer before the new question, so an edit starts a new branch.
- **`streamChat(turn, onText, signal)`** (`frontend/src/api/index.ts`) posts the `ChatTurn` (`messages`, `conversationId`, `parentId`, `safeOnly`) and reads the body with a stream reader, calling `onText` with the text so far. It resolves with a `ChatReply` (`text`, `conversationId`, `exchangeId`) read from the headers.
- `safeOnly` is `!adultShown` (the browser's adult lock, see [safety.md](safety.md)).
- When an answer is complete, `onPromptReady` hands it to `App` (`onChatPrompt` in `frontend/src/App/index.tsx`), which puts it in the prompt box as text (`lookIncluded: null`, so the character's look is added) and **generates at once** with the `RunLink` `{ chatExchangeId }`.
- **`RunLink`** (`frontend/src/types/index.ts`) is `Pick<SentSettings, 'testSet' | 'chatExchangeId'>`: what one render is part of, sent with that render only and never kept in the settings. The A/B test uses the same type for its set.

## The installed local model

`.env.example` gives `hf.co/mlabonne/gemma-3-4b-it-abliterated-GGUF:Q4_K_M` as the example `OLLAMA_MODEL`: an uncensored (abliterated) Gemma 3 4B, 4-bit GGUF, about 2.7 GB while loaded. `ollama list` on this Mac shows that model installed (2.5 GB on disk). The project picks uncensored builds of chat models, since stock builds refuse or soften prompts; the app's own safeguards stay in force.

Set-up, from `.env.example`: `brew install ollama && brew services start ollama`, then `ollama pull <model>`, set `CHAT_PROVIDER=ollama` and `OLLAMA_MODEL`, and restart both servers. Memory and speed are in [performance.md](performance.md).

## Tests

- `backend/tests/test_chat_client.py`: streaming, `keep_alive` values, Ollama not running, model missing, errors in the stream, Grok's system prompt, provider choice.
- `backend/tests/test_chat_store.py`: conversations, follow-ups, branches, finished exchanges never change, foreign ids, titles, image links, the sensitive flag.
- `backend/tests/test_web_app.py`: the endpoint, saved ids in headers, failed and stopped replies, titles, image links, the Laya check, and that logs hold no chat text.
- `frontend/src/pages/create/SettingsPanel/components/ChatPanel/index.test.tsx`: the panel.
