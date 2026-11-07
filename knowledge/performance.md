# Performance and hardware

## Render times

Measured on an Apple M5 with 24 GB of memory:

| Model | 512 × 512 | 1024 × 1024 |
|-------|-----------|-------------|
| Z-Image-Turbo, 9 steps, 8-bit (default) | about 13 s | about 55 s |
| Z-Image-Turbo, 9 steps, 4-bit | about 10 s | about 48 s |
| Z-Image-Turbo, 9 steps, original | about 12 min | about 13 min |
| WAI-Illustrious, 28 steps | | about 40 s |
| Anime Desire, 30 steps | | about 45 to 60 s |
| RealVisXL, 30 steps | | about 45 to 60 s (the hint the model dialog shows) |
| FLUX.1-dev (4-bit), 25 steps | | a few minutes |
| MOSS-Image, 30 steps | about 2 min | about 7 min |

- **Switching models** takes about 10 seconds; the first step after a switch is a little slower while the model warms up. A change in the set of add-ons a render uses reloads the model too; a change in a slider's strength does not.
- **MOSS-Image** adds about 20 seconds for a new prompt, to run its text encoder; repeating the last prompt with a new seed or size skips that.
- **Variations** run only part of the steps (about the Change percentage of them), so they are quicker than a full render.
- **The face lock** adds about 2 GB of memory while in use, and a few seconds to the first render that uses it.
- Each image's render time is shown in its details in History, and in the logs.

## Model memory

- **Z-Image-Turbo at full size** needs about 20 GB of memory, which does not fit beside macOS on a 24 GB Mac: it swaps, so an image takes about 12 minutes, and switching to another model afterwards can take as long again. The default 8-bit copy fits, peaking at 11.7 GB.
- **FLUX.1-dev** runs from its 4-bit copy in about 10 GB.
- **MOSS-Image**'s text encoder (16 GB) and image model (10 GB) do not fit in memory together, so they take turns. With `MODEL_COMPRESSION=on`, the 8-bit text encoder needs 10 GB instead of 17 GB.
- Only one model is in memory at a time.

If renders are very slow, close other memory-hungry apps first.

## Helpers: memory and latency

Measured in this project on the same Mac:

| Helper | Memory | Latency |
|--------|--------|---------|
| Ollama chat model (an uncensored Gemma 3 4B, 4-bit build) | about 2.7 GB while loaded; Ollama itself about 50 MB with no model loaded | about 40 tokens a second; first words after about 1 s once loaded (the first message also waits a few seconds for the load) |
| Laya, the decision model (CPU) | its own process, ended after each task by default, so the web app stays around 0.36 GB | about 1.5 s to start its process, then about 0.1 s per decision |
| Image classifier (CPU, inside the web app) | small (a 343 MB checkpoint) | a few seconds to load after each start; runs once per saved image |

- **The chat model unloads** `OLLAMA_KEEP_ALIVE` after the last message (`2m` by default; `0` unloads it at once), so it holds no memory between chats.
- **Laya** starts loading as soon as a locked chat question arrives, so its start overlaps saving the question. `DECISION_KEEP_ALIVE=60` keeps the process for 60 seconds after its last task, which saves the 1.5 s start for a burst of questions at the cost of its memory meanwhile. `DECISION_THREADS` sets its CPU threads (8 by default).
- **The GPU is shared** when you chat during a render: the Ollama model and the image model both use it, so both run slower. Laya and the image classifier run on the CPU and leave the GPU alone.

## Monitoring

Both servers log each model load and unload with its time, each render with its seconds, each chat with its time to the first words and total, and each Laya decision with its milliseconds and trace id. How to read and follow them is in [logging.md](logging.md). For memory, Activity Monitor shows the two Python servers, the Laya process (`laya_worker.py`, only while it runs) and `ollama`.

## Disk

| Set-up | Space |
|--------|-------|
| Z-Image-Turbo only (default) | about 44 GB (original 32.9 GB plus the 8-bit copy 10.7 GB) |
| All six models, originals | about 142 GB (the sum of the sizes in [Models](models.md#download-sizes)) |
| All six, with `MODEL_COMPRESSION=on` | about 128 GB (Z-Image-Turbo's and FLUX.1-dev's originals are always kept) |

Add-ons are small (0.01 to 0.7 GB each); the face lock adds 3.4 GB, Laya about 800 MB and the image classifier 343 MB. Building a compressed copy needs room for the copy while the original is still there. History is stored in `history.db`; its size is shown in History, and **Clean up** frees space.

## Tested on

| Component | Tested on |
|-----------|-----------|
| Chip | Apple M5 |
| Memory | 24 GB |
