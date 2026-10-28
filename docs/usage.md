# Using the app

The app has two views, **Create** and **History**, switched in the header. The address shows which one you are on (`/` or `/history`), so a reload or a bookmark opens the same view.

## Create

1. **Model**: the sidebar shows the selected model. **Change** opens the model dialog, where models are grouped into **Photorealistic** and **Anime & illustration** tabs. Only downloaded models can be chosen; see [Models](models.md#downloading-and-removing-models).
2. **Prompt**: write it yourself, or click one of the **example** cards below the prompt box to fill it. Models that use one also show a **negative prompt** (what to avoid). Each model's examples live in `example_prompts.json`; edit the file and reload the page to change them.
3. **Resolution**: pick a category tab (Square, Portrait, Landscape, Widescreen), then a size (S, M, L, XL). Sizes the model cannot make are greyed out, with the reason. **Custom** takes any size, snapped to valid values.
4. **Sampling**: steps, guidance and seed. **Reset to model defaults** undoes your changes. The seed can be random each time, rolled with the dice, or set to the last image's seed to repeat a result.
5. **Generate** (or ⌘/Ctrl + Enter).

While an image renders, the result area shows what is happening: waiting, loading the model, reading the prompt, or **Step 4 of 9** with a progress bar, plus how long it has been running. **Cancel** stops it after the current step, without adding anything to History.

The tab title shows when a render is running. If it finishes while you are in another tab or app, the title says so and a notification appears; the browser asks once for permission, the first time you press Generate.

Switching models resets steps and guidance to the new model's defaults. Your prompt, seed, size and negative prompt are kept where the model allows them, and its recommended size and negative prompt are offered in one click. Your settings are remembered in the browser between visits.

## Prompt builder

**Prompt builder** (above the prompt box) opens a dialog that assembles a detailed prompt step by step, with a live preview.

First pick a **purpose** at the top. Each one shows only the steps it needs, starts from sensible choices (only those you have not set yet) and writes the parts that matter for it first:

| Purpose | Steps | What it stresses |
|---------|-------|------------------|
| **General** | every step except Intimacy | nothing in particular |
| **Portrait** | Subject, Face & hair, Scene & light, Camera, Mood & finish; close shot types only | the face, hair and light |
| **Fashion** | every step except Face & hair and Intimacy; starts as a full-body fashion shot in a studio | the outfit and figure |
| **Glamour (18+)** | every step; nudity up to topless, no explicit acts | the outfit, body and mood |
| **Explicit (18+)** | every step and option | nudity, explicit poses and acts |
| **Scene** | Scene & light, Camera, Mood & finish; no people | the place and light |

The steps:

1. **Subject**: who (woman, man, couple, two women, two men), an adult age range, ethnicity and your own details
2. **Face & hair**: eye colour, expression, makeup, skin tone and details, hair length, colour and style
3. **Body**: body type, height, bust, hips and legs, tattoos and piercings
4. **Outfit**: tops, bottoms, lingerie, outerwear, shoes, a colour for each, accessories
5. **Pose & action**
6. **Intimacy (18+)**: nudity level (clothed, implied, topless, fully nude) and intimacy details; shown only in an 18+ purpose
7. **Scene & light**: a scene or your own environment, time of day, weather, lighting
8. **Camera**: photo style, shot type, angle, lens, depth of field
9. **Mood & finish**: mood, colour grading, realism details, extra details and negative terms

- **Surprise me** fills the main choices with random values you can then adjust. Any choice can also be set to **Random**, and **Re-roll** picks new values for those.
- **Use this prompt** puts the prompt and negative prompt into the prompt box, replacing what is there; **Append to prompt** adds to it instead.
- **It writes for the selected model.** For Z-Image-Turbo and MOSS-Image, one detailed paragraph: who and what is happening first, then the person, the outfit, the setting, the light and the camera, each tied to the subject. For WAI-Illustrious and Anime Desire, a tag list: quality tags, who, then adult content, then the rest, with what the purpose stresses weighted higher (for example `(completely nude:1.3)` in Explicit).
- **It never contradicts itself.** The nudity level decides the outfit (topless leaves out tops and bras; fully nude and implied nudity leave only shoes and accessories). Partner actions are offered only for a couple, poses and actions about breasts or lingerie only when the subject includes a woman, and actions about taking clothes off only while those clothes are still on.
- In an 18+ purpose, terms such as `nsfw` are taken out of the negative prompt, since they would work against it.
- **Adults only**: explicit content, nudity and lingerie need "Who" and an adult age range, and the builder refuses any detail that suggests a minor.

### Your own purposes

The purposes live in `prompt_modes.json` in the project folder; edit it and reopen the builder to change them. Each one has:

- `id`, `label` and `description`
- `steps`: which steps it shows, from `subject`, `appearance`, `body`, `outfit`, `pose`, `intimacy`, `scene`, `camera` and `finish`
- `defaults`: a starting value per choice, for example `"shotType": "headshot"`
- `options`: a shorter list for a choice, for example `"nudity": ["clothed", "implied"]`; an empty list hides that choice
- `emphasis`: the parts of the paragraph to write first, from `face`, `hair`, `body`, `outfit`, `nudity`, `intimacy`, `scene`, `details`, `light`, `camera`, `mood` and `realism`
- `weights`: tag weights from 0.5 to 2, for `nudity`, `action`, `explicitPose`, `pose`, `outfit`, `face`, `hair`, `body`, `scene` and `light`
- `adult_only`: marks an 18+ purpose

A purpose with an unknown step, choice or option is left out, with a note in the builder saying why. A purpose that shows the Intimacy step is always treated as 18+, so the adult checks above apply whatever the file says.

## Prompt weights

WAI-Illustrious and Anime Desire understand weights in the usual Automatic1111 / ComfyUI form:

| Write | Effect |
|-------|--------|
| `(tag:1.3)` | strengthens the tag by 1.3 |
| `(tag)` | strengthens it by 1.1 |
| `[tag]` | weakens it to 0.9 |

Their prompts can also run past the 77 tokens their text encoder reads at once; long prompts are encoded in chunks, so nothing at the end is cut off.

Z-Image-Turbo and MOSS-Image read prompts as natural language and have no weights. For them, put what matters most early and say it plainly.

## Chat with Grok (optional)

Needs an [xAI API key](https://x.ai/); the tab is disabled without one.

1. Add the key to `.env` in the project folder: `XAI_API_KEY=your_api_key_here`, and restart `main.py`.
2. Choose **Chat with Grok** and describe the image you want in plain words.
3. Grok writes a detailed prompt, which becomes your prompt, and the image is generated.
4. Edit one of your messages to branch from there and generate again.

Your messages are sent to xAI; everything else stays on your Mac.

## History

**History** shows every image, newest first, 30 to a page. The address keeps the page and filters, so reload, Back and Forward work as you would expect.

**Filters** (above the images, and combined):

- **Search prompts**: images whose prompt contains the text you type
- **Model**: one model's images
- **Ratio**: square, portrait, landscape or widescreen images, grouped as in the resolution picker
- **Favourites**: only the images you starred (the star on each image)

**Compare** lets you pick two images, even from different searches, and see them side by side with the facts that differ (seed, steps, size and so on) highlighted.

The header shows how much space History uses, and offers:

- **Export** (or **Export these** with a filter on): a zip of the images shown, each PNG with a text file of its prompts and settings, plus `history.json` with every image's details
- **Clean up**: deletes the images older than 7, 30 or 90 days, showing how many first, and always keeps favourites
- **Delete all**: removes everything, favourites included

Clean up and Delete all also shrink `history.db` on disk.

## Image viewer

Opening an image shows it large, with its details beside it: its settings, render time, **colour palette** (its six main colours with their share of the image; click one to copy its hex code), the prompt and negative prompt (each with **Copy**), and where it came from if it is an edit or a variation.

On the image: **Download**, **Edit**, **Delete**, zoom, full screen and the star. At the bottom of the details: **Make variations** and **Reuse settings** (loads its settings into Create, with the same seed).

| Key | Action |
|-----|--------|
| ← / → | previous or next image, across pages, within the current filters |
| Z | full screen on or off |
| F | star or unstar |
| Delete (twice) | delete, then move on to the next image |
| Esc | leave full screen, then close |

Click the image to see it at 100% (drag to look around), and click again to fit it back.

## Editing an image

**Edit** turns the viewer into a small editor:

- **Rotate** left or right, **Flip** horizontally or vertically
- **Crop**, free or to a ratio: Original, 1:1, 4:5, 3:4, 2:3, 9:16 or 16:9; drag the frame or its handles, or nudge it with the arrow keys
- **Undo** and **Redo** (⌘Z, ⇧⌘Z), and **Reset**

**Save as new image** adds the edited copy to History with the original's prompt and settings, and "Edited from image #…" in its details. The original is never changed. While editing, the viewer's keys are paused, and closing with unsaved edits asks first.

## Variations

**Make variations** takes an image back to Create as a **start image**: its prompt and settings are loaded, and each **Generate** makes a new image from it, with a new seed.

- **Change** (10% to 90%) sets how far the new image may drift, from small changes to a new picture with the same idea.
- Change the prompt as well ("the same scene at night") to steer it.
- Variations are quicker than a full render, since they run only part of the steps.
- If the size you choose is a different shape from the start image, the start image is cropped to fit, centred.
- **×** on the start image goes back to a normal render. **Reuse settings** on a variation brings its start image back.

Z-Image-Turbo, WAI-Illustrious and Anime Desire can make variations. MOSS-Image cannot; with a start image set it says so, and Generate waits until you pick another model or remove the image.
