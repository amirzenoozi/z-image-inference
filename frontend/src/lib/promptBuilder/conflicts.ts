// Choices that contradict each other: two hand positions give a third hand, a standing pose with a lying act gives
// a twisted body. Each option is tagged once with what it uses; the rules below find the clashes. Random picks avoid
// them (fitsChoice); clashes in choices the user made are shown as warnings (clashesIn), not blocked.
import type { BuilderState } from './build'
import { NOT_SET, RANDOM, REMOVE } from './constants'

type Position = 'standing' | 'sitting' | 'kneeling' | 'allFours' | 'lying' | 'squatting' | 'onTop' | 'carried'

interface Body {
  hands?: number
  /** The body positions it can be done in; poses have one, acts may allow several. */
  positions?: readonly Position[]
  /** It uses the mouth, so a smile or another act with the mouth can't happen at once. */
  mouth?: true
  /** The face is turned away from the camera. */
  away?: true
  /** It is about the legs or lower body, which a close shot can't show. */
  legs?: true
}

const standing = { positions: ['standing'] } as const
const sitting = { positions: ['sitting'] } as const
const kneeling = { positions: ['kneeling'] } as const
const allFours = { positions: ['allFours'] } as const
const lying = { positions: ['lying'] } as const
const onTop = { positions: ['onTop', 'sitting'] } as const

