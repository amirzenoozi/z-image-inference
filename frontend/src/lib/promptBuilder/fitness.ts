// Gym, yoga and workout options for the Fitness purpose (and any other that shows these steps). Each workout and place
// carries a full description, so the paragraph says what the body is doing, not just its name. "Spicy" options stay
// clothed, flattering through cut and pose, and are offered only once "Who" and an adult age are chosen.
import type { BuilderState } from './build'
import { NOT_SET, RANDOM } from './constants'
import { ACCESSORIES, BOTTOMS, OUTERWEAR, SHOES, TOPS } from './data'
import { includesMan, includesWoman } from './rules'

export const GYM_WORKOUTS: Readonly<Record<string, string>> = {
  'barbell back squat': 'performing a barbell back squat, the bar resting across the upper back, thighs parallel to the floor, core braced',
  deadlift: 'lifting a heavy barbell in a deadlift, back flat, hips driving forward, grip tight on the bar',
  'bench press': 'lying on a bench pressing a barbell up from the chest, feet planted, arms extending',
  'overhead press': 'pressing a barbell overhead, arms locked out, core tight',
  'dumbbell curl': 'curling a dumbbell, biceps flexed, elbow tucked at the side',
  'pull-up': 'hanging from a pull-up bar, chin above the bar, back and arms engaged',
  'push-up': 'in a push-up, body in a straight line from head to heels, arms bent',
  plank: 'holding a forearm plank, body straight and steady, core engaged',
  'walking lunges': 'stepping into a deep lunge, back knee close to the floor, torso upright',
  'kettlebell swing': 'swinging a kettlebell up to chest height, hips snapping forward',
  'battle ropes': 'whipping heavy battle ropes in waves, knees bent, arms working hard',
  'cable row': 'seated at a cable row, pulling the handle to the stomach, shoulders drawn back',
  'treadmill run': 'running on a treadmill mid-stride, arms pumping',
  'spin bike': 'riding a spin bike out of the saddle, leaning over the handlebars',
  'rowing machine': 'pulling on a rowing machine, legs extended, handle drawn to the chest',
  'resting on a bench': 'sitting on a weight bench catching a breath, a towel around the neck',
  'flexing in the gym mirror': 'flexing both arms in front of the gym mirror, proud of the pump',
}

export const YOGA_POSES: Readonly<Record<string, string>> = {
  'downward dog': 'in downward-facing dog on a yoga mat, hips high, heels reaching towards the floor',
  'tree pose': 'balancing in tree pose, one foot pressed against the inner thigh, palms together above the head',
  'warrior I': 'in warrior I, front knee bent, back leg straight, arms reaching overhead',
  'warrior II': 'in warrior II, legs wide, front knee bent, arms stretched out level with the shoulders',
  'triangle pose': 'in triangle pose, legs wide, one hand reaching to the floor and the other to the sky',
  "child's pose": "resting in child's pose, forehead on the mat, arms stretched forward",
  'cobra pose': 'in cobra pose, lying on the stomach with the chest lifted and arms straight',
  'crow pose': 'balancing in crow pose, knees resting on the upper arms, feet lifted off the mat',
  'bridge pose': 'in bridge pose, lying on the back with the hips lifted high, feet planted',
  'lotus meditation': 'sitting in lotus position, eyes closed, hands resting on the knees in meditation',
  headstand: 'in a supported headstand, legs straight up, perfectly balanced',
  'pigeon pose': 'in pigeon pose, one leg folded in front and the other stretched long behind',
}

export const PILATES_STRETCHES: Readonly<Record<string, string>> = {
  'pilates reformer': 'working out on a Pilates reformer, legs extended, the carriage sliding back',
  'side plank': 'holding a side plank, body in one long line, top arm reaching up',
  'hamstring stretch': 'sitting on the floor reaching for the toes in a hamstring stretch',
  'quad stretch': 'standing on one leg, pulling the other heel up behind in a quad stretch',
  'foam rolling': 'rolling out the legs on a foam roller on the floor',
}

