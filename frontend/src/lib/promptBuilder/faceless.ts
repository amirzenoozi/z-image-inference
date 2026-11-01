// Poses and framings for the Faceless purpose: the picture starts below the chin, so each one is written out to keep
// the face out of frame and the body, the curves and the clothes in it.
import { REALISM_DETAILS } from './extraData'
import type { BuilderMode } from './modes'

/** Body-led poses, offered in the 18+ purposes. */
export const FACELESS_POSES: Readonly<Record<string, string>> = {
  'kneeling on the bed, back arched': 'kneeling on the bed with the back arched and the hips pushed back',
  'lying on the side, hip curve': 'lying on the side, one leg bent forward to show the curve of the hip and waist',
  'hands at the waistband': 'standing with the thumbs hooked into the waistband at the hips',
  'sitting on the bed edge, legs crossed': 'sitting on the edge of the bed with the legs crossed, hands resting on the thighs',
  'leaning on a doorframe': 'leaning a shoulder on a doorframe, one knee bent and the hip pushed out',
  'mirror selfie, phone hiding the face': 'taking a mirror selfie with the phone held up to hide the face',
  'stepping out of the shower in a towel': 'stepping out of the shower, a towel held against the body, water drops on the skin',
  'adjusting a strap': 'one hand sliding a thin strap back onto the shoulder',
  'lying on the stomach, legs up': 'lying on the stomach on the bed with the lower legs raised and crossed at the ankles',
  'standing in profile, back arched': 'standing in profile with the back arched, showing the line from the chest to the hips',
}

/** Framings that keep the face out; the shot is written out in full in the prompt. */
export const FACELESS_SHOTS: Readonly<Record<string, string>> = {
  'neck-down shot': 'neck-down shot cropped just below the chin with the face out of frame',
  'collarbone-to-hips crop': 'tight crop from the collarbone to the hips with the face out of frame',
  'hips-and-legs crop': 'crop from the waist down to the feet',
  'back view from the shoulders down': 'back view from the shoulders down with the head out of frame',
  'over-the-shoulder back view': 'back view over one shoulder with the face turned away and out of frame',
}

export const FACELESS_PHOTO_STYLES: readonly string[] = ['boudoir', 'swimwear editorial']

/** Worn over lingerie or swimwear; offered with the other outerwear. */
export const LOUNGE_OUTERWEAR: readonly string[] = ['Silk robe', 'Sarong', 'Crochet cover-up']

/** A purpose whose framings all keep the face out (Faceless), so nothing in its prompt points to the face. */
export function hidesFace(mode: Pick<BuilderMode, 'options'>): boolean {
  const shots = mode.options.shotType
  return shots !== undefined && shots.length > 0 && shots.every((shot) => shot in FACELESS_SHOTS)
}

/** Realism details about the face, left out where it isn't shown. */
const FACE_REALISM: ReadonlySet<string> = new Set(['sharp focus on the eyes'])

/** The realism details the purpose offers. */
export function realismOptions(mode: Pick<BuilderMode, 'options'>): readonly string[] {
  return hidesFace(mode) ? REALISM_DETAILS.filter((detail) => !FACE_REALISM.has(detail)) : REALISM_DETAILS
}

/** Lights whose wording is about the face, written without it where the face isn't shown. */
export const FACE_FREE_LIGHT: Readonly<Record<string, string>> = {
  'ring light': 'even ring light illumination with minimal shadows',
  'screen/monitor glow': 'cool screen glow casting soft bluish-white light across the skin in a dim room',
}
