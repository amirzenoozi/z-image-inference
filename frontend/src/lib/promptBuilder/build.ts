// Builder state, choices and the age safeguard. The option lists come from ComfyUI Photoreal Prompt Builder
// (MIT License, Copyright (c) 2025 artokun; see data.ts for the source links); the wording is written here, as
// a flowing paragraph (prose.ts) or a weighted tag list (tags.ts), depending on the model.
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
import { pronounFor, withArticle, type Facts, type Labelled, type Pronoun } from './facts'
import { proseFrom } from './prose'
import { tagsFrom } from './tags'
import type { ModelInfo } from '../../types'

export type PromptStyle = ModelInfo['prompt_style']

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
  | { status: 'ready'; prompt: string; negativePrompt: string; explicit: boolean }

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

/** Bust options, and poses and actions about breasts or lingerie, only apply when the subject may include a woman. */
export function includesWoman(who: string): boolean {
  return !['man', 'two men'].includes(who)
}

function includesMan(who: string): boolean {
  return ['man', 'couple', 'two men'].includes(who)
}

// Poses and solo actions about breasts, bras or panties
const WOMAN_ONLY = new Set([
  'chest pressed together arms', 'topless covering with hands', 'topless hair covering',
  'cupping breasts', 'squeezing breasts together', 'pulling panties aside', 'stepping out of panties', 'undoing bra clasp', 'pulling down strap',
])

const fitsWho = (who: string) => (option: string) => includesWoman(who) || !WOMAN_ONLY.has(option)

export function poseOptions(explicit: boolean, who: string = NOT_SET): string[] {
  return explicit ? [...POSES, ...Object.keys(EXPLICIT_POSES).filter(fitsWho(who))] : [...POSES]
}

export function soloActions(who: string): string[] {
  return Object.keys(EXPLICIT_SOLO_ACTIONS).filter(fitsWho(who))
}

/** Partner actions are written for a woman with a man, so they are only offered for a couple. */
export function partnerActions(who: string): string[] {
  return who === 'couple' ? Object.keys(EXPLICIT_PARTNER_ACTIONS) : []
}

function explicitActions(who: string): string[] {
  return [...soloActions(who), ...partnerActions(who)]
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
    explicitAction: p(soloActions(who), 'explicitAction'),
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
    hairLength: p(HAIR_LENGTHS, 'hairLength'), bodyType: p(BODY_TYPES, 'bodyType'), pose: p(poseOptions(state.explicit, who), 'pose'),
    sceneType: p(SCENE_TYPES, 'sceneType'), timeOfDay: p(TIMES_OF_DAY, 'timeOfDay'), lightingSetup: p(LIGHTING_SETUPS, 'lightingSetup'),
    photoStyle: p(PHOTO_STYLES, 'photoStyle'), shotType: p(SHOT_TYPES, 'shotType'), cameraAngle: p(CAMERA_ANGLES, 'cameraAngle'),
    lens: p(LENSES, 'lens'), depthOfField: p(DEPTH_OF_FIELD, 'depthOfField'), colorGrading: p(COLOR_GRADINGS, 'colorGrading'),
    realism: pickSome(REALISM_DETAILS, 2, seed, 'realism'),
    ...(state.explicit ? surpriseExplicit(state, who, seed) : surpriseClothed(state, seed)),
  }
}

// ── Facts ────────────────────────────────────────────────────────────────────
const isSet = (value: string) => value !== NOT_SET

function describeWho(who: Who, age: string, ethnicity: string, pronoun: Pronoun): string {
  const eth = isSet(ethnicity) ? `${ethnicity} ` : ''
  const ageText = isSet(age) ? ` in ${pronoun.their} ${age}` : ''
  if (who === 'couple') return `an adult ${eth}couple, a woman and a man${ageText}`
  if (who === 'two women' || who === 'two men') return `two adult ${eth}${who.slice(4)}${ageText}`
  return `an adult ${eth}${who}${ageText}`
}

function knownWho(value: string): Who | null {
  return (WHO_OPTIONS as readonly string[]).includes(value) ? (value as Who) : null
}

function explicitPose(state: BuilderState, who: string, seed: number): Labelled & { explicit: boolean } {
  const label = resolve(state.pose, poseOptions(state.explicit, who), seed, 'pose')
  const text = EXPLICIT_POSES[label]
  return { label, text: text ?? label, explicit: text !== undefined }
}

function explicitAction(state: BuilderState, who: string, seed: number): Labelled {
  if (!state.explicit) return { label: '', text: '' }
  const label = resolve(state.explicitAction, explicitActions(who), seed, 'explicitAction')
  // A choice kept from an earlier "Who" that no longer fits is left out rather than contradicting the subject
  return explicitActions(who).includes(label) ? { label, text: EXPLICIT_ACTIONS[label] } : { label: '', text: '' }
}

