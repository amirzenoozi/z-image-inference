# Third-party notices

This project includes code and data from other projects, and downloads models at run time. This file lists them with their licences.

## Included in this repository

| What | Where | Source | Licence |
|------|-------|--------|---------|
| Prompt builder options and their wording (ported to TypeScript); the prompt assembly is rewritten | `frontend/src/lib/promptBuilder/data.ts` | [ComfyUI Photoreal Prompt Builder](https://github.com/artokun/ComfyUI-Photoreal-Prompt-Builder), commit `a8a60f0d5a`, by artokun | MIT, see [`licenses/ComfyUI-Photoreal-Prompt-Builder-MIT.txt`](licenses/ComfyUI-Photoreal-Prompt-Builder-MIT.txt) |
| Explicit pose and action descriptions | `frontend/src/lib/promptBuilder/data.ts` | [ComfyUI Photoreal Prompt Builder NSFW module](https://github.com/artokun/ComfyUI-Photoreal-Prompt-Builder-NSFW), commit `25f332bf91`, by artokun | MIT, as stated in the module's README (see note below) |
| MOSS-Image pipeline code, with a change for MPS and a per-step callback | `moss_pipeline.py` | [`merged-model/pipeline_moss_image.py`](https://huggingface.co/axiomofmind/Moss-image-nsfw-uncensored-lora) by the OpenMOSS team | Apache 2.0, see [`LICENSE`](LICENSE) |

**Note on the NSFW module:** its repository has no licence file of its own. Its README says "License: MIT" and links to the main project's licence file. We rely on that statement; ask the author to add a licence file before redistributing this project widely.

## Downloaded at run time (not included)

The server downloads these models into `models/` on first use. They are not part of this repository; their own licences apply to how you use them and the images they produce.

| Model | Source | Licence |
|-------|--------|---------|
| Z-Image-Turbo | [Tongyi-MAI/Z-Image-Turbo](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo) | Apache 2.0 |
| WAI-NSFW-Illustrious v12 | [votepurchase/waiNSFWIllustrious_v120](https://huggingface.co/votepurchase/waiNSFWIllustrious_v120) | CreativeML OpenRAIL-M (includes use restrictions) |
| Anime Desire | [AI-Porn/anime-desire-illustrious](https://huggingface.co/AI-Porn/anime-desire-illustrious) | OpenRAIL (includes use restrictions) |
| SDXL configuration files, used to load Anime Desire's single-file checkpoint (no weights) | [stabilityai/stable-diffusion-xl-base-1.0](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0) | CreativeML OpenRAIL++-M |
| MOSS-Image NSFW (MOSS-Image with a merged LoRA) | [axiomofmind/Moss-image-nsfw-uncensored-lora](https://huggingface.co/axiomofmind/Moss-image-nsfw-uncensored-lora), based on [OpenMOSS-Team/MOSS-Image-SFT](https://huggingface.co/OpenMOSS-Team/MOSS-Image-SFT) | Apache 2.0 |
