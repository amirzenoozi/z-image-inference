import { optionTitle, t, type MessageKey } from '../../i18n'
import type { AddonInfo, GenerationSettings, ModelInfo } from '../../types'
import type { BuilderState } from '../promptBuilder/build'
import { NOT_SET } from '../promptBuilder/constants'
import type { BuilderMode, StepId } from '../promptBuilder/modes'
import { parseSpec, specFromState, specText, stateFromSpec } from '../promptBuilder/spec'
import { addonLabel } from '../addons'
import { linkedField, lookStrength, sliderAddons, withStrength, type Strengths } from '../lookSliders'

export const MAX_SETTINGS = 3
export const MIN_VERSIONS = 2
export const MAX_VERSIONS = 6
const STORAGE_KEY = 'z-image-studio.ab-test.v2'
// A test saved before one could compare several settings; read once and converted
const OLD_STORAGE_KEY = 'z-image-studio.ab-test.v1'

/** The builder choices a test can compare, by the step that shows them, with their labels. */
const CHOICE_FIELDS = {
  pose: { pose: 'builder.fieldPose' },
  scene: { sceneType: 'builder.fieldScene', timeOfDay: 'builder.fieldTimeOfDay', weather: 'builder.fieldWeather' },
  camera: {
    photoStyle: 'builder.fieldPhotoStyle', shotType: 'builder.fieldShotType', cameraAngle: 'builder.fieldCameraAngle', lens: 'builder.fieldLens',
    depthOfField: 'builder.fieldDepthOfField', imageFilter: 'builder.fieldImageFilter',
  },
  finish: { colorGrading: 'builder.fieldColourGrading' },
} as const satisfies Partial<Record<StepId, Partial<Record<keyof BuilderState, MessageKey>>>>

type ChoiceSteps = typeof CHOICE_FIELDS
export type TestedChoice = { [S in keyof ChoiceSteps]: keyof ChoiceSteps[S] }[keyof ChoiceSteps]

/** One setting a test compares: a look slider (its strength) or a builder choice (its option). */
export type TestSetting = { kind: 'slider'; addonId: string } | { kind: 'choice'; field: TestedChoice }

/** A slider's strength or a choice's option. */
export type TestValue = number | string

/**
 * One A/B test: the settings it compares (one to three), and its versions, one per image (A first), each with a value for
 * every setting, in the settings' order.
 */
export interface AbTest {
  settings: TestSetting[]
  versions: TestValue[][]
}

/** One image of a test: its settings, and what it tried, as History keeps it. */
export interface TestVersion {
  settings: GenerationSettings
  label: string
}

type Built = { state: BuilderState; mode: BuilderMode }

const CHOICE_LABELS: Record<TestedChoice, MessageKey> = Object.assign({}, ...Object.values(CHOICE_FIELDS))

export const choiceLabel = (field: TestedChoice): string => t(CHOICE_LABELS[field])

const STEP_LABELS: Record<keyof ChoiceSteps, MessageKey> = {
  pose: 'builder.stepPose', scene: 'builder.stepScene', camera: 'builder.stepCamera', finish: 'builder.stepFinish',
}

/** The group a setting is offered under: Look for the sliders, else the builder step that shows the choice. */
function groupOf(setting: TestSetting): MessageKey {
  if (setting.kind === 'slider') return 'create.sectionLook'
  const step = (Object.keys(CHOICE_FIELDS) as (keyof ChoiceSteps)[]).find((each) => setting.field in CHOICE_FIELDS[each])
  return step ? STEP_LABELS[step] : 'create.sectionLook'
}

/** Settings under their group's heading, in the order given, a group only once it has something in it. */
export function groupedSettings(settings: readonly TestSetting[]): { label: string; settings: TestSetting[] }[] {
  const groups = new Map<MessageKey, TestSetting[]>()
  for (const setting of settings) groups.set(groupOf(setting), [...(groups.get(groupOf(setting)) ?? []), setting])
  return [...groups].map(([key, inGroup]) => ({ label: t(key), settings: inGroup }))
}

/** A setting's identity, the same for the same slider or choice. */
export const settingKey = (setting: TestSetting): string => (setting.kind === 'slider' ? `slider:${setting.addonId}` : setting.field)