const POSES: Readonly<Record<string, Body>> = {
  standing, 'standing hand on hip': { ...standing, hands: 1 }, 'standing both hands on hips': { ...standing, hands: 2 },
  'standing arms crossed': { ...standing, hands: 2 }, 'standing hands in pockets': { ...standing, hands: 2 },
  'standing contrapposto': standing, 'standing one leg bent': { ...standing, legs: true }, walking: standing, 'walking mid-step turn': standing,
  sitting, 'sitting cross-legged': { ...sitting, legs: true }, 'sitting one knee up': { ...sitting, legs: true }, 'sitting on edge': sitting,
  'sitting couch lounge': sitting, 'sitting on floor': sitting, 'sitting on stairs': sitting,
  'leaning against wall': standing, 'leaning on railing': { ...standing, hands: 1 }, 'leaning in doorway': standing, 'leaning on table': { ...standing, hands: 1 },
  crouching: { positions: ['squatting'] }, squatting: { positions: ['squatting'] }, kneeling,
  'reclining on sofa': lying, 'lying on side': lying, 'lying on back': lying, 'lying on stomach elbows up': lying,
  'back to camera': { away: true }, 'hair flip': { hands: 1 }, 'touching hair': { hands: 1 }, 'tucking hair behind ear': { hands: 1 },
  'hand on chest': { hands: 1 }, 'chin on hand': { hands: 1 }, 'fingers near lips': { hands: 1, mouth: true },
  'adjusting collar': { hands: 1 }, 'adjusting jacket': { hands: 2 }, 'mirror selfie pose': { hands: 1 }, 'holding phone': { hands: 1 },
  texting: { hands: 2 }, 'holding coffee': { hands: 1 }, 'peace sign': { hands: 1 }, 'laughing candid': { mouth: true },
  twirl: standing, 'dance step': standing, 'small jump': standing, 'stretch overhead': { ...standing, hands: 2 }, 'yoga warrior pose': { ...standing, hands: 2, legs: true },
  'arched back on all fours': { ...allFours, hands: 2 }, 'ass up face down': { ...allFours, away: true, legs: true }, 'back arched standing': standing,
  'bent over': { ...standing, legs: true }, 'bent over looking back': { ...standing, legs: true }, 'chest pressed together arms': { hands: 2 },
  'hands and knees': { ...allFours, hands: 2 }, 'kneeling legs apart': { ...kneeling, legs: true }, 'kneeling looking up': kneeling,
  'legs open seated': { ...sitting, legs: true }, 'legs spread lying back': { ...lying, legs: true }, 'legs up lying back': { ...lying, legs: true },
  'lying face down hips raised': { ...lying, away: true, legs: true }, 'lying on back knees bent': { ...lying, legs: true },
  'lying on side leg raised': { ...lying, legs: true }, 'on elbows and knees': { ...allFours, hands: 2 }, 'on knees back arched': kneeling,
  'on knees hands on thighs': { ...kneeling, hands: 2 }, 'one leg up against wall': { ...standing, legs: true },
  'presenting from behind': { positions: ['allFours', 'standing'], away: true, legs: true }, 'reclining legs parted': { ...lying, legs: true },
  'riding position': onTop, 'sitting legs open': { ...sitting, legs: true }, 'sitting spread eagle': { ...sitting, legs: true },
  'squatting legs apart': { positions: ['squatting'], legs: true }, 'standing bent at waist': { ...standing, legs: true },
  'standing legs apart': { ...standing, legs: true }, straddling: onTop, 'stretching on bed': { ...lying, hands: 2 },
  'topless covering with hands': { hands: 2 },
  // Workouts (fitness.ts)
  'barbell back squat': { positions: ['squatting'], hands: 2, legs: true }, deadlift: { ...standing, hands: 2, legs: true },
  'bench press': { ...lying, hands: 2 }, 'overhead press': { ...standing, hands: 2 }, 'dumbbell curl': { ...standing, hands: 1 },
  'pull-up': { ...standing, hands: 2 }, 'push-up': { ...allFours, hands: 2 }, plank: { ...allFours, hands: 2 }, 'walking lunges': { ...standing, legs: true },
  'kettlebell swing': { ...standing, hands: 2, legs: true }, 'battle ropes': { ...standing, hands: 2 }, 'cable row': { ...sitting, hands: 2 },
  'treadmill run': { ...standing, legs: true }, 'spin bike': { ...sitting, hands: 2, legs: true }, 'rowing machine': { ...sitting, hands: 2, legs: true },
  'resting on a bench': sitting, 'flexing in the gym mirror': { ...standing, hands: 2 },
  'downward dog': { ...allFours, hands: 2, legs: true }, 'tree pose': { ...standing, hands: 2, legs: true }, 'warrior I': { ...standing, hands: 2, legs: true },
  'warrior II': { ...standing, hands: 2, legs: true }, 'triangle pose': { ...standing, hands: 2, legs: true }, "child's pose": { ...kneeling, hands: 2, away: true },
  'cobra pose': { ...lying, hands: 2 }, 'crow pose': { positions: ['squatting'], hands: 2 }, 'bridge pose': { ...lying, legs: true },
  'lotus meditation': { ...sitting, hands: 2, legs: true }, headstand: { ...allFours, hands: 2, legs: true }, 'pigeon pose': { ...sitting, legs: true },
  'pilates reformer': { ...lying, legs: true }, 'side plank': { ...lying, hands: 1 }, 'hamstring stretch': { ...sitting, hands: 2, legs: true },
  'quad stretch': { ...standing, hands: 1, legs: true }, 'foam rolling': { ...lying, legs: true },
  'boxing pads': { ...standing, hands: 2 }, 'jump rope': { ...standing, hands: 2, legs: true }, 'sprint start': { positions: ['squatting'], hands: 2, legs: true },
  'post-run stretch': { ...standing, hands: 1, legs: true },
  'glute bridge, back arched': { ...lying, legs: true }, 'squat seen from behind': { positions: ['squatting'], hands: 2, away: true, legs: true },
  'bending for a dumbbell': { ...standing, hands: 1, legs: true }, 'arched back stretch on the mat': { ...allFours, hands: 2 },
  'cable machine, looking back': { ...standing, hands: 1 }, 'flirty gym mirror selfie': { ...standing, hands: 1 },
}

