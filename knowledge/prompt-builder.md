# Prompt builder

The prompt builder turns step-by-step choices into a prompt for the selected model: a paragraph for the models that read sentences, a weighted tag list for the SDXL anime models. This file explains how its code is organised, which rules it enforces and how to extend it safely.

The logic lives in `frontend/src/lib/promptBuilder/`, one folder per module (each with `index.ts`, and a test beside it where there is one). The dialog and its steps live in `frontend/src/shared/promptBuilder/`, since Create and the Characters page both use them. For what the user sees, see [usage.md](usage.md#prompt-builder).

## The pipeline at a glance

```
BuilderState (build/)  +  BuilderMode (modes/, from prompt_modes.json)
        │
        ▼
buildPrompt(state, mode, style)                       build/
  1. missingStart / adultContentProblem / missingTop   checks, may stop here
  2. resolveFacts(state, mode)                         resolveFacts/ → Facts (facts/)
       settleChoices: Random settled in order         settle/
       choicesFor: options allowed now                rules/
       withoutHiddenSteps: hidden steps add nothing
  3. proseFrom(facts, mode)  or  tagsFrom(facts, mode) prose/ or tags/, by the model's prompt_style
  4. negativePrompt(state, mode, facts)                negatives/
  5. clashesIn(choicesInPrompt(...))                   conflicts/, shown as warnings
        │
        ▼
BuildResult: incomplete | blocked | ready { prompt, negativePrompt, explicit, clashes }
```

`buildPrompt` is the one entry point. The builder's live preview, `promptFromSpec` (the JSON prompt), the character look and the render script all go through it, so the same rules apply everywhere.

## Modules

| Folder | What it holds |
|--------|---------------|
| `data/` | Option lists and prose expansions ported from upstream (see [Option data](#option-data)) |
| `extraData/` | Options written here: who, ages, ethnicities, eyes, makeup, skin, hair lengths, body, nudity levels, intimacy cues, explicit details, men's options |
| `choices/` | `CHOICE_OPTIONS`: every single choice and all its options before a mode narrows them; `ChoiceField`, `TextChoice`, `isChoiceField` |
| `constants/` | Special values: `NOT_SET` (`''`), `RANDOM`, `REMOVE`, `INHERIT_SCENE` |
| `build/` | `BuilderState`, `emptyBuilderState`, `buildPrompt`, the age safeguard, Surprise me, `switchMode`, step locks |
| `modes/` | `BuilderMode`, `parseModes`, `isAdultMode` and the other content-level helpers |
| `rules/` | `choicesFor` and the subject and content rules behind it |
| `resolveFacts/` | Turns the state into `Facts` within what the mode allows |
| `facts/` | The `Facts` type, pronouns and small text helpers (`joinPieces`, `withArticle`) |
| `prose/` | `proseFrom`: one paragraph in the mode's emphasis order |
| `tags/` | `tagsFrom`: a tag list with the mode's weights |
| `negatives/` | `negativePrompt`, `withoutSafeForWorkTerms` |
| `conflicts/` | What each option uses, `clashesIn`, `fitsChoice` |
| `settle/` | `settleChoices`, `pickFitting`, `choicesInPrompt` |
| `random/` | Seeded `pick`, `pickSome`, `resolve` (each field rolls on its own) |
| `multiChoice/` | Makeup, facial hair and lighting take several picks (`MORE_FIELDS`, `picksOf`, `withPicks`) |
| `choiceGroups/` | Grouped option lists for the menus (`poseGroups`, `choiceGroupsOf`) |
| `fitness/` | Fitness workouts, places, light, photo styles and clothing; `outfitOptions` |
| `intimates/` | Lingerie and swimwear, `GARMENT_DETAILS`, `intimateOptions`, `intimateSet`, `accessoryOptions` |
| `faceless/` | Faceless poses, framings, photo styles, lounge outerwear, face-free light |
| `filters/` | Image filters, `LIGHT_FILTERS`, `SHARP_REALISM`, `dateStampText` |
| `outfitMenu/` | The Outfit step's Top and Bottom menus |
| `customClothes/` | The user's own clothes, once registered |
| `character/` | Characters as builder choices |
| `spec/` | The JSON prompt |
| `storage/` | Saves the builder's state in the browser |

## Option data

`data/index.ts` holds the option lists and their prose expansions (photo styles, poses, scene types, shots, angles, lenses, depth of field, colour gradings, hair colours and styles, tops, bottoms, lingerie, outerwear, shoes, clothing colours, accessories, `LIGHTING_EXPANSIONS`, and the explicit poses and actions). They are generated from [ComfyUI Photoreal Prompt Builder](https://github.com/artokun/ComfyUI-Photoreal-Prompt-Builder) (commit `a8a60f0d5a`) and its NSFW module (commit `25f332bf91`), MIT licence, by artokun. `THIRD_PARTY_NOTICES.md` records this, with the licence in `licenses/`. The file header says "edit with care": the values are also the English labels' keys and the JSON prompt's allowed values.

Options the project added itself live in `extraData/`, `fitness/`, `intimates/`, `faceless/` and `filters/`. The prompt assembly is not upstream's: it is rewritten in `resolveFacts/`, `prose/` and `tags/`.

Option values are English and go into the prompt as they are. Only their label is translated, through `optionLabel` and `frontend/src/locales/<code>/options.json` (see [translations.md](translations.md)).

## Builder state

`BuilderState` (`build/index.ts`) holds every field: the subject (`who`, `age`, `ethnicity`, free-text `subject`), appearance, hair, body (including the men's and the Explicit-only anatomy fields), `strengths` and `lookMoved` for the look sliders, `outfit` (an `OutfitState` with `top`/`bottom`, `lingerieTop`/`lingerieBottom`, outerwear, shoes, a colour for each, three accessories and free `details`), `mode`, `nudity`, `intimacy`, `explicitDetails`, pose and actions, scene, lighting, camera, `imageFilter` and `dateStamp`, mood, colour grading, realism, extra details, the typed negative prompt, `rollSeed` and `lockedSteps`.

- `rollSeed` seeds every Random choice, so the preview stays stable until the user re-rolls.
- `storage/` keeps the state in `localStorage` under `z-image-studio.prompt-builder.v3`. It reads the old `v2` key once (where `explicit: true` becomes the `explicit` mode). `withNewFields` fills fields added since a state was saved, so a new field never throws saved choices away; `matchesShape` checks the rest against `emptyBuilderState()`.

### Checks in `buildPrompt`

| Check | Result |
|-------|--------|
| `missingStart`: no `who` and no free-text subject (or, in a mode without the Subject step, no scene) | `incomplete` |
| `adultContentProblem`: adult content and a word that suggests a minor in the free text (`minorTermIn`) | `blocked` |
| `adultContentProblem`: adult content without both `who` and `age` | `incomplete` |
| `missingTop`: an always-clothed mode (Faceless) with a woman and no top | `incomplete` |

`usesAdultContent` is true for an adult mode, or for lingerie in the outfit of any mode that is not safe. `minorTermIn` checks the free-text fields (subject, appearance and body extras, action, environment, mood, extra details, outfit details, date stamp) with the `MINOR_TERMS` pattern. `minorWordIn` is the same pattern for any text; characters and custom clothes use it too.

The project rule (from `CLAUDE.md`): explicit, nudity and lingerie prompts require "Who" and an adult age, and are refused if free text suggests a minor. Keep this when changing the builder.

## Purposes (modes)

A purpose is a `BuilderMode`, read from `prompt_modes.json` at the project root and served in the catalog as `builder_modes`.

| Key | Meaning |
|-----|---------|
| `id`, `label`, `description` | Identity; the label and description are translated through `tOr` (`builder.modeLabel_<id>`, `builder.modeDescription_<id>`), with the file's text as fallback |
| `content` | `safe`, `everyday`, `suggestive` or `explicit` (`CONTENT_LEVELS`) |
| `focus` | `opening` (replaces "a photograph"), `cues` (a sentence of style cues for prose), `tags` (style tags for tag prompts) |
| `steps` | From `STEP_IDS`: `subject`, `appearance`, `body`, `outfit`, `pose`, `intimacy`, `scene`, `camera`, `finish` |
| `defaults` | A starting value per choice, applied by `switchMode` only to choices still untouched |
| `options` | A narrower list per choice; `choicesFor` filters by it |
| `emphasis` | Prose blocks written first, from `PROSE_BLOCKS` |
| `weights` | Tag weights (0.5 to 2) per group, from `WEIGHT_GROUPS` |
| `negative` | Added to every negative prompt of the purpose (Faceless uses it for the face) |

The shipped file has nine purposes: `general`, `portrait`, `fashion` and `scene` (everyday), `influencer` and `fitness` (safe), `glamour` and `faceless` (suggestive) and `explicit` (explicit).

### Checking the file

The file is checked twice:

- **Server**, `prompt_modes()` in `backend/main.py`: the `BuilderMode` Pydantic model checks the shape (id pattern, label length, content level, weights 0.5 to 2, `negative` up to 500 characters, at least one step) and that ids are unique. While `ADULT_CONTENT` is off, the catalog leaves out modes where `is_adult()` is true.
- **Browser**, `parseModes` in `modes/`: `stepProblems` (unknown step, unknown content level, no steps, a `safe` mode with the Intimacy step), `optionProblems` (unknown choice, unknown option, a default not in the narrowed options) and `writingProblems` (unknown emphasis block or weight group, weight out of range). A mode with problems is left out and the builder names it; with no valid mode at all it falls back to `FALLBACK_MODE` (`general`, everyday).

### Content levels in code

What each level allows is enforced in code, not in the file:

| Helper (`modes/`) | Rule |
|-------------------|------|
| `isAdultMode` | `content` is `suggestive` or `explicit`, **or** the steps include `intimacy`. So editing `prompt_modes.json` can add adult options but never switch the age checks off. `backend/main.py` `BuilderMode.is_adult()` and `lib/adultContent` repeat the same rule. |
| `isSafeMode` | `content` is `safe` and the mode is not adult: no lingerie or swimwear, and `SAFE_NEGATIVES` in the negative prompt |
| `allowsExplicitActs` | Adult and not `suggestive`: explicit poses and acts |
| `alwaysClothed` | Adult without the Intimacy step (Faceless): no nudity, nothing can be removed, covering negatives added |
| `modesForCharacter` | A character with an uploaded face only gets the non-adult modes |

`rules/` applies these per field: `suggestive` limits nudity to `clothed`, `implied` and `topless`; partner actions only for a couple; woman-only poses only when the subject includes a woman; clothing actions only while those clothes are on; explicit details only in Explicit and only when they fit the subject and nudity (`explicitDetailOptions`); anatomy offered whatever the nudity but written only when it shows (`anatomyShows`).

## From state to facts

`resolveFacts(state, mode)` returns a `Facts` object: every choice resolved to plain text (`''` when unset), with labelled items (`Labelled`: a short `label` for tags, a full `text` for sentences) for pose, action, clothing, lighting and filter.

1. `settleChoices` gives every Random choice a concrete value, in an order that keeps them fitting (see [Conflicts](#conflicts-random-and-surprise-me)).
2. Each choice is resolved against `choicesFor(field, settled, mode)`: the options that fit the subject and content rules, narrowed by the mode. The steps' menus and Random use the same function, so a random pick is always one the field could offer.
3. Choices kept from an earlier "Who", nudity level or mode that no longer fit are left out rather than contradicting the rest (poses, acts, garments, anatomy, men's options, custom items for someone else).
4. The nudity level decides the clothing: a prompt never describes clothes the nudity level has taken off.
5. `lookPhrases(state)` adds the phrase sliders' wording to `appearanceExtra` (see [Look sliders](#look-sliders-linked-to-choices)).
6. `withoutHiddenSteps` blanks every fact of a step the mode does not show, so choices left from another mode never reach the prompt.

## Writing the prompt: prose or tags

`buildPrompt` picks the writer by the model's `prompt_style` (`ModelInfo.prompt_style`, set per model in `backend/model_catalog.py`, default `prose`).

| Style | Models | Writer | Shape |
|-------|--------|--------|-------|
| `prose` | Z-Image-Turbo, MOSS-Image, RealVisXL, FLUX.1-dev | `proseFrom` | One paragraph: the opening (who and what is happening, with the mode's `focus.opening`), the mode's `cues`, then the blocks in `emphasis` order followed by the rest of `PROSE_BLOCKS` |
| `tags` | WAI-Illustrious, Anime Desire | `tagsFrom` | Quality tags, who, the mode's `focus.tags`, adult content, then the person, clothing, removed items (`no …`), setting; groups in `weights` written as `(tag:1.3)` |

The `(tag:1.3)` weights are applied on the server by Compel (`backend/prompt_weights.py`).

## Negative prompt

`negativePrompt(state, mode, facts)` in `negatives/` joins, in order:

1. The user's typed negative prompt (only when the mode shows the Finish step); in an adult mode `withoutSafeForWorkTerms` drops `nsfw`, `censored`, `nude`, `nudity` and `naked`.
2. The mode's own `negative`.
3. `SAFE_NEGATIVES` in a safe mode.
4. Body negatives when the prompt has adult content.
5. Anatomy negatives (extra fingers and the like), always.
6. Coverage negatives: breast and genital cover terms by nudity level; in an always-clothed adult mode (no nudity in the prompt) both.

## Conflicts, Random and Surprise me

`conflicts/` tags each option once with what it uses: hands, body positions, mouth, facing away, legs, hair length range, daylight, indoor or outdoor, where a light can be, accessories worn in the same place, build, and filters. `clashesIn(state)` finds clashes of these kinds (`ClashKind`): `hands`, `position`, `mouth`, `facing`, `framing`, `hair`, `light`, `place`, `weather`, `accessories`, `build`, `filter`. `fitsChoice` asks whether a value would clash with what is chosen.

`settle/`:

- `settleChoices` settles Random choices in a fixed order (the place sets the time, the time the light, the hair length the style, the build the muscles and body hair, the pose the act and the expression, the filter the colour grading).
- `pickFitting(field, state, mode, seed)` picks a random allowed option that clashes with nothing already chosen. If every option clashes with the user's own choices, it picks any allowed one, since the warning then shows the clash.
- `choicesInPrompt` keeps only the choices that reach the prompt (shown steps, allowed options), so a choice left from another mode can't clash.

`build/` uses the same pieces for **Surprise me** (`surprise`): it fills the main choices in order (`SURPRISE_BEFORE_ACTS`, then sometimes a filter, then in an adult mode the pose, act and Intimacy step, then the outfit, and the expression last so it fits the act), keeps free text and locked steps (`lockedSteps`, `STEP_FIELDS`) and picks the rest to fit them. `surpriseStep` re-picks one step only. `surpriseOutfit` clears the outfit and dresses the subject as the purpose dresses: a matching lingerie or swimwear set in an 18+ purpose (`intimateSet`), gym clothes for a workout purpose (`isWorkoutFocused`), everyday clothes otherwise. One surprise in three gets an image filter, and the filter then replaces the colour grading and the sharp-focus realism details, unless the Finish step is locked.

Clashes in the user's own choices are not blocked. `buildPrompt` returns them in `clashes`, and `ClashWarnings` (`shared/promptBuilder/PromptBuilderDialog/components/ClashWarnings/`) shows them.

## Purpose-specific modules

### Fitness (`fitness/`)

Workouts in four groups (`GYM_WORKOUTS`, `YOGA_POSES`, `PILATES_STRETCHES`, `CARDIO_BOXING`) plus `SPICY_POSES`, each with a full description; `FITNESS_SCENES`, `FITNESS_LIGHTING` and `FITNESS_PHOTO_STYLES`; fitness clothing and accessories. `outfitOptions(slot, state)` is the one list each outfit slot offers a subject: spicy cuts only once "Who" and an adult age are chosen (`adultChosen`), each item only for who it suits. The Outfit step, Random, Surprise me and the prompt all read it. Fitness is a `safe` purpose, so spicy means clothed.

### Lingerie and swimwear (`intimates/`, `outfitMenu/`)

`intimates/` holds the lingerie and swimwear items, who each suits, and `GARMENT_DETAILS`: every garment's full wording, used in sentence prompts in every purpose (tags keep the short name). `intimateOptions` offers them only outside the safe purposes, and leaves out revealing or see-through items (`REVEALING`) unless the purpose can choose nudity. `accessoryOptions` adds lingerie accessories outside the safe purposes.

`outfitMenu/` builds one Top and one Bottom menu (`areaGroups`) with groups Everyday, Gym, Lingerie and Swimwear, plus any custom group. One item is worn per area: `wearItem` sets the right field and clears the other, keeping the colour. The state still keeps `top`/`bottom` apart from `lingerieTop`/`lingerieBottom`, because the nudity levels treat them differently. In an always-clothed purpose the Lingerie and Swimwear groups come first.

### Faceless (`faceless/`)

`FACELESS_POSES` (body-led poses, offered in every 18+ purpose), `FACELESS_SHOTS` (framings that keep the face out, written in full), `FACELESS_PHOTO_STYLES`, `LOUNGE_OUTERWEAR`, and `FACE_FREE_LIGHT` (light wording without the face). `hidesFace(mode)` is true when the mode narrows `shotType` and every shot it allows is a faceless framing; then `realismOptions` leaves out face realism details. Faceless is 18+ without the Intimacy step, so it never has nudity: anatomy only shows with nudity in the prompt, `missingTop` requires a top for a woman, and the cover negatives are added in `negatives/`.

### Image filters (`filters/`)

`IMAGE_FILTERS`: film, camera and print looks, each with full wording and tags, written after the camera details, plus the optional date stamp (`dateStampText`). A filter clashes with a colour grading (other than natural) and with `SHARP_REALISM` details; `LIGHT_FILTERS` (Red Night Glow, Purple Club Light) also clash with a lighting setup and need a night or twilight scene.

## Custom clothes

The user's own garments come from `custom_clothes.json` at the project root.

| Step | Where | What happens |
|------|-------|--------------|
| Read | `backend/custom_clothes.py` | Read on every catalog request; each entry checked by the `CustomGarment` Pydantic model (`value`, `title` as text or per language, `prompt`, `tags`, `slot`, `covers`, `group`, `for`, `adult`). `covers: "both"` needs slot `top`; an adult item must be a top, bottom or accessory. A broken entry is left out and named in `problems`; adult entries are left out while adult content is off. |
| Serve | `backend/main.py` | Catalog fields `custom_clothes` and `custom_clothes_problems` |
| Check | `frontend/src/lib/customClothes/` | `applyCustomClothes` (called once in `App/` and in the render script) refuses an entry whose value repeats a built-in option or whose text suggests a minor (`minorWordIn`), then registers the rest with `setCustomClothes` and their titles with `setCustomLabels` |
| Offer | `frontend/src/lib/promptBuilder/customClothes/` | `customOptions(slot, who, adult)`, `customGarment`, `coversBoth`, `isCustom`; the outfit menus, `intimateOptions` and the prompt read them like built-in items. An adult item is worn as lingerie (`lingerieTop`/`lingerieBottom`). |

## Characters as builder choices

`character/` links saved characters and the builder:

- `traitsOf(state)` keeps only identity choices: who, age, face, hair and body, not what they wear or do.
- `withTraits(state, traits)` fills the builder from a character; a value the builder no longer offers is left unset rather than written as it is.
- `characterProblem(name, traits)` requires a name, "Who" and an adult age, and refuses minor terms, since a character can be used in the 18+ purposes.
- `characterLook(character, style)` writes the character's look as the builder would, for Generate to put in front of a typed prompt (`promptToSend` in `lib/characterPrompt/`).
- `surpriseLook` gives a random look, keeping the chosen "Who".
- `character/index.test.ts` also checks `sample_characters.json`: each sample is adult and uses only builder options.

## The JSON prompt (`spec/`)

The JSON prompt is the builder's choices as they reach the prompt, grouped into sections. It is written as text for the chosen model only when sent, so one JSON prompt suits every model.

| Function | Purpose |
|----------|---------|
| `PromptSpec` | `{ version: 1, purpose, outfit?, look?, <section>? }`; sections from `FIELDS`: `subject`, `appearance`, `hair`, `body`, `anatomy`, `content`, `pose`, `scene`, `lighting`, `camera`, `finish`, `details` |
| `specFromState(state, mode)` | Settles Random, keeps only choices in the prompt (`choicesInPrompt`), drops unset values |
| `stateFromSpec(spec)` | Back to a `BuilderState`, for the builder or for writing |
| `parseSpec(text)` | Parses and checks: known keys only, each value one of the builder's options (free-text fields excepted), garments against `outfitOptions` and `allIntimates`, at most three accessories, `look` as finite numbers, `version` equal to `SPEC_VERSION`. Errors are translated `create.json*` messages. |
| `specText(spec)` | Pretty-printed JSON for the prompt box |
| `specFromText(text, purpose)` | A typed prompt as JSON: the whole text becomes `subject.description` |
| `promptFromSpec(spec, modes, style)` | Finds the purpose among `modes` (the ones open to the subject) and runs `buildPrompt`, so the purpose's rules and the age safeguard apply |

How it is used:

- The prompt box holds JSON when `settings.promptFormat` is `json`. Its **JSON | Text** switch (`pages/create/SettingsPanel/components/PromptEditor/`) shows the JSON, or the text written from it (read-only). A typed prompt switched to JSON becomes `specFromText` in the first purpose open to the subject. The switch waits while a slider A/B test runs.
- Generate sends both the text and the JSON (`renderRequest`, `prompt_spec` in the body). History stores the JSON in the `prompt_spec` column; **Reuse settings** reopens it as JSON (`promptOfItem` in `lib/settings/`).
- The server checks only the shape and size, in `backend/prompt_spec.py` (Pydantic, `extra="forbid"`, `version: Literal[1]`, up to 1000 characters per text, 30 items per list, 12 `look` entries). The safety rules run on the text, as for any prompt.
- Both sides test the same example, `frontend/src/test/promptSpecExample.json`: `spec/index.test.ts` and `backend/tests/test_prompt_spec.py`.
- Versioning: a new detail is a new optional key. A change that breaks old prompts raises `SPEC_VERSION` and upgrades older ones in `upgraded`.

## Look sliders linked to choices

Slider add-ons (`kind: slider` in `backend/model_catalog.py`) are linked to builder choices in `frontend/src/lib/lookSliders/`.

- **Trait sliders** (`weight` to `bodyType`, `muscle-tone` to `muscles`, `skin-tone` to `skinTone`, `hair-length` to `hairLength`) are linked both ways. `withStrength` sets a strength and picks the nearest option; `lookStrength` reads the strength, following a picked option through its default when no strength is set; `withoutStrength` lets it follow the option again.
- **Phrase sliders** (`hair-volume`, `natural-look`) have no matching option. Past a threshold, `lookPhrases` adds a short phrase, which `resolveFacts` puts into `appearanceExtra`.
- Builder state and character traits keep the strengths in `strengths`; the JSON prompt keeps them in `look`; History keeps them in `strengths`.
- One component, `shared/lookSliders/LookSliderField`, is used in Create's Look section, the builder's Face & hair, Body and Character steps, and the character dialog, fed the downloaded sliders by `LookSlidersContext`.

## Adding an option or field safely

### A new option in an existing list

1. Add it to the list in `data/`, `extraData/` or the purpose module.
2. Give it an English label in `frontend/src/locales/en/options.json`, and the same key in all six other languages.
3. Tag it in `conflicts/` if it uses hands, a body position, the mouth, the legs, faces away, depends on hair length, light, place or weather.
4. If it is for only some subjects or purposes, add it to the relevant rule (`rules/`, `outfitOptions`, `intimateOptions`).
5. Run `cd frontend && npm test`.

### A new builder field

1. Add it to `BuilderState` and `emptyBuilderState()` in `build/` (saved states get the default through `withNewFields`).
2. If it is a single choice, add it to `CHOICE_OPTIONS` in `choices/`.
3. Add it to `STEP_FIELDS` (and `STEP_CHOICES` or `SURPRISE_BEFORE_ACTS` if Surprise me should pick it).
4. Resolve it in `resolveFacts/`, add it to `Facts`, write it in `prose/` and `tags/`, and blank it in `withoutHiddenSteps`.
5. Add it to `FIELDS` in `spec/` and to the matching section in `backend/prompt_spec.py`; update `promptSpecExample.json` if it helps both tests.
6. Show it in a step in `shared/promptBuilder/steps/`.
7. If an A/B test can compare it, add it to `CHOICE_FIELDS` in `lib/abTest/`.

### Tests that guard the builder

| Test | Checks |
|------|--------|
| `data/options.test.ts` | Every option has a label in `en/options.json`, and no label is left for an option that is gone |
| `conflicts/index.test.ts` | Clash detection; every choice on Random never clashes (400 rolls per subject); every option of each tagged field, pinned, with everything else Random; Surprise me in every shipped purpose and subject (300 rolls); warnings only for the user's own choices |
| `build/index.test.ts`, `build/surprise.test.ts` | Prose and tag output, pronouns, the explicit rules, Surprise me, per-step dice and locks |
| `rules/explicitDetails.test.ts`, `rules/maleOptions.test.ts` | Who and when anatomy, explicit details and men's options are offered and written; old saved states still load |
| `fitness/`, `faceless/`, `filters/`, `outfitMenu/`, `multiChoice/` tests | Each module's rules, such as Faceless never showing nudity and Fitness never writing lingerie |
| `spec/index.test.ts` | The shared example; Random settled; builder rules on JSON prompts; look strengths |
| `character/index.test.ts` | Traits, `characterProblem`, the sample characters |
| `frontend/src/i18n/locales.test.ts` | Every language has every label |
| `backend/tests/test_prompt_spec.py` | The server accepts the shared example and refuses other shapes |

`frontend/src/test/fixtures.ts` imports the real `prompt_modes.json` as `builderModes`, so the tests check the shipped purposes.
