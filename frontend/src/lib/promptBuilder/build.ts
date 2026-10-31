// Builder state, choices and the age safeguard. The option lists come from ComfyUI Photoreal Prompt Builder
// (MIT License, Copyright (c) 2025 artokun; see data.ts for the source links); the wording is written here, as
// a flowing paragraph (prose.ts) or a weighted tag list (tags.ts), depending on the model, and shaped by the mode.
import { t } from '../../i18n'
import type { ModelInfo } from '../../types'
import { CHOICE_OPTIONS, TEXT_CHOICES, type TextChoice } from './choices'
import { INHERIT_SCENE, NOT_SET, RANDOM, REMOVE } from './constants'
import { CLOTHING_COLORS, LIGHTING_EXPANSIONS } from './data'
import { fitnessClothing, isWorkoutFocused, outfitOptions } from './fitness'
import { intimateOptions, intimateSet } from './intimates'
import { INTIMACY_CUES, REALISM_DETAILS, type Nudity } from './extraData'
import { alwaysClothed, isAdultMode, isSafeMode, showsStep, type BuilderMode, type StepId } from './modes'
import { negativePrompt } from './negatives'
import { proseFrom } from './prose'
import { pick, pickSome } from './random'
import { resolveFacts } from './resolveFacts'
import { choicesFor, explicitDetailOptions, includesWoman } from './rules'
import { clashesIn, fitsChoice, type Clash } from './conflicts'
import { choicesInPrompt, pickFitting, settleChoices } from './settle'
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
  /** Further picks of a choice that takes several (multiChoice.ts), after the first. */
  makeupMore: string[]
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
  /** Explicit purpose only: a man's size, a woman's nipples, and the pubic hair, when they would be seen. */
  penis: string
  /** Men: the beard, chest and bulge. Anyone: the muscles, abs and (18+) body hair. */
  facialHair: string
  facialHairMore: string[]
  muscles: string
  abs: string
  chest: string
  bodyHair: string
  bulge: string
  nipples: string
  pubicHair: string
  tattoos: string[]
  piercings: string[]
  bodyExtra: string
  outfit: OutfitState
  /** The id of the builder mode (purpose), from prompt_modes.json. */
  mode: string
  nudity: Nudity
  intimacy: string[]
  /** Explicit purpose only: fluids, arousal and marks (EXPLICIT_DETAILS). */
  explicitDetails: string[]
  pose: string
  explicitAction: string
  action: string
  sceneType: string
  environment: string
  timeOfDay: string
  weather: string
  lightingSetup: string
  lightingMore: string[]
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
  | { status: 'ready'; prompt: string; negativePrompt: string; explicit: boolean; clashes: Clash[] }

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
    eyeColor: NOT_SET, expression: NOT_SET, makeup: NOT_SET, makeupMore: [], skinTone: NOT_SET, skinDetails: [], appearanceExtra: '',
    hairColor: NOT_SET, hairstyle: NOT_SET, hairLength: NOT_SET,
    bodyType: NOT_SET, height: NOT_SET, bust: NOT_SET, hips: NOT_SET, penis: NOT_SET, nipples: NOT_SET, pubicHair: NOT_SET,
    facialHair: NOT_SET, facialHairMore: [], muscles: NOT_SET, abs: NOT_SET, chest: NOT_SET, bodyHair: NOT_SET, bulge: NOT_SET, tattoos: [], piercings: [], bodyExtra: '',
    outfit: emptyOutfit(), mode: 'general', nudity: 'clothed', intimacy: [], explicitDetails: [],
    pose: NOT_SET, explicitAction: NOT_SET, action: '',
    sceneType: NOT_SET, environment: '', timeOfDay: NOT_SET, weather: NOT_SET, lightingSetup: NOT_SET, lightingMore: [], lightingCustom: '',
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
      reason: t('builder.reasonMinor', { term: minorTerm }),
    }
  }
  if (state.who === NOT_SET || state.age === NOT_SET) {
    return { status: 'incomplete', reason: t('builder.reasonNeedsAdult') }
  }
  return null
}

// ── Random choices ───────────────────────────────────────────────────────────
export function hasRandomChoice(state: BuilderState): boolean {
  const outfitValues = Object.values(state.outfit).flat().filter((value): value is string => typeof value === 'string')
  return [...TEXT_CHOICES.map((key) => state[key]), ...outfitValues].includes(RANDOM)
}