const ACTIONS: Readonly<Record<string, Body>> = {
  'biting finger': { hands: 1, mouth: true }, 'biting lip': { mouth: true }, 'caressing inner thigh': { hands: 1, legs: true },
  'cupping breasts': { hands: 2 }, 'dripping wet from shower': standing, 'finger in mouth': { hands: 1, mouth: true },
  'grabbing bedsheets': { hands: 2, positions: ['lying', 'allFours', 'kneeling'] }, 'grinding on pillow': { positions: ['onTop', 'sitting', 'lying'] },
  'hands between legs': { hands: 2, legs: true }, 'holding vibrator': { hands: 1 }, 'licking finger': { hands: 1, mouth: true },
  'licking lollipop': { hands: 1, mouth: true }, 'moaning expression': { mouth: true }, 'peeling off shirt': { hands: 2 },
  'playing with waistband': { hands: 1 }, 'pulling down strap': { hands: 1 }, 'pulling hair back': { hands: 1 }, 'pulling panties aside': { hands: 1, legs: true },
  'rubbing lotion on legs': { hands: 2, legs: true, positions: ['sitting', 'standing'] }, 'running hands through hair': { hands: 2 },
  'sliding hand down body': { hands: 1 }, 'slowly undressing': { hands: 2 }, 'smearing lipstick': { hands: 1, mouth: true },
  'spreading legs slowly': { legs: true, positions: ['sitting', 'lying'] }, 'squeezing breasts together': { hands: 2 },
  'stepping out of panties': { hands: 2, legs: true, positions: ['standing'] }, 'sucking finger': { hands: 1, mouth: true },
  'touching neck sensually': { hands: 1 }, 'undoing bra clasp': { hands: 2 },
  'being carried against wall': { positions: ['carried'], hands: 2 }, 'being fingered': { legs: true }, 'being held down on bed': lying,
  'being pinned against wall': standing, 'bent over receiving from behind': { ...standing, legs: true },
  'blowjob on knees': { ...kneeling, hands: 1, mouth: true }, 'cowgirl riding': onTop, 'deep throat': { positions: ['kneeling', 'lying'], mouth: true },
  'doggy style': { positions: ['allFours', 'standing'], legs: true }, 'face sitting on him': onTop, 'giving handjob': { hands: 1, positions: ['kneeling', 'sitting', 'lying'] },
  'grabbed by hair from behind': { positions: ['allFours', 'standing'] }, 'grinding on his lap': onTop,
  'hands tied while being taken': { ...lying, hands: 2 }, 'him holding her legs up missionary': { ...lying, legs: true },
  'him pulling her hair during doggy': { positions: ['allFours', 'standing'], legs: true }, 'kissing passionately': { mouth: true },
  'legs over his shoulders': { ...lying, legs: true }, 'legs wrapped around him standing': { positions: ['carried'], legs: true },
  'lying back receiving oral': { ...lying, legs: true }, missionary: lying, 'on top reverse cowgirl': { ...onTop, away: true },
  'pressed against glass': { ...standing, hands: 2 }, 'prone bone': { ...lying, away: true }, 'receiving facial': { ...kneeling, mouth: true },
  'reverse cowgirl': { ...onTop, away: true }, 'side by side spooning': lying, 'sitting on his face': onTop,
  'spread eagle for him': { ...lying, legs: true }, 'standing carry position': { positions: ['carried'] },
  'straddling his lap face to face': onTop, 'sucking while looking up': { ...kneeling, hands: 1, mouth: true }, 'undressing each other': { ...standing, hands: 2 },
}

const CUES: Readonly<Record<string, Body>> = { 'hand trailing over the body': { hands: 1 }, 'bitten lower lip': { mouth: true } }

// Explicit details that use the mouth or show the lower body
const DETAILS: Readonly<Record<string, Body>> = {
  'cum in mouth': { mouth: true }, 'cum dripping from mouth': { mouth: true }, 'drool and saliva strands': { mouth: true },
  creampie: { legs: true }, 'cum on thighs': { legs: true }, 'cum on ass': { legs: true }, squirting: { legs: true }, 'wet pussy': { legs: true },
  'dripping wet': { legs: true }, 'erect penis': { legs: true }, precum: { legs: true }, 'red handprint on ass': { legs: true },
}

