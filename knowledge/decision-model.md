# Decision model (Laya)

Laya is a small decision model: instead of writing text, it answers typed questions about a text (yes/no, a choice or a score) with probabilities. The app uses it to check chat questions for nudity while adult content is locked, and offers it directly at `POST /api/decide`.

## Overview

| Part | File |
|------|------|
| Runner, child process, keep-alive, trace ids | `backend/decision_model.py` |
| The child process itself | `backend/laya_worker.py` |
| Tasks, thresholds, version fingerprint | `backend/decision_tasks.py` |
| Saved decisions | `backend/decision_store.py`, table `decision_tasks` |
| Chat check and `/api/decide` | `check_question`, `save_decision`, `decide` in `backend/main.py` |
| Tests | `backend/tests/test_decision_model.py`, `backend/tests/test_web_app.py`, `no_real_laya` in `backend/tests/conftest.py` |

- Checkpoint: Hugging Face repo `convaiinnovations/laya`, only the English checkpoint at the repo's root (`rl_agent_config.json`, `model.safetensors`, `tokenizer/*`, `encoder/*`), downloaded on first use into `models/laya/` (about 800 MB) with a `.download-complete` marker. The Python package is `laya` (`laya>=0.4.28` in `pyproject.toml`).
- Laya is used as shipped: it only classifies and never refuses, so there is no "uncensored" build to pick.
- It runs on the **CPU**. On MPS every fresh load paid about 13 s compiling Metal kernels (see [decisions.md](decisions.md)), and the CPU leaves the GPU to the image models.

## How it runs (`backend/decision_model.py`)

### `LayaRunner`

There is one module-level `runner = LayaRunner()`.

