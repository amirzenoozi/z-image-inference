# Design decisions

The choices that shape this project, and why each was made. Read this before changing one of them: most look arbitrary from the code alone, and several were made after trying the alternative.

## The app and its users

- **Personal and local.** The app runs on one Mac for its owner. It has no login and no public-exposure hardening; `APP_HOST=0.0.0.0` is only for a phone on a trusted network. Server inputs are still checked as if public, because a stale tab or a script can send anything.
- **Uncensored models.** Image models, LoRAs and the local chat model are picked in their uncensored ("abliterated") builds, because stock builds refuse or soften prompts. The app's own safeguards (the age checks, the adult locks, the safe-for-work rules) stay in force whatever the model. The one exception is a classifier: Laya is used as shipped, since it only classifies and never refuses.

## Prompts

- **The JSON prompt comes first.** The builder's JSON prompt (`PromptSpec`) is the source of truth; the text the model reads is written from it when sent. History keeps the JSON (`prompt_spec`), so Reuse reopens an image in the builder and A/B tests can change one field. Scripted renders must go through `make render`, never hand-written text. See [prompt-builder.md](prompt-builder.md).
- **Prompts sent to models stay English.** Only labels are translated; option values never are. See [translations.md](translations.md).

## Models and memory

- **One image model at a time.** Switching unloads the previous one first: two do not fit in 24 GB. All model work runs on one thread, because MLX only works on the thread that created it.
- **Helpers load only while working.** The local chat model (Ollama, `OLLAMA_KEEP_ALIVE`) and Laya (`DECISION_KEEP_ALIVE`) unload after use, so they hold no memory between tasks.
- **Laya runs in a child process.** Unloading it inside the web app freed the model but left about 0.8 GB (imported libraries and memory the allocator keeps). A child process that exits on unload gives every byte back, for about 1.3 s more per cold task. Chosen over keeping it in-process. See [decision-model.md](decision-model.md).
- **Laya runs on the CPU.** On the GPU (MPS), every fresh load pays about 13 s compiling Metal kernels, which defeats loading per task; the CPU also leaves the GPU to the image models.

## Chat

- **Ollama's own API, not its OpenAI-compatible one.** Only the native `/api/chat` takes `keep_alive`, which makes the model unload between chats.
- **System prompts live in `backend/system_prompts.py`.** Out of the client code, but in Python rather than text files, so they are easy to change and review. A small local model gets a short, direct prompt: with Grok's long one it copied the workflow steps ("Quantity: one. Generate reasoning: …") into its answer, which then became the image prompt.
- **Chats are append-only.** An exchange is created when the question is sent and completed once; editing an earlier question creates a new exchange (a branch, through `parent_id`) and keeps the old one. The tab label stays "Chat"; the model's name shows in a note under the tabs. See [chat.md](chat.md).

## Safety

- **Rules on the server.** Adult content, safe-for-work renders and the Laya check are enforced by the web app; the browser only hides and explains.
- **Fail closed.** If a required check cannot run (the image classifier still loading, Laya failing while adult content is locked), the request is refused rather than allowed.
- **Decisions in code, thresholds in `.env`.** Each Laya task decides in code; its thresholds are `.env` variables listed in `.env.example`, and each saved decision records the task's version (a fingerprint of its questions and thresholds).
- **What is saved about a decision.** The `decision_tasks` table keeps the task, its version, the linked chat exchange (not the text), the outcome (`pass`, `refuse` or `error`), the probabilities and the time taken. When Laya fails, the row records only the outcome `error`; the reason is logged with the trace id, not stored. The free `/api/decide` endpoint saves nothing.
- **Logs never hold content.** No prompts, chat text, character names, images, keys or the unlock word: only ids, settings, timings and trace ids. See [logging.md](logging.md).

## Code and process

- **The same purpose uses the same control everywhere** (sidebar, builder, character dialog), one shared component.
- **Small functions:** at most about 9 branches, 4 parameters and 100 lines; extracted pieces must name a real idea.
- **Commits** follow `<type>(<scope>): <description>` (feat, docs, fix, test, chore); translations go first, in their own `chore(i18n)` commit, so every commit builds and shows the right text. No AI attribution in commits or on GitHub. Secrets are scanned on every commit and push (`.githooks/check-secrets`); plain settings such as `OLLAMA_MODEL` are exempt from its `.env` value check, since the app shows them.
