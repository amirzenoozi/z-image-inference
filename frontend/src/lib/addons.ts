import { tOr } from '../i18n'
import type { AddonInfo, Loadable, ModelInfo, ModelStatusReport } from '../types'

/** The add-on's name in the UI's language, by id, so History can name the add-ons an image used. */
export function addonLabel(id: string, fallback: string = id): string {
  return tOr(`create.addonLabel_${id}`, fallback)
}

const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Whether the prompt asks for what the add-on adds: one of its keywords as a whole word, in any case. Mirrors the server's rule. */
export function addonApplies(addon: AddonInfo, prompt: string): boolean {
  return new RegExp(`\\b(?:${addon.keywords.map(escape).join('|')})\\b`, 'i').test(prompt)
}

/**
 * The add-ons a render sends: switched on, belonging to this model, and downloaded. While the status is unknown they
 * are sent anyway, and the server explains if one it needs is missing.
 */
export function addonsToSend(model: ModelInfo, enabled: readonly string[], status: Loadable<ModelStatusReport>): string[] {
  const downloaded = (id: string) => status.status !== 'settled' || status.value.models[id]?.status === 'ready'
  return model.addons.filter((addon) => enabled.includes(addon.id) && downloaded(addon.id)).map((addon) => addon.id)
}

export function withAddon(enabled: readonly string[], addonId: string, on: boolean): string[] {
  const others = enabled.filter((id) => id !== addonId)
  return on ? [...others, addonId] : others
}
