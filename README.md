# Z-Image Inference on Apple Silicon

[![Licence: Apache 2.0](https://img.shields.io/badge/licence-Apache_2.0-blue)](LICENSE)
[![macOS on Apple Silicon](https://img.shields.io/badge/macOS-Apple_Silicon-black?logo=apple&logoColor=white)](#requirements)
[![Python 3.12+](https://img.shields.io/badge/Python-3.12+-3776AB?logo=python&logoColor=white)](pyproject.toml)
[![FastAPI](https://img.shields.io/badge/FastAPI-backend-009688?logo=fastapi&logoColor=white)](backend/main.py)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](frontend/package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](frontend/tsconfig.app.json)
[![MLX](https://img.shields.io/badge/MLX-Metal-FF6F00)](https://github.com/ml-explore/mlx)
[![Last commit](https://img.shields.io/github/last-commit/amirzenoozi/z-image-inference)](https://github.com/amirzenoozi/z-image-inference/commits/main)
[![Stars](https://img.shields.io/github/stars/amirzenoozi/z-image-inference?style=social)](https://github.com/amirzenoozi/z-image-inference/stargazers)

[![English](https://img.shields.io/badge/🇬🇧-English-lightgrey)](docs/usage.md#language)
[![Nederlands](https://img.shields.io/badge/🇳🇱-Nederlands-lightgrey)](docs/usage.md#language)
[![Italiano](https://img.shields.io/badge/🇮🇹-Italiano-lightgrey)](docs/usage.md#language)
[![Français](https://img.shields.io/badge/🇫🇷-Français-lightgrey)](docs/usage.md#language)
[![Deutsch](https://img.shields.io/badge/🇩🇪-Deutsch-lightgrey)](docs/usage.md#language)
[![Español](https://img.shields.io/badge/🇪🇸-Español-lightgrey)](docs/usage.md#language)
[![Português](https://img.shields.io/badge/🇧🇷-Português-lightgrey)](docs/usage.md#language)

![The Create page: model, prompt, resolution and sampling settings on the left, the generated image on the right](docs/images/create.png)

> Generate images locally on your Mac with Z-Image-Turbo, RealVisXL, two SDXL anime models and MOSS-Image, from a clean web interface, in seven languages. Nothing leaves your machine (unless you turn on the optional Grok chat).

Z-Image Inference runs image generation models natively on Apple Silicon (MLX and Metal) and gives them a friendly browser UI: write or build a prompt, pick a model and a size, and generate. Every image is kept in a searchable History, where you can browse, compare, edit and make variations of it.

| Model | Best for |
|-------|----------|
| [Z-Image-Turbo](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo) (default) | Fast photorealistic images, including readable text |
| [WAI-NSFW-Illustrious v12](https://huggingface.co/votepurchase/waiNSFWIllustrious_v120) (SDXL) | Anime and illustration styles |
| [Anime Desire](https://huggingface.co/AI-Porn/anime-desire-illustrious) (Illustrious SDXL) | Anime and hentai styles, with Danbooru tags |
| [MOSS-Image NSFW](https://huggingface.co/axiomofmind/Moss-image-nsfw-uncensored-lora) | Photorealistic adult content (slow) |
| [RealVisXL V5.0](https://huggingface.co/SG161222/RealVisXL_V5.0) (SDXL) | Photorealistic people, and keeping a character's face in photo style |

Only Z-Image-Turbo downloads by itself; you add or remove the others from the app.

## Highlights

- **Runs entirely on your Mac**, with live progress, Cancel, and a notification when a long render finishes
- **Prompt builder**: assemble a detailed prompt step by step for a purpose (portrait, fashion, scene, 18+ and more), written as a rich description or as weighted tags to suit each model
- **Prompt weights and long prompts** (`(tag:1.3)`) on the SDXL models, with nothing cut off after 77 tokens
- **Variations**: start a new image from one you made, with a slider for how much it may change
- **Characters**: name a person once, then make many images of them with the same look, and find them all in History; 13 sample characters to start with
- **Face lock**: keep a character's face across images on the SDXL models (IP-Adapter), in photo style with RealVisXL or anime style with the others, from a History image or your own photo (kept safe for work)
- **History**: search, filter by model, ratio, character and favourites, page through it, compare two images side by side, and export a zip
- **Sensitive images blurred** in lists, marked by the prompt's words and by a small image classifier, and shown as they are when opened
- **Image viewer and editor**: browse with the arrow keys, zoom to 100%, go full screen, see the colour palette, and rotate, flip or crop into a new copy
- **Chat with Grok** (optional) to turn a plain description into a detailed prompt
- **Seven languages**: English, Nederlands, Italiano, Français, Deutsch, Español and Português, set in `.env`; prompts stay English for the models
- **Light and dark mode**, keyboard shortcuts, and settings remembered between visits

## Requirements

- A Mac with Apple Silicon; 24 GB of memory is comfortable (tested on an M5 with 24 GB)
- macOS, [uv](https://github.com/astral-sh/uv) (it installs Python 3.12+ for you) and [Node.js](https://nodejs.org/) 20+
- Disk space: about 45 GB for Z-Image-Turbo (its original plus the 8-bit copy it runs), more for each extra model ([sizes](docs/models.md#download-sizes))

## Quick start

```bash
git clone https://github.com/amirzenoozi/z-image-inference.git
cd z-image-inference
uv sync
cd frontend && npm ci && npm run build && cd ..
```

Then run the two parts, each in its own terminal:

```bash
uv run python backend/model_server.py   # loads and runs the models
uv run python backend/main.py           # the web app
```

Open **http://127.0.0.1:7860**. The first start downloads Z-Image-Turbo (about 33 GB) and builds its 8-bit copy, so it takes a while once; after that it starts in seconds.

## Settings

Optional, in a `.env` file in the project folder:

| Variable | What it does |
|----------|--------------|
| `APP_LANGUAGE` | The app's language: `en` (default), `nl`, `it`, `fr`, `de`, `es` or `pt` |
| `XAI_API_KEY` | Turns on **Chat with Grok** ([xAI API key](https://x.ai/)) |
| `Z_IMAGE_BITS` | Which Z-Image-Turbo copy to run: `8` (default), `6`, `5`, `4`, `3`, or `original` |
| `MODEL_COMPRESSION` | `on` keeps smaller compressed copies of the other models instead of their originals |

Restart both servers after changing them. See [Models](docs/models.md) for what each setting changes.

### Keeping secrets and odd branch names out of git

Once per clone: `git config core.hooksPath .githooks` and `brew install gitleaks`. The pre-commit and pre-push hooks then block any change that contains a value from your `.env` or looks like a key (`.githooks/check-secrets`). Without gitleaks only the `.env` check runs.

The same hooks only allow the branch names `dev`, `main`, `feature/…`, `bug/…`, `docs/…` and `test/…`.

Switching branches prints a checklist of these checks for the new branch (`.githooks/post-checkout`); it only informs, the commit and push hooks do the blocking.

## Documentation

- [Using the app](docs/usage.md): the language, creating images, the prompt builder, prompt weights, Grok chat, History, the viewer, the editor, variations, characters and the face lock
- [Models](docs/models.md): the five models, their defaults, downloading and removing them, compression and Z-Image-Turbo's levels
- [Performance and hardware](docs/performance.md): render times, memory and disk use
- [How it works](docs/architecture.md): the two servers, the API, storage and technical notes
- [Development](docs/development.md): running in development, tests and project layout
- [Troubleshooting](docs/troubleshooting.md)

## A note on content

Some of these models are made for adult content and are labelled "not for all audiences" on Hugging Face. The app is for adults only: explicit prompts in the prompt builder need an adult age range and are refused if any detail suggests a minor. Check each model's licence before using its images; WAI-Illustrious, for example, is CreativeML OpenRAIL-M, which restricts some uses.

## Acknowledgements

- [OrdinarySF/z-image-inference](https://github.com/OrdinarySF/z-image-inference), the original project this one started from
- [Tongyi Lab](https://huggingface.co/Tongyi-MAI) for Z-Image-Turbo, [WAI](https://civitai.com/) for WAI-NSFW-Illustrious, [SG161222](https://huggingface.co/SG161222) for RealVisXL, and [OpenMOSS](https://huggingface.co/OpenMOSS-Team) for MOSS-Image, with axiomofmind's LoRA
- [IP-Adapter](https://huggingface.co/h94/IP-Adapter) for the face lock, and [Falconsai](https://huggingface.co/Falconsai/nsfw_image_detection) for the sensitive-image check
- [mflux](https://github.com/filipstrand/mflux) for MLX inference, [diffusers](https://huggingface.co/docs/diffusers) and [Compel](https://github.com/damian0815/compel)
- [ComfyUI Photoreal Prompt Builder](https://github.com/artokun/ComfyUI-Photoreal-Prompt-Builder) and its [NSFW module](https://github.com/artokun/ComfyUI-Photoreal-Prompt-Builder-NSFW) by artokun (MIT), the source of the prompt builder's options
- [React](https://react.dev/), [Vite](https://vite.dev/), [Tailwind CSS](https://tailwindcss.com/), [Headless UI](https://headlessui.com/) and [Lucide](https://lucide.dev/) for the interface
- [z-image-mps](https://github.com/ivanfioravanti/z-image-mps) for MPS optimisation ideas

## Licence

Apache License 2.0. See [LICENSE](LICENSE), and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for included third-party code and the licences of the downloaded models.
