import type { BuilderModeData } from '../../types'
import { CHOICE_OPTIONS, isChoiceField, type ChoiceField } from './choices'
import { INHERIT_SCENE } from './constants'

export const STEP_IDS = ['subject', 'appearance', 'body', 'outfit', 'pose', 'intimacy', 'scene', 'camera', 'finish'] as const
export type StepId = (typeof STEP_IDS)[number]

/** The parts of the written paragraph after its opening sentence, in their default order. */
export const PROSE_BLOCKS = ['nudity', 'face', 'body', 'hair', 'outfit', 'intimacy', 'scene', 'details', 'light', 'camera', 'mood', 'realism'] as const
export type ProseBlock = (typeof PROSE_BLOCKS)[number]

/** Groups of tags a mode can weight for the tag-based models. */
export const WEIGHT_GROUPS = ['nudity', 'action', 'explicitPose', 'pose', 'outfit', 'face', 'hair', 'body', 'scene', 'light'] as const
export type WeightGroup = (typeof WEIGHT_GROUPS)[number]
const MIN_WEIGHT = 0.5
const MAX_WEIGHT = 2

/** A purpose for the builder, read from prompt_modes.json: which steps it shows, where it starts and what it stresses. */
export interface BuilderMode {
  id: string
  label: string
  description: string
  adult_only: boolean
  steps: StepId[]
  defaults: Partial<Record<ChoiceField, string>>
  options: Partial<Record<ChoiceField, string[]>>
  emphasis: ProseBlock[]
  weights: Partial<Record<WeightGroup, number>>
}

/** Used when prompt_modes.json has no valid mode: every everyday step, nothing adult. */
export const FALLBACK_MODE: BuilderMode = {
  id: 'general',
  label: 'General',
  description: 'Any photo of a person, with every everyday option.',
  adult_only: false,
  steps: ['subject', 'appearance', 'body', 'outfit', 'pose', 'scene', 'camera', 'finish'],
  defaults: {},
  options: {},
  emphasis: [],
  weights: {},
}

/**
 * Showing the Intimacy step makes a mode adult whatever its file says, so the age checks always apply to it;
 * editing prompt_modes.json can add adult options but never switch those checks off.
 */
export function isAdultMode(mode: BuilderMode): boolean {
  return mode.adult_only || mode.steps.includes('intimacy')
}

export function showsStep(mode: BuilderMode, step: StepId): boolean {
  return mode.steps.includes(step)
}

const isStep = (value: string): value is StepId => (STEP_IDS as readonly string[]).includes(value)
const isBlock = (value: string): value is ProseBlock => (PROSE_BLOCKS as readonly string[]).includes(value)
const isWeightGroup = (value: string): value is WeightGroup => (WEIGHT_GROUPS as readonly string[]).includes(value)

function knownOption(field: ChoiceField, value: string): boolean {
  return (CHOICE_OPTIONS[field] as readonly string[]).includes(value) || (field === 'lightingSetup' && value === INHERIT_SCENE)
}

function stepProblems(data: BuilderModeData): string[] {
  const unknown = data.steps.filter((step) => !isStep(step))
  return [...(data.steps.length ? [] : ['it shows no steps']), ...unknown.map((step) => `unknown step "${step}"`)]
}

function optionProblems(data: BuilderModeData): string[] {
  const problems: string[] = []
  for (const [field, values] of Object.entries(data.options)) {
    if (!isChoiceField(field)) problems.push(`unknown choice "${field}" in options`)
    else problems.push(...values.filter((value) => !knownOption(field, value)).map((value) => `unknown ${field} option "${value}"`))
  }
  for (const [field, value] of Object.entries(data.defaults)) {
    if (!isChoiceField(field)) problems.push(`unknown choice "${field}" in defaults`)
    else if (!knownOption(field, value)) problems.push(`unknown ${field} default "${value}"`)
    else if (data.options[field] && !data.options[field].includes(value)) problems.push(`the ${field} default "${value}" is not in its own options`)
  }
  return problems
}

function writingProblems(data: BuilderModeData): string[] {
  const blocks = data.emphasis.filter((block) => !isBlock(block)).map((block) => `unknown emphasis "${block}"`)
  const weights = Object.entries(data.weights).flatMap(([group, weight]) =>
    !isWeightGroup(group) ? [`unknown weight group "${group}"`] : weight < MIN_WEIGHT || weight > MAX_WEIGHT ? [`the ${group} weight must be between ${MIN_WEIGHT} and ${MAX_WEIGHT}`] : [],
  )
  return [...blocks, ...weights]
}

/** Checks each mode against the builder's steps, choices and options; a mode with problems is left out and reported. */
export function parseModes(raw: readonly BuilderModeData[]): { modes: BuilderMode[]; problems: string[] } {
  const modes: BuilderMode[] = []
  const problems: string[] = []
  for (const data of raw) {
    const found = [...stepProblems(data), ...optionProblems(data), ...writingProblems(data)]
    if (found.length) problems.push(`Mode "${data.id}" was left out: ${found.join('; ')}.`)
    else modes.push(data as BuilderMode)
  }
  return modes.length ? { modes, problems } : { modes: [FALLBACK_MODE], problems }
}
