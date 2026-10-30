import type { BuilderState } from './build'
import { CHOICE_OPTIONS, type ChoiceField } from './choices'
import { EXPLICIT_PARTNER_ACTIONS, EXPLICIT_POSES, EXPLICIT_SOLO_ACTIONS, POSES } from './data'
import { workoutPoses } from './fitness'
import { EXPLICIT_DETAILS, type DetailNeeds, type Nudity } from './extraData'
import { allowsExplicitActs, isAdultMode, showsStep, type BuilderMode } from './modes'

const showsIntimacy = (mode: BuilderMode) => showsStep(mode, 'intimacy')

/** Bust options, and poses and actions about breasts or lingerie, only apply when the subject may include a woman. */
export function includesWoman(who: string): boolean {
  return !['man', 'two men'].includes(who)
}

export function includesMan(who: string): boolean {
  return ['man', 'couple', 'two men'].includes(who)
}

// Poses and solo actions about breasts, bras or panties
const WOMAN_ONLY = new Set([
  'chest pressed together arms', 'topless covering with hands', 'topless hair covering',
  'cupping breasts', 'squeezing breasts together', 'pulling panties aside', 'stepping out of panties', 'undoing bra clasp', 'pulling down strap',
])

const fitsWho = (who: string) => (option: string) => includesWoman(who) || !WOMAN_ONLY.has(option)

export function poseOptions(explicit: boolean, state: Pick<BuilderState, 'who' | 'age'>): string[] {
  const everyday = [...POSES, ...workoutPoses(state)]
  return explicit ? [...everyday, ...Object.keys(EXPLICIT_POSES).filter(fitsWho(state.who))] : everyday
}

// Actions about clothes still being on, and the nudity levels that leave those clothes on
const CLOTHING_ACTIONS: Readonly<Record<string, readonly Nudity[]>> = {
  'peeling off shirt': ['clothed'],
  'pulling down strap': ['clothed'],
  'undoing bra clasp': ['clothed'],
  'playing with waistband': ['clothed', 'topless'],
  'pulling panties aside': ['clothed', 'topless'],
  'stepping out of panties': ['clothed', 'topless'],
  'slowly undressing': ['clothed', 'topless'],
  'undressing each other': ['clothed', 'topless'],
}

const fitsNudity = (nudity: Nudity) => (action: string) => CLOTHING_ACTIONS[action]?.includes(nudity) ?? true

export function soloActions(who: string, nudity: Nudity): string[] {
  return Object.keys(EXPLICIT_SOLO_ACTIONS).filter(fitsWho(who)).filter(fitsNudity(nudity))
}

/** Partner actions are written for a woman with a man, so they are only offered for a couple. */
export function partnerActions(who: string, nudity: Nudity): string[] {
  return who === 'couple' ? Object.keys(EXPLICIT_PARTNER_ACTIONS).filter(fitsNudity(nudity)) : []
}

/** A field's options under the mode's content level, and only those that fit the subject. */
const SUGGESTIVE_NUDITY: readonly Nudity[] = ['clothed', 'implied', 'topless']

function nudityOptions(mode: BuilderMode): string[] {
  if (!isAdultMode(mode)) return ['clothed']
  return mode.content === 'suggestive' ? [...SUGGESTIVE_NUDITY] : [...CHOICE_OPTIONS.nudity]
}

function fittingOptions(field: ChoiceField, state: BuilderState, mode: BuilderMode): string[] {
  const explicit = allowsExplicitActs(mode)
  if (field === 'pose') return poseOptions(explicit, state)
  if (field === 'explicitAction') return explicit ? [...soloActions(state.who, state.nudity), ...partnerActions(state.who, state.nudity)] : []
  if (field === 'nudity') return nudityOptions(mode)
  return bodyOptions(field, state, mode) ?? maleOptions(field, state, mode) ?? [...CHOICE_OPTIONS[field]]
}

/**
 * The anatomy options, by who is in the scene and the purpose; undefined for the fields they don't cover. They are
 * offered whatever the nudity, which is chosen in a later step; the prompt only includes them when they show (anatomyShows).
 */
function bodyOptions(field: ChoiceField, state: BuilderState, mode: BuilderMode): string[] | undefined {
  const explicit = allowsExplicitActs(mode)
  if (field === 'bust') return includesWoman(state.who) ? [...CHOICE_OPTIONS.bust] : []
  if (field === 'penis') return explicit && includesMan(state.who) ? [...CHOICE_OPTIONS.penis] : []
  if (field === 'pubicHair') return explicit ? [...CHOICE_OPTIONS.pubicHair] : []
  if (field === 'nipples') return isAdultMode(mode) && includesWoman(state.who) ? [...CHOICE_OPTIONS.nipples] : []
  return undefined
}

const BARE_CHEST: readonly Nudity[] = ['topless', 'nude']
const CLOTHED_BELOW: readonly Nudity[] = ['clothed', 'topless']

/** The options that depend on a man in the scene or an 18+ purpose; undefined for the fields they don't cover. */
function maleOptions(field: ChoiceField, state: BuilderState, mode: BuilderMode): string[] | undefined {
  const man = includesMan(state.who)
  if (field === 'facialHair' || field === 'chest') return man ? [...CHOICE_OPTIONS[field]] : []
  if (field === 'bodyHair') return isAdultMode(mode) ? [...CHOICE_OPTIONS.bodyHair] : []
  if (field === 'bulge') return isAdultMode(mode) && man && CLOTHED_BELOW.includes(state.nudity) ? [...CHOICE_OPTIONS.bulge] : []
  return undefined
}

/** Whether an anatomy choice would be seen at this nudity level, and so goes into the prompt. */
export function anatomyShows(field: 'penis' | 'nipples' | 'pubicHair', nudity: Nudity): boolean {
  return field === 'nipples' ? BARE_CHEST.includes(nudity) : nudity === 'nude'
}

function meetsNeeds(needs: DetailNeeds, state: BuilderState): boolean {
  const checks = [
    !needs.man || includesMan(state.who),
    !needs.woman || includesWoman(state.who),
    !needs.couple || state.who === 'couple',
    !needs.nude || state.nudity === 'nude',
  ]
  return checks.every(Boolean)
}

/** The explicit details that fit the subject and nudity now: none outside the Explicit purpose. */
export function explicitDetailOptions(state: BuilderState, mode: BuilderMode): string[] {
  if (!allowsExplicitActs(mode) || !showsIntimacy(mode)) return []
  return Object.entries(EXPLICIT_DETAILS).filter(([, detail]) => meetsNeeds(detail.needs, state)).map(([value]) => value)
}

/**
 * The options a field offers now: those that fit the subject and content rules, narrowed by the mode. The steps
 * and the "Random" picks both use this, so a random pick is always one the field could offer.
 */
export function choicesFor(field: ChoiceField, state: BuilderState, mode: BuilderMode): string[] {
  const narrowed = mode.options[field]
  const fitting = fittingOptions(field, state, mode)
  return narrowed ? fitting.filter((option) => narrowed.includes(option)) : fitting
}
