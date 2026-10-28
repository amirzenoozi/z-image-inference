// Builder state, choices and the age safeguard. The option lists come from ComfyUI Photoreal Prompt Builder
// (MIT License, Copyright (c) 2025 artokun; see data.ts for the source links); the wording is written here, as
// a flowing paragraph (prose.ts) or a weighted tag list (tags.ts), depending on the model, and shaped by the mode.
import type { ModelInfo } from '../../types'
import { CHOICE_OPTIONS, TEXT_CHOICES, type ChoiceField } from './choices'
import { INHERIT_SCENE, NOT_SET, RANDOM, REMOVE } from './constants'
import { BOTTOMS, CLOTHING_COLORS, LIGHTING_EXPANSIONS, LINGERIE_BOTTOMS, LINGERIE_TOPS, SHOES, TOPS } from './data'
import { INTIMACY_CUES, REALISM_DETAILS, type Nudity } from './extraData'
import { isAdultMode, isSafeMode, showsStep, type BuilderMode } from './modes'
import { negativePrompt } from './negatives'
import { proseFrom } from './prose'
import { pick, pickSome } from './random'
import { resolveFacts } from './resolveFacts'
import { choicesFor } from './rules'
import { tagsFrom } from './tags'

export { INHERIT_SCENE, NOT_SET, RANDOM, REMOVE } from './constants'
export { withoutSafeForWorkTerms } from './negatives'
export { choicesFor, includesWoman, partnerActions, poseOptions, soloActions } from './rules'

export type PromptStyle = ModelInfo['prompt_style']

export const LIGHTING_SETUPS: readonly string[] = Object.keys(LIGHTING_EXPANSIONS)

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
  /** The id of the builder mode (purpose), from prompt_modes.json. */
  mode: string
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
    outfit: emptyOutfit(), mode: 'general', nudity: 'clothed', intimacy: [],
    pose: NOT_SET, explicitAction: NOT_SET, action: '',
    sceneType: NOT_SET, environment: '', timeOfDay: NOT_SET, weather: NOT_SET, lightingSetup: NOT_SET, lightingCustom: '',
    photoStyle: NOT_SET, shotType: NOT_SET, cameraAngle: NOT_SET, lens: NOT_SET, depthOfField: NOT_SET,
    mood: '', colorGrading: NOT_SET, realism: [], extraDetails: '', negativePrompt: '', rollSeed: 1,
  }
}

// ── Age safeguard ────────────────────────────────────────────────────────────
// Sexual or lingerie content must describe adults; these words point to a minor.
const MINOR_TERMS =
  /\b(?:child(?:ren)?|kids?|minors?|under-?age(?:d)?|teen(?:s|age|aged|ager|agers)?|pre-?teens?|tweens?|school ?(?:girl|boy)s?|lol(?:i|ita)|shota|toddlers?|infants?|bab(?:y|ies)(?![\s-]*(?:blue|pink|doll|oil|powder))|girls?|boys?|daughters?|sons?|nieces?|nephews?|juveniles?|adolescents?|(?:[1-9]|1[0-7])\s*(?:yo|y\/o|y\.o\.|-?\s*years?[\s-]*old|-year-old))\b/i

/** Adult content: an adult mode, or lingerie in the outfit of any mode that is not safe (a safe mode leaves lingerie out). */
export function usesAdultContent(state: BuilderState, mode: BuilderMode): boolean {
  const wearsLingerie = [state.outfit.lingerieTop, state.outfit.lingerieBottom].some((item) => item !== NOT_SET && item !== REMOVE)
  return isAdultMode(mode) || (wearsLingerie && !isSafeMode(mode))
}

/** The first word that suggests a minor, when the prompt would include adult content. */
export function minorTermIn(state: BuilderState, mode: BuilderMode): string | null {
  if (!usesAdultContent(state, mode)) return null
  const freeText = [
    state.subject, state.appearanceExtra, state.bodyExtra, state.action, state.environment, state.mood,
    state.extraDetails, state.outfit.details,
  ].join(' ')
  return minorWordIn(freeText)
}

/** The first word in the text that points to a minor; characters check their name and details with it. */
export function minorWordIn(text: string): string | null {
  return MINOR_TERMS.exec(text)?.[0] ?? null
}

