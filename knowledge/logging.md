# Logging

Both servers log every line, Uvicorn's included, with a time and a level, to the terminal and to a rotating file in `logs/`. Logs record what happened (loads, renders, chats, decisions, downloads, refusals, deletes) with ids, settings and timings, and never content such as prompts, chat text, names, images or keys.

## Set-up (`backend/log_setup.py`)

`configure(server)` is called once at start-up by each server, before Uvicorn starts:

- `backend/main.py`: `log_setup.configure("web_app")`, then `uvicorn.run(app, host=APP_HOST, port=7860, log_config=None)`.
- `backend/model_server.py`: `log_setup.configure("model_server")`, then `uvicorn.run(app, host="127.0.0.1", port=8000, log_config=None)`.

`log_config=None` stops Uvicorn installing its own logging, so its lines (start-up, requests) go through the same handlers.

| Setting | Value |
|---------|-------|
| Line format | `%(asctime)s %(levelname)-7s %(name)s: %(message)s` |
| Date format | `%Y-%m-%d %H:%M:%S` (local time) |
| Handlers | the terminal (`StreamHandler`) and `logs/<server>.log` (`RotatingFileHandler`, UTF-8) |
| Rotation | 5 MB per file (`MAX_FILE_BYTES = 5_000_000`), 3 old files kept (`.1` to `.3`) |
| Level | `LOG_LEVEL` in `.env`: `DEBUG`, `INFO` (default), `WARNING` or `ERROR`, trimmed and any case |

An unknown `LOG_LEVEL` falls back to `INFO` and logs `LOG_LEVEL='<value>' is not one of DEBUG, INFO, WARNING, ERROR; using INFO.` `logs/` is created if missing and is git-ignored. A line looks like:

```
2026-11-07 14:02:11 INFO    web_app: Saved image #812: z-image-turbo, 1024x1024, 9 steps, rendered in 55.2s
```

The files are `logs/web_app.log` and `logs/model_server.log`. Follow one with `tail -f logs/web_app.log`.

Each module logs through `logging.getLogger(...)`, never `print` (the command-line tools in `backend/tools/` excepted).

## Loggers

| Logger name | Where | Process and file |
|-------------|-------|------------------|
| `web_app` | `backend/main.py` | web app, `logs/web_app.log` |
| `decision` | `backend/decision_model.py`, `backend/decision_tasks.py` | web app, `logs/web_app.log` |
| `chat_client` | `backend/chat_client.py` (`__name__`) | web app |
| `nsfw_detector` | `backend/nsfw_detector.py` | web app |
| `i18n`, `log_setup` | configuration warnings | both |
| `model_server` | `backend/model_server.py` | model server, `logs/model_server.log` |
| `uvicorn`, `uvicorn.error`, `uvicorn.access` | Uvicorn | both |

Laya's child process (`backend/laya_worker.py`) does not log through this set-up. Its stderr is inherited from the web app, so anything its libraries print shows in the web app's terminal but not in the log file.

## What each server logs

### Web app (`backend/main.py`)

| Level | Message (shape) |
|-------|-----------------|
| INFO | `Language <code>; adult content is on/off` (start) |
| INFO | `Decision model (Laya) is on` or `... is off: chat questions are not checked while adult content is locked` (start) |
| INFO | `Saved image #<id>: <model>[ + <add-on>], <w>x<h>, <n> steps, rendered in <s>s[, kept safe for work][, set <set id>]` |
| WARNING | `Render refused by the safe-for-work rules (character <id or None>)` |
| WARNING | `The model server is not running` |
| ERROR | `The model server did not answer within 900s` |
| INFO | `The model server did not render (<status>): <detail>` (409 cancelled, 422 invalid, 503 not ready) |
| ERROR | `The model server failed with status <status>` |
| WARNING | `The sensitive-image check could not start: <error>`; `Image #<id> could not be checked: <error>` |
| INFO | `Deleted image #<id>`; `Cleared History`; `Deleted <n> image(s) older than <days> days` |
| INFO | `Created character #<id>`; `Deleted character #<id>` |
| INFO | `Chat with <name>: <n> message(s), exchange #<id> in conversation #<id>` |
| WARNING | `Chat with <name> failed (<reason>)` (before the first words) |
| INFO | `Chat with <name> answered <n> characters in <s>s (first words after <s>s)` |
| WARNING | `Chat with <name> failed/stopped after <n> characters (<reason or "the browser left">)` |
| INFO / WARNING | `Titled conversation #<id>`; `Could not title conversation #<id> (<reason>)` |
| WARNING | `[<trace id>] Chat question refused by the nudity check (exchange #<id>)` |

`<name>` is the chat's display name: `Grok` or the Ollama model's name. Other modules in the web app add `CHAT_PROVIDER=... is not grok or ollama; chat is off.` (`chat_client`), `Downloading the sensitive-image check (...)...` (`nsfw_detector`) and `APP_LANGUAGE=... is not one of ...; using English.` (`i18n`).

### Decision logger (`decision`)

From `backend/decision_model.py` and `backend/decision_tasks.py`, in the web app's log:

