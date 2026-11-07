# Safety and privacy

This file lists every safety and privacy mechanism in the app: the two adult-content locks, safe-for-work renders, sensitive images, the minors safeguard, uploaded face photos and the Laya check on chat questions. Each section names the code that enforces it, and the last section lists the known gaps.

## Overview

| Mechanism | Where it is enforced | What it does |
|-----------|---------------------|--------------|
| `ADULT_CONTENT` lock | server, `backend/adult_content.py` | Off: nothing adult is served, every render is kept safe for work |
| Browser lock (hidden word) | browser, `frontend/src/lib/adultContent/`; server honours `safe_only` | A privacy screen per browser, on top of the `.env` lock |
| Safe-for-work renders | server, `backend/safe_for_work.py`, `render_and_save` in `backend/main.py` | Refuses sensitive prompts and start images, adds a safe negative, discards a nude result |
| Uploaded face photos | server, `safe_render_for` in `backend/main.py` | A character whose face is a photo always gets safe-for-work renders |
| Sensitive words | server, `backend/sensitive.py` | Marks prompts (and chat exchanges) as sensitive; used for blurring and refusals |
| Image classifier | server, `backend/nsfw_detector.py` | Checks every saved image; only ever adds the sensitive flag |
| Minors safeguard | browser only, `frontend/src/lib/promptBuilder/build/`, `character/`, `modes/` | Adult builder prompts and characters need an adult age and no minor terms |
| Laya nudity check | server, `check_question` in `backend/main.py` | A locked chat question that Laya scores as nude is refused; fails closed |
| Log privacy | `backend/log_setup.py` and every logger | Logs hold ids, settings and timings, never content |

## The two adult-content locks

### Lock 1: `ADULT_CONTENT` in `.env` (the real lock)

`backend/adult_content.py` reads `ADULT_CONTENT`. Only the exact value `on` (any case, trimmed) turns it on; anything else, including a missing value, is off.

- `enabled()`: `ADULT_CONTENT=on`.
- `locked(safe_only)`: adult content is locked for a request when `safe_only` is true or `enabled()` is false.
- `hidden(sensitive)`: a sensitive image or prompt is never served while adult content is off.

When it is off, the web app enforces this for every caller, whatever the browser sends:

- **Catalog** (`GET /api/catalog` in `backend/main.py`): models with `adult=True` (`ModelSpec` in `backend/model_catalog.py`) and adult purposes (`BuilderMode.is_adult()`: content `suggestive` or `explicit`, or the `intimacy` step) are left out. `adult_content.available` is false.
- **History**: `history_filter` and `history_set` set `hide_sensitive` to true whatever the request says. `check_shown` answers 404 for a sensitive image on the single-image endpoints (`/image`, `/download`, `/palette`, `/edits`, `/favourite`, `/sensitive`).
- **Renders**: `safe_render_for` returns "keep safe", so every render goes through the safe-for-work rules below, and add-ons with `adult=True` are stripped from the request (`model_server_request`).

### Lock 2: the browser lock and `ADULT_UNLOCK_WORD`

With `ADULT_CONTENT=on`, a hidden word in `ADULT_UNLOCK_WORD` keeps adult content hidden in each browser until it is typed. An empty word means no browser lock: everything `.env` allows is shown.

- The catalog sends `adult_content.word_lock` (whether a word is set), never the word itself.
- `POST /api/adult-content/word` takes `{"typed": "..."}` (at most 200 characters) and answers `{"match": true|false}`. `ends_with_unlock_word` compares the end of what was typed with the word using `hmac.compare_digest`, and returns false when adult content is off or no word is set. The word never reaches the browser.
- `frontend/src/shared/adultContent/useUnlock/useUnlockWord.ts` collects keys typed outside any text field on the Create page (at most the last 100), and asks the server once typing pauses for 600 ms. On a phone, five taps on the app's title within 2.5 s open `UnlockDialog`.
- A match toggles the lock (`AdultContentProvider`), stored in `localStorage` under `z-image-studio.adult-content-unlocked`. Every browser starts locked; storage that cannot be read counts as locked. A short notice says when it switches.
- `shown = info.available && (!info.word_lock || unlocked)`.