function adultContentProblem(state: BuilderState, mode: BuilderMode): BuildResult | null {
  if (!usesAdultContent(state, mode)) return null
  const minorTerm = minorTermIn(state, mode)
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
export function hasRandomChoice(state: BuilderState): boolean {
  const outfitValues = Object.values(state.outfit).flat().filter((value): value is string => typeof value === 'string')
  return [...TEXT_CHOICES.map((key) => state[key]), ...outfitValues].includes(RANDOM)
}

const SURPRISE_FIELDS = [
  'eyeColor', 'expression', 'makeup', 'skinTone', 'hairColor', 'hairstyle', 'hairLength', 'bodyType', 'pose', 'sceneType',
  'timeOfDay', 'lightingSetup', 'photoStyle', 'shotType', 'cameraAngle', 'lens', 'depthOfField', 'colorGrading',
] as const satisfies readonly ChoiceField[]

function surpriseAdult(state: BuilderState, mode: BuilderMode, seed: number): Partial<BuilderState> {
  const p = (options: readonly string[], field: string) => pick(options, seed, field)
  const nudity = p(choicesFor('nudity', state, mode), 'nudity') as Nudity
  return {
    nudity,
    explicitAction: p(choicesFor('explicitAction', { ...state, nudity }, mode), 'explicitAction'),
    intimacy: pickSome(INTIMACY_CUES, 2, seed, 'intimacy'),
    bust: p(choicesFor('bust', state, mode), 'bust'),
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
export function surprise(state: BuilderState, seed: number, mode: BuilderMode): BuilderState {
  const needsPerson = showsStep(mode, 'subject')
  const who = state.who === NOT_SET && needsPerson ? pick(['woman', 'man'], seed, 'who') : state.who
  const withWho = { ...state, who }
  const picked = Object.fromEntries(SURPRISE_FIELDS.map((field) => [field, pick(choicesFor(field, withWho, mode), seed, field)]))
  return {
    ...withWho,
    ...picked,
    age: state.age === NOT_SET && needsPerson ? pick(CHOICE_OPTIONS.age, seed, 'age') : state.age,
    realism: pickSome(REALISM_DETAILS, 2, seed, 'realism'),
    ...(isAdultMode(mode) ? surpriseAdult(withWho, mode, seed) : surpriseClothed(withWho, seed)),
  }
}

// ── Modes ────────────────────────────────────────────────────────────────────
const isSpecial = (value: string) => [NOT_SET, RANDOM, REMOVE, INHERIT_SCENE].includes(value)

/** Clears choices the mode does not allow, the way a stale action is left out when "Who" changes. */
function keepAllowed(state: BuilderState, mode: BuilderMode): BuilderState {
  const next = { ...state }
  for (const field of TEXT_CHOICES) {
    if (!isSpecial(next[field]) && !choicesFor(field, next, mode).includes(next[field])) next[field] = NOT_SET
  }
  const levels = choicesFor('nudity', next, mode) as Nudity[]
  return levels.includes(next.nudity) ? next : { ...next, nudity: levels[0] ?? 'clothed' }
}

/** Switches to a mode: its defaults fill only choices still untouched, so nothing you set is overwritten. */
export function switchMode(state: BuilderState, mode: BuilderMode): BuilderState {
  const untouched = emptyBuilderState()
  const next: BuilderState = { ...state, mode: mode.id }
  for (const field of TEXT_CHOICES) {
    const value = mode.defaults[field]
    if (value !== undefined && state[field] === untouched[field]) next[field] = value
  }
  const nudity = mode.defaults.nudity as Nudity | undefined
  if (nudity && state.nudity === untouched.nudity) next.nudity = nudity
  return keepAllowed(next, mode)
}

function missingStart(state: BuilderState, mode: BuilderMode): BuildResult | null {
  if (!showsStep(mode, 'subject')) {
    return state.environment.trim() || state.sceneType !== NOT_SET ? null : { status: 'incomplete', reason: 'Choose a scene or describe the place, to start.' }
  }
  return state.subject.trim() || state.who !== NOT_SET ? null : { status: 'incomplete', reason: 'Choose who the photo is of, or describe the subject, to start.' }
}

export function buildPrompt(state: BuilderState, mode: BuilderMode, style: PromptStyle = 'prose'): BuildResult {
  const problem = missingStart(state, mode) ?? adultContentProblem(state, mode)
  if (problem) return problem
  const facts = resolveFacts(state, mode)
  const prompt = style === 'tags' ? tagsFrom(facts, mode) : proseFrom(facts, mode)
  return { status: 'ready', prompt, negativePrompt: negativePrompt(state, mode, facts), explicit: isAdultMode(mode) }
}