export const CARDIO_BOXING: Readonly<Record<string, string>> = {
  'boxing pads': 'throwing a punch into boxing pads, gloves on, fierce focus',
  'jump rope': 'skipping rope mid-jump, the rope a blur of motion',
  'sprint start': 'in a crouched sprint start on the track, fingertips on the line',
  'post-run stretch': 'stretching after a run, one hand against a wall for balance',
}

/** Flattering poses that stay clothed; offered only for a chosen adult. */
export const SPICY_POSES: Readonly<Record<string, string>> = {
  'glute bridge, back arched': 'in a glute bridge with the back arched and the hips pushed high, leggings tight on the body',
  'squat seen from behind': 'squatting deep with a barbell, seen from behind, leggings hugging every curve',
  'bending for a dumbbell': 'bending at the hips to pick up a dumbbell from the floor, back arched',
  'arched back stretch on the mat': 'stretching on all fours on the mat with the back deeply arched',
  'cable machine, looking back': 'leaning on the cable machine, looking back over the shoulder with a confident smile',
  'flirty gym mirror selfie': 'taking a flirty mirror selfie in the gym, one hip popped, a confident expression',
}

export const WORKOUTS: Readonly<Record<string, string>> = { ...GYM_WORKOUTS, ...YOGA_POSES, ...PILATES_STRETCHES, ...CARDIO_BOXING, ...SPICY_POSES }

/** Who an item is for and whether it is a spicy one; anything not listed suits anyone. */
interface Fit {
  only?: 'woman' | 'man'
  spicy?: true
}

const FITNESS_TOPS: Readonly<Record<string, Fit>> = {
  'Sports bra': { only: 'woman' }, 'Compression top': {}, 'Muscle tee': {}, 'Stringer tank': { only: 'man' }, 'Yoga bodysuit': { only: 'woman' },
  'Low-cut sports bra': { only: 'woman', spicy: true }, 'Strappy open-back sports bra': { only: 'woman', spicy: true },
  'Cropped compression top': { spicy: true }, 'Low-back yoga bodysuit': { only: 'woman', spicy: true }, 'Deep-cut stringer vest': { only: 'man', spicy: true },
}
const FITNESS_BOTTOMS: Readonly<Record<string, Fit>> = {
  'Athletic shorts': {}, 'Running shorts': {}, 'Compression tights': {},
  'High-cut gym briefs': { only: 'woman', spicy: true }, 'Micro running shorts': { spicy: true }, 'Scrunch-butt leggings': { only: 'woman', spicy: true },
  'Fitted compression shorts': { only: 'man', spicy: true },
}
const FITNESS_SHOES: Readonly<Record<string, Fit>> = { 'Training shoes': {}, 'Running shoes': {}, 'Grip socks': {} }

const FITNESS_OUTERWEAR: readonly string[] = ['Track jacket']
const FITNESS_ACCESSORIES: readonly string[] = ['Lifting belt', 'Wrist wraps', 'Lifting gloves', 'Sweatband', 'Fitness tracker', 'Gym towel', 'Water bottle']

/** Every accessory, the builder's own and the fitness gear. */
export const ALL_ACCESSORIES: readonly string[] = [...ACCESSORIES, ...FITNESS_ACCESSORIES]

/** "Who" and an age are chosen; every age offered is adult. */
export function adultChosen(state: Pick<BuilderState, 'who' | 'age'>): boolean {
  return ![NOT_SET, RANDOM].includes(state.who) && state.age !== NOT_SET
}

function fits(state: Pick<BuilderState, 'who' | 'age'>) {
  return ([, fit]: [string, Fit]) => {
    const forWho = fit.only === undefined || (fit.only === 'woman' ? includesWoman(state.who) : includesMan(state.who))
    return forWho && (!fit.spicy || adultChosen(state))
  }
}

const offered = (items: Readonly<Record<string, Fit>>, state: Pick<BuilderState, 'who' | 'age'>) =>
  Object.entries(items).filter(fits(state)).map(([item]) => item)

