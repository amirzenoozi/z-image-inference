# Development

## First setup

`make setup` runs `scripts/setup.sh`. It checks for Apple Silicon, Homebrew, git, uv and Node.js 20 or newer, installs gitleaks, turns on the git hooks (`git config core.hooksPath .githooks`), creates `.env` from `.env.example` once, then runs `uv sync` and builds the UI. It is safe to run again: each step skips what is already done. Every `.env` variable is described in [configuration.md](configuration.md).

## Running in development

Run the two servers as usual, then the UI with live reload:

```bash
uv run python backend/model_server.py
uv run python backend/main.py
cd frontend && npm run dev
```

Open the address Vite prints; it forwards `/api` to `main.py`. After changing the UI for normal use, rebuild it with `cd frontend && npm run build`; `main.py` serves `frontend/dist`.

`make model-server`, `make app` and `make dev` run the same three commands (`make help` lists every target). The `Makefile` stays a thin wrapper: each target is one command from `CLAUDE.md`, with no logic of its own.

For the optional helpers: the local chat needs Ollama running (`brew services start ollama`) with the model in `OLLAMA_MODEL` pulled; Laya downloads itself into `models/laya/` on the first locked chat question. See [chat.md](chat.md) and [decision-model.md](decision-model.md).

## Checks

```bash
uv run pytest                                 # backend tests
cd frontend && npm test                       # frontend tests (Vitest)
cd frontend && npx tsc -b && npx oxlint src   # type check and lint
```

`make test`, `make lint` and `make check` (lint and tests, to run before a pull request) run them.

The backend tests use fake models, a fake Laya and a fake chat, so they run in seconds without any model downloaded; `backend/tests/conftest.py` turns the real image check off.

## Scripted renders

`make render FILE=list.json` renders a list of JSON prompts through the running web app, one at a time, into `~/Pictures/z-image/` (`DRY_RUN=1` only prints them). It goes through `frontend/scripts/render.mjs` and `frontend/scripts/renderSpecs.ts`, which build each request the same way as Create's Generate. Render by script only this way, never by posting hand-written text.

## Project layout

```
z-image-inference/
├── backend/                   # All the Python code
│   ├── paths.py               # Where the data lives: the project folder above backend/
│   ├── main.py                # Web app: serves the UI and the /api endpoints
│   ├── model_server.py        # Loads the models and generates images
│   ├── model_catalog.py       # The six models and their add-ons, shared by both servers
│   ├── generation_request.py  # Request checks shared by both servers
│   ├── resolutions.py         # Resolution presets and their categories
│   ├── prompt_spec.py         # Checks the shape of the JSON prompt saved in History
│   ├── history_store.py       # History database
│   ├── image_codec.py         # Lossless WebP storage of History images
│   ├── character_store.py     # Characters, kept in the History database
│   ├── custom_clothes.py      # Reads custom_clothes.json
│   ├── history_export.py      # History zip export
│   ├── image_edits.py         # Rotate, flip and crop, applied with Pillow
│   ├── palette.py             # Colour palette of an image
│   ├── prompt_weights.py      # Rewrites (tag:1.3) weights for Compel
│   ├── adult_content.py       # The ADULT_CONTENT lock
│   ├── sensitive.py           # Which prompts mark an image as sensitive (blurred in lists)
│   ├── nsfw_detector.py       # The CPU image classifier that checks each image for nudity
│   ├── safe_for_work.py       # The safe-for-work rules (uploaded faces, locked adult content)
│   ├── moss_pipeline.py       # Vendored MOSS-Image pipeline (Apache 2.0)
│   ├── chat_client.py         # The chat: Ollama (local) or xAI Grok, streamed
│   ├── chat_store.py          # Saved chats: conversations and exchanges in history.db
│   ├── system_prompts.py      # The chat's system prompts, one per provider, and the title prompt
│   ├── decision_model.py      # Laya: downloads it, runs it in a child process, one task at a time
│   ├── decision_tasks.py      # Laya's tasks (the nudity check) and their thresholds
│   ├── decision_store.py      # Laya's saved decisions on chat questions
│   ├── laya_worker.py         # Laya's child process: JSON lines over stdin and stdout
│   ├── log_setup.py           # One log setup for both servers: terminal and logs/<server>.log
│   ├── i18n.py, locales/      # The backend's messages, per language
│   ├── tests/                 # Backend tests (pytest)
│   └── tools/                 # recompress_history.py, z_image_levels.py
├── frontend/                  # React, TypeScript and Tailwind UI (Vite)
│   ├── scripts/               # render.mjs and renderSpecs.ts, for make render
│   └── src/
│       ├── App/               # The app shell: views, generation, A/B test, language gate
│       ├── api/               # The API client
│       ├── pages/             # One folder per page, with the components only it uses
│       │   ├── create/        # CreatePage: settings, prompt, chat, models, the result
│       │   ├── history/       # HistoryPage: filters, grid, the image viewer and editor
│       │   └── characters/    # CharactersPage: the cards and the character editor
│       ├── shared/            # Used by more than one page, by topic (ui/, form/, images/,
│       │                      #   characters/, promptBuilder/, lookSliders/, abTest/, adultContent/, models/)
│       ├── lib/               # Logic: settings, prompt builder, look sliders, A/B test, edits
│       ├── i18n/, locales/    # Translations
│       ├── types/             # Shared TypeScript types
│       └── test/              # Shared test fixtures
├── knowledge/                 # The project's knowledge: one file per area (README.md is the index)
├── scripts/setup.sh           # First-time setup, run by make setup
├── .githooks/                 # Branch-name and secret checks on commit and push
├── Makefile                   # Thin wrapper over the commands in CLAUDE.md
├── example_prompts.json       # Each model's example prompts
├── prompt_modes.json          # The prompt builder's purposes
├── custom_clothes.json        # Your own clothes for the prompt builder
├── sample_characters.json     # The characters a new database starts with
├── .env.example               # The settings template; make setup copies it to .env
├── models/                    # Downloaded models (not in git)
├── logs/                      # model_server.log and web_app.log (not in git)
└── history.db                 # Images, characters, chats and decisions (not in git)
```