const OUTFIT_SLOTS = [
  { label: 'lingerie top', item: 'lingerieTop', color: 'lingerieTopColor', options: LINGERIE_TOPS },
  { label: 'lingerie bottom', item: 'lingerieBottom', color: 'lingerieBottomColor', options: LINGERIE_BOTTOMS },
  { label: 'top', item: 'top', color: 'topColor', options: TOPS },
  { label: 'bottom', item: 'bottom', color: 'bottomColor', options: BOTTOMS },
  { label: 'outerwear', item: 'outerwear', color: 'outerwearColor', options: OUTERWEAR },
  { label: 'shoes', item: 'shoes', color: 'shoesColor', options: SHOES },
] as const

type OutfitSlot = (typeof OUTFIT_SLOTS)[number]['item']

// The garments each nudity level leaves on; a prompt never describes clothes the nudity level has taken off
const WORN_WITH: Record<Nudity, ReadonlySet<OutfitSlot>> = {
  clothed: new Set(OUTFIT_SLOTS.map((slot) => slot.item)),
  implied: new Set(['shoes']),
  topless: new Set(['lingerieBottom', 'bottom', 'shoes']),
  nude: new Set(['shoes']),
}

function outfitFacts(outfit: OutfitState, nudity: Nudity | null, seed: number): { clothing: string[]; removed: string[] } {
  const clothing: string[] = []
  const removed: string[] = []
  for (const slot of OUTFIT_SLOTS) {
    const item = resolve(outfit[slot.item], slot.options, seed, slot.item)
    const color = resolve(outfit[slot.color], CLOTHING_COLORS, seed, slot.color)
    const worn = nudity === null || WORN_WITH[nudity].has(slot.item)
    if (item === REMOVE) removed.push(slot.label)
    else if (isSet(item) && worn) clothing.push(isSet(color) ? `${color} ${item.toLowerCase()}` : item.toLowerCase())
  }
  const accessories = outfit.accessories.map((item, index) => resolve(item, ACCESSORIES, seed, `accessory${index}`).toLowerCase())
  return { clothing: [...clothing, ...new Set(accessories.filter(isSet))], removed }
}

const PREPOSITIONS = ['in ', 'at ', 'on ', 'near ', 'by ', 'inside ', 'outside ', 'under ', 'above ', 'along ', 'within ']

function placeOf(environment: string, sceneType: string): string {
  const env = environment.trim()
  if (env) return PREPOSITIONS.some((p) => env.toLowerCase().startsWith(p)) ? env : `in ${env}`
  return isSet(sceneType) ? `in ${withArticle(sceneType)} setting` : ''
}

function lightingOf(state: BuilderState, sceneType: string, seed: number): Labelled {
  const setup = resolve(state.lightingSetup, LIGHTING_SETUPS, seed, 'lightingSetup')
  if (setup !== INHERIT_SCENE) return { label: setup, text: LIGHTING_EXPANSIONS[setup] ?? '' }
  return isSet(sceneType) ? { label: `${sceneType} lighting`, text: `the natural light of the ${sceneType} setting` } : { label: '', text: '' }
}

/** "razor thin f/1.4" → "razor thin depth of field at f/1.4". */
function depthOfField(value: string): string {
  if (!isSet(value)) return ''
  const words = value.split(' ')
  return `${words.slice(0, -1).join(' ')} depth of field at ${words[words.length - 1]}`
}

function personFacts(state: BuilderState, who: string, seed: number) {
  const r = (value: string, options: readonly string[], field: string) => resolve(value, options, seed, field)
  return {
    eyes: r(state.eyeColor, EYE_COLORS, 'eyeColor'),
    expression: r(state.expression, EXPRESSIONS, 'expression'),
    makeup: r(state.makeup, MAKEUP, 'makeup'),
    skinTone: r(state.skinTone, SKIN_TONES, 'skinTone'),
    skinDetails: state.skinDetails,
    appearanceExtra: state.appearanceExtra.trim(),
    hair: { length: r(state.hairLength, HAIR_LENGTHS, 'hairLength'), color: r(state.hairColor, HAIR_COLORS, 'hairColor'), style: r(state.hairstyle, HAIRSTYLES, 'hairstyle') },
    body: {
      type: r(state.bodyType, BODY_TYPES, 'bodyType'),
      height: r(state.height, HEIGHTS, 'height'),
      bust: includesWoman(who) ? r(state.bust, BUST_SIZES, 'bust') : NOT_SET,
      hips: r(state.hips, HIPS, 'hips'),
      marks: [...state.tattoos, ...state.piercings],
      extra: state.bodyExtra.trim(),
    },
  }
}

