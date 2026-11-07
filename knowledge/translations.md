# Translations

The app's interface and messages come in seven languages, chosen once in `.env` and applied by both the backend and the UI. This file explains where the texts live, how code looks them up, and the rules and tests that keep every language complete.

## Languages

| Code | Language |
|------|----------|
| `en` | English (default, and the source every other language must match) |
| `nl` | Dutch |
| `it` | Italian |
| `fr` | French |
| `de` | German |
| `es` | Spanish |
| `pt` | Portuguese |

The list is defined twice and must stay the same: `LANGUAGES` in `backend/i18n.py` and `LANGUAGES` in `frontend/src/i18n/index.ts`.

## How the language is chosen

1. `APP_LANGUAGE` in `.env` (see `.env.example`) sets it. Restart both servers after changing it.
2. `backend/i18n.py` `language()` reads it once (cached), trimmed and lower-cased. An unknown code logs a warning and falls back to English.
3. The catalog (`GET /api/catalog`) sends it to the UI as `language`.
4. `LanguageGate` in `frontend/src/App/index.tsx` calls `loadLanguage(code)` and shows the loading screen until the language has loaded. Nothing else renders before that, so every text the user sees is already in the right language.
5. `loadLanguage` sets `document.documentElement.lang`. If a language fails to load, the app stays in English (which works fully) and the console says why.

English is bundled into the main code. Each other language is a separate chunk, fetched only when chosen (`import.meta.glob` in `i18n/index.ts`).

## Locale files

| Side | Files | Shape |
|------|-------|-------|
| Frontend | `frontend/src/locales/<code>/<namespace>.json` | Flat keys per namespace, `{placeholders}` |
| Backend | `backend/locales/<code>.json` | One flat file per language, `{placeholders}` (Python `str.format`) |

Frontend namespaces:

| Namespace | Holds |
|-----------|-------|
| `common` | Shared words (Close, Loading, errors) |
| `create` | Create page, models, add-ons, JSON prompt errors, A/B test |
| `history` | History, the viewer, editing, clean-up |
| `characters` | Characters page and editor |
| `builder` | Prompt builder steps, purposes, reasons, problems |
| `options` | Labels of the prompt builder's option values, keyed by the English value |

The backend file holds messages the server sends to the user, such as refusals and validation errors (`i18n.t()` in `main.py`, `custom_clothes.py`, `character_store.py`, `chat_client.py`, `safe_for_work.py` and others). They arrive in the UI already translated, as the error `detail`.

## Frontend API

All in `frontend/src/i18n/index.ts`:

| Function | Use |
|----------|-----|
| `t(key, params?)` | A text by `namespace.key`, with `{placeholders}` filled in. `key` is typed (`MessageKey`) from the English files, so a wrong key fails the type check. |
| `tn(key, count, params?)` | A plural text. The files have `key_one` and `key_other` (and other forms, such as `_many`, where a language needs them). The form comes from `Intl.PluralRules`; `{count}` is filled in, formatted for the language. |
| `tOr(key, fallback, params?)` | Text keyed by data rather than code, such as a purpose by its id: `builder.modeLabel_<id>`, `builder.modeDescription_<id>`, `create.modelDescription_<id>`, `create.modelCategory_<id>`, `create.addonLabel_<id>`, `create.addonDescription_<id>`. Uses the translation, else English, else `fallback` (the text the data gives, such as `prompt_modes.json`'s `label`). |
| `optionLabel(value)` | How a prompt builder option is shown, from the `options` namespace. A custom label wins, then the current language, then English, then the value itself. |
| `optionTitle(value)` | `optionLabel` with a capital first letter, for menus and checkboxes. |
| `setCustomLabels(labels)` | Registers the titles of the user's own clothes from `custom_clothes.json` (one text, or one per language code, falling back to `en`, then to the value). Called by `applyCustomClothes` in `lib/customClothes`. |
| `loadLanguage(code)`, `language()`, `isLanguage(code)` | Load and read the current language. |

A key missing from a translation falls back to English at run time, but the tests below do not allow that to ship.

Backend: `i18n.t(key, **params)` returns the message in the app's language, falling back to English for a missing key.

## Rules

- **Look text up when it is shown, never at module load.** A module-level constant would be read before `LanguageGate` loads the language and stay English. Store the key or a function (for example `VIEWS` in `App/index.tsx` holds `label: () => t('create.viewCreate')`).
- **Prompts sent to the models stay English.** Only labels are translated; option values never are. The builder's options are English words that go into the prompt as they are (`optionLabel` translates only what the menu shows), and the JSON prompt stores the English values. The backend docstring says the same for the server.
- **Every language has every key, with the same placeholders.** Add a new text to all seven languages in the same change, and remove a key from all of them.
- **A new builder option needs a label** in `en/options.json` and in the six other `options.json` files.
- **Translation commits go first, in their own commit.** Commit locale and message files separately from logic changes, with the scope `i18n` (for example `chore(i18n): add dutch labels for the opening hours form`). When new code uses new keys, commit the translations first, so every commit still builds and shows the right text. This rule comes from the owner's global instructions, not from the repo's `CLAUDE.md`.

## Tests that enforce them

| Test | Checks |
|------|--------|
| `frontend/src/i18n/locales.test.ts` | For each non-English language and each namespace found in `locales/en/`: the file exists, no key is missing (a missing `_one` is allowed, since some languages use other plural forms), no key is extra (plural variants of an English key are allowed), each text has the same placeholders as its English source, and no text is empty |
| `frontend/src/i18n/i18n.test.ts` | Placeholders are filled and unknown ones left visible, an unknown language falls back to English, switching languages works, an option without a label shows as it is, and builder values stay English in every language |
| `frontend/src/lib/promptBuilder/data/options.test.ts` | Every prompt builder option has a label in `en/options.json`, and no label is left for an option that no longer exists |
| `backend/tests/test_i18n.py` | Every language has exactly the English keys, with the same placeholders and no empty text; every English message formats; `APP_LANGUAGE` is read, trimmed and lower-cased, and an unknown or empty value gives English |
| `npx tsc -b` | Every `t()` and `tn()` key exists in the English files (`MessageKey`, `PluralKey`) |

## Adding a text

1. Add the key to the English file (`frontend/src/locales/en/<namespace>.json` or `backend/locales/en.json`).
2. Add the same key, with the same placeholders, to the six other languages.
3. Use it with `t()`, `tn()` or `tOr()` (frontend) or `i18n.t()` (backend), at the moment it is shown.
4. Run `cd frontend && npm test` and `uv run pytest backend/tests/test_i18n.py`.

To remove a text, delete its key from all seven files in the same change.