While the browser lock is on (`shown` is false):

- `catalogFor(catalog, false)` in `frontend/src/lib/adultContent/index.ts` removes adult models, adult add-ons and adult purposes, and sets every remaining purpose's content to `safe` (no lingerie, the safe negatives).
- Generate sends `safe_only: true` (`renderRequest` and `generateBody` in `frontend/src/api/`), so the server keeps the render safe for work exactly as if `ADULT_CONTENT` were off.
- History requests send `hide_sensitive=true`; the A/B compare dialog and export do too.
- The chat sends `safe_only: true`, which turns on the Laya check (below).

The browser lock is a privacy screen for one browser. `frontend/src/lib/adultContent/index.ts` says so: "the .env lock is the real one".

## Safe-for-work renders

`render_and_save` in `backend/main.py` decides with `safe_render_for` whether a render is kept safe for work:

1. The character's face is an uploaded photo (`character.face_uploaded`): kept safe, and messages name the character.
2. Otherwise, `adult_content.locked(req.safe_only)`: kept safe when `ADULT_CONTENT` is off or the browser sent `safe_only`.

For a safe render, `check_safe_request` runs before anything is sent to the model server:

| Check | Code | Result |
|-------|------|--------|
| An adult model while locked (not for the uploaded-face reason) | `check_safe_request` | refused, `lockedModel` |
| A sensitive word in the prompt | `safe_for_work.check_prompt` (uses `sensitive_word`) | refused, the message quotes the word |
| A start image (variation) that is marked sensitive | `safe_for_work.check_start_image` | refused |
| The image classifier not loaded yet | `safe_for_work.check_image_check_ready` | refused: "try again in a moment" |

Then:

- **Safe negative.** `with_safe_negative` appends each term of `SAFE_NEGATIVE` the negative prompt does not already have (compared case-insensitively). The exact value in `backend/safe_for_work.py`:

  ```
  nsfw, nude, naked, nudity, topless, nipples, lingerie, underwear, see-through, cleavage
  ```

- **Adult add-ons** are removed from the request.
- **Result check.** After rendering, `nsfw_detector.is_nsfw` checks the image. `check_result` treats anything but `False` as not safe: a nude result, or one that could not be checked (`None`), is discarded and never saved.

A refusal raises `NotSafeForWork`, which `generate` turns into a 422. It logs only `Render refused by the safe-for-work rules (character <id>)`, since the message can quote the prompt and name the character.

These rules are tested in `backend/tests/test_face_upload.py` and `backend/tests/test_adult_content.py`.

## Uploaded face photos

A character can have a face photo (`face_upload`, base64, at most 14,000,000 characters) instead of a History image as its face (`backend/character_store.py`). It is decoded with Pillow, converted to RGB, shrunk to at most 1024 px on its longest side and stored as PNG; anything unreadable is refused (`BadPhoto`). A character has one face at a time (`one_face`).

Because a photo can show a real person, every render for such a character is kept safe for work, whatever `ADULT_CONTENT` or the browser says (first branch of `safe_render_for`). The UI also hides the 18+ purposes for it (`modesForCharacter` in `frontend/src/lib/promptBuilder/modes/`), but the server is what enforces it. The photo is served back at `GET /api/characters/{id}/face-upload` with `Cache-Control: no-cache`.

## Sensitive words and blurring

`backend/sensitive.py` holds one case-insensitive, whole-word regular expression. The exact pattern:

```
\b(?:nude|nudes|naked|nudity|nsfw|explicit|uncensored|topless|bottomless|nipples?|areolae?|genitals?|vulva|pussy|penis|sex|sexual|sexually|sexy|intercourse|erotic|porn\w*|orgasm\w*|masturbat\w*|lingerie|boudoir|sensual|hentai)\b
```

Whole words only, so "explicitly" or "Sussex" do not match.

