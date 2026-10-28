import { emptyBuilderState, type BuilderState } from './build'
import { NUDITY_LEVELS } from './extraData'

const STORAGE_KEY = 'z-image-studio.prompt-builder.v3'
// v2 had an "explicit" switch where v3 has a mode
const OLD_STORAGE_KEY = 'z-image-studio.prompt-builder.v2'

/** True when `value` has every key of `template`, each of the same kind (nested objects and lists checked too). */
function matchesShape(value: unknown, template: unknown): boolean {
  if (Array.isArray(template)) {
    if (!Array.isArray(value)) return false
    // An empty template list holds any number of strings; a filled one is a fixed-length tuple
    if (template.length === 0) return value.every((item) => typeof item === 'string')
    return value.length === template.length && value.every((item) => matchesShape(item, template[0]))
  }
  if (typeof template === 'object' && template !== null) {
    if (typeof value !== 'object' || value === null) return false
    const record = value as Record<string, unknown>
    return Object.entries(template).every(([key, child]) => matchesShape(record[key], child))
  }
  return typeof value === typeof template
}

function isBuilderState(value: unknown): value is BuilderState {
  const knownNudity = NUDITY_LEVELS.some((level) => level.value === (value as BuilderState | null)?.nudity)
  return matchesShape(value, emptyBuilderState()) && knownNudity
}

function fromOldState(stored: unknown): unknown {
  if (typeof stored !== 'object' || stored === null) return stored
  const { explicit, ...rest } = stored as Record<string, unknown>
  return { ...rest, mode: explicit === true ? 'explicit' : 'general' }
}

/** Choices saved before a field existed get that field's default, so adding a field never throws saved choices away. */
function withNewFields(stored: unknown): unknown {
  if (typeof stored !== 'object' || stored === null) return stored
  return { ...emptyBuilderState(), ...stored }
}

export function loadBuilderState(): BuilderState {
  try {
    const current = localStorage.getItem(STORAGE_KEY)
    const stored: unknown = current === null ? fromOldState(JSON.parse(localStorage.getItem(OLD_STORAGE_KEY) ?? 'null')) : JSON.parse(current)
    const filled = withNewFields(stored)
    return isBuilderState(filled) ? filled : emptyBuilderState()
  } catch {
    return emptyBuilderState()
  }
}

export function saveBuilderState(state: BuilderState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage can be full or blocked; the builder then simply starts fresh next time
  }
}
