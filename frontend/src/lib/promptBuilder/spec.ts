// The JSON prompt: the builder's choices as they reach the prompt, grouped into sections and saved with each image.
// It is written as text for the chosen model only when it is sent, so one JSON prompt suits every model. Every
// choice keeps to the builder's options, so the purpose's content rules and the age safeguard still apply; the free
// text goes where the builder has free text. A new detail is a new optional key; a change that breaks old prompts
// raises SPEC_VERSION and upgrades them in `upgraded`.
import { t } from '../../i18n'
import { buildPrompt, emptyBuilderState, type BuilderState, type BuildResult, type OutfitState, type PromptStyle } from './build'
import { CHOICE_OPTIONS, isChoiceField } from './choices'
import { INHERIT_SCENE, NOT_SET, REMOVE } from './constants'
import { CLOTHING_COLORS, LINGERIE_BOTTOMS, LINGERIE_TOPS } from './data'
import { EXPLICIT_DETAILS, EXPLICIT_PIERCINGS, FACIAL_HAIR, INTIMACY_CUES, MAKEUP, PIERCINGS, REALISM_DETAILS, SKIN_DETAILS, TATTOOS } from './extraData'
import { ALL_ACCESSORIES, outfitOptions, type ClothingSlot } from './fitness'
import type { BuilderMode } from './modes'
import { choicesInPrompt, settleChoices } from './settle'

export const SPEC_VERSION = 1

type StringField = { [K in keyof BuilderState]: BuilderState[K] extends string ? K : never }[keyof BuilderState]
type ListField = { [K in keyof BuilderState]: BuilderState[K] extends string[] ? K : never }[keyof BuilderState]
/** A builder field, or a choice that takes several: its first pick and the further ones, written as one list. */
type Field = StringField | ListField | readonly [StringField, ListField]

const FIELDS = {
  subject: { who: 'who', age: 'age', ethnicity: 'ethnicity', description: 'subject' },
  appearance: {
    eyes: 'eyeColor', expression: 'expression', makeup: ['makeup', 'makeupMore'], skin_tone: 'skinTone', skin_details: 'skinDetails', extra: 'appearanceExtra',
  },
  hair: { color: 'hairColor', style: 'hairstyle', length: 'hairLength' },
  body: {
    type: 'bodyType', height: 'height', bust: 'bust', hips: 'hips', muscles: 'muscles', abs: 'abs', chest: 'chest', body_hair: 'bodyHair',
    facial_hair: ['facialHair', 'facialHairMore'], tattoos: 'tattoos', piercings: 'piercings', extra: 'bodyExtra',
  },
  anatomy: { penis: 'penis', nipples: 'nipples', pubic_hair: 'pubicHair', bulge: 'bulge' },
  content: { nudity: 'nudity', intimacy: 'intimacy', explicit_details: 'explicitDetails' },
  pose: { pose: 'pose', explicit_action: 'explicitAction', action: 'action' },
  scene: { type: 'sceneType', environment: 'environment', time: 'timeOfDay', weather: 'weather' },
  lighting: { setup: 'lightingSetup', more: 'lightingMore', custom: 'lightingCustom' },
  camera: { style: 'photoStyle', shot: 'shotType', angle: 'cameraAngle', lens: 'lens', depth_of_field: 'depthOfField' },
  finish: { mood: 'mood', grading: 'colorGrading', realism: 'realism' },
  details: { extra: 'extraDetails', negative: 'negativePrompt' },
} as const satisfies Readonly<Record<string, Readonly<Record<string, Field>>>>

type Sections = typeof FIELDS
type SpecSection<S extends Readonly<Record<string, Field>>> = { [K in keyof S]?: S[K] extends StringField ? string : string[] }

const GARMENTS = {
  top: ['top', 'topColor'],
  bottom: ['bottom', 'bottomColor'],
  lingerie_top: ['lingerieTop', 'lingerieTopColor'],
  lingerie_bottom: ['lingerieBottom', 'lingerieBottomColor'],
  outerwear: ['outerwear', 'outerwearColor'],
  shoes: ['shoes', 'shoesColor'],
} as const satisfies Readonly<Record<string, readonly [keyof OutfitState, keyof OutfitState]>>

type GarmentSlot = keyof typeof GARMENTS

export interface Garment {
  item: string
  color?: string
}

export type OutfitSpec = { [S in GarmentSlot]?: Garment } & { accessories?: string[]; details?: string }

export type PromptSpec = { version: typeof SPEC_VERSION; purpose: string; outfit?: OutfitSpec } & { [S in keyof Sections]?: SpecSection<Sections[S]> }

export type ParsedSpec = { ok: true; spec: PromptSpec } | { ok: false; reason: string }

// ── From the builder and back ────────────────────────────────────────────────

type Values = Record<string, string | string[]>

function valueOf(state: BuilderState, field: Field): string | string[] {
  if (typeof field !== 'string') return [state[field[0]], ...state[field[1]]].filter((value) => value !== NOT_SET)
  return state[field]
}

