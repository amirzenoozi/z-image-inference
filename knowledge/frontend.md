# Frontend

The UI is a React 19 and TypeScript app styled with Tailwind v4, built with Vite into `frontend/dist`, which `main.py` serves. This file explains how the code is laid out, how data flows from settings to a saved image, and the conventions every new component should follow.

For the prompt builder's internals see [prompt-builder.md](prompt-builder.md); for languages see [translations.md](translations.md); for the commands see [development.md](development.md).

## Layout

```
frontend/
├── scripts/            render.mjs and renderSpecs.ts (scripted renders)
├── vite.config.ts      dev proxy, vendor chunk, Vitest settings
└── src/
    ├── main.tsx        mounts <App />, registers the service worker on secure pages
    ├── index.css       Tailwind, and the .lucide icon size and stroke
    ├── App/            the root component, LanguageGate, useAbTest
    ├── api/            the HTTP client for /api/*
    ├── types/          shared TypeScript types (catalog, settings, history, Loadable …)
    ├── i18n/           t, tn, tOr, optionLabel
    ├── locales/        <code>/<namespace>.json messages
    ├── lib/            logic with no JSX (except a few hooks)
    ├── pages/          create/, history/, characters/
    ├── shared/         components used by more than one page
    └── test/           setup, fixtures, select helper, the shared JSON prompt example
```

### pages/, shared/ and lib/

| Folder | Holds | Rule |
|--------|-------|------|
| `pages/<page>/` | `CreatePage`, `HistoryPage`, `CharactersPage` and the components only that page uses | A component moves to `shared/` once a second page needs it |
| `shared/` | Components used by more than one page, by topic: `ui/` (Modal, IconButton, LazyPart, TooltipBubble, topDialog, `ui` with Spinner, ErrorNotice, Section, DialogLoading, PromptBlock), `form/`, `images/` (CompareDialog, ImageFacts, SensitiveImage), `characters/`, `lookSliders/`, `models/`, `abTest/`, `adultContent/`, `promptBuilder/` | The prompt builder stays together in `shared/promptBuilder/`, since Create and Characters both use it |
| `lib/` | Logic: settings, generation, the A/B test, History's address, characters, adult content, look sliders, styles, the prompt builder | Keep business rules here, testable without rendering |

### One folder per module

- Every module and component has its own folder named after it, holding `index.ts` or `index.tsx`, and its test `index.test.ts(x)` beside it when it has one (`lib/settings/index.ts`, `pages/create/CreatePage/components/PaneSwitch/index.tsx`).
- A component used by only one other component sits in that component's `components/` folder (`pages/history/HistoryPage/components/HistoryViewer/`, and inside it `components/EditSession/`).
- A hook used by only one module sits beside it in the same folder (`pages/history/HistoryPage/useViewerAddress.ts`, `App/useAbTest.ts`).
- Import a module by its folder (`../settings`), never `.../index`.

### Pages at a glance

| Page | Main parts |
|------|-----------|
| `pages/create/` | `CreatePage` (with `PaneSwitch`, `ResultPanel`), `SettingsPanel` (with `ModelPicker`, `PromptEditor`, `CharacterPicker`, `LookSliders`, `AddonsPanel`, `ResolutionPicker`, `SamplingControls`, `StartImageBlock`, `ChatPanel`, `AbTestBar`, `AbTestDialog`, `SizeHint`), `models/modelParts` |
| `pages/history/` | `HistoryPage` (with `HistoryFilters`, `HistoryGrid`, `Pagination`, `HistoryCleanUp`, `HistoryViewer` and its `EditSession`, `ColourPalette`, `SensitiveButton`, `ImageCharacter`, `CompareSetButton`), `FavouriteButton` |
| `pages/characters/` | `CharactersPage`, `CharacterEditor` (with `CharacterFace`) |

## App/

`App/index.tsx` is the root:

