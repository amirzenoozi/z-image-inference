# Configuration

This file covers first-time setup and every setting in `.env`, the file of local settings at the project root. For each variable it gives the meaning, default, valid values, which server reads it, when a change takes effect, and what depends on it.

## Setup

### Requirements

- A Mac with Apple Silicon (M1 or later). The code assumes MPS and MLX and does not run usefully elsewhere.
- Homebrew, git, [uv](https://docs.astral.sh/uv/) and Node.js 20 or newer.
- Python 3.12 or newer (`requires-python` in `pyproject.toml`, `.python-version` says 3.12). `uv sync` fetches it if needed; setup does not check it separately.
- Disk space: Z-Image-Turbo alone is about 33 GB on the first model server start. See [models.md](models.md) and [performance.md](performance.md).

### `make setup`

`make setup` runs `scripts/setup.sh`. It stops with a message at the first failed check, and is safe to run again: each step skips what is already done.

1. **Checks** that the machine is `Darwin` on `arm64`, and that `brew`, `git`, `uv` and `node` are installed, with Node.js 20 or newer (`MIN_NODE_MAJOR`). Each failure says how to install the missing tool.
2. **Installs gitleaks** with Homebrew if missing.
3. **Turns on the git hooks:** `git config core.hooksPath .githooks`. The hooks check branch names (`main`, `feature/*`, `bug/*`, `docs/*`, `test/*`) on commit and push, and scan for secrets (`.githooks/check-secrets`: gitleaks, plus every value of the local `.env` of 8 characters or more, except the plain settings listed in the script).
4. **Creates `.env`** by copying `.env.example`, only if `.env` does not exist yet. An existing `.env` is never touched.
5. **Installs Python packages:** `uv sync`.
6. **Installs and builds the UI:** `cd frontend && npm ci && npm run build`, which `main.py` serves from `frontend/dist`.

It downloads no models. Then:

```bash
make model-server   # uv run python backend/model_server.py, port 8000; first start downloads Z-Image-Turbo
make app            # uv run python backend/main.py, http://127.0.0.1:7860
```

Other downloads happen on first use: the image classifier (`models/nsfw-detector/`, about 343 MB) on the web app's first start, Laya (`models/laya/`, about 800 MB) on its first task, the face lock adapter (`models/ip-adapter/`) on the first face-locked render, and other models when the user downloads them in the app.

`make hooks` turns on the git hooks and installs gitleaks on their own, for a clone that skipped setup.

## How `.env` is read

- Both servers call `load_dotenv()` at import (`backend/main.py`, `backend/model_server.py`). It finds `.env` at the project root and copies its values into the process environment **once, at start**. So every change to `.env` needs a restart of the server that reads the variable, even for variables the code reads on each use.
- `load_dotenv()` does not override variables already set in the shell. A value exported in the terminal wins over `.env`.
- An empty value counts as missing (`.env.example` says so, and the code strips and checks every value).
- `.env` and `.env.*` are git-ignored, except `.env.example`. Never commit a real key. Do not paste keys into docs, code or examples; use placeholders such as `<your-key>`.
- An unknown value usually falls back to the default with a warning in the log. The exception is `Z_IMAGE_BITS`, which stops the model server (see below).

## Variables

"Web app" is `backend/main.py` (port 7860); "model server" is `backend/model_server.py` (port 8000). "Restart" names the server(s) to restart after a change.

### Chat

| Variable | Default | Valid values | Read by | Restart |
|---|---|---|---|---|
| `CHAT_PROVIDER` | `grok` | `grok` or `ollama` (any case) | Web app (`chat_client.chat_client`) | Web app |
| `XAI_API_KEY` | empty | An xAI API key, `<your-xai-key>` | Web app (`GrokClient`) | Web app |
| `OLLAMA_MODEL` | empty | An Ollama model name, as `ollama list` shows it | Web app (`OllamaClient`) | Web app |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Ollama's base address; a trailing `/` is removed | Web app | Web app |
| `OLLAMA_KEEP_ALIVE` | `2m` | A duration with a unit (`30s`, `2m`), or a bare number of seconds (`0` unloads at once) | Web app | Web app |

- `CHAT_PROVIDER` picks who writes prompts in the chat. Any other value turns the chat off with a warning. `ready_chat()` decides what the catalog offers (`chat_available`, `chat_name`) and what `POST /api/chat` accepts, so both always agree.
- With `grok`, the chat is available only when `XAI_API_KEY` is set. It calls `https://api.x.ai/v1` with the model `grok-4-1-fast-non-reasoning` (`GROK_MODEL`). The messages leave the Mac.
- With `ollama`, the chat is available only when `OLLAMA_MODEL` is set; Ollama must be running with that model pulled (`brew install ollama && brew services start ollama`, then `ollama pull <model>`). Pick an uncensored build. A missing model or a stopped Ollama is reported when a chat starts, not at startup.
- `OLLAMA_KEEP_ALIVE` is sent with every chat. A bare number is sent as a number, since Ollama reads strings only with a unit (`keep_alive_value`).
- See [chat.md](chat.md).

### Model downloads

| Variable | Default | Valid values | Read by | Restart |
|---|---|---|---|---|
| `HF_TOKEN` | empty | A Hugging Face read token, `<your-hf-token>` | Model server (through `huggingface_hub`) | Model server |
| `CIVITAI_TOKEN` | empty | A Civitai API key, `<your-civitai-key>` | Model server (`download_problem`, `download_from_civitai`) | Model server |

- `HF_TOKEN` is needed only for FLUX.1-dev, which is gated: accept its licence on its Hugging Face page first. `download_problem` refuses the download (and that of its add-ons while FLUX.1-dev is not downloaded) with `400` when `huggingface_hub.get_token()` finds no token. `get_token()` also finds a token saved by the Hugging Face command-line login, so a token is found even with `HF_TOKEN` empty in that case. The code never reads `HF_TOKEN` itself; `huggingface_hub` does, for every download in either server.
- `CIVITAI_TOKEN` is needed for add-ons hosted on Civitai (`source="civitai"` in `backend/model_catalog.py`); without it their download is refused with `400`. It is sent as a `Bearer` header.

### App

| Variable | Default | Valid values | Read by | Restart |
|---|---|---|---|---|
| `APP_LANGUAGE` | `en` | `en`, `nl`, `it`, `fr`, `de`, `es`, `pt` | Both (`backend/i18n.py`); the UI gets it in the catalog | Both |
| `APP_HOST` | `127.0.0.1` | `127.0.0.1` (this Mac only) or `0.0.0.0` (the local network) | Web app (`uvicorn.run` in `main.py`) | Web app |
| `LOG_LEVEL` | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR` (any case) | Both (`backend/log_setup.py`) | Both |

- `APP_LANGUAGE` sets the language of the UI and of the servers' messages. An unknown code uses English with a warning. The value is cached for the life of the process. Prompts sent to the models stay English. See [translations.md](translations.md).
- `APP_HOST=0.0.0.0` lets a phone on the same Wi-Fi open `http://<the Mac's address>:7860`. The app has **no login**, so anyone on that network can use every endpoint (see [api.md](api.md)); use it only on a trusted network, or keep the default and use Tailscale (see [usage.md](usage.md)). The model server always binds to `127.0.0.1`, whatever this says.
- `LOG_LEVEL` applies to the terminal and to `logs/<server>.log` (5 MB per file, 3 old files kept). An unknown level uses `INFO` with a warning. See [logging.md](logging.md).

### Models

| Variable | Default | Valid values | Read by | Restart |
|---|---|---|---|---|
| `Z_IMAGE_BITS` | `8` | `8`, `6`, `5`, `4`, `3` or `original` | Both (`z_image_bits()` in `backend/model_catalog.py`) | Both |
| `MODEL_COMPRESSION` | `off` | `on`; anything else is off | Both (`compression_enabled()`) | Both |

- `Z_IMAGE_BITS` picks which Z-Image-Turbo copy runs. A number runs the quantised copy in `models/zimage-q<bits>/`, built once from the original on first load; `original` runs the original files, which are always kept. **An invalid value raises an error**: the model server does not start, and `GET /api/catalog` fails with `500`.
- `MODEL_COMPRESSION=on` keeps and runs smaller compressed copies of WAI-Illustrious, Anime Desire and MOSS-Image instead of their originals. It does not affect Z-Image-Turbo (set by `Z_IMAGE_BITS`), RealVisXL (already float16) or FLUX.1-dev (always 4-bit). Switching it changes which files count as downloaded (`is_downloaded`), so a model can show as missing until its other copy exists.
- The web app reads both for the sizes and speed hints in the catalog (`kept_gb`, `speed_hint`), so restart both servers after changing either. See [models.md](models.md).

### Decision model (Laya)

| Variable | Default | Valid values | Read by | Restart |
|---|---|---|---|---|
| `DECISION_MODEL` | `on` | `off`; anything else is on | Web app (`decision_model.enabled()`) | Web app |
| `DECISION_KEEP_ALIVE` | `0` | Whole seconds (digits only) | Web app (`LayaRunner._done`) | Web app |
| `DECISION_THREADS` | `8` | Whole number of CPU threads | Web app (`worker_command`) | Web app |
| `DECISION_NUDITY_REFUSE_AT` | `0.52` | A number above 0 and at most 1 | Web app (`NUDITY` in `backend/decision_tasks.py`) | Web app |

- `DECISION_MODEL=off` turns Laya off: chat questions are **not** checked while adult content is locked, and `POST /api/decide` answers `503`. With it on, a locked chat question that Laya cannot check is refused (the check fails closed).
- `DECISION_KEEP_ALIVE` is how long Laya's process stays after its last task; `0` ends it at once. A preload before a chat check keeps it at least 10 seconds (`PRELOAD_GRACE_SECONDS`). A value with a unit (`60s`) is not a whole number and falls back to `0` with a warning, unlike `OLLAMA_KEEP_ALIVE`.
- `DECISION_THREADS` is passed to Laya's child process (`backend/laya_worker.py`) for `torch.set_num_threads`. An invalid value uses 8 with a warning.
- `DECISION_NUDITY_REFUSE_AT` is the nudity probability at which a locked chat question is refused. Lower is stricter. An invalid or out-of-range value uses `0.52` with a warning. It is part of the task's `version` fingerprint saved in `decision_tasks`, so results from before and after a change can be told apart.
- See [decision-model.md](decision-model.md).

### Adult content

| Variable | Default | Valid values | Read by | Restart |
|---|---|---|---|---|
| `ADULT_CONTENT` | `off` | `on`; anything else (including empty) is off | Web app (`backend/adult_content.py`) | Web app |
| `ADULT_UNLOCK_WORD` | empty | Any word; treat it like a password, `<your-word>` | Web app | Web app |

- `ADULT_CONTENT` off: the catalog leaves out adult purposes, models and add-ons; History hides sensitive images in every list, link and export; every render is kept safe for work; chat questions are checked by Laya (when `DECISION_MODEL` is on).
- `ADULT_UNLOCK_WORD` matters only with `ADULT_CONTENT=on`. Set, each browser starts locked until the word is typed in the app (checked by `POST /api/adult-content/word`, so the word never reaches the browser), and while locked the browser sends `safe_only` and `hide_sensitive`. Empty, what `ADULT_CONTENT` allows is shown without a word. The word is never logged, and the secret check in `.githooks/check-secrets` treats it as a secret.
- See [safety.md](safety.md).

### Outside `.env`

These are environment variables the project reads that are not in `.env.example`:

| Variable | Default | Where | Meaning |
|---|---|---|---|
| `APP_URL` | `http://127.0.0.1:7860` | `frontend/scripts/renderSpecs.ts` (`make render`) | Where the render script finds the running web app. Set it in the shell, not in `.env` (the script does not load `.env`). |
| `USE_TF` | set to `0` | `backend/laya_worker.py` | Set by the code with `setdefault` in Laya's child process so the Hugging Face libraries do not load TensorFlow. Not a user setting. |

## Example `.env`

A minimal working file, with placeholders in place of secrets:

```dotenv
CHAT_PROVIDER=grok
XAI_API_KEY=<your-xai-key>
OLLAMA_MODEL=
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_KEEP_ALIVE=2m
HF_TOKEN=
CIVITAI_TOKEN=
APP_LANGUAGE=en
APP_HOST=127.0.0.1
Z_IMAGE_BITS=8
DECISION_MODEL=on
DECISION_KEEP_ALIVE=0
DECISION_THREADS=8
DECISION_NUDITY_REFUSE_AT=0.52
LOG_LEVEL=INFO
MODEL_COMPRESSION=off
ADULT_CONTENT=off
ADULT_UNLOCK_WORD=
```

When adding a variable: put it in `.env.example` with a comment, read it with a default and a warning for bad values, list it here, and add it to `plain_settings` in `.githooks/check-secrets` if it is a plain setting of 8 characters or more that is not a secret.