| Level | Message (shape) |
|-------|-----------------|
| INFO | `Downloading Laya (convaiinnovations/laya) to <path>...` |
| INFO | `[<trace id or preload>] Laya loaded in <s>s` |
| INFO | `[<trace id>] <label>: <question> <value>, ... (<ms> ms)`, for example `[...] nudity: nudity 0.04 (93 ms)`; the label is the task name or `free` for `/api/decide` |
| ERROR (with traceback) | `[<trace id>] Laya could not load (<type>)`; `[<trace id>] <label>: Laya could not answer (<type>)` |
| WARNING | `Laya did not close cleanly (<type>)` |
| INFO | `Laya unloaded` |
| WARNING | `<VAR>=<value> is not a whole number; using <default>.`; `<VAR>=<value> is not a number above 0 and at most 1; using <default>.` |

Every task's lines carry its trace id, which is also returned to the caller (the `X-Decision-Trace-Id` header or the `trace_id` field) and saved in `decision_tasks`. A preload logs `[preload]`, since the task's id does not exist yet. See [decision-model.md](decision-model.md).

### Model server (`backend/model_server.py`)

| Level | Message (shape) |
|-------|-----------------|
| INFO | `Z-Image-Turbo runs <bits>-bit` or `the original files`; `model compression is on/off` (start) |
| INFO | `Downloading <label>...`; `Downloaded <label> in <s>s`; ERROR with traceback: `Downloading <label> failed` |
| INFO | `Downloading <repo> to <path>...` (each Hugging Face snapshot) |
| INFO | `Creating <target>...`; `Created <target> in <s>s` (one-time builds); `Storing <file> as float16...`; `Creating 8-bit text encoder at <path>...` |
| INFO | `Loading <label>...`; `Loaded <label> in <s>s`; `Unloaded <label>` |
| INFO | `Removed <label> from disk` |
| WARNING | `Render refused: <message>` (model or add-on not ready, face lock not ready) |
| INFO | `Job <id> cancelled` |
| INFO | `Job <id> rendered: <model>[ + <add-on>], <w>x<h>, <n> steps, <s>s` |

The job id ties a model server line to the web app's render; the web app's `Saved image #<id>` line gives the History id.

## The privacy rule

Logs never hold:

- prompt text (positive or negative), chat questions or answers, or the text given to Laya;
- character names;
- images or image data;
- API keys and tokens (`XAI_API_KEY`, `HF_TOKEN`, `CIVITAI_TOKEN`), or the unlock word.

They hold ids (image, character, exchange, conversation, job, trace), model and add-on ids, sizes, step counts, timings, character counts and error types or short reasons. `backend/log_setup.py` states the rule in its docstring, and so does `CLAUDE.md`.

How the code keeps to it:

- Safe-for-work refusals log only the character id, because the message can quote the prompt and name the character (`generate` in `backend/main.py`).
- `ChatError` carries a separate `reason` for the log (an exception type, a status code or a fixed phrase), never the conversation or a key.
- `DecisionError` carries the exception's type name; `summary` in `decision_model.py` logs each question's main value only.
- The model server's 409/422/503 detail is its message (`msg` of each validation error), not the input.

Tests that check it:

| Test | File | Checks |
|------|------|--------|
| `test_a_saved_image_is_logged_without_its_prompt` | `backend/tests/test_web_app.py` | the saved-image line, at DEBUG, without the prompt or the negative prompt |
| `test_chat_streams_the_rewritten_prompt_and_logs_it_without_its_text` | `backend/tests/test_web_app.py` | the chat lines, without the question or the answer |
| `test_the_free_endpoint_answers_without_saving` | `backend/tests/test_web_app.py` | the `/api/decide` line has the trace id, not the text |
| `test_laya_loads_for_a_task_and_unloads_right_after_by_default` | `backend/tests/test_decision_model.py` | the decision lines, without the text |
| `test_a_model_load_and_a_render_are_logged_without_the_prompt` | `backend/tests/test_jobs.py` | the model server's load and render lines, without the prompt |
| `backend/tests/test_log_setup.py` | | the file, format, level from `LOG_LEVEL`, and the fallback for an unknown level |

When adding a log line, log what happened with ids, settings and timings; if a message is built from user text or an exception's message, log its type or a fixed reason instead.

## Monitoring resource use

The model server is the heavy process: it holds the image model (up to about 12 GB for the default Z-Image-Turbo 8-bit, more for others; see [performance.md](performance.md)) and uses the GPU. The web app stays small (about 0.36 GB), Laya's process exists only during a task by default, and Ollama holds its model only until `OLLAMA_KEEP_ALIVE` runs out.

Find the processes:

```bash
pgrep -fl model_server.py      # model server
pgrep -fl backend/main.py      # web app
pgrep -fl laya_worker.py       # Laya, only while it runs
pgrep -fl ollama               # Ollama
```

| Tool | Use |
|------|-----|
| Activity Monitor | Memory and CPU per process; the GPU History window (Window menu) for GPU load. Shows the two Python servers, `laya_worker.py` while it runs, and `ollama` |
| `top -pid <pid>` | Live CPU and memory for one process (`top -pid <pid> -stats pid,command,cpu,mem`) |
| `footprint -p <pid>` | The true memory footprint, including GPU (Metal) allocations that unified memory charges to the process; the best number for the model server |
| `sudo powermetrics --samplers gpu_power -i 1000` | GPU power and activity once a second; needs `sudo` |
| `macmon` or `asitop` (optional, third-party) | A live terminal view of CPU, GPU, power and memory on Apple Silicon; install separately (for example `brew install macmon`, or `pip install asitop`, which needs `sudo`) |

The logs give the timings to set beside these: each load and render with its seconds, each chat with its time to the first words and total, and each Laya decision with its milliseconds.