- **One worker thread** (`ThreadPoolExecutor(max_workers=1, thread_name_prefix="laya")`), so tasks queue instead of loading Laya twice, and at most one Laya exists.
- `decide(text, questions, label)` makes a new trace id (a UUID4), counts itself as waiting, runs on the worker and blocks for the result. It returns a `Decision(trace_id, answers, decide_ms)` or raises `DecisionError(reason, trace_id)`.
- `_ensure_loaded` cancels any pending unload and loads Laya if needed (`load_laya`, or a test's loader), logging `[<trace id>] Laya loaded in <s>s`.
- `answer_of` reduces each raw answer: a yes/no (`noul`) question becomes `{"probability": p}`; a `choice` becomes `{"choice": label, "probabilities": {...}}`; a `score` becomes `{"score": value, "probabilities": {...}}`.
- **Keep-alive.** After each piece of work, `_done` lowers the waiting count. While anything else is waiting, Laya stays. When nothing is, it unloads at once if `DECISION_KEEP_ALIVE` is `0` (the default), or starts a timer for that many seconds; the timer submits `_unload_if_idle` to the worker, which unloads only if nothing is waiting by then. A task already waiting shares the loaded model.
- **Preload.** `preload()` starts loading now, for a task about to come, so the load overlaps the caller's own work. `POST /api/chat` calls it before saving the question. A preload keeps Laya for at least `PRELOAD_GRACE_SECONDS = 10`, even with no keep-alive, in case its task arrives after the load finishes. A preload's failure is logged and swallowed; the task that follows tries again and reports it. Its log lines read `[preload]`, since the task's trace id does not exist yet.
- `_unload` closes the agent (best effort; a failure is a warning) and logs `Laya unloaded`.

### `ProcessLaya`: Laya in a child process

`load_laya` downloads once, then starts `ProcessLaya(worker_command())`, which runs `sys.executable backend/laya_worker.py <models/laya> <DECISION_THREADS>`.

**Why a child process:** unloading Laya inside the web app freed the model but left about 0.8 GB (imported libraries and memory the allocator keeps, per [decisions.md](decisions.md)). Ending a child process gives all its memory back to the OS, so the web app stays at its own memory (about 0.36 GB, per [performance.md](performance.md)). The cost is a cold start of about 1.5 s per task when it is not kept alive (the code's comment says "about 2 seconds" for starting Python, importing torch and loading, and slower after a reboot). A decision then takes about 0.1 s on the CPU. These are measurements recorded in [performance.md](performance.md), not checked by any test.

- Load timeout: `LOAD_TIMEOUT_SECONDS = 120` (waiting for the `ready` line).
- Decision timeout: `DECIDE_TIMEOUT_SECONDS = 30`.
- A reply of `{"error": ...}` raises; an empty line (the process died) raises with its exit code; no reply in time raises `TimeoutError`.
- `close()` closes the child's stdin so it exits, waits 5 s, and kills it if it has not.

### The worker protocol (`backend/laya_worker.py`)

JSON lines over stdin and stdout:

1. It keeps a duplicate of stdout for the protocol and points stdout at stderr, so anything a library prints goes to stderr and never breaks the protocol. It sets `USE_TF=0`, imports torch and `laya`, sets `torch.set_num_threads(threads)` and calls `laya.load(path, device="cpu")`.
2. It writes `{"ready": true}`.
3. For each request line `{"text": ..., "questions": {...}}` it writes `{"answers": {...}}` (numpy and torch numbers become plain floats), or `{"error": "<exception type name>"}`.
4. It exits when stdin closes.

The worker's stderr is inherited from the web app, so library output shows in the web app's terminal but not in `logs/web_app.log`.

## Tasks (`backend/decision_tasks.py`)

A task is the questions Laya is asked and, in code, what the answers decide.

- **`Threshold(env, default)`**: a probability read from an `.env` variable. A missing value uses the default; a value that is not a number above 0 and at most 1 logs a warning and uses the default.
- **`Task(name, questions, refuse_at)`**: `refuses(decision)` is true when any yes/no question's probability reaches (is at least) its threshold. Only `noul` questions can be in `refuse_at`.
- **`version`**: the first 12 hex characters of a SHA-256 over the questions and the current threshold values (sorted JSON). It tells a task's saved results apart after its wording or a threshold changes.

### `NUDITY`

The one task today, used on chat questions while adult content is locked:

```python
NUDITY = Task(
    name="nudity",
    questions={
        "nudity": {
            "type": "noul",
            "instructions": "Would the image show bare breasts, genitals or a sexual act?",
            "criteria": {
                "true": "the person is naked, topless, undressed or in a sexual act",
                "false": "everyone in it is dressed, or there are no people",
            },
        },
    },
    refuse_at={"nudity": Threshold(env="DECISION_NUDITY_REFUSE_AT", default=0.52)},
)
```

Zero-shot, with this wording Laya scores clothed scenes up to about 0.5 and nude ones from about 0.52, so the default sits between them. How the chat uses it, and the fail-closed behaviour, are in [safety.md](safety.md).

## Saved decisions (`backend/decision_store.py`)

Table `decision_tasks` in `history.db`:

| Column | Meaning |
|--------|---------|
| `id` | row id |
| `trace_id` | the task's trace id, unique |
| `task` | task name, such as `nudity` |
| `task_version` | `Task.version` at the time |
| `chat_exchange_id` | the chat exchange it ran on (not null; references `chat_exchanges`) |
| `outcome` | `pass`, `refuse` or `error` |
| `answers` | JSON: each question's main value, such as `{"nudity": 0.04}`; empty for an error |
| `decide_ms` | time Laya took to answer; null for an error |
| `created_at` | when it was saved (UTC) |

The question's text is not copied here; it stays in `chat_exchanges`. `save` adds a row; `for_exchange` reads an exchange's decisions, oldest first (used by tests; no endpoint reads them yet). `check_question` saves a row for every check, errors included.

## `POST /api/decide`

Asks Laya questions about a text directly. Nothing is saved; the log has the trace id but not the text.

Request (`DecideRequest` in `backend/main.py`):

```json
{
  "text": "a fox in the snow",
  "questions": {
    "kind":  {"type": "choice", "instructions": "What kind of image is this?", "criteria": {"animal": "animals", "place": "places"}},
    "night": {"type": "noul",   "instructions": "Is it at night?", "criteria": {"true": "night", "false": "day"}},
    "calm":  {"type": "score",  "instructions": "How calm?", "criteria": ["tense", "calm"]}
  }
}
```

| Limit | Value |
|-------|-------|
| `text` | 1 to 4000 characters |
| `questions` | 1 to 10; ids match `^\w{1,40}$` |
| `type` | `choice`, `score` or `noul`; no other fields allowed |
| `instructions` | 1 to 500 characters |
| `criteria` | `choice`: an object of 2 to 20 named criteria; `score`: a list of 2 to 20 ordered levels; `noul`: optional, but if given exactly the keys `true` and `false`; each criterion 1 to 200 characters |

Response (`DecideResponse`):

```json
{
  "trace_id": "6f1c...",
  "decide_ms": 94,
  "answers": {
    "kind":  {"choice": "animal", "probabilities": {"animal": 0.9, "place": 0.1}},
    "night": {"probability": 0.07},
    "calm":  {"score": 1.5, "probabilities": {"tense": 0.2, "calm": 0.8}}
  }
}
```

(The values above are illustrative.)

| Status | When |
|--------|------|
| 200 | answered |
| 422 | the request breaks a limit above |
| 503 | `DECISION_MODEL=off` (`decisionOff`) |
| 502 | Laya could not load or answer (`decisionUnavailable`), with header `X-Decision-Trace-Id` |

The endpoint has no login, like the rest of the app.

## Trace ids

Every task gets a UUID4 trace id in `LayaRunner.decide`. It appears:

- in each log line of the task, on the `decision` logger: `[<trace id>] <label>: <question> <value>, ... (<ms> ms)`, where the label is the task name (`nudity`) or `free` for `/api/decide`; failures as `[<trace id>] <label>: Laya could not answer (<type>)` or `[<trace id>] Laya could not load (<type>)`;
- in `DecisionError.trace_id` and the `X-Decision-Trace-Id` header on refusals and errors;
- in `trace_id` of the `/api/decide` response;
- in `decision_tasks.trace_id`;
- in the chat refusal warning: `[<trace id>] Chat question refused by the nudity check (exchange #<id>)`.

`summary` logs each question's main value only, never the text or the criteria. So a trace id in a user's error message leads to the log lines and the saved row without exposing content.

## Settings

All in `.env`, listed in `.env.example`; restart the web app after a change.

| Variable | Default | Meaning |
|----------|---------|---------|
| `DECISION_MODEL` | `on` | `off` turns Laya off: the chat check is skipped and `/api/decide` answers 503 |
| `DECISION_KEEP_ALIVE` | `0` | seconds Laya stays loaded after its last task; a whole number, else the default with a warning |
| `DECISION_THREADS` | `8` | CPU threads for the worker; a whole number, else the default with a warning |
| `DECISION_NUDITY_REFUSE_AT` | `0.52` | the `NUDITY` threshold; above 0 and at most 1 |

## Tests never load the real model

`no_real_laya` in `backend/tests/conftest.py` is autouse: it replaces `decision_model.load_laya` with a function that raises `AssertionError("tests must not load the real Laya")`, gives each test a fresh `LayaRunner`, and clears `DECISION_MODEL`, `DECISION_KEEP_ALIVE` and `DECISION_NUDITY_REFUSE_AT`. A test that needs Laya gives the runner a fake loader. The process protocol is tested with a stand-in worker script (`test_laya_in_its_process_answers_each_request_and_ends_when_closed`).

## Adding a new task

1. Define a `Task` in `backend/decision_tasks.py`: a `name`, its `questions` in Laya's format, and `refuse_at` thresholds, each a `Threshold` with its own `.env` variable.
2. Add each variable with its default and a one-line explanation to `.env.example`.
3. Call `decision_model.runner.decide(text, TASK.questions, TASK.name)` where it is needed (and `runner.preload()` early, if there is other work to overlap), then decide with `TASK.refuses(decision)`. Choose fail open or fail closed on `DecisionError` and name the choice in the code.
4. Save the decision if it should be calibrated later. Note the current limits: `save_decision` in `backend/main.py` is written for `NUDITY` (it records `NUDITY.name` and `NUDITY.version`, and reads `answer["probability"]`, so it only fits yes/no questions), and `decision_tasks.chat_exchange_id` is not null, so a task not tied to a chat exchange needs a schema change.
5. Test it with a fake loader (as `laya_says` in `backend/tests/test_web_app.py`), never the real model; test both a pass and a refusal, and Laya failing.
6. Add any user-facing message to all seven `backend/locales/*.json` files.

## Calibration

Laya is over-confident zero-shot: its probabilities cluster, and the `NUDITY` margin between clothed (up to about 0.50) and nude (from about 0.52) is thin. Saved decisions exist so that it can be calibrated:

1. Review saved `decision_tasks` rows with their questions (join on `chat_exchange_id`) and label each one right or wrong.
2. With about 40 labelled rows, fit a small calibration head with Laya's `fit` and load it with the model in the worker.
3. Then revisit `DECISION_NUDITY_REFUSE_AT`. The task's `version` changes with the threshold, so old and new rows stay apart.

Notes from the installed `laya` 0.4.28, checked in its source but not tried in this project: `fit(rows, questions, ...)` is a method of `VegaAgent` (returned by `laya.load` with its `vegaml` option); it fits a head per question over frozen features, then a temperature and threshold on held-out rows. Its `min_rows` floor is 24 rows for a yes/no question with the default 5 folds, so about 40 leaves room for the held-out share. The plain agent the worker loads today (`laya.load(path, device="cpu")`) offers `fit_temperatures` and `fit_binning` instead. Confirm which path to use before building it.

## Planned: general safety classifier

**Not built yet.** This is a proposal, tracked in [roadmap.md](roadmap.md).

One `choice` question would classify a text into one of these categories:

`safe`, `violence`, `gore`, `weapons`, `self_harm`, `hate`, `extremism`, `drugs`, `sexual`, `minor_sexual`, `real_person`, `copyright`, `misinformation`

Each category would map to an action, decided in code:

| Action | Categories |
|--------|-----------|
| Always refuse | `self_harm`, `hate`, `extremism`, `minor_sexual` |
| Refuse while adult content is locked | `violence`, `gore`, `drugs`, `sexual` |
| Flag only (allow, record the flag) | `weapons`, `copyright`, `real_person`, `misinformation` |

Combination rules:

- `real_person` combined with `sexual`, `violence` or `gore` is always refused.
- `misinformation` combined with `real_person` is refused.

Because a single choice returns one top label, `minor_sexual` and `self_harm` would also be checked by their own probability, and refused when it reaches their threshold even when they are not the top choice. Each threshold would be an `.env` variable, as for `NUDITY`. Test each category on sample prompts before building, and calibrate it as above.
