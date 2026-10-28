// Options added on top of the upstream builder. Wording is written to read naturally inside a prompt.
import type { MessageKey } from '../../i18n'

export type Who = 'woman' | 'man' | 'couple' | 'two women' | 'two men'

export const WHO_OPTIONS: readonly Who[] = ['woman', 'man', 'couple', 'two women', 'two men']

/** Adult age ranges only; the prompt always says "adult" alongside them. */
export const AGE_RANGES: readonly string[] = [
  'early 20s', 'mid 20s', 'late 20s', 'early 30s', 'late 30s', '40s', '50s', '60s',
]

export const ETHNICITIES: readonly string[] = [
  'East Asian', 'Southeast Asian', 'South Asian', 'Middle Eastern', 'Black', 'White',
  'Latina/Latino', 'Mediterranean', 'Nordic', 'Indigenous', 'mixed-race',
]

export const EYE_COLORS: readonly string[] = ['brown', 'dark brown', 'hazel', 'amber', 'green', 'blue', 'grey', 'blue-green']

export const EXPRESSIONS: readonly string[] = [
  'soft smile', 'wide laughing smile', 'confident look', 'sultry gaze', 'playful smirk', 'parted lips',
  'serene expression', 'dreamy look', 'intense stare', 'shy glance over the shoulder', 'pouting lips', 'neutral expression',
]

export const MAKEUP: readonly string[] = [
  'no makeup', 'natural makeup', 'glam makeup', 'smoky eye makeup', 'bold red lipstick', 'glossy nude lips',
  'winged eyeliner', 'dewy glowing makeup', 'dramatic evening makeup',
]

export const SKIN_TONES: readonly string[] = ['fair', 'light', 'light olive', 'olive', 'tan', 'golden brown', 'brown', 'deep brown', 'dark']

export const SKIN_DETAILS: readonly string[] = [
  'freckles', 'beauty marks', 'sun-kissed glow', 'subtle tan lines', 'dewy skin', 'light body hair', 'stretch marks', 'scars',
]

export const HAIR_LENGTHS: readonly string[] = ['buzzed', 'short', 'chin-length', 'shoulder-length', 'long', 'very long']

export const BODY_TYPES: readonly string[] = [
  'slim build', 'athletic build', 'toned build', 'average build', 'curvy figure', 'hourglass figure',
  'voluptuous figure', 'plus-size figure', 'muscular build', 'broad-shouldered build',
]

export const HEIGHTS: readonly string[] = ['tall', 'average height', 'short']

export const BUST_SIZES: readonly string[] = [
  'small natural breasts', 'medium natural breasts', 'full natural breasts', 'large natural breasts', 'very large breasts',
]

export const HIPS: readonly string[] = ['narrow hips', 'wide hips', 'round butt', 'toned glutes', 'thick thighs', 'long legs']

export const TATTOOS: readonly string[] = [
  'small delicate tattoos', 'floral shoulder tattoo', 'full sleeve tattoo', 'back piece tattoo', 'thigh tattoo',
  'script tattoo on the ribs', 'hip tattoo',
]

export const PIERCINGS: readonly string[] = ['ear piercings', 'nose stud', 'septum ring', 'navel piercing', 'tongue piercing']

/** Only offered when explicit content is on. */
export const EXPLICIT_PIERCINGS: readonly string[] = ['nipple piercings']

/** Only offered when explicit content is on. */
export const INTIMACY_CUES: readonly string[] = [
  'flushed cheeks', 'skin glistening with sweat', 'tousled hair', 'bedroom eyes', 'bitten lower lip',
  'goosebumps on the skin', 'heavy-lidded gaze', 'arched back', 'hand trailing over the body', 'messy bedsheets',
]

export type Nudity = 'clothed' | 'implied' | 'topless' | 'nude'

/** Each level and the key of its label, looked up when shown. */
export const NUDITY_LEVELS: readonly { value: Nudity; label: MessageKey }[] = [
  { value: 'clothed', label: 'builder.nudityClothed' },
  { value: 'implied', label: 'builder.nudityImplied' },
  { value: 'topless', label: 'builder.nudityTopless' },
  { value: 'nude', label: 'builder.nudityNude' },
]

export const TIMES_OF_DAY: readonly string[] = [
  'dawn', 'sunrise', 'morning', 'midday', 'afternoon', 'golden hour', 'sunset', 'dusk', 'blue hour', 'night', 'midnight',
]

export const WEATHER: readonly string[] = ['clear skies', 'overcast sky', 'light rain', 'heavy rain', 'falling snow', 'fog', 'heat haze', 'stormy sky']

export const REALISM_DETAILS: readonly string[] = [
  'natural skin texture with visible pores', 'subtle film grain', 'sharp focus on the eyes', 'shot on a full-frame camera',
  'true-to-life colours', 'soft natural highlights', 'fine fabric texture', 'candid unposed feel',
]