1. `App` loads the catalog with `useCatalog()` (a `Loadable`). Pending shows `Loading`; failed shows `ErrorNotice` with a retry.
2. `LanguageGate` loads the catalog's `language` with `loadLanguage` before rendering anything else; until then it shows the loading screen (English is the only bundled language).
3. Providers wrap the workspace: `AdultContentProvider`, then `CharactersProvider`.
4. `Workspace` registers the custom clothes once (`applyCustomClothes`), derives the working catalog with `catalogFor(fullCatalog, adultShown)`, loads and saves the settings, parses the builder modes, and owns the view, the generation, model status, render alerts and the A/B test. It provides `LookSlidersContext` and `AbTestContext` to everything below.
5. `generateWith` builds the request with `renderRequest` and runs it with `useGeneration`; it does nothing while a render is pending or the prompt is empty.

The view (`create`, `history`, `characters`) lives in the address (`/`, `/history`, `/characters`) through `lib/view`'s `useView`. `CreatePage` stays mounted and is only hidden on other views, so its state survives switching.

### Lazy loading

History, Characters, the prompt builder dialog and the A/B test dialog load their code the first time they are opened (`lazy` in `App/index.tsx`, `pages/create/SettingsPanel/index.tsx` and `.../PromptEditor/index.tsx`). Each is wrapped in `LazyPart` (`shared/ui/LazyPart`), which shows a placeholder (`Loading`, or `DialogLoading` for a dialog) and, if the chunk fails to load (usually because the app was rebuilt while the page was open), an error with a reload button. Keep the first screen, Create, light. `App/lazyViews.test.tsx` checks the placeholder.

`vite.config.ts` puts React, React DOM, the scheduler, Headless UI and its Floating UI, React Aria and TanStack dependencies into one `vendor` chunk, so the browser keeps them while the app's own code changes. In development, Vite proxies `/api` to `http://127.0.0.1:7860`.

## State and settings

There is no state library. State is React state and context, saved where needed in `localStorage`.

| Key | Module | Holds |
|-----|--------|-------|
| `z-image-studio.settings.v1` | `lib/settings` | Create's `GenerationSettings` (model, prompt, `promptFormat`, negative prompt, size, steps, guidance, seed, `randomSeed`, start image, `characterId`, `lookIncluded`, add-ons, strengths) |
| `z-image-studio.prompt-builder.v3` | `lib/promptBuilder/storage` | The builder's state (reads the old `v2` once) |
| `z-image-studio.ab-test.v2` | `lib/abTest` | The running A/B test (reads the old `v1` once) |
| `z-image-studio.adult-content-unlocked` | `lib/adultContent` | `'true'` once this browser is unlocked |
| `z-image-studio.character-gender.v1` | `lib/characterFilter` | The Characters page's gender filter |

`lib/settings` also owns the model rules for settings: `initialSettings`, `withModel` (keeps values the new model allows), `switchModel` (applies the model's sampling defaults), `settingsFromItem` and `variationSettings` (from a History image; a stored `prompt_spec` comes back as JSON with `promptFormat: 'json'`), `characterSettings`, `snapSide` and `presetsFor`. Loading checks every stored field and falls back to defaults for anything it can't use.

Contexts:

| Context | Provided by | Holds |
|---------|-------------|-------|
| `AdultContentContext` (`lib/adultContent`) | `AdultContentProvider` | `shown` and `toggle` |
| `CharactersContext` (`lib/characters`) | `CharactersProvider` | The characters as a `Loadable`, and `reload`; `useCharacters`, `useCharacter(id)` |
| `LookSlidersContext` (`shared/lookSliders/LookSlidersContext`) | `Workspace` | The downloaded slider add-ons (`downloadedSliders`) |
| `AbTestContext` (`shared/abTest/AbTestContext`) | `Workspace` | The running A/B test, or null |

Each context has a harmless default (no characters, adult content shown, no sliders, no test), so a single component renders in a test without its provider.

## API client

`frontend/src/api/index.ts` has one function per endpoint (catalog, model status, download and remove, generate, job progress and cancel, History pages, position, sets, export, palette, edits, favourite, sensitive, delete, summary and clean-up, characters, the unlock word, chat streaming, and image, download and face URLs).

- `request` wraps `fetch`: an abort is re-thrown as is, a network failure becomes `ApiError` with status 0 and the translated `create.appUnreachable`, and a non-OK answer becomes `ApiError` with the server's `detail` (`describeDetail` reads FastAPI's string or validation list).
- `generateBody(settings, jobId)` is the one place that writes a render request's body. Create and the render script both use it.
- `CANCELLED_STATUS` (409) marks a cancelled render.
- `hideSensitive` parameters send `hide_sensitive` while this browser's adult lock is on.

