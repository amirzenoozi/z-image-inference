// Puts the catalog's custom_clothes.json entries into the prompt builder: each checked against the built-in options
// (a value of their own) and the age safeguard, then registered with its menu title.
import { setCustomLabels, t } from '../../i18n'
import type { Catalog, CustomGarmentData } from '../../types'
import { minorWordIn } from '../promptBuilder/build'
import { CHOICE_OPTIONS } from '../promptBuilder/choices'
import { setCustomClothes } from '../promptBuilder/customClothes'
import { ACCESSORIES, BOTTOMS, OUTERWEAR, SHOES, TOPS } from '../promptBuilder/data'
import { LOUNGE_OUTERWEAR } from '../promptBuilder/faceless'
import { ALL_FITNESS_OPTIONS } from '../promptBuilder/fitness'
import { ALL_INTIMATES, EVERY_ACCESSORY } from '../promptBuilder/intimates'

function builtInValues(): ReadonlySet<string> {
  const lists = [TOPS, BOTTOMS, OUTERWEAR, SHOES, ACCESSORIES, LOUNGE_OUTERWEAR, ALL_FITNESS_OPTIONS, EVERY_ACCESSORY, ...Object.values(ALL_INTIMATES), ...Object.values(CHOICE_OPTIONS)]
  return new Set(lists.flat().map((value) => value.toLowerCase()))
}

/** Why an entry can't be offered, or null. */
function problemOf(garment: CustomGarmentData, builtIn: ReadonlySet<string>): string | null {
  if (builtIn.has(garment.value.toLowerCase())) return t('builder.customBuiltIn', { value: garment.value })
  const term = minorWordIn([garment.value, garment.prompt, garment.tags].join(' '))
  return term ? t('builder.customMinor', { value: garment.value, term }) : null
}

/** Registers the catalog's custom clothes; the ones left out are named, with the server's own problems, in the builder. */
export function applyCustomClothes(catalog: Pick<Catalog, 'custom_clothes' | 'custom_clothes_problems'>): void {
  const builtIn = builtInValues()
  const checked = catalog.custom_clothes.map((garment) => ({ garment, problem: problemOf(garment, builtIn) }))
  const items = checked.filter(({ problem }) => problem === null).map(({ garment }) => garment)
  const problems = [...catalog.custom_clothes_problems, ...checked.flatMap(({ problem }) => (problem ? [problem] : []))]
  setCustomClothes(items, problems)
  setCustomLabels(Object.fromEntries(items.map((garment) => [garment.value, garment.title])))
}
