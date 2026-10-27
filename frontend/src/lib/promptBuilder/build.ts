// Prompt assembly ported from ComfyUI Photoreal Prompt Builder's build_prompt and compose_outfit
// (MIT License, Copyright (c) 2025 artokun); see data.ts for the source links. The subject, appearance,
// body, nudity, time, weather and realism parts are additions; with them unset the output matches upstream.
import {
  ACCESSORIES,
  BOTTOMS,
  CAMERA_ANGLES,
  CLOTHING_COLORS,
  COLOR_GRADINGS,
  DEPTH_OF_FIELD,
  EXPLICIT_PARTNER_ACTIONS,
  EXPLICIT_POSES,
  EXPLICIT_SOLO_ACTIONS,
  HAIRSTYLES,
  HAIR_COLORS,
  LENSES,
  LIGHTING_EXPANSIONS,
  LINGERIE_BOTTOMS,
  LINGERIE_TOPS,
  OUTERWEAR,
  PHOTO_STYLES,
  POSES,
  SCENE_TYPES,
  SHOES,
  SHOT_TYPES,
  TOPS,
} from './data'
import {
  AGE_RANGES,
  BODY_TYPES,
  BUST_SIZES,
  ETHNICITIES,
  EXPRESSIONS,
  EYE_COLORS,
  HAIR_LENGTHS,
  HEIGHTS,
  HIPS,
  INTIMACY_CUES,
  MAKEUP,
  NUDITY_LEVELS,
  REALISM_DETAILS,
  SKIN_TONES,
  TIMES_OF_DAY,
  WEATHER,
  WHO_OPTIONS,
  type Nudity,
  type Who,
} from './extraData'

export const NOT_SET = ''
export const RANDOM = 'random'
export const REMOVE = 'remove'
export const INHERIT_SCENE = 'inherit from scene'

export const LIGHTING_SETUPS: readonly string[] = Object.keys(LIGHTING_EXPANSIONS)
export const EXPLICIT_ACTIONS: Readonly<Record<string, string>> = { ...EXPLICIT_SOLO_ACTIONS, ...EXPLICIT_PARTNER_ACTIONS }

export interface OutfitState {
  top: string
  topColor: string
  bottom: string
  bottomColor: string
  lingerieTop: string
  lingerieTopColor: string
  lingerieBottom: string
  lingerieBottomColor: string
  outerwear: string
  outerwearColor: string
  shoes: string
  shoesColor: string
  accessories: [string, string, string]
  details: string
}

export interface BuilderState {
  who: string
  age: string
  ethnicity: string
  /** Free text about the subject; on its own it is the whole subject, as upstream. */
  subject: string
  eyeColor: string
  expression: string
  makeup: string
  skinTone: string
  skinDetails: string[]
  appearanceExtra: string
  hairColor: string
  hairstyle: string
  hairLength: string
  bodyType: string
  height: string
  bust: string
  hips: string
  tattoos: string[]
  piercings: string[]
  bodyExtra: string
  outfit: OutfitState
  explicit: boolean
  nudity: Nudity
  intimacy: string[]
  pose: string
  explicitAction: string
  action: string
  sceneType: string
  environment: string
  timeOfDay: string
  weather: string
  lightingSetup: string
  lightingCustom: string
  photoStyle: string
  shotType: string
  cameraAngle: string
  lens: string
  depthOfField: string
  mood: string
  colorGrading: string
  realism: string[]
  extraDetails: string
  negativePrompt: string
  /** Seeds every "Random" choice, so the preview stays stable until the user re-rolls. */
  rollSeed: number
}

export type BuildResult =
  | { status: 'incomplete'; reason: string }
  | { status: 'blocked'; reason: string }
  | { status: 'ready'; prompt: string; negativePrompt: string }

export function emptyOutfit(): OutfitState {
  return {
    top: NOT_SET, topColor: NOT_SET, bottom: NOT_SET, bottomColor: NOT_SET,
    lingerieTop: NOT_SET, lingerieTopColor: NOT_SET, lingerieBottom: NOT_SET, lingerieBottomColor: NOT_SET,
    outerwear: NOT_SET, outerwearColor: NOT_SET, shoes: NOT_SET, shoesColor: NOT_SET,
    accessories: [NOT_SET, NOT_SET, NOT_SET], details: '',
  }
}