/** A setting's name, as the builder and the Look section call it. */
export function settingName(setting: TestSetting, model: ModelInfo): string {
  if (setting.kind === 'choice') return choiceLabel(setting.field)
  return addonLabel(setting.addonId, model.addons.find((addon) => addon.id === setting.addonId)?.label ?? setting.addonId)
}

/** The choices a test can compare in this purpose: those of its steps. */
export function testableChoices(mode: BuilderMode): TestedChoice[] {
  return Object.entries(CHOICE_FIELDS).flatMap(([step, fields]) => (mode.steps.includes(step as StepId) ? (Object.keys(fields) as TestedChoice[]) : []))
}

/** The sliders a test can compare: the model's downloaded ones. */
export const testableSliders = (model: ModelInfo, downloaded: readonly AddonInfo[]): AddonInfo[] =>
  sliderAddons(model).filter((addon) => downloaded.some((each) => each.id === addon.id))

/** The builder's choices and purpose of a JSON prompt; null for a typed prompt or one that can't be read. */
export function promptChoices(settings: GenerationSettings, modes: readonly BuilderMode[]): Built | null {
  if (settings.promptFormat !== 'json') return null
  const parsed = parseSpec(settings.prompt)
  const mode = parsed.ok ? modes.find((candidate) => candidate.id === parsed.spec.purpose) : undefined
  return parsed.ok && mode ? { state: stateFromSpec(parsed.spec), mode } : null
}

/** What the prompt has for a setting now, which a newly added setting starts every version at. */
export function currentValue(setting: TestSetting, settings: GenerationSettings, modes: readonly BuilderMode[]): TestValue {
  const built = promptChoices(settings, modes)
  if (setting.kind === 'choice') return built ? built.state[setting.field] : NOT_SET
  return built ? lookStrength(setting.addonId, built.state) : (settings.strengths[setting.addonId] ?? 0)
}

// A slider moved in a JSON prompt also picks its linked choice, as everywhere else (lib/lookSliders)
function withValue(state: BuilderState, setting: TestSetting, value: TestValue): BuilderState {
  return setting.kind === 'slider' ? withStrength(state, setting.addonId, Number(value)) : { ...state, [setting.field]: String(value) }
}

// A typed prompt can only change its sliders' strengths; testProblem stops a test with a choice from running on one
function withStrengths(strengths: Strengths, settings: readonly TestSetting[], row: readonly TestValue[]): Strengths {
  return settings.reduce((next, setting, at) => (setting.kind === 'slider' ? { ...next, [setting.addonId]: Number(row[at]) } : next), strengths)
}

/** The settings with one of the test's versions in place. */
export function withVersion(settings: GenerationSettings, test: AbTest, index: number, modes: readonly BuilderMode[]): GenerationSettings {
  const row = test.versions[index]
  const built = promptChoices(settings, modes)
  if (!built) return { ...settings, strengths: withStrengths(settings.strengths, test.settings, row) }
  const state = test.settings.reduce((next, setting, at) => withValue(next, setting, row[at]), built.state)
  return { ...settings, prompt: specText(specFromState(state, built.mode)) }
}

function valueLabel(setting: TestSetting, value: TestValue, model: ModelInfo): string {
  const name = settingName(setting, model)
  return setting.kind === 'choice' ? `${name}: ${optionTitle(String(value))}` : `${name} ${value}`
}

/** What one version tries, such as "Weight -4 · Image filter: Portra Analog Warmth". */
export function versionLabel(test: AbTest, index: number, model: ModelInfo): string {
  return test.settings.map((setting, at) => valueLabel(setting, test.versions[index][at], model)).join(' · ')
}

/** Each image the test makes, in order, all on the same seed. */
export function testVersions(settings: GenerationSettings, test: AbTest, model: ModelInfo, modes: readonly BuilderMode[]): TestVersion[] {
  return test.versions.map((_, index) => ({ settings: { ...withVersion(settings, test, index, modes), randomSeed: false }, label: versionLabel(test, index, model) }))
}

/** Starting a test fixes the seed, picking one now if each render had its own, and puts version A in the prompt. */
export function startTest(settings: GenerationSettings, test: AbTest, modes: readonly BuilderMode[], newSeed: () => number): GenerationSettings {
  const seed = settings.randomSeed ? newSeed() : settings.seed
  return withVersion({ ...settings, seed, randomSeed: false }, test, 0, modes)
}

