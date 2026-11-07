# Knowledge

Everything about this project, one area per file. Start with the overview, then open the file for the area you are working on; together they replace reading the whole codebase.

## Start here

| File | Covers |
|---|---|
| [overview.md](overview.md) | What the app is, the two servers and the helper processes, where data lives, and the main flows step by step |
| [decisions.md](decisions.md) | The design decisions and why they were made; read before changing one |
| [configuration.md](configuration.md) | Setup, and every `.env` variable with its default and valid values |

## Areas

| File | Covers |
|---|---|
| [models.md](models.md) | The image models and add-ons: engines, downloads, compression, Z-Image-Turbo's levels |
| [api.md](api.md) | Every endpoint of the web app (and the model server's internal ones): requests, responses, headers, errors |
| [database.md](database.md) | Every table and column in `history.db`, how they link, and how older databases are upgraded |
| [prompt-builder.md](prompt-builder.md) | Purposes, rules and content levels, the JSON prompt, clashes, Random and Surprise me, custom clothes, look sliders |
| [frontend.md](frontend.md) | The UI's structure and conventions: pages, shared components, lazy loading, phones first, dialogs, the A/B test, History |
| [chat.md](chat.md) | The chat: Grok or a local model through Ollama, system prompts, saved conversations, titles and image links |
| [decision-model.md](decision-model.md) | Laya, the small decision model: its process, tasks, thresholds, trace ids, `/api/decide`, calibration and the planned safety classifier |
| [safety.md](safety.md) | The adult-content locks, safe-for-work renders, sensitive images, minors, uploaded faces, the Laya check, and known gaps |
| [translations.md](translations.md) | Languages, the i18n functions, locale files and their rules |
| [logging.md](logging.md) | Log files and levels, what is and is not logged, trace ids, and monitoring resource use |
| [performance.md](performance.md) | Render times, memory and disk use, including the chat model and Laya |

## Working on the project

| File | Covers |
|---|---|
| [usage.md](usage.md) | The user guide: what each feature does from the user's side |
| [development.md](development.md) | Running in development, tests, git hooks, commit and code rules, the project layout |
| [troubleshooting.md](troubleshooting.md) | Common problems and their fixes |
| [roadmap.md](roadmap.md) | Ideas not built yet and open findings, with priorities |

## Keeping it current

- A change that alters how an area works updates that area's file in the same change, the way translations ship with the code that uses them.
- Check facts against the code, and name files with their paths (`backend/chat_store.py`), so a reader can follow them.
- A new decision worth explaining goes in [decisions.md](decisions.md); a finding not fixed goes in [roadmap.md](roadmap.md), and leaves it when done.
- `CLAUDE.md` at the project root holds the rules and a map to these files; the detail lives here.
- UK English, no em dashes, short plain sentences.
