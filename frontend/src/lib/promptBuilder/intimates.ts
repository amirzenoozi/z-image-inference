// Lingerie, underwear and swimwear: the Lingerie & swimwear rows, offered only outside the safe purposes. Each item
// has a full description, so a paragraph prompt says how it is cut and how it fits, not just its name; a tag prompt
// keeps the short name. See-through items are offered only where a purpose lets nudity be chosen.
import type { BuilderState } from './build'
import { NOT_SET } from './constants'
import { LINGERIE_BOTTOMS, LINGERIE_TOPS } from './data'
import { isAdultMode, showsStep, type BuilderMode } from './modes'
import { pick } from './random'
import { includesMan, includesWoman } from './rules'

type Wearer = Pick<BuilderState, 'who'>
type For = 'woman' | 'man'

const SWIM_TOPS: Readonly<Record<string, For>> = {
  'String bikini top': 'woman', 'Triangle bikini top': 'woman', 'Bandeau bikini top': 'woman', 'Underwire bikini top': 'woman',
}
// They cover top and bottom, so Surprise me leaves the bottom off
const ONE_PIECES: Readonly<Record<string, For>> = {
  'Plunging one-piece swimsuit': 'woman', 'Cut-out one-piece swimsuit': 'woman', 'High-leg one-piece swimsuit': 'woman',
}
const SWIM_BOTTOMS: Readonly<Record<string, For>> = {
  'String bikini bottoms': 'woman', 'Brazilian bikini bottoms': 'woman', 'High-cut bikini bottoms': 'woman', 'Thong bikini bottoms': 'woman',
  'Side-tie bikini bottoms': 'woman', 'Swim briefs': 'man', 'Swim trunks': 'man',
}
const MORE_LINGERIE_TOPS: Readonly<Record<string, For>> = { 'Lace bodysuit': 'woman', 'Satin slip': 'woman' }
const MORE_LINGERIE_BOTTOMS: Readonly<Record<string, For>> = {
  'Lace garter set': 'woman', 'Boxer briefs': 'man', 'Low-rise briefs': 'man', Trunks: 'man',
}

/** Items that show what clothes would cover; left out wherever nudity can't be chosen. */
const SEE_THROUGH: ReadonlySet<string> = new Set(['Sheer bra', 'Sheer panties', 'Bodystocking', 'Cage bra', 'Harness bra'])

export const GARMENT_DETAILS: Readonly<Record<string, string>> = {
  'Babydoll top': 'babydoll top with a fitted lace bust and a floaty chiffon hem',
  'Balconette bra': 'balconette bra with half-cups and wide-set straps that lift and frame the bust',
  Bralette: 'soft unlined bralette with thin straps and a deep neckline',
  'Cage bra': 'cage bra with strappy cut-out bands across the chest',
  'Harness bra': 'harness bra with thin straps crossing over the chest and shoulders',
  'Lace bra': 'lace bra with scalloped edges and delicate floral detail',
  'Lace bralette': 'lace bralette with scalloped trim and thin straps',
  'Lace bustier': 'lace bustier with boning that cinches the waist and lifts the bust',
  'Lingerie corset': 'lingerie corset laced tight at the back to shape an hourglass waist',
  'Longline bra': 'longline bra with a deep band that hugs the ribs',
  'Overbust corset': 'overbust corset with structured boning and a sweetheart neckline',
  'Plunge bra': 'plunge bra with a deep V that shows cleavage',
  'Push-up bra': 'push-up bra with padded cups that lift into full cleavage',
  'Satin bra': 'satin bra with a glossy sheen and thin straps',
  'Sheer bra': 'sheer mesh bra with fine trim',
  'Strapless bra': 'strapless bra with smooth moulded cups across bare shoulders',
  'Teddy lingerie': 'lace teddy with a plunging bodice and high-cut legs',
  'Triangle bra': 'triangle bra with soft unpadded cups and string ties',
  'Lace bodysuit': 'lace bodysuit with a plunging neckline and high-cut legs',
  'Satin slip': 'satin slip with thin straps and a lace-trimmed neckline that skims the body',
  'Bikini briefs': 'low-rise bikini briefs',
  Bodystocking: 'fishnet bodystocking covering the body from the shoulders to the toes',
  'Cheeky briefs': 'cheeky briefs cut high to show the curve of the buttocks',
  'Fishnet stockings': 'fishnet stockings that reach the upper thigh',
  'Fishnet tights': 'fishnet tights stretched over the legs',
  'G-string': 'G-string with a tiny front panel and a thin string at the back',
  'Garter belt': 'garter belt at the waist with straps clipped to stockings',
  'High-waisted panties': 'high-waisted panties that sit at the natural waist',
  'Hold-up stockings': 'hold-up stockings with wide lace bands at the thigh',
  'Lace panties': 'lace panties with scalloped edges',
  'Satin panties': 'satin panties with a glossy finish',
  'Sheer panties': 'sheer mesh panties',
  'Sheer tights': 'sheer tights with a soft sheen on the legs',
  Stockings: 'thigh-high stockings with a seam up the back',
  'Strappy panties': 'strappy panties with thin bands across the hips',
  'Suspender belt': 'suspender belt with straps holding up stockings',
  'Thigh garters': 'lace garters around the upper thighs',
  'Thigh-highs': 'thigh-highs with lace tops',
  Thong: 'thong with a narrow back',
  'Lace garter set': 'lace garter set of high-waisted panties with garter straps clipped to stockings',
  'Boxer briefs': 'fitted boxer briefs that hug the thighs',
  'Low-rise briefs': 'low-rise briefs with a contoured pouch',
  Trunks: 'short trunks with a wide waistband',
  'String bikini top': 'string bikini top with small triangle cups tied at the neck and back',
  'Triangle bikini top': 'triangle bikini top with slim adjustable straps',
  'Bandeau bikini top': 'strapless bandeau bikini top wrapped snugly across the bust',
  'Underwire bikini top': 'underwire bikini top with structured cups that lift the bust',
  'Plunging one-piece swimsuit': 'plunging one-piece swimsuit with a neckline cut to the navel',
  'Cut-out one-piece swimsuit': 'one-piece swimsuit with cut-outs at the waist',
  'High-leg one-piece swimsuit': 'high-leg one-piece swimsuit cut high over the hips',
  'String bikini bottoms': 'string bikini bottoms tied at the hips',
  'Brazilian bikini bottoms': 'Brazilian-cut bikini bottoms that show the curve of the buttocks',
  'High-cut bikini bottoms': 'high-cut bikini bottoms that lengthen the legs',
  'Thong bikini bottoms': 'thong bikini bottoms with a narrow back',
  'Side-tie bikini bottoms': 'side-tie bikini bottoms with bows at the hips',
  'Swim briefs': 'swim briefs cut low on the hips',
  'Swim trunks': 'swim trunks resting low on the hips',
  'Silk robe': 'silk robe left loosely belted',
}