function settingFacts(state: BuilderState, seed: number) {
  const r = (value: string, options: readonly string[], field: string) => resolve(value, options, seed, field)
  const sceneType = r(state.sceneType, SCENE_TYPES, 'sceneType')
  return {
    place: placeOf(state.environment, sceneType),
    sceneType,
    time: r(state.timeOfDay, TIMES_OF_DAY, 'timeOfDay'),
    weather: r(state.weather, WEATHER, 'weather'),
    extraDetails: state.extraDetails.trim(),
    lighting: lightingOf(state, sceneType, seed),
    lightingCustom: state.lightingCustom.trim(),
    photoStyle: r(state.photoStyle, PHOTO_STYLES, 'photoStyle'),
    shot: r(state.shotType, SHOT_TYPES, 'shotType'),
    angle: r(state.cameraAngle, CAMERA_ANGLES, 'cameraAngle'),
    lens: r(state.lens, LENSES, 'lens'),
    depthOfField: depthOfField(r(state.depthOfField, DEPTH_OF_FIELD, 'depthOfField')),
    mood: state.mood.trim(),
    grading: r(state.colorGrading, COLOR_GRADINGS, 'colorGrading'),
    realism: state.realism,
  }
}

function resolveFacts(state: BuilderState): Facts {
  const seed = state.rollSeed
  const whoChoice = resolve(state.who, WHO_OPTIONS, seed, 'who')
  const who = knownWho(whoChoice)
  const pronoun = pronounFor(who)
  const age = resolve(state.age, AGE_RANGES, seed, 'age')
  const ethnicity = resolve(state.ethnicity, ETHNICITIES, seed, 'ethnicity')
  const subjectExtra = state.subject.trim()
  const core = who ? describeWho(who, age, ethnicity, pronoun) : ''
  const nudity = state.explicit ? state.nudity : null
  return {
    who, pronoun, age, ethnicity, subjectExtra,
    hasWoman: who !== null && includesWoman(who),
    hasMan: who !== null && includesMan(who),
    subject: [core, subjectExtra].filter(Boolean).join(', '),
    pose: explicitPose(state, whoChoice, seed),
    action: explicitAction(state, whoChoice, seed),
    freeAction: state.action.trim(),
    nudity,
    intimacy: state.explicit ? state.intimacy : [],
    ...personFacts(state, whoChoice, seed),
    ...outfitFacts(state.outfit, nudity, seed),
    outfitDetails: state.outfit.details.trim(),
    ...settingFacts(state, seed),
  }
}

// ── Negative prompt ──────────────────────────────────────────────────────────
const ANATOMY_NEGATIVES =
  'extra fingers, extra hands, extra limbs, missing fingers, fused fingers, mutated hands, deformed hands, phantom limb, ' +
  'floating hand, disembodied hand, extra arms, bad anatomy, malformed limbs, wrong number of fingers, six fingers, ' +
  'disfigured, ugly, blurry, watermark, text, logo, signature'
const BODY_NEGATIVES = 'saggy breasts, torpedo breasts, droopy breasts, pendulous breasts, tubular breasts, uneven breasts, deflated breasts'
const BREAST_COVER_NEGATIVES = 'exposed nipples, bare breasts, lifted shirt, shirt pulled up, topless, areola visible'
const INTIMATE_COVER_NEGATIVES = 'exposed genitals, no underwear, pantyless, bottomless'
// Negatives that would fight explicit content; removed from the user's own negative prompt when it is on
const SAFE_FOR_WORK_TERMS = new Set(['nsfw', 'censored', 'nude', 'nudity', 'naked'])

function coverageNegatives(state: BuilderState): string[] {
  if (!state.explicit) return []
  const breastsCovered = state.nudity === 'clothed' || state.nudity === 'implied'
  return [breastsCovered ? BREAST_COVER_NEGATIVES : '', state.nudity === 'nude' ? '' : INTIMATE_COVER_NEGATIVES]
}

/** Drops terms such as "nsfw" from a negative prompt, so it does not work against explicit content. */
export function withoutSafeForWorkTerms(negativePrompt: string): string {
  return negativePrompt
    .split(',')
    .map((term) => term.trim())
    .filter((term) => term && !SAFE_FOR_WORK_TERMS.has(term.toLowerCase()))
    .join(', ')
}

function negativePrompt(state: BuilderState): string {
  const own = state.explicit ? withoutSafeForWorkTerms(state.negativePrompt) : state.negativePrompt.trim()
  // Upstream always adds the body terms; here they only apply to explicit prompts
  const parts = [own, state.explicit ? BODY_NEGATIVES : '', ANATOMY_NEGATIVES, ...coverageNegatives(state)]
  return parts.filter(Boolean).join(', ')
}

export function buildPrompt(state: BuilderState, style: PromptStyle = 'prose'): BuildResult {
  if (!state.subject.trim() && state.who === NOT_SET) {
    return { status: 'incomplete', reason: 'Choose who the photo is of, or describe the subject, to start.' }
  }
  const problem = adultContentProblem(state)
  if (problem) return problem
  const facts = resolveFacts(state)
  const prompt = style === 'tags' ? tagsFrom(facts) : proseFrom(facts)
  return { status: 'ready', prompt, negativePrompt: negativePrompt(state), explicit: state.explicit }
}
