import { FITNESS_LIGHTING, FITNESS_PHOTO_STYLES, FITNESS_SCENES, WORKOUTS } from './fitness'
import {
  CAMERA_ANGLES,
  COLOR_GRADINGS,
  DEPTH_OF_FIELD,
  EXPLICIT_PARTNER_ACTIONS,
  EXPLICIT_POSES,
  EXPLICIT_SOLO_ACTIONS,
  HAIRSTYLES,
  HAIR_COLORS,
  LENSES,
  LIGHTING_EXPANSIONS,
  PHOTO_STYLES,
  POSES,
  SCENE_TYPES,
  SHOT_TYPES,
} from './data'
import {
  ABS,
  AGE_RANGES,
  BODY_HAIR,
  BODY_TYPES,
  BULGES,
  BUST_SIZES,
  CHESTS,
  ETHNICITIES,
  EXPRESSIONS,
  EYE_COLORS,
  FACIAL_HAIR,
  HAIR_LENGTHS,
  HEIGHTS,
  HIPS,
  MAKEUP,
  MUSCLES,
  NIPPLES,
  NUDITY_LEVELS,
  PENIS_SIZES,
  PUBIC_HAIR,
  SKIN_TONES,
  TIMES_OF_DAY,
  WEATHER,
  WHO_OPTIONS,
} from './extraData'

/** Every single choice in the builder and all its options, before a mode or the subject narrows them. */
export const CHOICE_OPTIONS = {
  who: WHO_OPTIONS,
  age: AGE_RANGES,
  ethnicity: ETHNICITIES,
  eyeColor: EYE_COLORS,
  expression: EXPRESSIONS,
  makeup: MAKEUP,
  skinTone: SKIN_TONES,
  hairColor: HAIR_COLORS,
  hairstyle: HAIRSTYLES,
  hairLength: HAIR_LENGTHS,
  bodyType: BODY_TYPES,
  height: HEIGHTS,
  bust: BUST_SIZES,
  hips: HIPS,
  penis: PENIS_SIZES,
  facialHair: FACIAL_HAIR,
  muscles: MUSCLES,
  abs: ABS,
  chest: CHESTS,
  bodyHair: BODY_HAIR,
  bulge: BULGES,
  nipples: NIPPLES,
  pubicHair: PUBIC_HAIR,
  pose: [...POSES, ...Object.keys(EXPLICIT_POSES), ...Object.keys(WORKOUTS)],
  explicitAction: [...Object.keys(EXPLICIT_SOLO_ACTIONS), ...Object.keys(EXPLICIT_PARTNER_ACTIONS)],
  nudity: NUDITY_LEVELS.map((level) => level.value),
  sceneType: [...new Set([...SCENE_TYPES, ...Object.keys(FITNESS_SCENES)])],
  timeOfDay: TIMES_OF_DAY,
  weather: WEATHER,
  lightingSetup: [...Object.keys(LIGHTING_EXPANSIONS), ...Object.keys(FITNESS_LIGHTING)],
  photoStyle: [...PHOTO_STYLES, ...FITNESS_PHOTO_STYLES],
  shotType: SHOT_TYPES,
  cameraAngle: CAMERA_ANGLES,
  lens: LENSES,
  depthOfField: DEPTH_OF_FIELD,
  colorGrading: COLOR_GRADINGS,
} satisfies Record<string, readonly string[]>

export type ChoiceField = keyof typeof CHOICE_OPTIONS
/** The choices whose value is any text, as opposed to the nudity level. */
export type TextChoice = Exclude<ChoiceField, 'nudity'>

export const CHOICE_FIELDS = Object.keys(CHOICE_OPTIONS) as ChoiceField[]
export const TEXT_CHOICES = CHOICE_FIELDS.filter((field): field is TextChoice => field !== 'nudity')

export function isChoiceField(name: string): name is ChoiceField {
  return Object.hasOwn(CHOICE_OPTIONS, name)
}
