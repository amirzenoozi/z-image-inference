# Development

## Running in development

Run the two servers as usual, then the UI with live reload:

```bash
uv run python backend/model_server.py
uv run python backend/main.py
cd frontend && npm run dev
```

Open the address Vite prints; it forwards `/api` to `main.py`. After changing the UI for normal use, rebuild it with `cd frontend && npm run build`; `main.py` serves `frontend/dist`.

`make model-server`, `make app` and `make dev` run the same three commands (`make help` lists every target).

## Checks

```bash
uv run pytest                                 # backend tests
cd frontend && npm test                       # frontend tests (Vitest)
cd frontend && npx tsc -b && npx oxlint src   # type check and lint
```

`make test`, `make lint` and `make check` (lint and tests) run them.

The backend tests use fake models, so they run in seconds without any model downloaded.

## Project layout

```
z-image-inference/
├── backend/                   # All the Python code
│   ├── paths.py               # Where the data lives: the project folder above backend/
│   ├── main.py                # Web app: serves the UI and the /api endpoints
│   ├── model_server.py        # Loads the models and generates images
│   ├── model_catalog.py       # The five models and their defaults, shared by both servers
│   ├── generation_request.py  # Request checks shared by both servers
│   ├── resolutions.py         # Resolution presets and their categories
│   ├── history_store.py       # History database
│   ├── character_store.py     # Characters, kept in the History database
│   ├── history_export.py      # History zip export
│   ├── image_edits.py         # Rotate, flip and crop, applied with Pillow
│   ├── palette.py             # Colour palette of an image
│   ├── prompt_weights.py      # Rewrites (tag:1.3) weights for Compel
│   ├── sensitive.py           # Which prompts mark an image as sensitive (blurred in lists)
│   ├── nsfw_detector.py       # The image classifier that checks each image for nudity
│   ├── safe_for_work.py       # The rules for characters with an uploaded face photo
│   ├── moss_pipeline.py       # Vendored MOSS-Image pipeline (Apache 2.0)
│   ├── grok_client.py         # xAI Grok client
│   ├── tests/                 # Backend tests
│   └── tools/                 # Z-Image-Turbo compression level comparison
├── example_prompts.json       # Each model's example prompts
├── sample_characters.json     # The characters a new database starts with
├── prompt_modes.json          # The prompt builder's purposes
├── frontend/                  # React, TypeScript and Tailwind UI (Vite)
│   └── src/
│       ├── pages/             # One folder per page, with the components only it uses
│       │   ├── create/        # CreatePage: settings, prompt, models (models/), the result
│       │   ├── history/       # HistoryPage: filters, grid, and the image viewer and editor (viewer/)
│       │   └── characters/    # CharactersPage: the cards, and the character editor
│       ├── shared/            # Used by more than one page
│       │   ├── ui/            # Modal, IconButton, tooltips, Pagination, Section, Spinner …
│       │   ├── form/          # Field components
│       │   ├── images/        # SensitiveImage, ImageFacts
│       │   ├── characters/    # CharactersProvider
│       │   └── promptBuilder/ # The prompt builder dialog and its steps
│       ├── i18n/, locales/    # Translations
│       └── lib/               # Logic: settings, API client, prompt builder, edits
├── docs/                      # This documentation
├── models/                    # Downloaded models (not in git)
└── history.db                 # Generated images (not in git)
```

`CLAUDE.md` describes the conventions the code follows, such as how dialogs, icons and icon buttons are built, and the rules to keep, such as the prompt builder's adult-only checks.
