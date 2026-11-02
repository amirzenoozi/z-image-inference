import { tOr } from '../../i18n'
import type { AddonInfo, Loadable, ModelInfo, ModelStatusReport } from '../../types'

/** The add-on's name in the UI's language, by id, so History can name the add-ons an image used. */
export function addonLabel(id: string, fallback: string = id): string {
  return tOr(`create.addonLabel_${id}`, fallback)
}

/**
 * The optional add-ons a render sends: switched on, belonging to this model, and downloaded. While the status is unknown they
 * are sent anyway, and the server explains if one it needs is missing. Automatic ones need no sending, and sliders go as strengths.
 */
export function addonsToSend(model: ModelInfo, enabled: readonly string[], status: Loadable<ModelStatusReport>): string[] {
  const downloaded = (id: string) => status.status !== 'settled' || status.value.models[id]?.status === 'ready'
  return optionalAddons(model).filter((addon) => enabled.includes(addon.id) && downloaded(addon.id)).map((addon) => addon.id)
}

/** The add-ons the user switches on, each with a checkbox in Create. */
export function optionalAddons(model: ModelInfo): AddonInfo[] {
  return model.addons.filter((addon) => addon.kind === 'optional')
}

export function withAddon(enabled: readonly string[], addonId: string, on: boolean): string[] {
  const others = enabled.filter((id) => id !== addonId)
  return on ? [...others, addonId] : others
}