// In the order they are picked, so each fits the ones before it; the expression waits for the act
const SURPRISE_BEFORE_ACTS = [
  'hairLength', 'hairstyle', 'hairColor', 'eyeColor', 'makeup', 'skinTone', 'facialHair', 'bodyType', 'muscles', 'abs', 'sceneType', 'timeOfDay', 'lightingSetup',
  'photoStyle', 'shotType', 'cameraAngle', 'lens', 'depthOfField', 'colorGrading', 'pose',
] as const satisfies readonly TextChoice[]

function pickInOrder(state: BuilderState, fields: readonly TextChoice[], mode: BuilderMode, seed: number): BuilderState {
  return fields.reduce((next, field) => ({ ...next, [field]: pickFitting(field, next, mode, seed) }), state)
}

/** Up to `count` chips of a list, each fitting the pose, the act and the chips picked before it. */
function pickChips(state: BuilderState, field: 'intimacy' | 'explicitDetails', options: readonly string[], count: number, seed: number): string[] {
  return pickSome(options, options.length, seed, field).reduce<string[]>((chips, chip) => {
    const fits = chips.length < count && fitsChoice({ ...state, [field]: chips }, { [field]: [...chips, chip] }, chip)
    return fits ? [...chips, chip] : chips
  }, [])
}

const pickNudity = (state: BuilderState, mode: BuilderMode, seed: number) => pick(choicesFor('nudity', state, mode), seed, 'nudity') as Nudity

/** The intimacy cues and the explicit details, each fitting the pose, the act and the nudity level. */
function withChips(state: BuilderState, mode: BuilderMode, seed: number): BuilderState {
  const intimacy = pickChips(state, 'intimacy', INTIMACY_CUES, 2, seed)
  return { ...state, intimacy, explicitDetails: pickChips({ ...state, intimacy }, 'explicitDetails', explicitDetailOptions(state, mode), 2, seed) }
}

/** The Intimacy step: the nudity level and its chips. */
function surpriseIntimacy(state: BuilderState, mode: BuilderMode, seed: number): BuilderState {
  return withChips({ ...state, nudity: pickNudity(state, mode, seed) }, mode, seed)
}

function surpriseAdult(state: BuilderState, mode: BuilderMode, seed: number): BuilderState {
  // The nudity level comes first, since the acts and anatomy offered depend on it
  const withNudity = { ...state, nudity: pickNudity(state, mode, seed) }
  const withAct = pickInOrder(withNudity, ['explicitAction', 'penis', 'nipples', 'pubicHair', 'chest', 'bodyHair', 'bulge'], mode, seed)
  return { ...withChips(withAct, mode, seed), bust: pick(choicesFor('bust', state, mode), seed, 'bust') }
}

/**
 * A whole new outfit for the purpose: every garment and accessory chosen before is cleared first, so nothing old is
 * mixed in, then the subject is dressed as the purpose dresses: a matching lingerie or swimwear set in an 18+ purpose
 * (with a top for a woman), gym clothes for a workout purpose, everyday clothes otherwise. Typed details are kept.
 */
function surpriseOutfit(state: BuilderState, mode: BuilderMode, seed: number): BuilderState {
  const colour = (field: string) => pick(CLOTHING_COLORS, seed, field)
  const bare: OutfitState = { ...emptyOutfit(), details: state.outfit.details }
  if (isAdultMode(mode)) {
    return { ...state, outfit: { ...bare, ...intimateSet(state, mode, seed), lingerieTopColor: colour('lingerieColor'), lingerieBottomColor: colour('lingerieColor') } }
  }
  const workout = isWorkoutFocused(mode.options.pose)
  const clothes = (slot: 'top' | 'bottom' | 'shoes') => pick(workout ? fitnessClothing(slot, state) : outfitOptions(slot, state), seed, slot)
  return { ...state, outfit: { ...bare, top: clothes('top'), topColor: colour('topColor'), bottom: clothes('bottom'), shoes: clothes('shoes') } }
}

/** Fills the main choices with concrete random values the user can then adjust, none contradicting another; free text is kept. */
export function surprise(state: BuilderState, seed: number, mode: BuilderMode): BuilderState {
  const needsPerson = showsStep(mode, 'subject')
  const who = state.who === NOT_SET && needsPerson ? pick(['woman', 'man'], seed, 'who') : state.who
  const start: BuilderState = {
    ...state,
    who,
    age: state.age === NOT_SET && needsPerson ? pick(CHOICE_OPTIONS.age, seed, 'age') : state.age,
    realism: pickSome(REALISM_DETAILS, 2, seed, 'realism'),
  }
  const looked = pickInOrder(start, SURPRISE_BEFORE_ACTS, mode, seed)
  const acted = isAdultMode(mode) ? surpriseAdult(looked, mode, seed) : looked
  return pickInOrder(surpriseOutfit(acted, mode, seed), ['expression'], mode, seed)
}

