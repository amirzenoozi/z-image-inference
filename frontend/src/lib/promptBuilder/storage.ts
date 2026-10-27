import { emptyBuilderState, type BuilderState } from './build'

const STORAGE_KEY = 'z-image-studio.prompt-builder.v1'

/** True when `value` has every key of `template`, each of the same kind (nested objects checked too). */
function matchesShape(value: unknown, template: unknown): boolean {
  if (Array.isArray(template)) {
    return Array.isArray(value) && value.length === template.length && value.every((item) => matchesShape(item, template[0]))
  }
  if (typeof template === 'object' && template !== null) {
    if (typeof value !== 'object' || value === null) return false
    const record = value as Record<string, unknown>
    return Object.entries(template).every(([key, child]) => matchesShape(record[key], child))
  }
  return typeof value === typeof template
}

export function loadBuilderState(): BuilderState {
  const fallback = emptyBuilderState()
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    return matchesShape(stored, fallback) ? (stored as BuilderState) : fallback
  } catch {
    return fallback
  }
}

export function saveBuilderState(state: BuilderState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage can be full or blocked; the builder then simply starts fresh next time
  }
}
