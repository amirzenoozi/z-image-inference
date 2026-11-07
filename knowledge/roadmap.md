# Roadmap and open findings

Ideas not built yet and problems found but not fixed, with a priority each. Update it when an item is done (remove it) or a new one is found.

**Priorities:** High: broken behaviour, a safety risk, or something blocking other work. Medium: a real problem or clear improvement that can wait. Low: polish.

## Safety and the decision model

| Priority | Item | Where | Why |
|---|---|---|---|
| High | Calibrate Laya: review saved decisions, mark them right or wrong, fit a calibration on them and load it with the model. The plain agent the worker loads offers `fit_temperatures` and `fit_binning`; `fit` (a small learned head) is on `VegaAgent` only, so check which fits before building | `backend/laya_worker.py`, table `decision_tasks` | Zero-shot, the nudity check separates clothed from nude prompts by a thin margin (about 0.50 against 0.52) |
| High | General safety classifier: one `choice` question over safe, violence, gore, weapons, self_harm, hate, extremism, drugs, sexual, minor_sexual, real_person, copyright and misinformation, with per-category actions | `backend/decision_tasks.py` | Planned in [decision-model.md](decision-model.md); test each category on sample prompts before building |
| Medium | Check image prompts with Laya too, before a locked render | `backend/main.py` `render_and_save` | Today only the word list checks them first; the image check catches the rest after the GPU time is spent |
| Medium | A server-side minors check | backend | The minors safeguard is in the browser's prompt builder only |
| High | Check that a character is an adult on the server | `POST` and `PATCH /api/characters` in `backend/main.py` | Only the browser runs `characterProblem`; any caller can save a character with any traits |
| Medium | Apply the browser's adult lock to single-image endpoints | `check_shown` in `backend/main.py` | `/api/history/{id}/image` and the others hide sensitive images only when `ADULT_CONTENT` is off, not when the browser lock is on |
| Medium | Decide what `DECISION_MODEL=off` means while adult content is locked | `chat` in `backend/main.py` | Today it lets locked chat questions through unchecked; failing closed would refuse them instead |
| Medium | Make the chat check task-neutral before adding tasks | `save_decision` in `backend/main.py`, `decision_tasks.chat_exchange_id NOT NULL` | It hardcodes `NUDITY` and yes/no answers, and every saved decision must belong to a chat exchange |
| Low | `DELETE /api/history/{id}` ignores the adult lock | `backend/main.py` | The other single-image endpoints check it |
| Low | Laya failing answers 503 in chat but 502 in `/api/decide` | `backend/main.py` | One status for the same cause is easier to handle |
| Low | `DECISION_KEEP_ALIVE` takes whole seconds only | `backend/decision_model.py` | `60s` falls back to 0, while `OLLAMA_KEEP_ALIVE` accepts units |
| Low | Deleting an image leaves links to it | `history_store.py` | SQLite foreign keys are not enforced, so `edited_from`, `varied_from`, `face_from`, `cover_id` and `chat_exchanges.history_id` can point at a deleted image |
| Low | Show Laya's files in the model dialog, so they can be removed like the image models | `models/laya/` | 807 MB that can only be deleted by hand |
| Low | Tag a preload's log line with the task's trace id | `backend/decision_model.py` | Preload lines read `[preload]`, since the task's id does not exist yet |

## Chat

| Priority | Item | Where | Why |
|---|---|---|---|
| Medium | The chat writes a JSON prompt, not text | `backend/system_prompts.py`, `ChatPanel` | Matches the JSON-first rule: History could reopen chat images in the builder |
| Medium | Chat history screen: list conversations by title, reopen one, see each answer's image | new UI | The data is already saved |
| Low | Show dates in local time | chat and History | `created_at` is stored in UTC |

## Performance and monitoring

| Priority | Item | Where | Why |
|---|---|---|---|
| Medium | Load the image classifier only when needed (as Laya does) | `backend/nsfw_detector.py` | It stays in the web app's memory all the time; measure first |
| Medium | Drop successful progress polls from the access log | `backend/log_setup.py` | Several lines a second during a render bury the useful ones |
| Medium | Render queue in the UI | Create | Queue prompts instead of waiting for each render |
| Low | Monitoring dashboard: Prometheus and Grafana with render times, load times, memory and Laya decisions | both servers | Free and local; see [logging.md](logging.md) for today's options |

## Code tidying

| Priority | Item | Where |
|---|---|---|
| Low | Old single-file names in comments (`data.ts`, `prose.ts`, `modes.ts`, `spec.ts`) after the move to folders | `lib/promptBuilder/`, `THIRD_PARTY_NOTICES.md`, `backend/prompt_spec.py` |
| Low | An empty leftover folder | `pages/history/HistoryPage/components/CompareDialog/` |
| Low | `CLAUDE.md` names two content levels; the code has four (`safe`, `everyday`, `suggestive`, `explicit`) | `CLAUDE.md`, `prompt-builder.md` has all four |
| Low | `pyproject.toml` still says "Add your description here" | `pyproject.toml` |

## Features and polish

| Priority | Item |
|---|---|
| Low | Mark an A/B test's winner |
| Low | An A/B label chip in History's grid |
| Low | Swipe between A/B results on phones |
| Low | JSON prompts for the 32 older images that have text only |
| Low | Upscaling, style presets, shoot-day sets |