export function emptyBuilderState(): BuilderState {
  return {
    who: NOT_SET, age: NOT_SET, ethnicity: NOT_SET, subject: '',
    eyeColor: NOT_SET, expression: NOT_SET, makeup: NOT_SET, skinTone: NOT_SET, skinDetails: [], appearanceExtra: '',
    hairColor: NOT_SET, hairstyle: NOT_SET, hairLength: NOT_SET,
    bodyType: NOT_SET, height: NOT_SET, bust: NOT_SET, hips: NOT_SET, tattoos: [], piercings: [], bodyExtra: '',
    outfit: emptyOutfit(), explicit: false, nudity: 'clothed', intimacy: [],
    pose: NOT_SET, explicitAction: NOT_SET, action: '',
    sceneType: NOT_SET, environment: '', timeOfDay: NOT_SET, weather: NOT_SET, lightingSetup: NOT_SET, lightingCustom: '',
    photoStyle: NOT_SET, shotType: NOT_SET, cameraAngle: NOT_SET, lens: NOT_SET, depthOfField: NOT_SET,
    mood: '', colorGrading: NOT_SET, realism: [], extraDetails: '', negativePrompt: '', rollSeed: 1,
  }
}

export function poseOptions(explicit: boolean): string[] {
  return explicit ? [...POSES, ...Object.keys(EXPLICIT_POSES)] : [...POSES]
}

/** Bust options only apply when the subject may include a woman. */
export function includesWoman(who: string): boolean {
  return !['man', 'two men'].includes(who)
}

// ── Age safeguard ────────────────────────────────────────────────────────────
// Sexual or lingerie content must describe adults; these words point to a minor.
const MINOR_TERMS =
  /\b(?:child(?:ren)?|kids?|minors?|under-?age(?:d)?|teen(?:s|age|aged|ager|agers)?|pre-?teens?|tweens?|school ?(?:girl|boy)s?|lol(?:i|ita)|shota|toddlers?|infants?|bab(?:y|ies)(?![\s-]*(?:blue|pink|doll|oil|powder))|girls?|boys?|daughters?|sons?|nieces?|nephews?|juveniles?|adolescents?|(?:[1-9]|1[0-7])\s*(?:yo|y\/o|y\.o\.|-?\s*years?[\s-]*old|-year-old))\b/i

export function usesAdultContent(state: BuilderState): boolean {
  const wearsLingerie = [state.outfit.lingerieTop, state.outfit.lingerieBottom].some((item) => item !== NOT_SET && item !== REMOVE)
  return state.explicit || wearsLingerie
}

/** The first word that suggests a minor, when the prompt would include adult content. */
export function minorTermIn(state: BuilderState): string | null {
  if (!usesAdultContent(state)) return null
  const freeText = [
    state.subject, state.appearanceExtra, state.bodyExtra, state.action, state.environment, state.mood,
    state.extraDetails, state.outfit.details,
  ].join(' ')
  return MINOR_TERMS.exec(freeText)?.[0] ?? null
}

function adultContentProblem(state: BuilderState): BuildResult | null {
  if (!usesAdultContent(state)) return null
  const minorTerm = minorTermIn(state)
  if (minorTerm) {
    return {
      status: 'blocked',
      reason: `Prompts with explicit content or lingerie must describe adults. Remove “${minorTerm}” (for example, write “adult woman” or “adult man”).`,
    }
  }
  if (state.who === NOT_SET || state.age === NOT_SET) {
    return { status: 'incomplete', reason: 'Explicit and lingerie prompts need “Who” and an adult age range, in the Subject step.' }
  }
  return null
}

// ── Random choices ───────────────────────────────────────────────────────────
function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

