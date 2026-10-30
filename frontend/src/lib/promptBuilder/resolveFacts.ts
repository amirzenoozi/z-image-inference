import type { BuilderState, OutfitState } from './build'
import type { ChoiceField } from './choices'
import { INHERIT_SCENE, NOT_SET, REMOVE } from './constants'
import {
  CLOTHING_COLORS,
  EXPLICIT_PARTNER_ACTIONS,
  EXPLICIT_POSES,
  EXPLICIT_SOLO_ACTIONS,
  LIGHTING_EXPANSIONS,
  LINGERIE_BOTTOMS,
  LINGERIE_TOPS,
} from './data'
import { WHO_OPTIONS, type Nudity, type Who } from './extraData'
import { pronounFor, withArticle, type Facts, type Labelled, type Pronoun } from './facts'
import { isAdultMode, isSafeMode, showsStep, type BuilderMode } from './modes'
import { resolve } from './random'
import { anatomyShows, choicesFor, explicitDetailOptions, includesMan, includesWoman } from './rules'
import { picksOf, type MultiChoice } from './multiChoice'
import { settleChoices } from './settle'
import { ALL_ACCESSORIES, CONDITIONAL_CLOTHING, FITNESS_LIGHTING, FITNESS_SCENES, WORKOUTS, outfitOptions } from './fitness'

const EXPLICIT_ACTIONS: Readonly<Record<string, string>> = { ...EXPLICIT_SOLO_ACTIONS, ...EXPLICIT_PARTNER_ACTIONS }
const isSet = (value: string) => value !== NOT_SET
const NOTHING: Labelled = { label: '', text: '' }
const BAREFOOT = 'Barefoot'

type Choose = (field: ChoiceField, value: string) => string

/** The first pick resolved (Random settles to an option), then the further picks that still fit, without repeats. */
function chooseAll(state: BuilderState, mode: BuilderMode, choose: Choose, field: MultiChoice): string[] {
  const more = picksOf(state, field).slice(1).filter((value) => choicesFor(field, state, mode).includes(value))
  const first = choose(field, state[field])
  return isSet(first) ? [...new Set([first, ...more])] : []
}

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

function poseFacts(state: BuilderState, mode: BuilderMode, choose: Choose): Labelled & { explicit: boolean } {
  const chosen = choose('pose', state.pose)
  const label = choicesFor('pose', state, mode).includes(chosen) ? chosen : NOT_SET
  const text = EXPLICIT_POSES[label]
  return { label, text: text ?? WORKOUTS[label] ?? label, explicit: text !== undefined }
}

/** A pose or act kept from an earlier "Who", nudity level or mode that no longer fits is left out rather than contradicting it. */
function actionFacts(state: BuilderState, mode: BuilderMode, choose: Choose): Labelled {
  const label = choose('explicitAction', state.explicitAction)
  return choicesFor('explicitAction', state, mode).includes(label) ? { label, text: EXPLICIT_ACTIONS[label] } : NOTHING
}

/** The nudity level, kept within what the mode allows; null when the prompt has no adult content. */
function nudityFacts(state: BuilderState, mode: BuilderMode): Nudity | null {
  if (!isAdultMode(mode) || !showsStep(mode, 'intimacy')) return null
  const allowed = choicesFor('nudity', state, mode) as Nudity[]
  return allowed.includes(state.nudity) ? state.nudity : (allowed[0] ?? 'clothed')
}

type Wearer = Pick<BuilderState, 'who' | 'age'>

const OUTFIT_SLOTS = [
  { label: 'lingerie top', item: 'lingerieTop', color: 'lingerieTopColor', options: () => LINGERIE_TOPS },
  { label: 'lingerie bottom', item: 'lingerieBottom', color: 'lingerieBottomColor', options: () => LINGERIE_BOTTOMS },
  { label: 'top', item: 'top', color: 'topColor', options: (wearer: Wearer) => outfitOptions('top', wearer) },
  { label: 'bottom', item: 'bottom', color: 'bottomColor', options: (wearer: Wearer) => outfitOptions('bottom', wearer) },
  { label: 'outerwear', item: 'outerwear', color: 'outerwearColor', options: (wearer: Wearer) => outfitOptions('outerwear', wearer) },
  { label: 'shoes', item: 'shoes', color: 'shoesColor', options: (wearer: Wearer) => outfitOptions('shoes', wearer) },
] as const

