// The user's own clothes (custom_clothes.json), set once the catalog loads (lib/customClothes) and offered by the
// outfit menus like built-in items: in the top/bottom fields, or the lingerie ones for an adult item.
import type { CustomGarmentData } from '../../../types'
import { includesMan, includesWoman } from '../rules'

export type CustomSlot = CustomGarmentData['slot']

let clothes: readonly CustomGarmentData[] = []
let problems: readonly string[] = []

export function setCustomClothes(items: readonly CustomGarmentData[], found: readonly string[]): void {
  clothes = items
  problems = found
}

/** Why entries of custom_clothes.json were left out, for the builder to show. */
export const customClothesProblems = (): readonly string[] => problems

export const customGarment = (value: string): CustomGarmentData | undefined => clothes.find((garment) => garment.value === value)

/** A dress or jumpsuit: worn on top, it also covers the bottom. */
export const coversBoth = (value: string): boolean => customGarment(value)?.covers === 'both'

const fitsWearer = (who: string) => (garment: CustomGarmentData) =>
  garment.for === 'anyone' || (garment.for === 'woman' ? includesWoman(who) : includesMan(who))

/** The custom items of a slot this subject may wear: the adult ones (worn as lingerie) or the others. */
export function customOptions(slot: CustomSlot, who: string, adult: boolean): CustomGarmentData[] {
  return clothes.filter((garment) => garment.slot === slot && garment.adult === adult).filter(fitsWearer(who))
}

export const customValues = (slot: CustomSlot, adult: boolean): string[] =>
  clothes.filter((garment) => garment.slot === slot && garment.adult === adult).map((garment) => garment.value)

export const isCustom = (value: string): boolean => customGarment(value) !== undefined
