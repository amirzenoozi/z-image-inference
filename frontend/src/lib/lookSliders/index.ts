import type { AddonInfo, Loadable, ModelInfo, ModelStatusReport } from '../../types'
import type { PromptSpec } from '../promptBuilder/spec'

/** Look slider strengths by slider add-on id (model_catalog.Z_IMAGE_SLIDER_ADDONS). */
export type Strengths = Record<string, number>

type TraitField = 'bodyType' | 'muscles' | 'skinTone' | 'hairLength'

/** The look a slider reads and writes: the builder's matching choices and the strengths set on top. Builder state and character traits both have it. */
export type LookTraits = Record<TraitField, string> & { strengths?: Strengths }

interface TraitSlider {
  field: TraitField
  /** The strength each of the builder's options puts the slider at. */
  defaults: Record<string, number>
  /** The options a moved slider picks: the nearest one to its strength. */
  written: readonly (readonly [string, number])[]
}

// Negative strengths make the subject thinner, lighter skinned and shorter haired, as the LoRAs' authors describe. The prompt already
// says the option, so its default stays mild; the defaults are kept inside each slider's range (model_catalog)
const TRAIT_SLIDERS: Record<string, TraitSlider> = {
  weight: {
    field: 'bodyType',
    defaults: {
      'slim build': -2, 'athletic build': -1, 'toned build': -1, 'average build': 0, 'curvy figure': 2, 'hourglass figure': 2,
      'voluptuous figure': 3, 'plus-size figure': 5, 'muscular build': 0, 'broad-shouldered build': 0,
    },
    written: [['slim build', -2], ['athletic build', -1], ['average build', 0], ['curvy figure', 2], ['voluptuous figure', 3], ['plus-size figure', 5]],
  },
  'muscle-tone': {
    field: 'muscles',
    defaults: { lean: 1, toned: 3, muscular: 5, 'very muscular': 7, 'huge bodybuilder': 8 },
    written: [['lean', 1], ['toned', 3], ['muscular', 5], ['very muscular', 7], ['huge bodybuilder', 8]],
  },
  'skin-tone': {
    field: 'skinTone',
    defaults: { fair: -2, light: -1, 'light olive': 0, olive: 0, tan: 1, 'golden brown': 2, brown: 3, 'deep brown': 3, dark: 3 },
    written: [['fair', -2], ['light', -1], ['olive', 0], ['tan', 1], ['golden brown', 2], ['brown', 3]],
  },
  'hair-length': {
    field: 'hairLength',
    defaults: { buzzed: -4, short: -3, 'chin-length': -1, 'shoulder-length': 0, long: 2, 'very long': 4 },
    written: [['buzzed', -4], ['short', -3], ['chin-length', -1], ['shoulder-length', 0], ['long', 2], ['very long', 4]],
  },
}

interface PhraseSlider {
  /** The phrase a strength at or below `below`, or at or above `above`, adds to the prompt. */
  low?: { below: number; phrase: string }
  high: { above: number; phrase: string }
}

// No builder option says these, so a slider far enough from 0 adds a short phrase instead (resolveFacts)
const PHRASE_SLIDERS: Record<string, PhraseSlider> = {
  'hair-volume': { low: { below: -2.5, phrase: 'sleek flat hair' }, high: { above: 2.5, phrase: 'big voluminous hair' } },
  'natural-look': { high: { above: 4, phrase: 'a natural look with minimal makeup and real skin texture' } },
}

/** The builder choice a slider is linked to (it picks the nearest option), or null for one that adds a phrase instead. */
export function linkedField(addonId: string): TraitField | null {
  return TRAIT_SLIDERS[addonId]?.field ?? null
}

export function sliderAddons(model: ModelInfo): AddonInfo[] {
  return model.addons.filter((addon) => addon.kind === 'slider')
}

function nearestOption(written: TraitSlider['written'], strength: number): string {
  return written.reduce((best, option) => (Math.abs(option[1] - strength) < Math.abs(best[1] - strength) ? option : best))[0]
}

/**
 * A slider's strength for a look: the one set on it while its option still says it (an option picked since then wins), else what
 * the option says, else 0 (off).
 */
export function lookStrength(addonId: string, look: LookTraits): number {
  const set = look.strengths?.[addonId]
  const trait = TRAIT_SLIDERS[addonId]
  if (!trait) return set ?? 0
  const option = look[trait.field]
  if (set !== undefined && (option === '' || nearestOption(trait.written, set) === option)) return set
  return trait.defaults[option] ?? 0
}

/** The look with a slider moved: its strength set, and the builder's matching choice changed to the nearest option. */
export function withStrength<T extends LookTraits>(look: T, addonId: string, strength: number): T {
  const strengths = { ...look.strengths, [addonId]: strength }
  const trait = TRAIT_SLIDERS[addonId]
  return trait ? { ...look, strengths, [trait.field]: nearestOption(trait.written, strength) } : { ...look, strengths }
}

/** The look with a slider's own strength taken off, so it follows its matching choice again (or goes back to 0). */
export function withoutStrength<T extends LookTraits>(look: T, addonId: string): T {
  const strengths = Object.fromEntries(Object.entries(look.strengths ?? {}).filter(([id]) => id !== addonId))
  return { ...look, strengths }
}

/** The look with each moved slider applied, in turn. */
export function withMoved<T extends LookTraits>(look: T, moved: Strengths): T {
  return Object.entries(moved).reduce((current, [addonId, strength]) => withStrength(current, addonId, strength), look)
}

function phraseFor(slider: PhraseSlider, strength: number): string | null {
  if (slider.low && strength <= slider.low.below) return slider.low.phrase
  return strength >= slider.high.above ? slider.high.phrase : null
}

/** The phrases the look's sliders without a builder option add to the prompt. */
export function lookPhrases(look: LookTraits): string[] {
  return Object.entries(PHRASE_SLIDERS)
    .map(([addonId, slider]) => phraseFor(slider, lookStrength(addonId, look)))
    .filter((phrase): phrase is string => phrase !== null)
}

/** A JSON prompt's look, for its sliders' strengths. */
export function lookOfSpec(spec: PromptSpec): LookTraits {
  return {
    bodyType: spec.body?.type ?? '', muscles: spec.body?.muscles ?? '', skinTone: spec.appearance?.skin_tone ?? '', hairLength: spec.hair?.length ?? '',
    strengths: spec.look,
  }
}

/** The strengths a render sends: the model's downloaded sliders not at 0, kept inside each slider's range. */
export function strengthsToSend(model: ModelInfo, strengthOf: (addonId: string) => number, status: Loadable<ModelStatusReport>): Strengths {
  const downloaded = (id: string) => status.status === 'settled' && status.value.models[id]?.status === 'ready'
  const entries = sliderAddons(model).flatMap((addon) => {
    if (!addon.slider || !downloaded(addon.id)) return []
    const strength = Math.min(Math.max(strengthOf(addon.id), addon.slider.minimum), addon.slider.maximum)
    return strength === 0 ? [] : [[addon.id, strength] as const]
  })
  return Object.fromEntries(entries)
}

/** Stored strengths, kept to numbers; anything else stored under the key is dropped. */
export function parseStrengths(value: unknown): Strengths {
  if (typeof value !== 'object' || value === null) return {}
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1])))
}