type OutfitSlot = (typeof OUTFIT_SLOTS)[number]['item']

// The garments each nudity level leaves on; a prompt never describes clothes the nudity level has taken off
const WORN_WITH: Record<Nudity, ReadonlySet<OutfitSlot>> = {
  clothed: new Set(OUTFIT_SLOTS.map((slot) => slot.item)),
  implied: new Set(['shoes']),
  topless: new Set(['lingerieBottom', 'bottom', 'shoes']),
  nude: new Set(['shoes']),
}

const LINGERIE_SLOTS: ReadonlySet<OutfitSlot> = new Set(['lingerieTop', 'lingerieBottom'])

/** A fitness garment no longer offered (a spicy cut once "Who" or the age is cleared) is left out; anything else is kept. */
function wornItem(outfit: OutfitState, slot: (typeof OUTFIT_SLOTS)[number], wearer: Wearer, seed: number): string {
  const options: readonly string[] = slot.options(wearer)
  const item = resolve(outfit[slot.item], options, seed, slot.item)
  return CONDITIONAL_CLOTHING.has(item) && !options.includes(item) ? NOT_SET : item
}

function outfitFacts(state: BuilderState, nudity: Nudity | null, seed: number, safe: boolean): { clothing: string[]; removed: string[] } {
  const { outfit } = state
  const clothing: string[] = []
  const removed: string[] = []
  for (const slot of OUTFIT_SLOTS.filter((candidate) => !safe || !LINGERIE_SLOTS.has(candidate.item))) {
    const item = wornItem(outfit, slot, state, seed)
    const color = resolve(outfit[slot.color], CLOTHING_COLORS, seed, slot.color)
    const worn = nudity === null || WORN_WITH[nudity].has(slot.item)
    // Bare feet have no colour
    const coloured = isSet(color) && item !== BAREFOOT
    if (item === REMOVE) removed.push(slot.label)
    else if (isSet(item) && worn) clothing.push(coloured ? `${color} ${item.toLowerCase()}` : item.toLowerCase())
  }
  const accessories = outfit.accessories.map((item, index) => resolve(item, ALL_ACCESSORIES, seed, `accessory${index}`).toLowerCase())
  return { clothing: [...clothing, ...new Set(accessories.filter(isSet))], removed }
}

const PREPOSITIONS = ['in ', 'at ', 'on ', 'near ', 'by ', 'inside ', 'outside ', 'under ', 'above ', 'along ', 'within ']

function placeOf(environment: string, sceneType: string): string {
  const env = environment.trim()
  if (env) return PREPOSITIONS.some((p) => env.toLowerCase().startsWith(p)) ? env : `in ${env}`
  if (!isSet(sceneType)) return ''
  return FITNESS_SCENES[sceneType] ?? `in ${withArticle(sceneType)} setting`
}

function lightingOf(setup: string, sceneType: string): Labelled {
  if (setup !== INHERIT_SCENE) return { label: setup, text: LIGHTING_EXPANSIONS[setup] ?? FITNESS_LIGHTING[setup] ?? '' }
  return isSet(sceneType) ? { label: `${sceneType} lighting`, text: `the natural light of the ${sceneType} setting` } : NOTHING
}

/** "razor thin f/1.4" → "razor thin depth of field at f/1.4". */
function depthOfField(value: string): string {
  if (!isSet(value)) return ''
  const words = value.split(' ')
  return `${words.slice(0, -1).join(' ')} depth of field at ${words[words.length - 1]}`
}