/** Every fitness item that can be offered, for translations. */
export const ALL_FITNESS_OPTIONS: readonly string[] = [
  ...Object.keys(FITNESS_TOPS), ...Object.keys(FITNESS_BOTTOMS), ...Object.keys(FITNESS_SHOES), ...FITNESS_OUTERWEAR, ...FITNESS_ACCESSORIES,
]

/** Fitness garments offered only to some subjects (one sex, or a chosen adult), so a kept choice may no longer fit. */
export const CONDITIONAL_CLOTHING: ReadonlySet<string> = new Set(
  [FITNESS_TOPS, FITNESS_BOTTOMS].flatMap((items) => Object.entries(items).filter(([, fit]) => fit.only || fit.spicy).map(([item]) => item)),
)

/** A purpose about working out: it narrows its poses to workouts, so Surprise me dresses the subject for the gym too. */
export function isWorkoutFocused(narrowedPoses: readonly string[] | undefined): boolean {
  return (narrowedPoses ?? []).some((pose) => pose in WORKOUTS)
}

/** The fitness garments alone that this subject may wear, for dressing a Fitness subject at random. */
export function fitnessClothing(slot: 'top' | 'bottom' | 'shoes', state: Pick<BuilderState, 'who' | 'age'>): string[] {
  return offered({ top: FITNESS_TOPS, bottom: FITNESS_BOTTOMS, shoes: FITNESS_SHOES }[slot], state)
}

export type ClothingSlot = 'top' | 'bottom' | 'outerwear' | 'shoes'

/**
 * What this subject may wear in a slot: the builder's own garments and the fitness ones, spicy cuts only for a chosen
 * adult and each for who it suits. The Outfit step, Random, Surprise me and the prompt all read it.
 */
export function outfitOptions(slot: ClothingSlot, state: Pick<BuilderState, 'who' | 'age'>): string[] {
  switch (slot) {
    case 'top':
      return [...TOPS, ...offered(FITNESS_TOPS, state)]
    case 'bottom':
      return [...BOTTOMS, ...offered(FITNESS_BOTTOMS, state)]
    case 'outerwear':
      return [...OUTERWEAR, ...FITNESS_OUTERWEAR]
    case 'shoes':
      return [...SHOES, ...offered(FITNESS_SHOES, state)]
  }
}

/** Poses offered with the rest: spicy ones only for a chosen adult. */
export function workoutPoses(state: Pick<BuilderState, 'who' | 'age'>): string[] {
  const safe = Object.keys(WORKOUTS).filter((pose) => !(pose in SPICY_POSES))
  return adultChosen(state) ? [...safe, ...Object.keys(SPICY_POSES)] : safe
}

export const FITNESS_SCENES: Readonly<Record<string, string>> = {
  gym: 'in a modern gym with racks of weights and mirrored walls',
  'yoga studio': 'in a bright yoga studio with wooden floors, rolled-out mats and soft daylight',
  'pilates studio': 'in a minimalist Pilates studio with reformer machines and white walls',
  'home gym': 'in a home gym with a squat rack, rubber flooring and a few plants',
  'boxing gym': 'in a gritty boxing gym with heavy bags and a ring under hanging lights',
  'crossfit box': 'in a CrossFit box with pull-up rigs, kettlebells and chalk dust in the air',
  'running track': 'on an outdoor running track, lane lines stretching into the distance',
  'outdoor workout park': 'in an outdoor workout park with pull-up bars among the trees',
}

export const FITNESS_LIGHTING: Readonly<Record<string, string>> = {
  'gym overhead light': 'harsh overhead gym lighting with crisp shadows that define the muscles',
  'soft studio daylight': 'soft, diffused daylight from tall studio windows',
  'golden hour track light': 'warm, low golden-hour sun raking across the scene',
}

export const FITNESS_PHOTO_STYLES: readonly string[] = ['sports editorial', 'motion blur action shot']
