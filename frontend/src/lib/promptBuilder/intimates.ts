// Lingerie, underwear and swimwear: the Lingerie & swimwear rows, offered only outside the safe purposes. Each item
// has a full description, so a paragraph prompt says how it is cut and how it fits, not just its name; a tag prompt
// keeps the short name. Items that leave bare or show through are offered only where a purpose lets nudity be chosen.
import type { BuilderState } from './build'
import { NOT_SET } from './constants'
import { LINGERIE_BOTTOMS, LINGERIE_TOPS } from './data'
import { ALL_ACCESSORIES } from './fitness'
import { isAdultMode, isSafeMode, showsStep, type BuilderMode } from './modes'
import { pick } from './random'
import { includesMan, includesWoman } from './rules'

type Wearer = Pick<BuilderState, 'who'>
type For = 'woman' | 'man'

const SWIM_TOPS: Readonly<Record<string, For>> = {
  'String bikini top': 'woman', 'Triangle bikini top': 'woman', 'Bandeau bikini top': 'woman', 'Underwire bikini top': 'woman',
  'Micro bikini top': 'woman', 'Ring bikini top': 'woman', 'Halter bikini top': 'woman', 'Push-up bikini top': 'woman', 'Crochet bikini top': 'woman',
  'High-neck bikini top': 'woman', 'Wet-look bikini top': 'woman',
}
// They cover top and bottom, so Surprise me leaves the bottom off
const ONE_PIECES: Readonly<Record<string, For>> = {
  'Plunging one-piece swimsuit': 'woman', 'Cut-out one-piece swimsuit': 'woman', 'High-leg one-piece swimsuit': 'woman', 'Sling bikini': 'woman',
  Monokini: 'woman', 'Thong one-piece swimsuit': 'woman', 'Backless one-piece swimsuit': 'woman', 'Lace-up one-piece swimsuit': 'woman',
}
const SWIM_BOTTOMS: Readonly<Record<string, For>> = {
  'String bikini bottoms': 'woman', 'Brazilian bikini bottoms': 'woman', 'High-cut bikini bottoms': 'woman', 'Thong bikini bottoms': 'woman',
  'Side-tie bikini bottoms': 'woman', 'Micro bikini bottoms': 'woman', 'Tanga bikini bottoms': 'woman', 'G-string bikini bottoms': 'woman',
  'Ring bikini bottoms': 'woman', 'Scrunch-butt bikini bottoms': 'woman', 'Cheeky bikini bottoms': 'woman', 'High-waisted bikini bottoms': 'woman',
  'Swim briefs': 'man', 'Swim trunks': 'man', 'Micro swim briefs': 'man', 'Square-cut swim trunks': 'man', 'Swim thong': 'man',
}
const MORE_LINGERIE_TOPS: Readonly<Record<string, For>> = {
  'Lace bodysuit': 'woman', 'Satin slip': 'woman', 'Waist cincher corset': 'woman', 'Underbust corset with garters': 'woman', 'Satin corset top': 'woman',
  'Leather corset': 'woman', 'PVC corset': 'woman', 'Latex corset': 'woman', 'Lace-up corset bodysuit': 'woman', 'Moulded T-shirt bra': 'woman',
  'Demi-cup bra': 'woman', 'Bandeau bra': 'woman', 'Lace bandeau': 'woman', 'Latex bra': 'woman', 'Bustier crop top': 'woman',
  'Cut-out bodysuit': 'woman', 'Halter bodysuit': 'woman', 'Thong bodysuit': 'woman', 'Garter bodysuit': 'woman', 'Crop cami': 'woman',
  'Mini tube top': 'woman', 'Bralette crop top': 'woman', Chemise: 'woman', 'Babydoll with a thigh slit': 'woman',
  'Nipple pasties': 'woman', 'Shelf bra (cupless)': 'woman', 'Quarter-cup bra': 'woman', 'Open-cup bra': 'woman',
  'Unbuttoned shirt': 'man', 'Cropped tank top': 'man', 'Sleeveless compression top': 'man', 'Leather chest harness': 'man', 'Mesh tank top': 'man',
}
const MORE_LINGERIE_BOTTOMS: Readonly<Record<string, For>> = {
  'Lace garter set': 'woman', 'Micro thong': 'woman', 'Cut-out thong': 'woman', 'High-leg thong': 'woman', 'Tanga briefs': 'woman',
  'Ruffle panties': 'woman', 'Booty shorts': 'woman', 'Latex shorts': 'woman', 'Garter skirt': 'woman', 'Crotchless panties': 'woman',
  'Boxer briefs': 'man', 'Low-rise briefs': 'man', Trunks: 'man', Jockstrap: 'man', 'Pouch briefs': 'man', 'Silk boxers': 'man',
}

