import type { Catalog, GenerationSettings } from '../../types'
import type { BuilderMode } from '../promptBuilder/modes'
import { parseSpec, promptFromSpec, specText } from '../promptBuilder/spec'
import { initialSettings, modelDefaults } from '../settings'

/** One image for the render script (scripts/renderSpecs.ts): a JSON prompt, and optionally how to render it. */
export interface SpecEntry {
  /** The file name the image is saved under, without the extension; the History id when left out. */
  name?: string
  spec: unknown
  /** A model id from the catalog; the default model when left out. */
  model?: string
  width?: number
  height?: number
  steps?: number
  guidance?: number | null
  /** A fixed seed; a new one for each image when left out. */
  seed?: number
  /** The character the image is made for; the JSON prompt already has its look. */
  characterId?: number
}

export type EntrySettings = { status: 'ready'; settings: GenerationSettings } | { status: 'problem'; reason: string }

/**
 * The Create settings for an entry: its JSON prompt (checked as the app checks one) and the negative prompt the builder writes
 * for it, with the model's defaults where the entry leaves something out. An unknown model or a JSON prompt that can't be
 * written is a problem, never a silent fallback.
 */
export function entrySettings(entry: SpecEntry, catalog: Catalog, modes: readonly BuilderMode[]): EntrySettings {
  const model = entry.model === undefined ? catalog.models[0] : catalog.models.find((each) => each.id === entry.model)
  if (!model) return { status: 'problem', reason: `Unknown model "${entry.model}"` }
  const parsed = parseSpec(JSON.stringify(entry.spec ?? null))
  if (!parsed.ok) return { status: 'problem', reason: parsed.reason }
  const built = promptFromSpec(parsed.spec, modes, model.prompt_style)
  if (built.status !== 'ready') return { status: 'problem', reason: built.reason }
  const defaults = modelDefaults(model)
  const settings: GenerationSettings = {
    ...initialSettings(catalog),
    ...defaults,
    modelId: model.id,
    prompt: specText(parsed.spec),
    promptFormat: 'json',
    negativePrompt: built.negativePrompt,
    width: entry.width ?? defaults.width,
    height: entry.height ?? defaults.height,
    steps: entry.steps ?? defaults.steps,
    guidance: entry.guidance ?? defaults.guidance,
    seed: entry.seed ?? 0,
    randomSeed: entry.seed === undefined,
    characterId: entry.characterId ?? null,
    lookIncluded: entry.characterId ?? null,
  }
  return { status: 'ready', settings }
}

/** The entries of a render list; anything else is refused with why. */
export function parseEntries(value: unknown): SpecEntry[] {
  if (!Array.isArray(value)) throw new Error('The render list must be a JSON array of entries, each with a "spec"')
  value.forEach((entry: unknown, index) => {
    if (typeof entry !== 'object' || entry === null || !('spec' in entry)) throw new Error(`Entry ${index + 1} has no "spec"`)
  })
  return value as SpecEntry[]
}