/** Expressions that shape the mouth, which an act with the mouth replaces. */
const MOUTH_EXPRESSIONS = new Set(['soft smile', 'wide laughing smile', 'playful smirk', 'parted lips', 'pouting lips'])
/** Expressions that can be read on a face turned away. */
const AWAY_EXPRESSIONS = new Set(['neutral expression', 'shy glance over the shoulder'])

const SELFIE = new Set(['mirror selfie', 'selfie arm-length', 'mirror selfie angle', 'overhead selfie angle'])
/** A pose that already holds the phone, so a selfie needs no extra hand. */
const PHONE_POSES = new Set(['mirror selfie pose', 'holding phone', 'texting'])
const FACE_SHOTS = new Set(['extreme close-up', 'close-up face', 'headshot'])
/** Shots that can't show the legs. */
const UPPER_SHOTS = new Set([...FACE_SHOTS, 'upper body portrait', 'chest-up portrait'])

const LENGTHS = ['buzzed', 'short', 'chin-length', 'shoulder-length', 'long', 'very long']
const at = (length: string) => LENGTHS.indexOf(length)
const fromChin = [at('chin-length'), Infinity] as const
const fromShoulder = [at('shoulder-length'), Infinity] as const
/** The shortest and longest hair each style can be done with. */
const STYLE_LENGTHS: Readonly<Record<string, readonly [number, number]>> = {
  'buzz cut': [at('buzzed'), at('short')], 'pixie cut': [at('short'), at('short')], 'blunt bob': [at('short'), at('chin-length')],
  'textured bob': [at('short'), at('chin-length')], 'long straight': [at('long'), Infinity], 'slicked back': [at('short'), Infinity],
  'wet look': [at('short'), Infinity], 'side part': [at('short'), Infinity], 'side swept': [at('short'), Infinity], cornrows: [at('short'), Infinity],
  'tight curls': [at('short'), Infinity], 'curtain bangs': fromChin, layered: fromChin, shag: fromChin, 'wolf cut': fromChin,
  'middle part straight': fromChin, 'loose curls': fromChin, 'beach waves': fromChin, 'hollywood waves': fromChin, 'messy waves': fromChin,
  'box braids': fromShoulder, 'braided crown': fromShoulder, 'braided ponytail': fromShoulder, 'dutch braids': fromShoulder,
  'fishtail braid': fromShoulder, 'french braid': fromShoulder, bun: fromShoulder, 'double buns': fromShoulder, 'low bun': fromShoulder,
  'messy bun': fromShoulder, 'space buns': fromShoulder, 'top knot': fromShoulder, 'high ponytail': fromShoulder,
  'low ponytail': fromShoulder, 'half up half down': fromShoulder,
}

type Daylight = 'day' | 'golden' | 'twilight' | 'night'
const TIME_LIGHT: Readonly<Record<string, Daylight>> = {
  dawn: 'twilight', sunrise: 'golden', morning: 'day', midday: 'day', afternoon: 'day', 'golden hour': 'golden',
  sunset: 'golden', dusk: 'twilight', 'blue hour': 'twilight', night: 'night', midnight: 'night',
}
/** Lighting and photo styles that only happen in some daylight. */
const NEEDS_LIGHT: Readonly<Record<string, readonly Daylight[]>> = {
  'golden hour': ['golden'], 'blue hour': ['twilight'], 'harsh midday sun': ['day'], 'backlit sun flare': ['day', 'golden'],
  'overcast soft': ['day'], 'natural window light': ['day', 'golden', 'twilight'], 'golden hour aesthetic': ['golden'], 'neon night': ['night', 'twilight'],
  'golden hour track light': ['golden'], 'soft studio daylight': ['day', 'golden'],
}

const INDOOR = new Set([
  'bedroom', 'bathroom', 'living room', 'kitchen', 'hotel room', 'cafe', 'bar/club', 'gym', 'studio', 'stairwell', 'hallway/corridor',
  'yoga studio', 'pilates studio', 'home gym', 'boxing gym', 'crossfit box',
])
/** Weather that would be in the picture, so it can't happen indoors. */
const OUTDOOR_WEATHER = new Set(['light rain', 'heavy rain', 'falling snow', 'fog', 'heat haze', 'stormy sky'])