/** Worn over lingerie, so offered with the accessories only outside the safe purposes (a leather harness and a body chain are everyday ones). */
export const LINGERIE_ACCESSORIES: readonly string[] = ['Thigh harness']

/**
 * Items that leave bare or show what clothes would cover (see-through, cupless, pasties, crotchless); offered only
 * where a purpose lets nudity be chosen.
 */
const REVEALING: ReadonlySet<string> = new Set([
  'Sheer bra', 'Sheer panties', 'Bodystocking', 'Cage bra', 'Harness bra', 'Nipple pasties', 'Shelf bra (cupless)', 'Quarter-cup bra', 'Open-cup bra',
  'Crotchless panties',
])

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
  'Waist cincher corset': 'waist cincher corset pulled tight under the bust to carve a tiny waist',
  'Underbust corset with garters': 'underbust corset with garter straps hanging down the thighs, cinching the waist and framing the bust',
  'Satin corset top': 'satin corset top with boning and a sweetheart neckline that pushes the bust up',
  'Leather corset': 'leather corset laced tight to an hourglass waist that pushes the bust into deep cleavage',
  'PVC corset': 'glossy PVC corset laced tight at the waist with a high shine',
  'Latex corset': 'latex corset with a wet-look shine moulded tight to the waist and bust',
  'Lace-up corset bodysuit': 'corset bodysuit laced up the front with high-cut legs and a thong back',
  'Moulded T-shirt bra': 'moulded T-shirt bra with smooth seamless cups that round out the bust',
  'Demi-cup bra': 'demi-cup bra cut low across the top of the bust',
  'Bandeau bra': 'strapless bandeau bra stretched tight across the bust',
  'Lace bandeau': 'lace bandeau wrapped low across the bust',
  'Latex bra': 'latex bra with a glossy wet-look shine',
  'Bustier crop top': 'bustier crop top with boning that lifts the bust and bares the midriff',
  'Cut-out bodysuit': 'bodysuit with bold cut-outs at the waist and under the bust',
  'Halter bodysuit': 'halter bodysuit with an open back and high-cut legs',
  'Thong bodysuit': 'thong bodysuit with a plunging neckline and a thong back',
  'Garter bodysuit': 'lace bodysuit with garter straps clipped to stockings',
  'Crop cami': 'silky crop cami with thin straps ending above the navel',
  'Mini tube top': 'mini tube top stretched tight across the bust with the midriff bare',
  'Bralette crop top': 'bralette crop top with a plunging neckline',
  Chemise: 'short satin chemise with lace trim skimming the upper thighs',
  'Babydoll with a thigh slit': 'babydoll with a fitted bust and a hem slit high up the thigh',
  'Nipple pasties': 'nipple pasties as the only cover on the bust',
  'Shelf bra (cupless)': 'cupless shelf bra framing and lifting the bare bust',
  'Quarter-cup bra': 'quarter-cup bra lifting the bust from below and leaving the nipples bare',
  'Open-cup bra': 'open-cup bra with strappy frames around the bare bust',
  'Micro thong': 'micro thong with a tiny front triangle and a string back',
  'Cut-out thong': 'thong with strappy cut-outs over the hips',
  'High-leg thong': 'high-leg thong cut high over the hip bones',
  'Tanga briefs': 'tanga briefs with narrow sides and a cheeky back',
  'Ruffle panties': 'ruffle panties with frilled lace across the buttocks',
  'Booty shorts': 'tiny booty shorts riding up to show the curve of the buttocks',
  'Latex shorts': 'glossy latex hot pants moulded to the hips',
  'Garter skirt': 'short lace garter skirt with straps clipped to stockings',
  'Crotchless panties': 'crotchless lace panties open at the front',
  Jockstrap: 'jockstrap with a snug pouch and straps framing the bare buttocks',
  'Pouch briefs': 'low-cut briefs with a contoured pouch',
  'Silk boxers': 'loose silk boxers sitting low on the hips',
  'Micro bikini top': 'micro bikini top with tiny triangle cups barely covering the bust',
  'Ring bikini top': 'bikini top joined by a metal ring at the centre of the bust',
  'Halter bikini top': 'halter bikini top tied behind the neck',
  'Push-up bikini top': 'push-up bikini top with padded cups that lift the bust',
  'Crochet bikini top': 'lined crochet bikini top in an open knit',
  'High-neck bikini top': 'high-neck bikini top with a keyhole cut-out over the cleavage',
  'Wet-look bikini top': 'metallic bikini top with a liquid wet-look shine',
  'Sling bikini': 'sling bikini of two thin straps running from the shoulders down to a tiny bottom',
  Monokini: 'monokini with wide cut-outs at the sides joined by a ring at the front',
  'Thong one-piece swimsuit': 'one-piece swimsuit with a thong back and a plunging front',
  'Backless one-piece swimsuit': 'one-piece swimsuit open down to the small of the back',
  'Lace-up one-piece swimsuit': 'one-piece swimsuit laced up the front to a deep neckline',
  'Micro bikini bottoms': 'micro bikini bottoms with a tiny front and a string back',
  'Tanga bikini bottoms': 'tanga bikini bottoms with narrow sides and a cheeky cut',
  'G-string bikini bottoms': 'G-string bikini bottoms with a thin string at the back',
  'Ring bikini bottoms': 'bikini bottoms with metal rings at the hips',
  'Scrunch-butt bikini bottoms': 'scrunch-butt bikini bottoms ruched to lift and shape the buttocks',
  'Cheeky bikini bottoms': 'cheeky bikini bottoms that show the lower curve of the buttocks',
  'High-waisted bikini bottoms': 'high-waisted bikini bottoms cut high on the legs',
  'Micro swim briefs': 'micro swim briefs cut very low and tight',
  'Square-cut swim trunks': 'square-cut swim trunks hugging the thighs',
  'Swim thong': 'swim thong with a snug pouch and a thong back',
  Sarong: 'sarong knotted low on the hips',
  'Crochet cover-up': 'crochet beach cover-up over the swimwear',
  'Leather harness': 'leather harness strapped across the chest and waist',
  'Thigh harness': 'leather thigh harness buckled around one thigh',
  'Body chain': 'delicate body chain draped over the hips and waist',
  'Unbuttoned shirt': 'shirt hanging fully unbuttoned and open over the bare chest',
  'Cropped tank top': 'cropped tank top ending above the abs',
  'Sleeveless compression top': 'skin-tight sleeveless compression top hugging the chest and arms',
  'Leather chest harness': 'leather chest harness strapped across the bare chest',
  'Mesh tank top': 'mesh tank top with the chest showing through',
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
  return nudityPossible(mode) ? all : all.filter((item) => !REVEALING.has(item))
}

