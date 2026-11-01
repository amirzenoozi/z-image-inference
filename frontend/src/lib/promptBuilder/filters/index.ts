// Image filters for the Camera step: a film stock, an old camera or a print, each written out in full for a sentence
// prompt and as a few tags for a tag prompt. A filter brings its own colours and focus, so it clashes with a colour
// grading and with a sharp-focus realism detail (conflicts.ts).

export interface ImageFilter {
  /** Written as its own sentence, after the camera. */
  text: string
  /** For the tag-based models. */
  tags: string
}

export const IMAGE_FILTERS: Readonly<Record<string, ImageFilter>> = {
  '90s disposable camera': {
    text: 'shot on a 90s disposable 35mm film camera, heavy coarse film grain, high ISO noise, slightly soft out-of-focus lens blur, warm faded analog colour grading, an orange-red light leak on the left edge, dark vignette',
    tags: 'disposable camera, 35mm film, heavy film grain, light leak, vignette, faded colours',
  },
  'Polaroid instant': {
    text: 'a Polaroid instant photo, soft focus, creamy washed-out colours with a slight green-blue cast, faded highlights, a white instant-film border',
    tags: 'polaroid, instant film, washed-out colours, white border, soft focus',
  },
  'Kodak Portra 400': {
    text: 'shot on Kodak Portra 400 film, fine grain, warm natural skin tones, soft pastel highlights, gentle contrast',
    tags: 'kodak portra 400, film photography, fine grain, warm skin tones, pastel highlights',
  },
  'Fujifilm Superia 400': {
    text: 'shot on Fujifilm Superia 400 film, cool green-teal shadows, punchy colours, visible grain',
    tags: 'fujifilm superia, film photography, teal shadows, punchy colours, film grain',
  },
  'Cinestill 800T': {
    text: 'shot on Cinestill 800T tungsten film, cool blue tones, red halation glow around the lights, visible grain',
    tags: 'cinestill 800t, halation, tungsten film, cool tones, film grain',
  },
  'Black-and-white Tri-X': {
    text: 'shot on Kodak Tri-X 400 black-and-white film, deep blacks, high contrast, gritty grain',
    tags: 'black and white, monochrome, tri-x, high contrast, film grain',
  },
  'Kodachrome 60s slide': {
    text: 'a 1960s Kodachrome slide, rich saturated reds and blues, deep shadows, fine grain',
    tags: 'kodachrome, 1960s, saturated colours, slide film, fine grain',
  },
  'Faded 70s print': {
    text: 'a faded 1970s photo print, washed-out warm yellow-orange tones, low contrast, soft blur, slightly worn paper',
    tags: '1970s photo, faded print, warm tones, low contrast, worn paper',
  },
  'Antique sepia': {
    text: 'an antique sepia photograph, warm brown tones, soft focus, faded edges, dust and scratches',
    tags: 'sepia, antique photo, soft focus, dust and scratches, faded edges',
  },
  'Expired 35mm film': {
    text: 'shot on expired 35mm film, unpredictable colour shifts, a magenta cast, heavy grain, faded blacks',
    tags: 'expired film, colour shift, magenta cast, heavy grain, faded blacks',
  },
  'Lomography cross-process': {
    text: 'Lomography cross-processed film, oversaturated colours, a strong yellow-green cast, heavy vignette, high contrast',
    tags: 'lomography, cross-processed, oversaturated, vignette, high contrast',
  },
  'Super 8 film still': {
    text: 'a Super 8 film still, warm saturated colours, heavy grain, soft flicker, rounded dark corners',
    tags: 'super 8, film still, heavy grain, warm colours, dark corners',
  },
  '2000s digicam flash': {
    text: 'shot on an early 2000s compact digital camera, harsh direct flash, blown highlights, low-resolution JPEG noise, cool white balance',
    tags: 'y2k digicam, direct flash, blown highlights, jpeg noise, low resolution',
  },
  'VHS camcorder still': {
    text: 'a VHS camcorder still frame, scan lines, colour bleeding, chromatic aberration, soft low resolution, tracking noise along the bottom',
    tags: 'vhs, camcorder, scan lines, chromatic aberration, low resolution',
  },
}

/** Realism details a filter's grain and soft focus contradict. */
export const SHARP_REALISM: ReadonlySet<string> = new Set(['sharp focus on the eyes', 'natural skin texture with visible pores', 'true-to-life colours'])

/** The date stamp as the camera would print it; quotes are dropped, since the prompt quotes it. */
export function dateStampText(stamp: string): string {
  const clean = stamp.replace(/["“”]/g, '').trim()
  return clean ? `an orange digital date stamp "${clean}" in the bottom right corner` : ''
}