/** Accessories worn in the same place, of which only one fits. */
const SAME_PLACE = [['Baseball cap', 'Beanie'], ['Eyeglasses', 'Sunglasses'], ['Backpack', 'Clutch bag', 'Handbag', 'Tote bag'], ['Bow tie', 'Necktie'], ['Choker', 'Leather choker', 'Spiked choker'], ['Belt', 'Chain belt', 'Lifting belt'], ['Watch', 'Fitness tracker']]
const HELD_ACCESSORIES = new Set(['Clutch bag', 'Water bottle'])

export type ClashKind = 'hands' | 'position' | 'mouth' | 'facing' | 'framing' | 'hair' | 'light' | 'weather' | 'accessories' | 'build'

/** Two or more choices that contradict each other, named by their values (option labels show them). */
export interface Clash {
  kind: ClashKind
  values: string[]
}

/** The choices a clash can involve, already settled: a value still Random or not set takes part in nothing. */
type Choices = Pick<BuilderState, 'pose' | 'explicitAction' | 'expression' | 'intimacy' | 'explicitDetails' | 'photoStyle' | 'shotType' | 'cameraAngle' | 'hairLength' | 'hairstyle' | 'sceneType' | 'timeOfDay' | 'weather' | 'lightingSetup' | 'lightingMore' | 'bodyType' | 'muscles' | 'abs' | 'chest' | 'bodyHair'> & {
  accessories: readonly string[]
}

const chosen = (value: string) => ![NOT_SET, RANDOM, REMOVE].includes(value)

function selfieIn(choices: Choices): string | null {
  return [choices.photoStyle, choices.shotType, choices.cameraAngle].find((value) => SELFIE.has(value)) ?? null
}

function bodyParts(choices: Choices): [string, Body][] {
  const parts: [string, Body | undefined][] = [
    [choices.pose, POSES[choices.pose]],
    [choices.explicitAction, ACTIONS[choices.explicitAction]],
    ...choices.intimacy.map((cue): [string, Body | undefined] => [cue, CUES[cue]]),
    ...choices.explicitDetails.map((detail): [string, Body | undefined] => [detail, DETAILS[detail]]),
  ]
  return parts.filter((part): part is [string, Body] => part[1] !== undefined)
}

function handsClash(choices: Choices): Clash[] {
  const users = bodyParts(choices).filter(([, body]) => (body.hands ?? 0) > 0)
  let hands = users.reduce((total, [, body]) => total + (body.hands ?? 0), 0)
  const selfie = selfieIn(choices)
  const held = choices.accessories.filter((item) => HELD_ACCESSORIES.has(item))
  const extra = [...(selfie && !PHONE_POSES.has(choices.pose) ? [selfie] : []), ...held]
  hands += extra.length
  return hands > 2 ? [{ kind: 'hands', values: [...users.map(([value]) => value), ...extra] }] : []
}

function positionClash(choices: Choices): Clash[] {
  const pose = POSES[choices.pose]?.positions
  const act = ACTIONS[choices.explicitAction]?.positions
  if (!pose || !act || act.some((position) => pose.includes(position))) return []
  return [{ kind: 'position', values: [choices.pose, choices.explicitAction] }]
}

function mouthClash(choices: Choices): Clash[] {
  const users = [
    ...bodyParts(choices).filter(([, body]) => body.mouth).map(([value]) => value),
    ...(MOUTH_EXPRESSIONS.has(choices.expression) ? [choices.expression] : []),
  ]
  return users.length > 1 ? [{ kind: 'mouth', values: users }] : []
}

