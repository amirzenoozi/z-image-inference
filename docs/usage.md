# Using the app

The app has three views, **Create**, **History** and **Characters**, switched in the header. The address shows which one you are on (`/`, `/history` or `/characters`), so a reload or a bookmark opens the same view.

## Language

The app is in English by default. To change it, set `APP_LANGUAGE` in `.env` in the project folder and restart both servers:

| Code | Language |
|------|----------|
| `en` | English |
| `nl` | Nederlands (Dutch) |
| `it` | Italiano (Italian) |
| `fr` | Français (French) |
| `de` | Deutsch (German) |
| `es` | Español (Spanish) |
| `pt` | Português (Portuguese) |

Everything you read is translated: the interface, the prompt builder's menus and purposes, and the app's messages. The prompts themselves stay in English, since the models understand English best: whatever language the builder's menus show, the prompt it writes and sends is English. An unknown code falls back to English, and `main.py` says so in its terminal.

## Use it on your phone

The app can be added to a phone's home screen and opened full screen, like an app. Images are still made on the Mac, so it must be running and reachable.

- **On the same Wi-Fi:** set `APP_HOST=0.0.0.0` in `.env`, restart the web app, and open `http://<the Mac's address>:7860` (find the address with `ipconfig getifaddr en0`). On an iPhone, **Share → Add to Home Screen** installs it. Android only adds a shortcut that opens in the browser, because a full install needs HTTPS. The app has no login, so anyone on that Wi-Fi can open it: use this only at home.
- **On a phone** the views are a bar at the bottom, and Create shows **Settings** or **Result** one at a time: Generate opens Result, and a red dot marks Result when an image arrives while you are in Settings. Dialogs fill the screen, and in the image viewer you swipe left or right for the next or previous image.
- **Anywhere, over HTTPS (recommended):** install [Tailscale](https://tailscale.com/) on the Mac and the phone, keep `APP_HOST` at its default, and run `tailscale serve --bg 7860` on the Mac. Open the `https://….ts.net` address it prints; both iPhone and Android can install it, and only your own devices can reach it.

## Create

1. **Model**: the sidebar shows the selected model. **Change** opens the model dialog, where models are grouped into **Photorealistic** and **Anime & illustration** tabs. Only downloaded models can be chosen; see [Models](models.md#downloading-and-removing-models).
2. **Prompt**: write it yourself, or click one of the **example** cards below the prompt box to fill it. Models that use one also show a **negative prompt** (what to avoid). Each model's examples live in `example_prompts.json`; edit the file and reload the page to change them.
3. **Resolution**: pick a category tab (Square, Portrait, Landscape, Widescreen), then a size (S, M, L, XL). Sizes the model cannot make are greyed out, with the reason. **Custom** takes any size, snapped to valid values.
4. **Sampling**: steps, guidance and seed. **Reset to model defaults** undoes your changes. The seed can be random each time, rolled with the dice, or set to the last image's seed to repeat a result.
5. **Generate** (or ⌘/Ctrl + Enter). While it runs, the prompt can be read and copied but not changed, and Generate waits; both come back when the image arrives, you cancel, or an error comes back. If you switch to History or Characters meanwhile, a red dot on the **Create** tab shows when the image (or an error) is ready.

While an image renders, the result area shows what is happening: waiting, loading the model, reading the prompt, or **Step 4 of 9** with a progress bar, plus how long it has been running. **Cancel** stops it after the current step, without adding anything to History.

The tab title shows when a render is running. If it finishes while you are in another tab or app, the title says so and a notification appears: "Your image is ready" (or "Ava's image is ready") with a thumbnail of the image, the model, the render time and the start of the prompt, or "Couldn't make your image" with the reason. A sensitive image shows the app's icon and no prompt instead, so nothing explicit pops up on screen. Clicking the notification opens Create, and a newer one replaces the last. The browser asks once for permission, the first time you press Generate.

Switching models resets steps and guidance to the new model's defaults. Your prompt, seed, size and negative prompt are kept where the model allows them, and its recommended size and negative prompt are offered in one click. Your settings are remembered in the browser between visits.

## Prompt builder

**Prompt builder** (above the prompt box) opens a dialog that assembles a detailed prompt step by step, with a live preview.

First pick a **purpose** at the top. Each one shows only the steps it needs, starts from sensible choices (only those you have not set yet), opens the prompt in its own style and writes the parts that matter for it first:

| Purpose | Steps | What it stresses |
|---------|-------|------------------|
| **General** | every step except Intimacy | nothing in particular |
| **Portrait** | Subject, Face & hair, Scene & light, Camera, Mood & finish; close shot types only | the face, hair and light |
| **Fashion** | every step except Face & hair and Intimacy; starts as a full-body fashion shot in a studio | the outfit and figure |
| **Influencer** | every step except Intimacy; safe for work, with no lingerie and nudity kept out by the negative prompt | "An Instagram influencer photo of …", a candid lifestyle look |
| **Glamour (18+)** | every step; nudity up to topless, no explicit poses or acts | "A sensual glamour photograph of …", alluring and tasteful |
| **Explicit (18+)** | every step and option | "An explicit adult photograph of …", nudity, explicit poses and acts |
| **Scene** | Scene & light, Camera, Mood & finish; no people | the place and light |

The steps (lists such as tattoos and skin details are checkboxes, ticked in the order they go into the prompt; **Makeup**, **Facial hair** and **Lighting** take several picks from one select, where "No makeup", "Clean-shaven" and Random replace the others):

1. **Subject**: who (woman, man, couple, two women, two men), an adult age range, ethnicity and your own details
2. **Face & hair**: eye colour, expression, makeup, skin tone and details, hair length, colour and style, and for a man facial hair
3. **Body**: body type, height, bust (up to gigantic), hips and legs (up to a huge butt), muscles, stomach (up to an eight-pack), tattoos and piercings; for a man his chest (shown only when it is bare or in an open top), and in both 18+ purposes body hair and, when he is clothed below, a bulge; in the Explicit purpose also penis size and pubic hair, and in both 18+ purposes nipples, offered whenever the subject fits and written into the prompt only when the nudity shows them
4. **Outfit**: tops, bottoms, lingerie, outerwear, shoes, a colour for each, accessories
5. **Pose & action**
6. **Intimacy (18+)**: nudity level (clothed, implied, topless, fully nude) and intimacy details; shown only in an 18+ purpose. In the Explicit purpose it also has **explicit details** (cum in several places, creampie, squirting, wetness, erection, precum, drool, lube, hickeys, a red handprint, smeared makeup, an after-sex look), each offered only when it fits who is in the scene and the nudity
7. **Scene & light**: a scene or your own environment, time of day, weather, lighting
8. **Camera**: photo style, shot type, angle, lens, depth of field
9. **Mood & finish**: mood, colour grading, realism details, extra details and negative terms

- **Surprise me** fills the main choices with random values you can then adjust. Any choice can also be set to **Random**, and **Re-roll** picks new values for those.
- **Use this prompt** puts the prompt and negative prompt into the prompt box, replacing what is there; **Append to prompt** adds to it instead.
- **It writes for the selected model.** For Z-Image-Turbo and MOSS-Image, one detailed paragraph: who and what is happening first, then the person, the outfit, the setting, the light and the camera, each tied to the subject. For WAI-Illustrious and Anime Desire, a tag list: quality tags, who, then adult content, then the rest, with what the purpose stresses weighted higher (for example `(completely nude:1.3)` in Explicit).
- **Choices that contradict each other** (two things for the same hands, a pose and an act in different body positions, a smile while the mouth is busy, a face turned away in a close-up, a hairstyle the hair length can't hold, sunlight at night, rain indoors, two hats) are never picked by **Random** or **Surprise me**: each choice is picked to fit the ones before it. If your own choices clash, the preview says which and why, since the model would try to draw both (often as an extra hand or a twisted body).
- **It never contradicts itself.** The nudity level decides the outfit (topless leaves out tops and bras; fully nude and implied nudity leave only shoes and accessories). Partner actions are offered only for a couple, poses and actions about breasts or lingerie only when the subject includes a woman, and actions about taking clothes off only while those clothes are still on.
- In an 18+ purpose, terms such as `nsfw` are taken out of the negative prompt, since they would work against it.
- **Adults only**: explicit content, nudity and lingerie need "Who" and an adult age range, and the builder refuses any detail that suggests a minor.

### Your own purposes

The purposes live in `prompt_modes.json` in the project folder; edit it and reopen the builder to change them. Each one has:

- `id`, `label` and `description`
- `content`: how far it may go: `safe` (no nudity or lingerie), `everyday`, `suggestive` (up to topless, no explicit poses or acts) or `explicit`; these rules are built into the app
- `focus`: an `opening` that replaces "a photograph", a sentence of style `cues` for the description models, and style `tags` for the tag models
- `steps`: which steps it shows, from `subject`, `appearance`, `body`, `outfit`, `pose`, `intimacy`, `scene`, `camera` and `finish`
- `defaults`: a starting value per choice, for example `"shotType": "headshot"`
- `options`: a shorter list for a choice, for example `"nudity": ["clothed", "implied"]`; an empty list hides that choice
- `emphasis`: the parts of the paragraph to write first, from `face`, `hair`, `body`, `outfit`, `nudity`, `intimacy`, `scene`, `details`, `light`, `camera`, `mood` and `realism`
- `weights`: tag weights from 0.5 to 2, for `nudity`, `action`, `explicitPose`, `pose`, `outfit`, `face`, `hair`, `body`, `scene` and `light`

A purpose with an unknown step, choice or option is left out, with a note in the builder saying why. A purpose that shows the Intimacy step is always treated as 18+, so the adult checks above apply whatever the file says.

## Prompt weights

WAI-Illustrious, Anime Desire and RealVisXL understand weights in the usual Automatic1111 / ComfyUI form:

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

Images are kept in `history.db` as lossless WebP: the same pixels as the PNG the model made, about 30% smaller. Downloads and the export are still PNG. Images saved before this were PNG; to convert them, stop the web app and run `uv run python backend/tools/recompress_history.py` (`--dry-run` first shows how many there are). It keeps a copy as `history.db.bak`; delete it once you are happy.

### Sensitive images

Images with nudity or sexual content are blurred in History's list, on character cards and in the face-lock thumbnail, with an eye icon and "Sensitive". Opening one shows it as it is.

- An image is marked sensitive when it is saved, if its prompt has words such as *nude*, *naked*, *nsfw*, *explicit*, *topless*, *lingerie* or *sensual* (so images from the 18+ builder purposes are). Images made before this existed are checked once, on the next start.
- The image itself is checked too, by a small image classifier ([Falconsai/nsfw_image_detection](https://huggingface.co/Falconsai/nsfw_image_detection), 343 MB, downloaded once into `models/nsfw-detector/` on the first start). It catches nudity the prompt didn't ask for, such as a typed prompt with a character whose look describes her body. Images saved before it was ready are checked in the background after a start; it takes a few seconds.
- No check is perfect, so the eye button on an opened image marks it as sensitive, or as not sensitive, by hand; that always wins. An edited copy keeps its original's setting.

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

Z-Image-Turbo, WAI-Illustrious, Anime Desire, RealVisXL and FLUX.1-dev can make variations. MOSS-Image cannot; with a start image set it says so, and Generate waits until you pick another model or remove the image.

## Characters

A **character** is a named person you make many images of, such as "Ava". It keeps the prompt builder's **Subject**, **Face & hair** and **Body** choices (who, age, ethnicity, eyes, skin, hair, facial hair, makeup, body, muscles, stomach, chest, tattoos and piercings), but not the outfit, pose or scene, so the same person can go anywhere. Pubic hair, penis size, nipples, body hair and a bulge are not part of a character either: they are chosen for each image.

- **Samples**: the app starts with thirteen sample characters, each with a different look, to try right away: Mei, Amara, Sofia, Freya, Elena, Ravi and Kai, and six young adults with one bold feature each: Nova (pastel pink hair), Jax (big tattoos), Tank (huge muscles), Ruby (very large breasts), Zara (blue hair and many piercings) and Ivy (lavender hair and tattoos). They are added once, the first time the app starts with a database; edit or delete them like any other, and a deleted one does not come back. They live in `sample_characters.json`: edit it before the first start to change them.
- **Browse them** on the Characters page; **All / Women / Men** at the top filters the cards; the choice is kept when you go to another view and come back, and across reloads.
- **Make one** with **New character** on the Characters page (**Surprise me** there fills in a random adult look you can then adjust; it keeps "Who", the name and anything you typed), or with **Save as character…** under the prompt builder's Subject step.
- **Use it** by picking it in **Character** at the top of Create's prompt (or **Use** on its card). Every image you then generate is linked to it. In the prompt builder, its look replaces the Subject, Face & hair and Body steps, which become one **Character** step; in the 18+ purposes it also has a **For this image** group for the body choices a character leaves out, such as pubic hair. A prompt you type yourself gets the character's look added to its start when you generate (as a sentence, or as tags for the SDXL models), so "a girl under the rain" still shows that person; Create says "Ivy's look is added to the start of your prompt". The prompt box keeps your own text, and History saves the full prompt. A prompt from the prompt builder, or reused from an image of the character, already has the look and is sent as it is.
- **Seed**: a character can have its own seed, used for every render of it, which keeps the face closer between images of similar prompts. Leave it empty for a new seed each time.
- **Find its images** with **Show images** on its card, or the **Character** filter in History. The image viewer shows the character an image belongs to; **Set as cover** puts that image on the character's card (otherwise its newest image is used).
- **Edit** changes its name, seed and look, in tabs (**Subject**, **Face & hair**, **Body**, **Face lock**; the arrow keys move between them); images already made keep the look they had. **Delete** removes the character but keeps its images in History.
- Characters are adults only: each needs "Who" and an adult age range, and a name or detail that suggests a minor is refused.

The description only keeps a face similar, not identical; models draw a new face for each image that fits the words. For the same face every time, use the face lock.

### Face lock

With **RealVisXL** (in photo style), **WAI-Illustrious** and **Anime Desire** (in anime style), a character can keep one face across images (IP-Adapter plus-face).

1. Make or crop an image where the character's face is large and clear: crop it with **Edit** in the image viewer if needed (the copy keeps its character).
2. In the image viewer, choose **Use as face**.
3. Pick the character in Create and generate with RealVisXL, WAI-Illustrious or Anime Desire. Create says "Face locked to image #12 at 60%".

- **Face strength** (on the **Face lock** tab of the character's **Edit**, 10% to 100%, 60% to start) sets how closely the face is kept. Higher keeps it closer but follows the prompt less: try 50% to 70%.
- The first face-locked render downloads the face lock files once (3.4 GB) and asks you to try again when they are there.
- The image viewer shows which image a render's face came from. Deleting that image ends the face lock; **Remove face** in the character's **Edit** does too.
- Z-Image-Turbo and MOSS-Image can't lock a face; with them the character's look comes from the description only, and Create says so.
- The face lock adds about 2 GB of memory while it is in use, and a few seconds to the first render that uses it.

#### Your own photo

In a character's **Edit**, **Upload a photo…** uses a photo (JPEG, PNG or WebP, up to 10 MB) as the face instead of a History image; it is saved with the character, made no larger than 1024 px. A character has one face at a time, so choosing **Use as face** later replaces the photo, and the other way round.

A photo can show a real person, so a character with an uploaded face is kept **safe for work**, enforced by the app's server for every render of that character, with any model:

- a prompt with a sensitive word (*nude*, *explicit*, *lingerie*, *sensual* and the like) is refused, and so is a variation of a sensitive image;
- safe-for-work terms (*nsfw, nude, naked, topless, lingerie* and more) are added to the negative prompt;
- every result goes through the image check, and an image that comes out with nudity is discarded, never saved; until the check is ready (a few seconds after the app starts), nothing is rendered for that character;
- the 18+ purposes are hidden in the prompt builder.

Remove the photo (or switch to a History face) to lift these rules.