- `sensitive_word(prompt)` returns the first match (used in refusal messages).
- `is_sensitive(prompt)` marks a new History image from its prompt (`history_store.add`, unless the caller passes a value), and marks a finished chat exchange from its question and answer (`chat_store.finish`, column `sensitive`).
- Older images without a flag get one from their prompt once (`mark_unchecked_images` in `backend/history_store.py`).

**Blurring.** Lists and thumbnails show a sensitive image blurred (`frontend/src/shared/images/SensitiveImage/`, `blur-xl` with a label); opening it shows it as it is. Character cards blur a sensitive cover or face. The user can change the flag per image (`PUT /api/history/{id}/sensitive`); a flag set by hand counts as checked, so the classifier never changes it.

## The image classifier

`backend/nsfw_detector.py` runs `Falconsai/nsfw_image_detection` (a ViT, Apache 2.0) on the CPU through a transformers `image-classification` pipeline, from `models/nsfw-detector/`.

- It downloads once (files `config.json`, `preprocessor_config.json`, `model.safetensors`), finishing with a `.download-complete` marker.
- `is_nsfw(png)` returns true when the `nsfw` label's score is at least `NSFW_THRESHOLD = 0.5`, and `None` while it is not loaded.
- Every saved render is checked (`render_and_save`); a true result sets `sensitive`, and `image_checked` records whether the check ran.
- **At start**, `start_image_checks` runs `check_unchecked_images` in a daemon thread (`image-checks`): it loads the classifier, then checks every image with `image_checked = 0`, 20 per database read. `record_image_check` uses `MAX(sensitive, ?)`, so the check only ever adds the flag.
- If it cannot load, a warning is logged and the prompt words stay the only check for ordinary renders. Safe renders are then refused (fail closed) because `check_image_check_ready` fails.
- Tests never run it: `no_image_check` in `backend/tests/conftest.py` turns off the start-up check and makes `is_nsfw` return `None`.

## The minors safeguard

This runs in the browser, in the prompt builder and the character editor.

- **`minorTermIn(state, mode)`** (`frontend/src/lib/promptBuilder/build/index.ts`): when the builder would produce adult content (`usesAdultContent`: an adult mode, or lingerie in a mode that is not safe), it searches the free-text fields (subject, appearance and body extras, action, environment, mood, extra details, outfit details, date stamp) for a minor term. A match blocks the prompt (`builder.reasonMinor`). Adult content also needs "Who" and an age chosen, or the prompt is incomplete (`builder.reasonNeedsAdult`).
- The exact pattern (`MINOR_TERMS`, case-insensitive):

  ```
  \b(?:child(?:ren)?|kids?|minors?|under-?age(?:d)?|teen(?:s|age|aged|ager|agers)?|pre-?teens?|tweens?|school ?(?:girl|boy)s?|lol(?:i|ita)|shota|toddlers?|infants?|bab(?:y|ies)(?![\s-]*(?:blue|pink|doll|oil|powder))|girls?|boys?|daughters?|sons?|nieces?|nephews?|juveniles?|adolescents?|(?:[1-9]|1[0-7])\s*(?:yo|y\/o|y\.o\.|-?\s*years?[\s-]*old|-year-old))\b
  ```

- **`characterProblem(name, traits)`** (`frontend/src/lib/promptBuilder/character/index.ts`): a character needs a name, "Who" and an age, and its name and free-text traits must not contain a minor term (`minorWordIn`). A character can be used in the 18+ purposes, so it must be an adult.
- **`isAdultMode(mode)`** (`frontend/src/lib/promptBuilder/modes/index.ts`): a mode is adult when its content is `suggestive` or `explicit`, or when it shows the Intimacy step, whatever `prompt_modes.json` says. Editing that file can add adult options but never switch the age checks off. `BuilderMode.is_adult()` in `backend/main.py` mirrors it for the catalog.
- Sample characters (`sample_characters.json`) and example prompts must stay clearly adult; `character/index.test.ts` checks the samples.