/** Why a test's versions can't run, or null: every choice must be set, and each version must differ from the others. */
export function valuesProblem(test: AbTest): string | null {
  const unset = test.settings.some((setting, at) => setting.kind === 'choice' && test.versions.some((row) => row[at] === NOT_SET))
  const distinct = new Set(test.versions.map((row) => JSON.stringify(row))).size === test.versions.length
  return unset || !distinct ? t('create.abValuesDiffer') : null
}

function settingProblem(setting: TestSetting, built: Built | null, sliders: readonly AddonInfo[]): string | null {
  if (setting.kind === 'slider') return sliders.some((addon) => addon.id === setting.addonId) ? null : t('create.abSliderMissing')
  if (!built) return t('create.abNeedsBuilderPrompt')
  return testableChoices(built.mode).includes(setting.field) ? null : t('create.abChoiceHidden', { field: choiceLabel(setting.field) })
}

/**
 * Why the test can't run with these settings, or null: a slider isn't downloaded for this model, or a choice needs a prompt
 * from the builder whose purpose shows it.
 */
export function testProblem(test: AbTest, settings: GenerationSettings, sliders: readonly AddonInfo[], modes: readonly BuilderMode[]): string | null {
  const built = promptChoices(settings, modes)
  return test.settings.map((setting) => settingProblem(setting, built, sliders)).find((problem) => problem !== null) ?? null
}

/** Whether the test locks this look slider: one it compares. */
export const sliderLocked = (locked: ReadonlySet<string>, addonId: string): boolean => locked.has(settingKey({ kind: 'slider', addonId }))

const lockedBy = (setting: TestSetting): string[] =>
  setting.kind === 'choice' ? [setting.field] : [settingKey(setting), linkedField(setting.addonId)].filter((field) => field !== null)

/** What a test locks in the builder: who the subject is, and what it compares (with the choice each slider is linked to). */
export function lockedBuilderFields(test: AbTest | null): ReadonlySet<string> {
  return test ? new Set(['who', 'age', ...test.settings.flatMap(lockedBy)]) : new Set()
}

// ── Kept in this browser ─────────────────────────────────────────────────────

const isSetting = (value: unknown): value is TestSetting => {
  const setting = value as Partial<Record<string, unknown>> | null
  if (setting?.kind === 'slider') return typeof setting.addonId === 'string'
  return setting?.kind === 'choice' && Object.hasOwn(CHOICE_LABELS, String(setting.field))
}

const isValueFor = (setting: TestSetting, value: unknown): boolean => typeof value === (setting.kind === 'slider' ? 'number' : 'string')

const isRow = (settings: readonly TestSetting[], row: unknown): boolean =>
  Array.isArray(row) && row.length === settings.length && settings.every((setting, at) => isValueFor(setting, row[at]))

const counted = (list: unknown, minimum: number, maximum: number): unknown[] | null =>
  Array.isArray(list) && list.length >= minimum && list.length <= maximum ? list : null

function isTest(value: unknown): value is AbTest {
  const test = value as Partial<Record<string, unknown>> | null
  const settings = counted(test?.settings, 1, MAX_SETTINGS)
  const versions = counted(test?.versions, MIN_VERSIONS, MAX_VERSIONS)
  if (!settings?.every(isSetting) || !versions) return false
  return versions.every((row) => isRow(settings, row))
}

/** A test saved before several settings could be compared: one setting, and one value per image. */
function fromOldTest(old: Partial<Record<string, unknown>> | null): unknown {
  const setting = old?.kind === 'slider' ? { kind: 'slider', addonId: old.addonId } : { kind: 'choice', field: old?.field }
  return { settings: [setting], versions: Array.isArray(old?.values) ? old.values.map((value: unknown) => [value]) : null }
}

function readStored(key: string): unknown {
  return JSON.parse(localStorage.getItem(key) ?? 'null')
}

/** The test running in this browser, kept across reloads; null for none, or one saved in a shape it can't use. */
export function loadTest(): AbTest | null {
  try {
    const stored = readStored(STORAGE_KEY) ?? fromOldTest(readStored(OLD_STORAGE_KEY) as Partial<Record<string, unknown>> | null)
    localStorage.removeItem(OLD_STORAGE_KEY)
    return isTest(stored) ? stored : null
  } catch {
    return null
  }
}

export function saveTest(test: AbTest | null): void {
  try {
    if (test) localStorage.setItem(STORAGE_KEY, JSON.stringify(test))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage can be full or blocked; the test then simply ends with the page
  }
}