/** A choice that no longer fits the subject or nudity (kept from earlier) is left out rather than contradicting them. */
function anatomyFacts(state: BuilderState, mode: BuilderMode) {
  const fitting = (field: 'penis' | 'nipples' | 'pubicHair') =>
    choicesFor(field, state, mode).includes(state[field]) && anatomyShows(field, state.nudity) ? state[field] : NOT_SET
  return { penis: fitting('penis'), nipples: fitting('nipples'), pubicHair: fitting('pubicHair') }
}

// Tops that leave a man's chest in view
const OPEN_TOPS = new Set(['Tank top', 'Mesh top', 'Fishnet top', 'Harness top', 'Deep V-neck top', 'Plunge neckline top'])

function chestShows(state: BuilderState, nudity: Nudity | null): boolean {
  if (nudity === 'topless' || nudity === 'nude') return true
  return state.outfit.top === REMOVE || OPEN_TOPS.has(state.outfit.top)
}

/** Choices that no longer fit who is in the scene or the purpose (kept from earlier) are left out. */
function buildFacts(state: BuilderState, mode: BuilderMode, nudity: Nudity | null) {
  const fitting = (field: 'muscles' | 'abs' | 'bodyHair' | 'chest' | 'bulge') => (choicesFor(field, state, mode).includes(state[field]) ? state[field] : NOT_SET)
  return {
    physique: { muscles: fitting('muscles'), abs: fitting('abs'), bodyHair: fitting('bodyHair') },
    male: { facialHair: facialHairOf(state, mode), chest: chestShows(state, nudity) ? fitting('chest') : NOT_SET, bulge: fitting('bulge') },
  }
}

function facialHairOf(state: BuilderState, mode: BuilderMode): string[] {
  const fits = (value: string) => choicesFor('facialHair', state, mode).includes(value)
  return fits(state.facialHair) ? chooseAll(state, mode, (_, value) => value, 'facialHair') : []
}

function personFacts(state: BuilderState, mode: BuilderMode, choose: Choose) {
  return {
    eyes: choose('eyeColor', state.eyeColor),
    expression: choose('expression', state.expression),
    makeup: chooseAll(state, mode, choose, 'makeup'),
    skinTone: choose('skinTone', state.skinTone),
    skinDetails: state.skinDetails,
    appearanceExtra: state.appearanceExtra.trim(),
    hair: { length: choose('hairLength', state.hairLength), color: choose('hairColor', state.hairColor), style: choose('hairstyle', state.hairstyle) },
    body: {
      type: choose('bodyType', state.bodyType),
      height: choose('height', state.height),
      bust: includesWoman(state.who) ? choose('bust', state.bust) : NOT_SET,
      hips: choose('hips', state.hips),
      marks: [...state.tattoos, ...state.piercings],
      extra: state.bodyExtra.trim(),
    },
  }
}

function settingFacts(state: BuilderState, mode: BuilderMode, choose: Choose) {
  const sceneType = choose('sceneType', state.sceneType)
  return {
    place: placeOf(state.environment, sceneType),
    sceneType,
    time: choose('timeOfDay', state.timeOfDay),
    weather: choose('weather', state.weather),
    extraDetails: state.extraDetails.trim(),
    lighting: chooseAll(state, mode, choose, 'lightingSetup').map((setup) => lightingOf(setup, sceneType)).filter((light) => light.text),
    lightingCustom: state.lightingCustom.trim(),
    photoStyle: choose('photoStyle', state.photoStyle),
    shot: choose('shotType', state.shotType),
    angle: choose('cameraAngle', state.cameraAngle),
    lens: choose('lens', state.lens),
    depthOfField: depthOfField(choose('depthOfField', state.depthOfField)),
    mood: state.mood.trim(),
    grading: choose('colorGrading', state.colorGrading),
    realism: state.realism,
  }
}

/** What a scene without people is of: the environment as written, or the scene type. */
function sceneSubject(state: BuilderState, sceneType: string): string {
  const env = state.environment.trim()
  const withoutPreposition = PREPOSITIONS.reduce((text, p) => (text.toLowerCase().startsWith(p) ? text.slice(p.length) : text), env)
  return withoutPreposition || withArticle(sceneType)
}

