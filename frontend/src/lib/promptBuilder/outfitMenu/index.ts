// The Outfit step's Top and Bottom menus. Each holds everyday clothes, gym clothes, lingerie and swimwear in one list,
// so one item is worn there and nothing hides under it; behind the scenes an everyday or gym item goes in the
// top/bottom field and lingerie or swimwear in lingerieTop/lingerieBottom, which the nudity levels treat differently.
import { t, type MessageKey } from '../../../i18n'
import type { CustomGarmentData } from '../../../types'
import type { OutfitState } from '../build'
import { NOT_SET, RANDOM } from '../constants'
import { BOTTOMS, TOPS } from '../data'
import { fitnessClothing } from '../fitness'
import { coversBoth, customOptions, isCustom } from '../customClothes'
import { allIntimates, intimateOptions, isSwimwear } from '../intimates'
import { alwaysClothed, isAdultMode, isSafeMode, type BuilderMode } from '../modes'

export type BodyArea = 'top' | 'bottom'

type Field = keyof Omit<OutfitState, 'accessories' | 'details'>

const FIELDS: Readonly<Record<BodyArea, { clothes: Field; clothesColor: Field; intimate: 'lingerieTop' | 'lingerieBottom'; intimateColor: Field }>> = {
  top: { clothes: 'top', clothesColor: 'topColor', intimate: 'lingerieTop', intimateColor: 'lingerieTopColor' },
  bottom: { clothes: 'bottom', clothesColor: 'bottomColor', intimate: 'lingerieBottom', intimateColor: 'lingerieBottomColor' },
}

export interface MenuGroup {
  /** As the menu shows it: a built-in group translated, a custom one as custom_clothes.json names it. */
  label: string
  options: readonly string[]
}

const BUILT_IN_GROUPS: Readonly<Record<string, MessageKey>> = {
  everyday: 'builder.groupEveryday', gym: 'builder.groupGym', lingerie: 'builder.groupLingerie', swimwear: 'builder.groupSwimwear',
}

/** The custom items offered here: the adult ones (worn as lingerie) only outside the safe purposes. */
function customHere(area: BodyArea, who: string, mode: BuilderMode): CustomGarmentData[] {
  return [...customOptions(area, who, false), ...(isSafeMode(mode) ? [] : customOptions(area, who, true))]
}

/**
 * The menu's groups for this subject and purpose: lingerie and swimwear only outside the safe purposes, and first in
 * one that keeps everyone clothed (Faceless), where they are what is worn. A custom item joins the built-in group it
 * names, or a group of its own after them.
 */
export function areaGroups(area: BodyArea, wearer: { who: string; age: string }, mode: BuilderMode): MenuGroup[] {
  const custom = customHere(area, wearer.who, mode)
  const inGroup = (key: string) => custom.filter((garment) => garment.group.toLowerCase() === key).map((garment) => garment.value)
  const builtIn = (key: string, options: readonly string[]): MenuGroup => ({ label: t(BUILT_IN_GROUPS[key]), options: [...options, ...inGroup(key)] })
  const intimate = isSafeMode(mode) ? [] : intimateOptions(FIELDS[area].intimate, wearer, mode).filter((item) => !isCustom(item))
  const clothes = [builtIn('everyday', area === 'top' ? TOPS : BOTTOMS), builtIn('gym', fitnessClothing(area, wearer))]
  const intimates = [builtIn('lingerie', intimate.filter((item) => !isSwimwear(item))), builtIn('swimwear', intimate.filter(isSwimwear))]
  const ordered = alwaysClothed(mode) ? [...intimates, ...clothes] : [...clothes, ...intimates]
  return [...ordered, ...customGroups(custom)].filter((group) => group.options.length > 0)
}

function customGroups(custom: readonly CustomGarmentData[]): MenuGroup[] {
  const names = [...new Set(custom.map((garment) => garment.group).filter((name) => !(name.toLowerCase() in BUILT_IN_GROUPS)))]
  return names.map((name) => ({ label: name, options: custom.filter((garment) => garment.group === name).map((garment) => garment.value) }))
}

/** What the menu shows: the lingerie or swimwear item when there is one, else the clothes item, with its colour. */
export function areaChoice(area: BodyArea, outfit: OutfitState): { item: string; color: string } {
  const fields = FIELDS[area]
  const intimate = outfit[fields.intimate] !== NOT_SET
  return intimate ? { item: outfit[fields.intimate], color: outfit[fields.intimateColor] } : { item: outfit[fields.clothes], color: outfit[fields.clothesColor] }
}

/** Wearing an item clears the other field, keeping the colour chosen; Random picks lingerie or swimwear in an 18+ purpose. */
export function wearItem(area: BodyArea, outfit: OutfitState, item: string, mode: BuilderMode): Partial<OutfitState> {
  const fields = FIELDS[area]
  const isIntimate = allIntimates(fields.intimate).includes(item) || (item === RANDOM && isAdultMode(mode))
  const [field, colorField, other, otherColor] = isIntimate
    ? [fields.intimate, fields.intimateColor, fields.clothes, fields.clothesColor]
    : [fields.clothes, fields.clothesColor, fields.intimate, fields.intimateColor]
  const worn = { [field]: item, [colorField]: areaChoice(area, outfit).color, [other]: NOT_SET, [otherColor]: NOT_SET }
  // A dress covers the bottom too, so nothing is worn there
  const covered = area === 'top' && coversBoth(item)
  return covered ? { ...worn, bottom: NOT_SET, bottomColor: NOT_SET, lingerieBottom: NOT_SET, lingerieBottomColor: NOT_SET } : worn
}

export function colourItem(area: BodyArea, outfit: OutfitState, color: string): Partial<OutfitState> {
  const fields = FIELDS[area]
  return { [outfit[fields.intimate] !== NOT_SET ? fields.intimateColor : fields.clothesColor]: color }
}