const isUnset = (value: string | string[] | Garment | undefined) => value === undefined || value === NOT_SET || (Array.isArray(value) && value.length === 0)

function withoutUnset<T extends string | string[] | Garment>(entries: [string, T][]): Record<string, T> | null {
  const kept = entries.filter(([, value]) => !isUnset(value))
  return kept.length ? Object.fromEntries(kept) : null
}

function sectionFrom(state: BuilderState, fields: Readonly<Record<string, Field>>): Values | null {
  const untouched = emptyBuilderState()
  const changed = Object.entries(fields).filter(([, field]) => typeof field !== 'string' || state[field] !== untouched[field])
  return withoutUnset(changed.map(([key, field]) => [key, valueOf(state, field)]))
}

function outfitFrom(outfit: OutfitState): OutfitSpec | null {
  const garments = withoutUnset(
    Object.entries(GARMENTS).map(([slot, [item, color]]): [string, Garment] => [slot, { item: outfit[item] as string, ...(outfit[color] !== NOT_SET && { color: outfit[color] as string }) }])
      .filter(([, garment]) => garment.item !== NOT_SET),
  )
  const accessories = outfit.accessories.filter((item) => item !== NOT_SET)
  const extras = withoutUnset<string | string[]>([['accessories', accessories], ['details', outfit.details]])
  return garments || extras ? { ...garments, ...extras } : null
}

/** The JSON prompt for what the builder would write: Random settled, and only choices that reach the prompt. */
export function specFromState(state: BuilderState, mode: BuilderMode): PromptSpec {
  const used = choicesInPrompt(settleChoices(state, mode), mode)
  const sections = Object.entries(FIELDS).flatMap(([name, fields]) => {
    const section = sectionFrom(used, fields)
    return section ? [[name, section]] : []
  })
  const outfit = outfitFrom(used.outfit)
  return { version: SPEC_VERSION, purpose: mode.id, ...Object.fromEntries(sections), ...(outfit && { outfit }) }
}

function setField(state: BuilderState, field: Field, value: string | string[]): BuilderState {
  if (typeof field !== 'string') {
    const [first = NOT_SET, ...more] = value as string[]
    return { ...state, [field[0]]: first, [field[1]]: more }
  }
  return { ...state, [field]: value }
}

function outfitOf(spec: OutfitSpec | undefined): OutfitState {
  const outfit: OutfitState = { ...emptyBuilderState().outfit, details: spec?.details ?? '' }
  for (const [slot, [item, color]] of Object.entries(GARMENTS)) {
    const garment = spec?.[slot as GarmentSlot]
    if (garment) Object.assign(outfit, { [item]: garment.item, [color]: garment.color ?? NOT_SET })
  }
  const accessories = spec?.accessories ?? []
  outfit.accessories = [accessories[0] ?? NOT_SET, accessories[1] ?? NOT_SET, accessories[2] ?? NOT_SET]
  return outfit
}

/** The builder's choices for a JSON prompt, so it can be opened in the builder or written as text. */
export function stateFromSpec(spec: PromptSpec): BuilderState {
  const filled = Object.entries(FIELDS).reduce((state, [name, fields]) => {
    const section: Values = spec[name as keyof Sections] ?? {}
    return Object.entries(section).reduce((next, [key, value]) => setField(next, fields[key as keyof typeof fields], value), state)
  }, emptyBuilderState())
  return { ...filled, mode: spec.purpose, outfit: outfitOf(spec.outfit) }
}

// ── Reading and checking a JSON prompt ───────────────────────────────────────

class SpecProblem extends Error {}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const LIST_OPTIONS: Readonly<Partial<Record<ListField, readonly string[]>>> = {
  makeupMore: MAKEUP, facialHairMore: FACIAL_HAIR, skinDetails: SKIN_DETAILS, tattoos: TATTOOS, piercings: [...PIERCINGS, ...EXPLICIT_PIERCINGS],
  intimacy: INTIMACY_CUES, explicitDetails: Object.keys(EXPLICIT_DETAILS), lightingMore: CHOICE_OPTIONS.lightingSetup, realism: REALISM_DETAILS,
}

/** The options a field takes, or null for free text. */
function optionsOf(field: StringField | ListField): readonly string[] | null {
  if (field === 'lightingSetup') return [...CHOICE_OPTIONS.lightingSetup, INHERIT_SCENE]
  if (isChoiceField(field)) return CHOICE_OPTIONS[field]
  return LIST_OPTIONS[field as ListField] ?? null
}

function checkKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key))
  if (unknown !== undefined) throw new SpecProblem(t('create.jsonUnknownField', { field: `${path}${unknown}` }))
}

function checkOptions(values: readonly string[], options: readonly string[] | null, path: string): void {
  const wrong = options && values.find((value) => !options.includes(value))
  if (wrong) throw new SpecProblem(t('create.jsonNotAnOption', { value: wrong, field: path }))
}