// What each step's own Surprise me picks again, in an order that keeps each pick fitting the ones before it
const STEP_CHOICES: Readonly<Partial<Record<StepId, readonly TextChoice[]>>> = {
  appearance: ['hairLength', 'hairstyle', 'hairColor', 'eyeColor', 'makeup', 'skinTone', 'facialHair', 'expression'],
  body: ['bodyType', 'muscles', 'abs', 'chest', 'bodyHair', 'bust', 'hips', 'height', 'penis', 'nipples', 'pubicHair', 'bulge'],
  pose: ['pose', 'explicitAction', 'expression'],
  scene: ['sceneType', 'timeOfDay', 'weather', 'lightingSetup'],
  camera: ['photoStyle', 'shotType', 'cameraAngle', 'lens', 'depthOfField'],
  finish: ['colorGrading'],
}

/** "Who" is kept once chosen, since the body, the outfit and the acts are chosen for it. */
function surpriseSubject(state: BuilderState, mode: BuilderMode, seed: number): BuilderState {
  const who = state.who === NOT_SET ? pick(['woman', 'man'], seed, 'who') : state.who
  return pickInOrder({ ...state, who }, ['age', 'ethnicity'], mode, seed)
}

/** Further picks of the step's multi-choices are dropped, so only the new pick is left. */
function withoutFurtherPicks(state: BuilderState, step: StepId): BuilderState {
  if (step === 'appearance') return { ...state, makeupMore: [], facialHairMore: [] }
  if (step === 'scene') return { ...state, lightingMore: [] }
  if (step === 'finish') return { ...state, realism: [] }
  return state
}

/**
 * Picks again only the choices of one step, each fitting everything else, which stays as it is; typed text is kept.
 * The Outfit step is dressed afresh, as Surprise me dresses it.
 */
export function surpriseStep(state: BuilderState, step: StepId, seed: number, mode: BuilderMode): BuilderState {
  if (step === 'subject') return surpriseSubject(state, mode, seed)
  if (step === 'outfit') return surpriseOutfit(state, mode, seed)
  if (step === 'intimacy') return surpriseIntimacy(state, mode, seed)
  const picked = pickInOrder(withoutFurtherPicks(state, step), STEP_CHOICES[step] ?? [], mode, seed)
  return step === 'finish' ? { ...picked, realism: pickSome(REALISM_DETAILS, 2, seed, 'realism') } : picked
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
    return state.environment.trim() || state.sceneType !== NOT_SET ? null : { status: 'incomplete', reason: t('builder.reasonNeedsScene') }
  }
  return state.subject.trim() || state.who !== NOT_SET ? null : { status: 'incomplete', reason: t('builder.reasonNeedsSubject') }
}

/** A purpose that keeps everyone clothed (Faceless) needs a top for a woman, so the model never leaves her topless. */
function missingTop(state: BuilderState, mode: BuilderMode): BuildResult | null {
  const needsTop = alwaysClothed(mode) && showsStep(mode, 'outfit') && includesWoman(state.who)
  const { top, lingerieTop } = state.outfit
  // A lingerie top only counts while it is offered: a see-through one kept from another purpose is left out
  const hasTop = (top !== NOT_SET && top !== REMOVE) || lingerieTop === RANDOM || intimateOptions('lingerieTop', state, mode).includes(lingerieTop)
  return needsTop && !hasTop ? { status: 'incomplete', reason: t('builder.reasonNeedsTop') } : null
}

export function buildPrompt(state: BuilderState, mode: BuilderMode, style: PromptStyle = 'prose'): BuildResult {
  const problem = missingStart(state, mode) ?? adultContentProblem(state, mode) ?? missingTop(state, mode)
  if (problem) return problem
  const facts = resolveFacts(state, mode)
  const prompt = style === 'tags' ? tagsFrom(facts, mode) : proseFrom(facts, mode)
  // Random picks never clash, so what is left comes from the user's own choices, shown as a warning
  const clashes = clashesIn(choicesInPrompt(settleChoices(state, mode), mode))
  return { status: 'ready', prompt, negativePrompt: negativePrompt(state, mode, facts), explicit: isAdultMode(mode), clashes }
}