export type IntimateSlot = 'lingerieTop' | 'lingerieBottom'

const fits = (wearer: Wearer) => ([, wearerFor]: [string, For]) => (wearerFor === 'woman' ? includesWoman(wearer.who) : includesMan(wearer.who))
const offered = (items: Readonly<Record<string, For>>, wearer: Wearer) => Object.entries(items).filter(fits(wearer)).map(([item]) => item)

/** Whether the purpose lets nudity be chosen, so an item that shows what clothes would cover may be offered. */
const nudityPossible = (mode: BuilderMode) => isAdultMode(mode) && showsStep(mode, 'intimacy')

/** The lingerie and swimwear this subject may wear in a slot under this purpose. */
export function intimateOptions(slot: IntimateSlot, wearer: Wearer, mode: BuilderMode): string[] {
  const top = slot === 'lingerieTop'
  // The original list is bras, panties and stockings
  const classic = includesWoman(wearer.who) ? (top ? LINGERIE_TOPS : LINGERIE_BOTTOMS) : []
  const added = top ? { ...MORE_LINGERIE_TOPS, ...SWIM_TOPS, ...ONE_PIECES } : { ...MORE_LINGERIE_BOTTOMS, ...SWIM_BOTTOMS }
  const all = [...classic, ...offered(added, wearer)]
  return nudityPossible(mode) ? all : all.filter((item) => !SEE_THROUGH.has(item))
}

/** Every lingerie and swimwear item, for translations and for checking a JSON prompt. */
export const ALL_INTIMATES: Readonly<Record<IntimateSlot, readonly string[]>> = {
  lingerieTop: [...LINGERIE_TOPS, ...Object.keys(MORE_LINGERIE_TOPS), ...Object.keys(SWIM_TOPS), ...Object.keys(ONE_PIECES)],
  lingerieBottom: [...LINGERIE_BOTTOMS, ...Object.keys(MORE_LINGERIE_BOTTOMS), ...Object.keys(SWIM_BOTTOMS)],
}

/** Items offered only to some subjects or purposes, so a kept choice may no longer fit and is left out of the prompt. */
export const CONDITIONAL_INTIMATES: ReadonlySet<string> = new Set([
  ...SEE_THROUGH, ...Object.keys({ ...MORE_LINGERIE_TOPS, ...SWIM_TOPS, ...ONE_PIECES, ...MORE_LINGERIE_BOTTOMS, ...SWIM_BOTTOMS }),
])

const SWIM_ITEMS: ReadonlySet<string> = new Set(Object.keys({ ...SWIM_TOPS, ...ONE_PIECES, ...SWIM_BOTTOMS }))

/**
 * A matching set for Surprise me: all lingerie or all swimwear, nothing under a one-piece, and only a bottom for a
 * man, since the tops are cut for women.
 */
export function intimateSet(wearer: Wearer, mode: BuilderMode, seed: number): Pick<BuilderState['outfit'], IntimateSlot> {
  const swim = pick(['lingerie', 'swim'], seed, 'intimateKind') === 'swim'
  const ofKind = (slot: IntimateSlot) => intimateOptions(slot, wearer, mode).filter((item) => SWIM_ITEMS.has(item) === swim)
  const tops = includesWoman(wearer.who) ? ofKind('lingerieTop') : []
  const lingerieTop = tops.length ? pick(tops, seed, 'lingerieTop') : NOT_SET
  const bottoms = ofKind('lingerieBottom')
  const lingerieBottom = lingerieTop in ONE_PIECES || !bottoms.length ? NOT_SET : pick(bottoms, seed, 'lingerieBottom')
  return { lingerieTop, lingerieBottom }
}
