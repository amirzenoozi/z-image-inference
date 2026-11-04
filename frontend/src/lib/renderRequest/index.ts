import type { Catalog, Character, GenerationSettings, Loadable, ModelStatusReport, SentSettings } from '../../types'
import { addonsToSend } from '../addons'
import { promptToSend, renderStrength } from '../characterPrompt'
import { strengthsToSend } from '../lookSliders'
import type { BuilderMode } from '../promptBuilder/modes'
import { findModel } from '../settings'

/** What a render request is built from besides the settings. */
export interface RequestContext {
  catalog: Catalog
  /** The character the settings name, or null. */
  character: Character | null
  modes: readonly BuilderMode[]
  modelStatus: Loadable<ModelStatusReport>
  /** Adult content is locked in this browser, so the server keeps the render safe for work. */
  safeOnly: boolean
}

export type RenderRequest = { status: 'ready'; request: SentSettings } | { status: 'problem'; reason: string }

/**
 * What Generate sends for these settings: the prompt as text (written from the JSON prompt, with the character's look when it
 * isn't in it yet) and the JSON it came from, the model shown, and the add-ons and slider strengths that apply. Create and the
 * render script (scripts/renderSpecs.ts) both send this, so a scripted image is saved exactly as one made in the app.
 */
export function renderRequest(next: GenerationSettings, context: RequestContext, testSet?: SentSettings['testSet']): RenderRequest {
  const { catalog, character, modes, modelStatus } = context
  // A model hidden by the lock falls back to the first one shown, so the request names that one too
  const model = findModel(catalog, next.modelId)
  const sent = promptToSend(next, character, model, modes)
  if (sent.status !== 'ready') return sent
  const strengths = strengthsToSend(model, (id) => renderStrength(id, sent, next, character, model), modelStatus)
  const request: SentSettings = {
    ...next, modelId: model.id, prompt: sent.prompt, promptFormat: 'text', promptSpec: sent.spec, safeOnly: context.safeOnly, testSet,
    addons: addonsToSend(model, next.addons, modelStatus), strengths,
  }
  return { status: 'ready', request }
}