/** Every lingerie and swimwear item, for translations and for checking a JSON prompt. */
export const ALL_INTIMATES: Readonly<Record<IntimateSlot, readonly string[]>> = {
  lingerieTop: [...LINGERIE_TOPS, ...Object.keys(MORE_LINGERIE_TOPS), ...Object.keys(SWIM_TOPS), ...Object.keys(ONE_PIECES)],
  lingerieBottom: [...LINGERIE_BOTTOMS, ...Object.keys(MORE_LINGERIE_BOTTOMS), ...Object.keys(SWIM_BOTTOMS)],
}

/** Items offered only to some subjects or purposes, so a kept choice may no longer fit and is left out of the prompt. */
export const CONDITIONAL_INTIMATES: ReadonlySet<string> = new Set([
  ...REVEALING, ...Object.keys({ ...MORE_LINGERIE_TOPS, ...SWIM_TOPS, ...ONE_PIECES, ...MORE_LINGERIE_BOTTOMS, ...SWIM_BOTTOMS }),
])

const SWIM_ITEMS: ReadonlySet<string> = new Set(Object.keys({ ...SWIM_TOPS, ...ONE_PIECES, ...SWIM_BOTTOMS }))

export const isSwimwear = (item: string): boolean => SWIM_ITEMS.has(item)

/**
 * A matching set for Surprise me: all lingerie or all swimwear, nothing under a one-piece, and for a man a spicy top
 * about half the time (never at the beach, where he is bare-chested).
 */
export function intimateSet(wearer: Wearer, mode: BuilderMode, seed: number): Pick<BuilderState['outfit'], IntimateSlot> {
  const swim = pick(['lingerie', 'swim'], seed, 'intimateKind') === 'swim'
  const ofKind = (slot: IntimateSlot) => intimateOptions(slot, wearer, mode).filter((item) => SWIM_ITEMS.has(item) === swim)
  const tops = ofKind('lingerieTop')
  // A woman always has a top; a man goes bare-chested about half the time
  const bareChested = !includesWoman(wearer.who) && pick(['bare', 'top'], seed, 'bareChested') === 'bare'
  const lingerieTop = tops.length && !bareChested ? pick(tops, seed, 'lingerieTop') : NOT_SET
  const bottoms = ofKind('lingerieBottom')
  const lingerieBottom = lingerieTop in ONE_PIECES || !bottoms.length ? NOT_SET : pick(bottoms, seed, 'lingerieBottom')
  return { lingerieTop, lingerieBottom }
}

/** The accessories under this purpose: the lingerie ones (harnesses, a body chain) only outside the safe purposes. */
export function accessoryOptions(mode: BuilderMode): readonly string[] {
  return isSafeMode(mode) ? ALL_ACCESSORIES : [...ALL_ACCESSORIES, ...LINGERIE_ACCESSORIES]
}

/** Every accessory any purpose offers, for translations and for checking a JSON prompt. */
export const EVERY_ACCESSORY: readonly string[] = [...ALL_ACCESSORIES, ...LINGERIE_ACCESSORIES]