## Generation flow

```
GenerationSettings
   │ renderRequest(settings, context, link)        lib/renderRequest
   │   promptToSend: JSON written as text, character look added     lib/characterPrompt
   │   addonsToSend, strengthsToSend: only downloaded, in range     lib/addons, lib/lookSliders
   ▼
SentSettings ──▶ useGeneration().run(request)        lib/generation
                   newJobId()                        lib/jobId
                   generateImage → POST /api/generate (generateBody)
                   useJobProgress(jobId) polls GET /api/jobs/{id}/progress every second   lib/jobProgress
   ▼
GenerationState: idle | pending | failed | settled
```

- `renderRequest` returns `{ status: 'ready', request }` or `{ status: 'problem', reason }`. It sends the prompt as text (`promptFormat: 'text'`) with the JSON in `promptSpec`, the model actually shown (a model hidden by the lock falls back to the first one shown), `safeOnly` while adult content is locked, and an optional `RunLink` (`testSet` for an A/B test, `chatExchangeId` for a render right after a chat answer).
- `useGeneration` keeps the result area's last outcome, so a cancelled render restores it instead of showing an error. `retry` re-runs a failed request; `cancel` calls `cancelJob` and lets the user try again if that call fails.
- `useJobProgress` returns null until the first answer and after a failed check: progress is extra information, so the result area then shows only the elapsed time.
- `newJobId` builds a UUID from `crypto.getRandomValues` where `crypto.randomUUID` is missing (plain HTTP from a phone).

## A/B test

`lib/abTest/` holds the rules and `App/useAbTest.ts` runs them.

