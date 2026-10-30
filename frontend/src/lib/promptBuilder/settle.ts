import type { BuilderState } from './build'
import { TEXT_CHOICES, type TextChoice } from './choices'
import { NOT_SET, RANDOM } from './constants'
import { ALL_ACCESSORIES } from './fitness'
import { fitsChoice } from './conflicts'
import { showsStep, type BuilderMode, type StepId } from './modes'
import { pick } from './random'
import { MORE_FIELDS, type MultiChoice } from './multiChoice'
import { choicesFor, explicitDetailOptions } from './rules'

/**
 * The order random choices are settled in: each one is picked to fit those before it, so the place sets the time,
 * the time the light, the hair length the style, the build the muscles and body hair, and the pose the act and the expression.
 */
const SETTLE_ORDER: readonly TextChoice[] = [
  'who', 'hairLength', 'hairstyle', 'bodyType', 'muscles', 'abs', 'chest', 'bodyHair', 'sceneType', 'timeOfDay', 'weather', 'lightingSetup', 'photoStyle', 'shotType', 'cameraAngle',
  'pose', 'explicitAction', 'expression',
]
const ORDERED: readonly TextChoice[] = [...SETTLE_ORDER, ...TEXT_CHOICES.filter((field) => !SETTLE_ORDER.includes(field))]

/**
 * A random option for `field` within the content rules that clashes with nothing already chosen; when every option
 * would clash with choices the user made, any allowed one, since the warning then shows the clash.
 */
export function pickFitting(field: TextChoice, state: BuilderState, mode: BuilderMode, seed: number): string {
  const options = choicesFor(field, state, mode)
  const fitting = options.filter((value) => fitsChoice(state, { [field]: value }, value))
  return pick(fitting.length ? fitting : options, seed, field)
}

function settleAccessories(state: BuilderState, seed: number): BuilderState {
  let settled = state
  state.outfit.accessories.forEach((item, index) => {
    if (item !== RANDOM) return
    const fits = (value: string) => {
      const accessories = settled.outfit.accessories.map((current, i) => (i === index ? value : current)) as BuilderState['outfit']['accessories']
      return fitsChoice(settled, { outfit: { ...settled.outfit, accessories } }, value)
    }
    const fitting = ALL_ACCESSORIES.filter(fits)
    const value = pick(fitting.length ? fitting : ALL_ACCESSORIES, seed, `accessory${index}`)
    const accessories = settled.outfit.accessories.map((current, i) => (i === index ? value : current)) as BuilderState['outfit']['accessories']
    settled = { ...settled, outfit: { ...settled.outfit, accessories } }
  })
  return settled
}

/** Every choice left on Random given a concrete value, in an order that keeps them from contradicting each other. */
export function settleChoices(state: BuilderState, mode: BuilderMode): BuilderState {
  let settled = state
  for (const field of ORDERED) {
    if (settled[field] === RANDOM) settled = { ...settled, [field]: pickFitting(field, settled, mode, state.rollSeed) }
  }
  return settleAccessories(settled, state.rollSeed)
}

// The choices each step holds that can take part in a clash
const STEP_CHOICES: Readonly<Partial<Record<StepId, readonly TextChoice[]>>> = {
  appearance: ['hairLength', 'hairstyle', 'expression'],
  pose: ['pose', 'explicitAction'],
  scene: ['sceneType', 'timeOfDay', 'weather', 'lightingSetup'],
  camera: ['photoStyle', 'shotType', 'cameraAngle'],
}

/**
 * Only the choices that reach the prompt: those of the steps the mode shows, and options it allows. A choice left
 * from another mode, which the prompt leaves out, can't clash with anything.
 */
export function choicesInPrompt(state: BuilderState, mode: BuilderMode): BuilderState {
  const hidden = Object.entries(STEP_CHOICES).flatMap(([step, fields]) => (showsStep(mode, step as StepId) ? [] : fields))
  const allowed = (field: TextChoice) => !hidden.includes(field) && (state[field] === NOT_SET || choicesFor(field, state, mode).includes(state[field]))
  const cleared = Object.fromEntries(TEXT_CHOICES.filter((field) => !allowed(field)).map((field) => [field, NOT_SET]))
  const outfit = showsStep(mode, 'outfit') ? state.outfit : { ...state.outfit, accessories: [NOT_SET, NOT_SET, NOT_SET] as BuilderState['outfit']['accessories'] }
  const intimacy = showsStep(mode, 'intimacy')
  const details = intimacy ? state.explicitDetails.filter((detail) => explicitDetailOptions(state, mode).includes(detail)) : []
  return { ...state, ...cleared, ...morePicksIn(state, cleared, mode), outfit, intimacy: intimacy ? state.intimacy : [], explicitDetails: details }
}

/** A choice's further picks go with its first: none once that is cleared, and only those that fit. */
function morePicksIn(state: BuilderState, cleared: Partial<BuilderState>, mode: BuilderMode): Partial<BuilderState> {
  return Object.fromEntries(
    (Object.keys(MORE_FIELDS) as MultiChoice[]).map((field) => {
      const fits = (value: string) => field in cleared ? false : choicesFor(field, state, mode).includes(value)
      return [MORE_FIELDS[field], state[MORE_FIELDS[field]].filter(fits)]
    }),
  )
}
