// The Outfit step's Top and Bottom menus. Each holds everyday clothes, gym clothes, lingerie and swimwear in one list,
// so one item is worn there and nothing hides under it; behind the scenes an everyday or gym item goes in the
// top/bottom field and lingerie or swimwear in lingerieTop/lingerieBottom, which the nudity levels treat differently.
import type { MessageKey } from '../../i18n'
import type { OutfitState } from './build'
import { NOT_SET, RANDOM } from './constants'
import { BOTTOMS, TOPS } from './data'
import { fitnessClothing } from './fitness'
import { ALL_INTIMATES, intimateOptions, isSwimwear } from './intimates'
import { alwaysClothed, isAdultMode, isSafeMode, type BuilderMode } from './modes'

export type BodyArea = 'top' | 'bottom'

type Field = keyof Omit<OutfitState, 'accessories' | 'details'>

const FIELDS: Readonly<Record<BodyArea, { clothes: Field; clothesColor: Field; intimate: 'lingerieTop' | 'lingerieBottom'; intimateColor: Field }>> = {
  top: { clothes: 'top', clothesColor: 'topColor', intimate: 'lingerieTop', intimateColor: 'lingerieTopColor' },
  bottom: { clothes: 'bottom', clothesColor: 'bottomColor', intimate: 'lingerieBottom', intimateColor: 'lingerieBottomColor' },
}

export interface MenuGroup {
  label: MessageKey
  options: readonly string[]
}

/**
 * The menu's groups for this subject and purpose: lingerie and swimwear only outside the safe purposes, and first in
 * one that keeps everyone clothed (Faceless), where they are what is worn.
 */
export function areaGroups(area: BodyArea, wearer: { who: string; age: string }, mode: BuilderMode): MenuGroup[] {
  const clothes: MenuGroup[] = [
    { label: 'builder.groupEveryday', options: area === 'top' ? TOPS : BOTTOMS },
    { label: 'builder.groupGym', options: fitnessClothing(area, wearer) },
  ]
  const intimate = isSafeMode(mode) ? [] : intimateOptions(FIELDS[area].intimate, wearer, mode)
  const intimates: MenuGroup[] = [
    { label: 'builder.groupLingerie', options: intimate.filter((item) => !isSwimwear(item)) },
    { label: 'builder.groupSwimwear', options: intimate.filter(isSwimwear) },
  ]
  const ordered = alwaysClothed(mode) ? [...intimates, ...clothes] : [...clothes, ...intimates]
  return ordered.filter((group) => group.options.length > 0)
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
  const isIntimate = ALL_INTIMATES[fields.intimate].includes(item) || (item === RANDOM && isAdultMode(mode))
  const [field, colorField, other, otherColor] = isIntimate
    ? [fields.intimate, fields.intimateColor, fields.clothes, fields.clothesColor]
    : [fields.clothes, fields.clothesColor, fields.intimate, fields.intimateColor]
  return { [field]: item, [colorField]: areaChoice(area, outfit).color, [other]: NOT_SET, [otherColor]: NOT_SET }
}

export function colourItem(area: BodyArea, outfit: OutfitState, color: string): Partial<OutfitState> {
  const fields = FIELDS[area]
  return { [outfit[fields.intimate] !== NOT_SET ? fields.intimateColor : fields.clothesColor]: color }
}
