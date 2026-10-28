import type { Catalog, GenerationSettings, HistoryItem, Limits, ModelInfo, ResolutionInfo } from '../types'

const STORAGE_KEY = 'z-image-studio.settings.v1'

type ModelDefaults = Pick<GenerationSettings, 'negativePrompt' | 'width' | 'height' | 'steps' | 'guidance'>

export function modelDefaults(model: ModelInfo): ModelDefaults {
  return {
    negativePrompt: model.default_negative_prompt,
    width: model.default_width,
    height: model.default_height,
    steps: model.default_steps,
    guidance: model.default_guidance,
  }
}

export function initialSettings(catalog: Catalog): GenerationSettings {
  const model = catalog.models[0]
  return { modelId: model.id, prompt: '', seed: 0, randomSeed: true, ...modelDefaults(model) }
}

export function findModel(catalog: Catalog, modelId: string): ModelInfo {
  return catalog.models.find((model) => model.id === modelId) ?? catalog.models[0]
}

export function presetsFor(model: ModelInfo, resolutions: ResolutionInfo[]): ResolutionInfo[] {
  return resolutions.filter((preset) => fitsModel(preset.width, preset.height, model))
}

export function fitsModel(width: number, height: number, model: ModelInfo): boolean {
  return Math.max(width, height) <= model.max_side
}

/** Rounds a side to the nearest allowed value for the model. */
export function snapSide(value: number, limits: Limits, maxSide: number): number {
  const step = limits.side_step
  const largest = Math.floor(maxSide / step) * step
  const snapped = Math.round(value / step) * step
  return Math.min(Math.max(Number.isFinite(snapped) ? snapped : limits.min_side, limits.min_side), largest)
}

/** Switches model, keeping the user's values where the new model allows them. */
export function withModel(settings: GenerationSettings, model: ModelInfo): GenerationSettings {
  const sizeFits = fitsModel(settings.width, settings.height, model)
  return {
    ...settings,
    modelId: model.id,
    width: sizeFits ? settings.width : model.default_width,
    height: sizeFits ? settings.height : model.default_height,
    steps: Math.min(settings.steps, model.max_steps),
  }
}

/** For when the user picks another model: its sampling defaults apply; prompt, seed and a size that fits are kept. */
export function switchModel(settings: GenerationSettings, model: ModelInfo): GenerationSettings {
  return { ...withModel(settings, model), steps: model.default_steps, guidance: model.default_guidance }
}

/** The settings that produced a history image, keeping the seed fixed so it can be reproduced. */
export function settingsFromItem(item: HistoryItem, catalog: Catalog): GenerationSettings {
  const model = findModel(catalog, item.model)
  return withModel(
    {
      modelId: model.id,
      prompt: item.prompt,
      negativePrompt: item.negative_prompt,
      width: item.width,
      height: item.height,
      steps: item.steps,
      guidance: item.guidance ?? model.default_guidance,
      seed: item.seed,
      randomSeed: false,
    },
    model,
  )
}

export function differsFromDefaults(settings: GenerationSettings, model: ModelInfo): boolean {
  const defaults = modelDefaults(model)
  return (Object.keys(defaults) as (keyof ModelDefaults)[]).some((key) => settings[key] !== defaults[key])
}

const NUMBER_FIELDS = ['width', 'height', 'steps', 'guidance', 'seed'] as const
const STRING_FIELDS = ['modelId', 'prompt', 'negativePrompt'] as const

function isStoredSettings(value: unknown): value is GenerationSettings {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  const numbersOk = NUMBER_FIELDS.every((key) => typeof record[key] === 'number' && Number.isFinite(record[key]))
  const stringsOk = STRING_FIELDS.every((key) => typeof record[key] === 'string')
  return numbersOk && stringsOk && typeof record.randomSeed === 'boolean'
}

/** Restores the last settings, falling back to defaults if storage is empty, unreadable or out of date. */
export function loadSettings(catalog: Catalog): GenerationSettings {
  let stored: unknown = null
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
  } catch {
    stored = null
  }
  if (!isStoredSettings(stored)) return initialSettings(catalog)
  return withModel(stored, findModel(catalog, stored.modelId))
}

export function saveSettings(settings: GenerationSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Storage can be full or blocked; settings then simply are not remembered
  }
}