- A test (`AbTest`) compares 1 to 3 settings (`MAX_SETTINGS`), each a look slider or a single-choice builder field (`TestSetting`), across 2 to 6 versions (`MIN_VERSIONS`, `MAX_VERSIONS`), each with a value for every setting.
- `startTest` fixes the seed (picking one if each render had its own) and puts version A into the prompt. `testVersions` gives each version's settings: a slider follows the linked-choice rule (`withStrength`), a choice is set in the JSON prompt. `testProblem` and `valuesProblem` say why a test can't run.
- `useAbTest.run` renders the versions one at a time on one seed, each with `testSet: { id, label }`, stopping at the first failure. History saves `set_id` and `set_label`; with more than one image the results open in `CompareDialog`.
- While a test runs, `AbTestContext` is not null, and every control that could change what it locks reads it and turns off: the model, the character, the purpose, Who, Age, the tested fields, the seed, Random, Surprise me and prompt replacement (Reuse settings, Use character, chat prompts). `lockedBuilderFields(test)` gives the builder fields (`who`, `age`, each tested field and each slider's linked choice). A new control that could change any of these must read `AbTestContext` too.

## History

- **Address**: `lib/historyAddress` keeps History's page, filters (`q`, `model`, `ratio`, `character`, `favourites`) and the open image (`?image=<id>`) in the query string, so a reload, bookmark or Back and Forward reopen them. `useHistoryAddress` returns the address, `go(next, 'push' | 'replace')` and a `visits` counter.
- **Viewer**: `pages/history/HistoryPage/useViewerAddress.ts` opens the image named in the address: it looks up its position with `fetchHistoryPosition` (so the viewer knows its index and total), keeps the address in step as the viewer moves, and removes `image` on close. A missing image (404, deleted or filtered out) clears it from the address with `replace`; another failure shows an error with a retry.
- **Sets**: an image with a `set_id` shows `CompareSetButton`, which loads the set (`GET /api/history/sets/{set_id}`) and opens it in `shared/images/CompareDialog`, which shows images side by side and highlights the facts they don't share.
- **Sensitive images** are blurred in lists by `SensitiveImage`; while the adult lock is on they are left out (`hide_sensitive`).

## Characters

Characters are loaded once by `CharactersProvider` and shared through `useCharacters` and `useCharacter`. The Characters page lists them and edits one in `CharacterEditor`, which reuses the builder's `SubjectStep`, `AppearanceStep` and `BodyStep` and checks it with `characterProblem`. `useForgetDeletedCharacter` in `App/` clears a chosen character that was deleted. In Create, `lib/characterPrompt` puts a character's look in front of a typed prompt unless `settings.lookIncluded` says the prompt already has it.

## Adult content

There are two locks (see `CLAUDE.md`). `ADULT_CONTENT` in `.env` is enforced by the server. On top of it, the browser has its own lock:

- `lib/adultContent`: `loadUnlocked` and `saveUnlocked` (every browser starts locked; unreadable storage counts as locked) and `catalogFor(catalog, shown)`, which removes adult purposes, models and add-ons while locked.
- `AdultContentProvider` holds `shown` for the whole app and shows a short notice when it switches.
- `useUnlock` lets the user type the hidden word on the Create page with no field focused, or in a dialog that five taps on the title open on a phone. The word is checked by `POST /api/adult-content/word` (`checkUnlockWord`).
- While locked, renders send `safe_only` and History requests send `hide_sensitive`.

## UI conventions

### Dialogs

- Every dialog uses `Modal` (`shared/ui/Modal`): a header with the title and a close button, the content (the only part that scrolls), then the buttons passed as `actions` under a divider, secondary action first and main action last. They are centred, or on the right with an `actionsNote` on the left. A two-column dialog (such as the image view) puts its actions at the bottom of the details column instead.
- Sizes: `md` (default) is a bottom sheet on phones; `lg`, `xl` and `full` fill a phone's screen and keep the header clear of the notch.
- A key a dialog handles (Escape, the image viewer's keys) acts only on the dialog on top: check `isTopDialog(element)` from `shared/ui/topDialog`, which compares against the last open `[role="dialog"][aria-modal="true"]`.

### Icons and icon buttons

- Icons come from `lucide-react`, never hand-drawn SVGs or text symbols. Their size (1rem) and stroke (1.75) are set once on `.lucide` in `index.css`.
- A button that shows only an icon uses `IconButton` (`shared/ui/IconButton`), which takes a `label` (its accessible name and tooltip) and an optional `shortcut`, shown in the tooltip.

### Phones first

| Width | Layout |
|-------|--------|
| Below 640px (`sm`) | The views are a bar at the bottom (`NAV_CLASS` in `App/`); every `Modal` is a bottom sheet (`md`) or fills the screen, with full-width buttons |
| Below 1024px (`lg`) | Create shows Settings or Result, one at a time, switched by `PaneSwitch`, which shows a dot when a result arrives while Settings is open |
| 1024px and up | Settings (440px) and Result side by side |

- Fields use 16px text below `sm` (`text-base sm:text-sm` in `fieldFrameClass`, `lib/styles`) so iOS does not zoom in.
- Touch screens get 44px targets and no hover-only controls through `pointer-coarse:` variants (`IconButton`, `tabClass`, `secondaryButtonClass`, `Checkbox`). Keep new controls the same.
- Keep clear of the notch and home bar with `env(safe-area-inset-*)` (the app shell, the header, the bottom bar and `Modal` all do).
- Shared class strings live in `lib/styles` (`controlHeight`, `fieldFrameClass`, `fieldLabelClass`, `secondaryButtonClass`, `fieldButtonClass`, `chipClass`, `cardClass`, `tabClass`).

### One control per purpose

The same setting uses the same control everywhere it is edited: one shared component for the sidebar, the prompt builder and the character dialog (the look sliders are one `LookSliderField`). When one place changes, change them all. Hide a sidebar control for a prompt from the builder when the builder already sets it (Create's Look section is for typed prompts only).

### Loading, empty and error states

- Data that loads is a `Loadable<T>` (`types/`): `pending`, `failed` (with `error`) or `settled` (with `value`, which may be empty). `useLoadable(load)` in `lib/hooks` tracks it, aborts on unmount and offers `retry`.
- Never show empty-state text while data is pending: show a spinner or placeholder (`Spinner`, `Loading`, `DialogLoading`, `animate-pulse` blocks).
- A failure shows `ErrorNotice` with `onRetry`, never something that looks like "no data". Where a part is optional (job progress, a palette), its failure hides only that part, and the code says so.
- Generation has its own `GenerationState`: `idle`, `pending` (with `startedAt`, `jobId`, `cancelling`), `failed` (with the request, for retry) or `settled` (with the saved item).

## Testing

- **Vitest** with **jsdom** (`vite.config.ts`, `test` section), `restoreMocks: true`. Run `cd frontend && npm test`.
- **Testing Library** (`@testing-library/react`, `user-event`, `jest-dom`). `src/test/setup.ts` adds the jest-dom matchers, a no-op `ResizeObserver` and `scrollIntoView` (jsdom has neither), and after each test runs `cleanup()` and clears `localStorage`.
- `src/test/fixtures.ts`: `builderModes` (the real `prompt_modes.json`), sample add-ons (`tattooAddon`, `weightSlider`), models (`fastModel`, `animeModel`), `catalog`, `historyItem(overrides)`, `character(overrides)`, and `deferred()` to hold a request pending so the waiting state can be tested.
- `src/test/select.ts`: `chooseOption(field, option)` picks from the app's Headless UI `Select` the way a person does.
- `src/test/promptSpecExample.json` is the JSON prompt both the frontend and backend tests read.
- Mock the API module with `vi.mock('../api', ...)` and keep the real functions you don't mock (see `App/lazyViews.test.tsx`).
- Type check and lint with `npx tsc -b && npx oxlint src`; `make check` runs lint and both test suites.

## Scripted renders

`make render FILE=list.json [DRY_RUN=1]` renders a list of JSON prompts through the running web app and saves each PNG to `~/Pictures/z-image/`.

| File | Role |
|------|------|
| `Makefile` | `cd frontend && node scripts/render.mjs <abs path> [--dry-run]` |
| `frontend/scripts/render.mjs` | Starts Vite in middleware mode and loads `renderSpecs.ts` through `ssrLoadModule`, because the app's code uses `import.meta.glob` (to load languages) |
| `frontend/scripts/renderSpecs.ts` | Fetches the catalog, characters and model status from `APP_URL` (default `http://127.0.0.1:7860`), registers custom clothes, then for each entry builds the request and posts it, one at a time, and downloads the PNG from `/api/history/{id}/download` |
| `frontend/src/lib/renderSpecs/` | `parseEntries` (refuses anything that is not a list of entries) and `entrySettings` (the entry's JSON prompt checked as the app checks one, the builder's negative prompt, the model's defaults where the entry leaves something out; an unknown model or an unwritable JSON prompt is a problem, never a silent fallback) |

An entry is `{ "spec": {...}, "name"?, "model"?, "width"?, "height"?, "steps"?, "guidance"?, "seed"?, "characterId"? }`. Each request goes through `renderRequest` and `generateBody`, exactly as Create's Generate, so the text is written from the JSON with the purpose's rules and History keeps the JSON. The script sends `safeOnly: false`; the server's `ADULT_CONTENT` lock still applies. A failed render is reported and not retried, since the server may already have made it; any failure sets exit code 1.

Render images by script only this way, never by posting hand-written text to `/api/generate`.