function facingClash(choices: Choices): Clash[] {
  const away = [...bodyParts(choices).filter(([, body]) => body.away).map(([value]) => value), ...(choices.shotType === 'from-behind candid' ? [choices.shotType] : [])]
  const face = [
    ...(FACE_SHOTS.has(choices.shotType) ? [choices.shotType] : []),
    ...(selfieIn(choices) ? [selfieIn(choices) as string] : []),
    ...(chosen(choices.expression) && !AWAY_EXPRESSIONS.has(choices.expression) ? [choices.expression] : []),
  ]
  return away.length && face.length ? [{ kind: 'facing', values: [away[0], face[0]] }] : []
}

function framingClash(choices: Choices): Clash[] {
  if (!UPPER_SHOTS.has(choices.shotType)) return []
  const legs = bodyParts(choices).find(([, body]) => body.legs)
  return legs ? [{ kind: 'framing', values: [choices.shotType, legs[0]] }] : []
}

function hairClash(choices: Choices): Clash[] {
  const range = STYLE_LENGTHS[choices.hairstyle]
  const length = at(choices.hairLength)
  if (!range || length < 0 || (length >= range[0] && length <= range[1])) return []
  return [{ kind: 'hair', values: [choices.hairstyle, choices.hairLength] }]
}

function lightClash(choices: Choices): Clash[] {
  const daylight = TIME_LIGHT[choices.timeOfDay]
  if (!daylight) return []
  const wrong = [choices.lightingSetup, ...choices.lightingMore, choices.photoStyle].find((value) => NEEDS_LIGHT[value] && !NEEDS_LIGHT[value].includes(daylight))
  return wrong ? [{ kind: 'light', values: [wrong, choices.timeOfDay] }] : []
}

function weatherClash(choices: Choices): Clash[] {
  return INDOOR.has(choices.sceneType) && OUTDOOR_WEATHER.has(choices.weather) ? [{ kind: 'weather', values: [choices.weather, choices.sceneType] }] : []
}

function accessoryClash(choices: Choices): Clash[] {
  return SAME_PLACE.flatMap((group) => {
    const worn = [...new Set(choices.accessories.filter((item) => group.includes(item)))]
    return worn.length > 1 ? [{ kind: 'accessories' as const, values: worn }] : []
  })
}

const BIG_MUSCLES = ['very muscular', 'huge bodybuilder']
const SHOWN_ABS = ['defined abs', 'six-pack', 'eight-pack']
const SOFT_BODIES = ['plus-size figure', 'voluptuous figure']
const CHEST_HAIR: Readonly<Record<string, string>> = { 'smooth chest': 'hairy', 'hairy chest': 'smooth', 'light chest hair': 'smooth' }

function buildClash(choices: Choices): Clash[] {
  const pairs: [string, string][] = [
    [choices.muscles, choices.bodyType], [choices.abs, choices.bodyType], [choices.chest, choices.bodyHair],
  ]
  const clashing = [
    BIG_MUSCLES.includes(choices.muscles) && choices.bodyType === 'slim build',
    SHOWN_ABS.includes(choices.abs) && SOFT_BODIES.includes(choices.bodyType),
    CHEST_HAIR[choices.chest] === choices.bodyHair,
  ]
  return pairs.filter((_, index) => clashing[index]).map((values) => ({ kind: 'build' as const, values }))
}

const RULES = [handsClash, positionClash, mouthClash, facingClash, framingClash, hairClash, lightClash, weatherClash, accessoryClash, buildClash]

function choicesOf(state: BuilderState): Choices {
  return { ...state, accessories: state.outfit.accessories.filter(chosen), intimacy: state.intimacy.filter(chosen) }
}

/** Every clash among the choices made so far; Random and unset choices take part in none. */
export function clashesIn(state: BuilderState): Clash[] {
  return RULES.flatMap((rule) => rule(choicesOf(state)))
}

/** Whether giving `field` this value would add a clash with the choices already settled, for picking at random. */
export function fitsChoice(state: BuilderState, patch: Partial<BuilderState>, value: string): boolean {
  return !clashesIn({ ...state, ...patch }).some((clash) => clash.values.includes(value))
}