function unitRandom(seed: number, field: string): number {
  let t = (seed ^ hash(field)) + 0x6d2b79f5
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** Each field rolls independently, so changing one "Random" field never changes another's pick. */
function pick(options: readonly string[], seed: number, field: string): string {
  return options[Math.floor(unitRandom(seed, field) * options.length)] ?? NOT_SET
}

function pickSome(options: readonly string[], count: number, seed: number, field: string): string[] {
  const shuffled = [...options].sort((a, b) => unitRandom(seed, `${field}:${a}`) - unitRandom(seed, `${field}:${b}`))
  return shuffled.slice(0, count)
}

function resolve(value: string, options: readonly string[], seed: number, field: string): string {
  return value === RANDOM ? pick(options, seed, field) : value
}

const SINGLE_CHOICES = [
  'who', 'age', 'ethnicity', 'eyeColor', 'expression', 'makeup', 'skinTone', 'hairColor', 'hairstyle', 'hairLength',
  'bodyType', 'height', 'bust', 'hips', 'pose', 'explicitAction', 'sceneType', 'timeOfDay', 'weather', 'lightingSetup',
  'photoStyle', 'shotType', 'cameraAngle', 'lens', 'depthOfField', 'colorGrading',
] as const satisfies readonly (keyof BuilderState)[]

export function hasRandomChoice(state: BuilderState): boolean {
  const outfitValues = Object.values(state.outfit).flat().filter((value): value is string => typeof value === 'string')
  return [...SINGLE_CHOICES.map((key) => state[key]), ...outfitValues].includes(RANDOM)
}

function surpriseExplicit(state: BuilderState, who: string, seed: number): Partial<BuilderState> {
  const p = (options: readonly string[], field: string) => pick(options, seed, field)
  return {
    explicitAction: p(Object.keys(EXPLICIT_SOLO_ACTIONS), 'explicitAction'),
    nudity: p(NUDITY_LEVELS.map((level) => level.value), 'nudity') as Nudity,
    intimacy: pickSome(INTIMACY_CUES, 2, seed, 'intimacy'),
    bust: includesWoman(who) ? p(BUST_SIZES, 'bust') : NOT_SET,
    outfit: {
      ...state.outfit,
      lingerieTop: p(LINGERIE_TOPS, 'lingerieTop'), lingerieTopColor: p(CLOTHING_COLORS, 'lingerieColor'),
      lingerieBottom: p(LINGERIE_BOTTOMS, 'lingerieBottom'), lingerieBottomColor: p(CLOTHING_COLORS, 'lingerieColor'),
    },
  }
}

function surpriseClothed(state: BuilderState, seed: number): Partial<BuilderState> {
  const p = (options: readonly string[], field: string) => pick(options, seed, field)
  return {
    outfit: { ...state.outfit, top: p(TOPS, 'top'), topColor: p(CLOTHING_COLORS, 'topColor'), bottom: p(BOTTOMS, 'bottom'), shoes: p(SHOES, 'shoes') },
  }
}

/** Fills the main choices with concrete random values the user can then adjust; free text is kept. */
export function surprise(state: BuilderState, seed: number): BuilderState {
  const p = (options: readonly string[], field: string) => pick(options, seed, field)
  const who = state.who === NOT_SET ? p(['woman', 'man'], 'who') : state.who
  return {
    ...state,
    who,
    age: state.age === NOT_SET ? p(AGE_RANGES, 'age') : state.age,
    eyeColor: p(EYE_COLORS, 'eyeColor'), expression: p(EXPRESSIONS, 'expression'), makeup: p(MAKEUP, 'makeup'),
    skinTone: p(SKIN_TONES, 'skinTone'), hairColor: p(HAIR_COLORS, 'hairColor'), hairstyle: p(HAIRSTYLES, 'hairstyle'),
    hairLength: p(HAIR_LENGTHS, 'hairLength'), bodyType: p(BODY_TYPES, 'bodyType'), pose: p(poseOptions(state.explicit), 'pose'),
    sceneType: p(SCENE_TYPES, 'sceneType'), timeOfDay: p(TIMES_OF_DAY, 'timeOfDay'), lightingSetup: p(LIGHTING_SETUPS, 'lightingSetup'),
    photoStyle: p(PHOTO_STYLES, 'photoStyle'), shotType: p(SHOT_TYPES, 'shotType'), cameraAngle: p(CAMERA_ANGLES, 'cameraAngle'),
    lens: p(LENSES, 'lens'), depthOfField: p(DEPTH_OF_FIELD, 'depthOfField'), colorGrading: p(COLOR_GRADINGS, 'colorGrading'),
    realism: pickSome(REALISM_DETAILS, 2, seed, 'realism'),
    ...(state.explicit ? surpriseExplicit(state, who, seed) : surpriseClothed(state, seed)),
  }
}

// ── Sentences ────────────────────────────────────────────────────────────────
const capitalise = (text: string) => (text ? text[0].toUpperCase() + text.slice(1) : text)
const isSet = (value: string) => value !== NOT_SET
const listOf = (...parts: string[]) => parts.filter(Boolean).join(', ')

function expand(label: string): string {
  return EXPLICIT_POSES[label] ?? EXPLICIT_ACTIONS[label] ?? label
}

const POSSESSIVE: Record<Who, string> = { woman: 'her', man: 'his', couple: 'their', 'two women': 'their', 'two men': 'their' }

function describeWho(who: Who, age: string, ethnicity: string): string {
  const eth = isSet(ethnicity) ? `${ethnicity} ` : ''
  const ageText = isSet(age) ? ` in ${POSSESSIVE[who]} ${age}` : ''
  if (who === 'couple') return `an adult ${eth}couple, a woman and a man${ageText}`
  if (who === 'two women' || who === 'two men') return `two adult ${eth}${who.slice(4)}${ageText}`
  return `an adult ${eth}${who}${ageText}`
}

function subjectPhrase(state: BuilderState, seed: number): string {
  const who = resolve(state.who, WHO_OPTIONS, seed, 'who')
  const extra = state.subject.trim()
  if (!isSet(who)) return extra
  const core = describeWho(who as Who, resolve(state.age, AGE_RANGES, seed, 'age'), resolve(state.ethnicity, ETHNICITIES, seed, 'ethnicity'))
  return extra ? `${core}, ${extra}` : core
}

function openerSentence(state: BuilderState, seed: number): string {
  const style = resolve(state.photoStyle, PHOTO_STYLES, seed, 'photoStyle')
  const pose = resolve(state.pose, poseOptions(state.explicit), seed, 'pose')
  const subject = subjectPhrase(state, seed)
  const opener = isSet(style) ? `${capitalise(style)} photo of ${subject}` : `Photo of ${subject}`
  return isSet(pose) ? `${opener}, ${expand(pose)}` : opener
}

function appearanceSentence(state: BuilderState, seed: number): string {
  const eyes = resolve(state.eyeColor, EYE_COLORS, seed, 'eyeColor')
  const tone = resolve(state.skinTone, SKIN_TONES, seed, 'skinTone')
  return capitalise(listOf(
    isSet(eyes) ? `${eyes} eyes` : '',
    resolve(state.expression, EXPRESSIONS, seed, 'expression'),
    resolve(state.makeup, MAKEUP, seed, 'makeup'),
    isSet(tone) ? `${tone} skin` : '',
    ...state.skinDetails,
    state.appearanceExtra.trim(),
  ))
}

function bodySentence(state: BuilderState, seed: number): string {
  const who = resolve(state.who, WHO_OPTIONS, seed, 'who')
  const bust = includesWoman(who) ? resolve(state.bust, BUST_SIZES, seed, 'bust') : NOT_SET
  return capitalise(listOf(
    resolve(state.bodyType, BODY_TYPES, seed, 'bodyType'),
    resolve(state.height, HEIGHTS, seed, 'height'),
    bust,
    resolve(state.hips, HIPS, seed, 'hips'),
    ...state.tattoos,
    ...state.piercings,
    state.bodyExtra.trim(),
  ))
}

function actionSentences(state: BuilderState, seed: number): string[] {
  const explicitAction = state.explicit ? resolve(state.explicitAction, Object.keys(EXPLICIT_ACTIONS), seed, 'explicitAction') : NOT_SET
  return [isSet(explicitAction) ? expand(explicitAction) : '', expand(state.action.trim())]
}

function hairSentence(state: BuilderState, seed: number): string {
  const length = resolve(state.hairLength, HAIR_LENGTHS, seed, 'hairLength')
  const color = resolve(state.hairColor, HAIR_COLORS, seed, 'hairColor')
  const style = resolve(state.hairstyle, HAIRSTYLES, seed, 'hairstyle')
  // Upstream leaves a lone colour as just "Auburn"; naming the hair makes the prompt clearer
  const hair = isSet(style) ? `${style} hair` : isSet(color) || isSet(length) ? 'hair' : ''
  return capitalise([length, color, hair].filter(Boolean).join(' '))
}

const OUTFIT_SLOTS = [
  { label: 'lingerie top', item: 'lingerieTop', color: 'lingerieTopColor', options: LINGERIE_TOPS },
  { label: 'lingerie bottom', item: 'lingerieBottom', color: 'lingerieBottomColor', options: LINGERIE_BOTTOMS },
  { label: 'top', item: 'top', color: 'topColor', options: TOPS },
  { label: 'bottom', item: 'bottom', color: 'bottomColor', options: BOTTOMS },
  { label: 'outerwear', item: 'outerwear', color: 'outerwearColor', options: OUTERWEAR },
  { label: 'shoes', item: 'shoes', color: 'shoesColor', options: SHOES },
] as const

function joinPieces(pieces: string[]): string {
  if (pieces.length <= 2) return pieces.join(' and ')
  return `${pieces.slice(0, -1).join(', ')}, and ${pieces[pieces.length - 1]}`
}

export function composeOutfit(outfit: OutfitState, seed: number): string {
  const pieces: string[] = []
  const removed: string[] = []
  for (const slot of OUTFIT_SLOTS) {
    const item = resolve(outfit[slot.item], slot.options, seed, slot.item)
    const color = resolve(outfit[slot.color], CLOTHING_COLORS, seed, slot.color)
    if (item === REMOVE) removed.push(slot.label)
    else if (isSet(item)) pieces.push(isSet(color) ? `${color} ${item.toLowerCase()}` : item.toLowerCase())
  }
  const accessories = outfit.accessories.map((item, index) => resolve(item, ACCESSORIES, seed, `accessory${index}`).toLowerCase())
  pieces.push(...new Set(accessories.filter(isSet)))

  const wearing = pieces.length ? `Wearing ${joinPieces(pieces)}` : ''
  const without = removed.length ? `without ${removed.join(', without ')}` : ''
  const clothing = wearing && without ? `${wearing}, ${without}` : wearing || capitalise(without)
  const details = outfit.details.trim()
  return clothing && details ? `${clothing}. ${details}` : clothing || details
}

const COVERED_BREASTS = 'nipples fully concealed by clothing, fabric, hands, or hair, breasts fully covered by outfit'
const COVERED_INTIMATE = 'underwear or lingerie covering intimate areas'

const EXPOSURE: Record<Nudity, string> = {
  clothed: `${COVERED_BREASTS}, ${COVERED_INTIMATE}`,
  implied: 'implied nudity, nipples and intimate areas hidden by hands, sheets, or hair',
  topless: `clothing adjusted to expose breasts, no bra, ${COVERED_INTIMATE}`,
  nude: 'clothing adjusted to expose breasts, no bra, not wearing panties',
}

function explicitSentences(state: BuilderState): string[] {
  if (!state.explicit) return []
  return [capitalise(EXPOSURE[state.nudity]), capitalise(listOf(...state.intimacy))]
}

const PREPOSITIONS = ['in ', 'at ', 'on ', 'near ', 'by ', 'inside ', 'outside ', 'under ', 'above ', 'along ', 'within ']

function placeSentence(environment: string, sceneType: string): string {
  const env = environment.trim()
  if (env) return PREPOSITIONS.some((p) => env.toLowerCase().startsWith(p)) ? capitalise(env) : `In ${env}`
  if (!isSet(sceneType)) return ''
  return `In ${'aeiou'.includes(sceneType[0].toLowerCase()) ? 'an' : 'a'} ${sceneType} setting`
}

function sceneSentence(state: BuilderState, sceneType: string, seed: number): string {
  const time = resolve(state.timeOfDay, TIMES_OF_DAY, seed, 'timeOfDay')
  const weather = resolve(state.weather, WEATHER, seed, 'weather')
  const place = placeSentence(state.environment, sceneType)
  const when = isSet(time) ? (place ? ` at ${time}` : `At ${time}`) : ''
  return capitalise(listOf(`${place}${when}`, weather))
}

function lightingSentence(state: BuilderState, sceneType: string, seed: number): string {
  const setup = resolve(state.lightingSetup, LIGHTING_SETUPS, seed, 'lightingSetup')
  const fromScene = isSet(sceneType) ? `lighting natural to a ${sceneType} setting` : ''
  const prose = setup === INHERIT_SCENE ? fromScene : LIGHTING_EXPANSIONS[setup] ?? ''
  return capitalise(listOf(prose, state.lightingCustom.trim()))
}

function technicalSentence(state: BuilderState, seed: number): string {
  const shot = resolve(state.shotType, SHOT_TYPES, seed, 'shotType')
  const lens = resolve(state.lens, LENSES, seed, 'lens')
  const dof = resolve(state.depthOfField, DEPTH_OF_FIELD, seed, 'depthOfField')
  const words = dof.split(' ')
  return listOf(
    capitalise(shot),
    resolve(state.cameraAngle, CAMERA_ANGLES, seed, 'cameraAngle'),
    isSet(lens) ? `${lens} lens` : '',
    isSet(dof) ? `${words[0]} depth of field at ${words[words.length - 1]}` : '',
  )
}

function moodSentence(state: BuilderState, seed: number): string {
  const grading = resolve(state.colorGrading, COLOR_GRADINGS, seed, 'colorGrading')
  const mood = state.mood.trim()
  return [
    mood ? `${capitalise(mood)} mood` : '',
    isSet(grading) && grading !== 'natural' ? `${capitalise(grading)} color grading` : '',
  ].filter(Boolean).join('. ')
}

const ANATOMY_NEGATIVES =
  'extra fingers, extra hands, extra limbs, missing fingers, fused fingers, mutated hands, deformed hands, phantom limb, ' +
  'floating hand, disembodied hand, extra arms, bad anatomy, malformed limbs, wrong number of fingers, six fingers, ' +
  'disfigured, ugly, blurry, watermark, text, logo, signature'
const BODY_NEGATIVES = 'saggy breasts, torpedo breasts, droopy breasts, pendulous breasts, tubular breasts, uneven breasts, deflated breasts'
const BREAST_COVER_NEGATIVES = 'exposed nipples, bare breasts, lifted shirt, shirt pulled up, topless, areola visible'
const INTIMATE_COVER_NEGATIVES = 'exposed genitals, no underwear, pantyless, bottomless'

function coverageNegatives(state: BuilderState): string[] {
  if (!state.explicit) return []
  const breastsCovered = state.nudity === 'clothed' || state.nudity === 'implied'
  return [breastsCovered ? BREAST_COVER_NEGATIVES : '', state.nudity === 'nude' ? '' : INTIMATE_COVER_NEGATIVES]
}

function negativePrompt(state: BuilderState): string {
  // Upstream always adds the body terms; here they only apply to explicit prompts
  const parts = [state.negativePrompt.trim(), state.explicit ? BODY_NEGATIVES : '', ANATOMY_NEGATIVES, ...coverageNegatives(state)]
  return parts.filter(Boolean).join(', ')
}

export function buildPrompt(state: BuilderState): BuildResult {
  if (!state.subject.trim() && state.who === NOT_SET) {
    return { status: 'incomplete', reason: 'Choose who the photo is of, or describe the subject, to start.' }
  }
  const problem = adultContentProblem(state)
  if (problem) return problem
  const seed = state.rollSeed
  const sceneType = resolve(state.sceneType, SCENE_TYPES, seed, 'sceneType')
  const sentences = [
    openerSentence(state, seed),
    appearanceSentence(state, seed),
    bodySentence(state, seed),
    ...actionSentences(state, seed),
    hairSentence(state, seed),
    composeOutfit(state.outfit, seed),
    ...explicitSentences(state),
    sceneSentence(state, sceneType, seed),
    capitalise(state.extraDetails.trim()),
    lightingSentence(state, sceneType, seed),
    technicalSentence(state, seed),
    moodSentence(state, seed),
    capitalise(listOf(...state.realism)),
  ]
  const prompt = sentences
    .map((sentence) => sentence.trim().replace(/\.+$/, ''))
    .filter(Boolean)
    .join('. ')
  return { status: 'ready', prompt: `${prompt}.`, negativePrompt: negativePrompt(state) }
}