## The Laya nudity check on locked chat questions

When the chat is asked while adult content is locked (`adult_content.locked(req.safe_only)`) and Laya is on (`DECISION_MODEL` is not `off`), `POST /api/chat` checks the last user message before the chat model sees it. See [decision-model.md](decision-model.md) for how Laya runs.

1. `decision_model.runner.preload()` starts Laya's process, so the load overlaps saving the question.
2. The exchange is saved (`chat_store.start`).
3. `check_question` asks Laya the `NUDITY` task from `backend/decision_tasks.py`. The exact question:

   ```python
   "nudity": {
       "type": "noul",
       "instructions": "Would the image show bare breasts, genitals or a sexual act?",
       "criteria": {
           "true": "the person is naked, topless, undressed or in a sexual act",
           "false": "everyone in it is dressed, or there are no people",
       },
   }
   ```

4. The question is refused when the `nudity` probability is at least `DECISION_NUDITY_REFUSE_AT` (default `0.52`; must be above 0 and at most 1, otherwise the default is used with a warning).

| Outcome | Saved decision | Exchange status | Response |
|---------|---------------|-----------------|----------|
| pass | `pass` with the probability | answered as usual | 200, streamed |
| refuse | `refuse` with the probability | `refused` | 422, `questionRefused`, `X-Decision-Trace-Id` header |
| Laya fails to load or answer | `error`, no answers | `failed`, error `safety check: <reason>` | 503, `decisionUnavailable`, `X-Decision-Trace-Id` header |

**Fail closed.** If Laya cannot answer, the question is refused, not passed. The chat model is never asked in either refusal case (tested in `backend/tests/test_web_app.py`).

**Threshold margin.** The comment on `NUDITY` says that zero-shot, Laya scores clothed scenes up to about 0.5 and nude ones from about 0.52 with this wording, so the default sits between them. That margin is thin; see Calibration in [decision-model.md](decision-model.md).

A chat answer that is then rendered (the Create page generates right after a chat answer) goes through the safe-for-work rules again as an image prompt, since the browser sends `safe_only` with it.

## What logs never contain

`backend/log_setup.py` states the rule: logs never hold prompt text, character names, images, tokens or the unlock word, only ids, settings and timings. Chat text and the text given to Laya are left out too. Errors are logged by their type or a short reason (`ChatError.reason`, `DecisionError.reason`), never the conversation or a key. Tests check this; see [logging.md](logging.md).

## Known gaps

- **Laya checks only chat questions.** Image prompts typed in Create, the builder's output and scripted renders are checked only by the word list before rendering, then by the image classifier after the GPU time is spent.
- **Laya checks only the last user message**, not earlier messages in the conversation nor the chat model's answer. The answer is caught only if it is rendered.
- **`DECISION_MODEL=off` turns the chat check off entirely**, so locked chat questions are answered unchecked. This is fail open by configuration; the start-up log says so.
- **No server-side minors check.** `minorTermIn` and `characterProblem` run only in the browser. A direct call to `POST /api/generate` or `POST /api/characters` skips them, and a typed prompt (not from the builder) is never checked for minor terms, even with adult content unlocked.
- **The word list is English only and easy to avoid** (synonyms, misspellings, other languages). It also refuses harmless uses of words such as "sex" in a safe render.
- **Thin nudity threshold.** About 0.50 for clothed against 0.52 for nude, without calibration. Expect both false refusals and misses until Laya is calibrated.
- **The browser lock is not a security boundary.** With `ADULT_CONTENT=on`, any client that omits `safe_only` or `hide_sensitive` gets everything; single-image endpoints (`/api/history/{id}/image` and others) serve sensitive images by id even while the browser lock is on, because `check_shown` only applies the `.env` lock. There is no login (see `APP_HOST` in `.env.example`).
- **The image classifier threshold (0.5) is uncalibrated**, and an image it cannot read during the start-up check keeps its prompt's flag (logged as a warning).
- **Uploaded face photos** are only protected against sexual content. There is no check that the user has the right to use the face.
