# Performance and hardware

## Render times

Measured on an Apple M5 with 24 GB of memory:

| Model | 512 × 512 | 1024 × 1024 |
|-------|-----------|-------------|
| Z-Image-Turbo, 9 steps, 8-bit (default) | about 13 s | about 55 s |
| Z-Image-Turbo, 9 steps, 4-bit | about 10 s | about 48 s |
| Z-Image-Turbo, 9 steps, original | about 12 min | about 13 min |
| WAI-Illustrious, 28 steps | | about 40 s |
| Anime Desire, 30 steps | | about 45–60 s |
| MOSS-Image, 30 steps | about 2 min | about 7 min |

- **Switching models** takes about 10 seconds; the first step after a switch is a little slower while the model warms up.
- **MOSS-Image** adds about 20 seconds for a new prompt, to run its text encoder; repeating the last prompt with a new seed or size skips that.
- **Variations** run only part of the steps (about the Change percentage of them), so they are quicker than a full render.
- Each image's render time is shown in its details in History.

## Memory

- **Z-Image-Turbo at full size** needs about 20 GB of memory, which does not fit beside macOS on a 24 GB Mac: it swaps, so an image takes about 12 minutes, and switching to another model afterwards can take as long again. The default 8-bit copy fits, peaking at 11.7 GB.
- **MOSS-Image**'s text encoder (16 GB) and image model (10 GB) do not fit in memory together, so they take turns. With `MODEL_COMPRESSION=on`, the 8-bit text encoder needs 10 GB instead of 17 GB.
- Only one model is in memory at a time.

If renders are very slow, close other memory-hungry apps first.

## Disk

| Set-up | Space |
|--------|-------|
| Z-Image-Turbo only (default) | about 44 GB (original 32.9 GB plus the 8-bit copy 10.7 GB) |
| All four models, originals | about 92 GB |
| All four, with `MODEL_COMPRESSION=on` | about 78 GB (Z-Image-Turbo's original is always kept) |

Building a compressed copy needs room for the copy while the original is still there. History is stored in `history.db`; its size is shown in History, and **Clean up** frees space.

## Tested on

| Component | Tested on |
|-----------|-----------|
| Chip | Apple M5 |
| Memory | 24 GB |
