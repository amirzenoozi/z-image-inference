import { createContext } from 'react'
import type { AddonInfo, Catalog, Loadable, ModelInfo, ModelStatusReport } from '../../../types'

/** The look sliders downloaded, which the prompt builder and the character dialog offer; none outside a provider (in tests of one component). */
export const LookSlidersContext = createContext<readonly AddonInfo[]>([])

/** Every model's downloaded slider add-ons; none while the download status is unknown. */
export function downloadedSliders(catalog: Catalog, status: Loadable<ModelStatusReport>): AddonInfo[] {
  if (status.status !== 'settled') return []
  return catalog.models.flatMap((model) => model.addons).filter((addon) => addon.kind === 'slider' && status.value.models[addon.id]?.status === 'ready')
}

/** Those of them a model has, for the prompt builder, which writes for one model. */
export function slidersOf(sliders: readonly AddonInfo[], model: ModelInfo): AddonInfo[] {
  return sliders.filter((slider) => model.addons.some((addon) => addon.id === slider.id))
}