function subjectFacts(state: BuilderState, mode: BuilderMode, choose: Choose, sceneType: string) {
  if (!showsStep(mode, 'subject')) {
    return { who: null, age: '', ethnicity: '', subjectExtra: '', subject: sceneSubject(state, sceneType), sceneOnly: true }
  }
  const who = knownWho(state.who)
  const age = choose('age', state.age)
  const ethnicity = choose('ethnicity', state.ethnicity)
  const subjectExtra = state.subject.trim()
  const core = who ? describeWho(who, age, ethnicity, pronounFor(who)) : ''
  return { who, age, ethnicity, subjectExtra, subject: [core, subjectExtra].filter(Boolean).join(', '), sceneOnly: false }
}

function hiddenBody(facts: Facts): Partial<Facts> {
  return {
    body: { type: '', height: '', bust: '', hips: '', marks: [], extra: '' },
    anatomy: { penis: '', nipples: '', pubicHair: '' },
    physique: { muscles: '', abs: '', bodyHair: '' },
    // The beard belongs to the Face & hair step, so it stays
    male: { facialHair: facts.male.facialHair, chest: '', bulge: '' },
  }
}

/** A step the mode hides contributes nothing, so choices left from another mode never reach the prompt. */
function withoutHiddenSteps(facts: Facts, mode: BuilderMode): Facts {
  const show = (step: Parameters<typeof showsStep>[1]) => showsStep(mode, step)
  return {
    ...facts,
    ...(show('appearance') ? {} : { eyes: '', expression: '', makeup: [], skinTone: '', skinDetails: [], appearanceExtra: '', hair: { length: '', color: '', style: '' }, male: { ...facts.male, facialHair: [] } }),
    ...(show('body') ? {} : hiddenBody(facts)),
    ...(show('outfit') ? {} : { clothing: [], removed: [], outfitDetails: '' }),
    ...(show('intimacy') ? {} : { explicitDetails: [] }),
    ...(show('pose') ? {} : { pose: { ...NOTHING, explicit: false }, action: NOTHING, freeAction: '' }),
    ...(show('scene') ? {} : { place: '', time: '', weather: '', lighting: [], lightingCustom: '' }),
    ...(show('camera') ? {} : { photoStyle: '', shot: '', angle: '', lens: '', depthOfField: '' }),
    ...(show('finish') ? {} : { mood: '', grading: '', realism: [], extraDetails: '' }),
  }
}

export function resolveFacts(state: BuilderState, mode: BuilderMode): Facts {
  const seed = state.rollSeed
  // Random choices are settled first, in an order that keeps them from contradicting each other
  const settled = settleChoices(state, mode)
  const choose: Choose = (field, value) => resolve(value, choicesFor(field, settled, mode), seed, field)
  const setting = settingFacts(settled, mode, choose)
  const subject = subjectFacts(settled, mode, choose, setting.sceneType)
  const nudity = nudityFacts(settled, mode)
  const facts: Facts = {
    ...subject,
    pronoun: pronounFor(subject.who),
    hasWoman: subject.who !== null && includesWoman(subject.who),
    hasMan: subject.who !== null && includesMan(subject.who),
    pose: poseFacts(settled, mode, choose),
    action: actionFacts(settled, mode, choose),
    freeAction: state.action.trim(),
    nudity,
    intimacy: nudity === null ? [] : state.intimacy,
    explicitDetails: settled.explicitDetails.filter((detail) => explicitDetailOptions(settled, mode).includes(detail)),
    anatomy: anatomyFacts(settled, mode),
    ...buildFacts(settled, mode, nudity),
    ...personFacts(settled, mode, choose),
    ...outfitFacts(settled, nudity, seed, isSafeMode(mode)),
    outfitDetails: state.outfit.details.trim(),
    ...setting,
    // A scene without people names its place in the opening sentence, so the scene sentence leaves it out
    place: subject.sceneOnly ? '' : setting.place,
  }
  return withoutHiddenSteps(facts, mode)
}