const isStringList = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string')

function checkValue(value: unknown, field: Field, path: string): void {
  const listOf = typeof field === 'string' ? null : field[0]
  const isList = listOf !== null || Array.isArray(emptyBuilderState()[field as ListField])
  if (isList ? !isStringList(value) : typeof value !== 'string') {
    throw new SpecProblem(t(isList ? 'create.jsonNeedsList' : 'create.jsonNeedsText', { field: path }))
  }
  checkOptions(isList ? (value as string[]) : [value as string], optionsOf(listOf ?? (field as StringField)), path)
}

function checkSection(value: unknown, fields: Readonly<Record<string, Field>>, name: string): void {
  if (!isRecord(value)) throw new SpecProblem(t('create.jsonNeedsObject', { field: name }))
  checkKeys(value, Object.keys(fields), `${name}.`)
  for (const [key, entry] of Object.entries(value)) checkValue(entry, fields[key], `${name}.${key}`)
}

const wearable = (slot: GarmentSlot): readonly string[] => {
  if (slot === 'lingerie_top') return LINGERIE_TOPS
  if (slot === 'lingerie_bottom') return LINGERIE_BOTTOMS
  // Everything any subject may wear; what this subject may not is left out when the prompt is written
  return outfitOptions(slot as ClothingSlot, { who: 'couple', age: CHOICE_OPTIONS.age[0] })
}

function checkGarment(value: unknown, slot: GarmentSlot): void {
  const path = `outfit.${slot}`
  if (!isRecord(value) || typeof value.item !== 'string') throw new SpecProblem(t('create.jsonNeedsGarment', { field: path }))
  checkKeys(value, ['item', 'color'], `${path}.`)
  checkOptions([value.item], [...wearable(slot), REMOVE], `${path}.item`)
  if (value.color === undefined) return
  if (typeof value.color !== 'string') throw new SpecProblem(t('create.jsonNeedsText', { field: `${path}.color` }))
  checkOptions([value.color], CLOTHING_COLORS, `${path}.color`)
}

function checkOutfit(value: unknown): void {
  if (!isRecord(value)) throw new SpecProblem(t('create.jsonNeedsObject', { field: 'outfit' }))
  checkKeys(value, [...Object.keys(GARMENTS), 'accessories', 'details'], 'outfit.')
  for (const slot of Object.keys(GARMENTS) as GarmentSlot[]) if (value[slot] !== undefined) checkGarment(value[slot], slot)
  checkAccessories(value.accessories)
  if (value.details !== undefined && typeof value.details !== 'string') throw new SpecProblem(t('create.jsonNeedsText', { field: 'outfit.details' }))
}

function checkAccessories(value: unknown): void {
  if (value === undefined) return
  const path = 'outfit.accessories'
  // The builder has three accessory slots
  if (!isStringList(value) || value.length > 3) throw new SpecProblem(t('create.jsonNeedsList', { field: path }))
  checkOptions(value, ALL_ACCESSORIES, path)
}

/** An older JSON prompt brought up to SPEC_VERSION; there is only one version so far. */
function upgraded(value: Record<string, unknown>): Record<string, unknown> {
  if (value.version !== SPEC_VERSION) throw new SpecProblem(t('create.jsonVersion', { version: String(value.version) }))
  return value
}

function checkSpec(value: unknown): PromptSpec {
  if (!isRecord(value)) throw new SpecProblem(t('create.jsonNeedsObject', { field: 'JSON' }))
  const spec = upgraded(value)
  checkKeys(spec, ['version', 'purpose', 'outfit', ...Object.keys(FIELDS)], '')
  if (typeof spec.purpose !== 'string') throw new SpecProblem(t('create.jsonNeedsText', { field: 'purpose' }))
  for (const [name, fields] of Object.entries(FIELDS)) if (spec[name] !== undefined) checkSection(spec[name], fields, name)
  if (spec.outfit !== undefined) checkOutfit(spec.outfit)
  return spec as PromptSpec
}

export function parseSpec(text: string): ParsedSpec {
  try {
    return { ok: true, spec: checkSpec(JSON.parse(text)) }
  } catch (error) {
    if (error instanceof SpecProblem) return { ok: false, reason: error.message }
    if (error instanceof SyntaxError) return { ok: false, reason: t('create.jsonUnreadable', { error: error.message }) }
    throw error
  }
}

export const specText = (spec: PromptSpec): string => JSON.stringify(spec, null, 2)

/** The JSON prompt written for a model, with the same rules as the builder; `modes` are the purposes open to the subject. */
export function promptFromSpec(spec: PromptSpec, modes: readonly BuilderMode[], style: PromptStyle): BuildResult {
  const mode = modes.find((candidate) => candidate.id === spec.purpose)
  if (!mode) return { status: 'blocked', reason: t('create.jsonUnknownPurpose', { purpose: spec.purpose }) }
  return buildPrompt(stateFromSpec(spec), mode, style)
}
