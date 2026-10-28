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
  'huge breasts', 'massive breasts', 'gigantic breasts',
]

export const HIPS: readonly string[] = ['narrow hips', 'wide hips', 'round butt', 'big round butt', 'huge butt', 'toned glutes', 'thick thighs', 'long legs']

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

/** Only offered in the Explicit purpose, with a man in the scene and fully nude. */
export const PENIS_SIZES: readonly string[] = ['average penis', 'large penis', 'huge penis', 'giant penis']

/** Only offered in the Explicit purpose, fully nude. */
export const PUBIC_HAIR: readonly string[] = ['shaved', 'trimmed', 'natural', 'hairy']

/** Only offered in an 18+ purpose, with a woman in the scene, topless or nude. */
export const NIPPLES: readonly string[] = ['puffy nipples', 'large areolae', 'small pink nipples']

/** What an explicit detail needs: a man or a woman in the scene, two people, and how undressed. */
export interface DetailNeeds {
  man?: true
  woman?: true
  /** A woman and a man together. */
  couple?: true
  nude?: true
}

/** Explicit details for the Explicit purpose: how each is written in a sentence and as tags, and what it needs. */
export const EXPLICIT_DETAILS: Readonly<Record<string, { text: string; tags: string; needs: DetailNeeds }>> = {
  'cum on face': { text: 'cum splattered across the face', tags: 'cum on face, facial', needs: { couple: true } },
  'cum on breasts': { text: 'thick cum on the breasts', tags: 'cum on breasts', needs: { couple: true } },
  'cum on stomach': { text: 'cum pooled on the stomach', tags: 'cum on stomach', needs: { man: true } },
  'cum on back': { text: 'cum across the back', tags: 'cum on back', needs: { couple: true } },
  'cum on ass': { text: 'cum on the ass', tags: 'cum on ass', needs: { couple: true } },
  'cum in mouth': { text: 'cum in the open mouth', tags: 'cum in mouth', needs: { couple: true } },
  'cum dripping from mouth': { text: 'cum dripping from the lips', tags: 'cum drip, cum string', needs: { couple: true } },
  creampie: { text: 'cum dripping out of the pussy after a creampie', tags: 'creampie, cum in pussy, cum drip', needs: { couple: true, nude: true } },
  'cum on thighs': { text: 'cum running down the thighs', tags: 'cum on thighs', needs: { man: true } },
  'covered in cum': { text: 'the body covered in cum', tags: 'covered in cum, cum on body', needs: { man: true } },
  squirting: { text: 'squirting, with fluid spraying', tags: 'squirting, female ejaculation', needs: { woman: true, nude: true } },
  'wet pussy': { text: 'a visibly wet, glistening pussy', tags: 'pussy juice, wet pussy', needs: { woman: true, nude: true } },
  'dripping wet': { text: 'arousal dripping down the inner thighs', tags: 'pussy juice drip, wet thighs', needs: { woman: true, nude: true } },
  'erect penis': { text: 'a fully erect penis', tags: 'erection, erect penis', needs: { man: true, nude: true } },
  precum: { text: 'precum glistening on the tip of the penis', tags: 'precum', needs: { man: true, nude: true } },
  'drool and saliva strands': { text: 'strands of saliva hanging from the lips', tags: 'drooling, saliva trail', needs: {} },
  'lube on skin': { text: 'glossy lube shining on the skin', tags: 'lube, shiny skin', needs: {} },
  hickeys: { text: 'fresh hickeys on the neck', tags: 'hickey', needs: {} },
  'red handprint on ass': { text: 'a red handprint on the ass', tags: 'handprint, spanked, red ass', needs: {} },
  'smeared makeup': { text: 'smeared lipstick and running mascara', tags: 'smeared lipstick, messy makeup', needs: {} },
  'messy after-sex look': { text: 'a flushed, dishevelled after-sex look', tags: 'after sex', needs: {} },
}

/** Men only, any purpose. */
export const FACIAL_HAIR: readonly string[] = ['clean-shaven', 'stubble', 'short beard', 'full beard', 'long beard', 'goatee', 'moustache']

export const MUSCLES: readonly string[] = ['lean', 'toned', 'muscular', 'very muscular', 'huge bodybuilder']

export const ABS: readonly string[] = ['flat stomach', 'defined abs', 'six-pack', 'eight-pack']

/** Men only, any purpose; written only when the chest shows (chestShows in resolveFacts.ts). */
export const CHESTS: readonly string[] = ['smooth chest', 'light chest hair', 'hairy chest', 'broad pecs']

/** 18+ purposes only. */
export const BODY_HAIR: readonly string[] = ['smooth', 'natural body hair', 'hairy']

/** 18+ purposes only, men only, when the lower body is clothed. */
export const BULGES: readonly string[] = ['visible bulge', 'large bulge']