How the frontend is organised (one folder per module, `components/` for a component used by only one other): [frontend.md](frontend.md).

## Git hooks

`make setup` (or `make hooks`) points git at `.githooks/`:

- **pre-commit**: checks the branch name, then the staged changes for secrets.
- **pre-push**: checks the branch name of each pushed branch, and the pushed commits for secrets.
- **post-checkout**: reports the checks for the branch you switched to; it cannot block.

Branch names must be `main`, `feature/<name>`, `bug/<name>`, `docs/<name>` or `test/<name>`. The secret check runs gitleaks (when installed) and also looks for every value from your local `.env` (8 characters or longer, except plain settings such as `APP_LANGUAGE`) in the added lines.

## Rules for contributors

**Commits**

- Format: `<type>(<scope>): <description>`, with a lower-case type that is exactly one of `feat`, `docs`, `fix`, `test` or `chore`, and a space after the colon. The scope names the area changed (`chat`, `decision`, `knowledge`); leave it out (`<type>: <description>`) only when no single area fits. Example: `docs(knowledge): rename docs to knowledge and update links`.
- Group commits by context: when many files change, split them into several commits, each one related set of changes.
- Translations (`backend/locales/`, `frontend/src/locales/`) go in their own commit with the scope `i18n`, before the code that uses the new keys, so every commit still builds and shows the right text. Example: `chore(i18n): add the safety check and decision endpoint messages`.
- Never commit a secret, not even a local or dev-only one: read it from `.env` and use an empty placeholder in templates.

**Code health**

- Keep each function small: at most about 9 branches, about 100 lines, 4 parameters, one level of nested `if`, and no condition with more than two `&&`/`||` (or `and`/`or`) parts; give a longer condition a name. Group values that travel together into a named type.
- A new branch in an existing function goes into a small named helper, so the function gets no more complex.
- Give everything a type: type hints in Python, explicit TypeScript types for props and API responses, no `any` or `Any`.
- Keep comments rare: explain why, not what.
- Before a pull request, run `make check`, and the project's code-health tool on the changed files if one is installed (none is set up in the repo).

**Project rules**

`CLAUDE.md` at the root lists the conventions the code follows (dialogs, icons, phone layout, one shared control per setting) and the rules to keep (the prompt builder's adult-only checks, one model loaded at a time, every new text in all seven languages, logs without prompt text). Read it before a change. Design decisions and their reasons are in [decisions.md](decisions.md).
