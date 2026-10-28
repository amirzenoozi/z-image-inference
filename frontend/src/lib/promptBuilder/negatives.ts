import type { BuilderState } from './build'
import type { Facts } from './facts'
import { isAdultMode, isSafeMode, showsStep, type BuilderMode } from './modes'

const ANATOMY_NEGATIVES =
  'extra fingers, extra hands, extra limbs, missing fingers, fused fingers, mutated hands, deformed hands, phantom limb, ' +
  'floating hand, disembodied hand, extra arms, bad anatomy, malformed limbs, wrong number of fingers, six fingers, ' +
  'disfigured, ugly, blurry, watermark, text, logo, signature'
const BODY_NEGATIVES = 'saggy breasts, torpedo breasts, droopy breasts, pendulous breasts, tubular breasts, uneven breasts, deflated breasts'
const BREAST_COVER_NEGATIVES = 'exposed nipples, bare breasts, lifted shirt, shirt pulled up, topless, areola visible'
const INTIMATE_COVER_NEGATIVES = 'exposed genitals, no underwear, pantyless, bottomless'
// Keeps a safe mode's images clothed, whatever the model leans towards
const SAFE_NEGATIVES = 'nsfw, nude, nudity, topless, lingerie, underwear, see-through, cleavage'
// Negatives that would fight explicit content; removed from the user's own negative prompt when it is on
const SAFE_FOR_WORK_TERMS = new Set(['nsfw', 'censored', 'nude', 'nudity', 'naked'])

function coverageNegatives(facts: Facts): string[] {
  if (facts.nudity === null) return []
  const breastsCovered = facts.nudity === 'clothed' || facts.nudity === 'implied'
  return [breastsCovered ? BREAST_COVER_NEGATIVES : '', facts.nudity === 'nude' ? '' : INTIMATE_COVER_NEGATIVES]
}

/** Drops terms such as "nsfw" from a negative prompt, so it does not work against explicit content. */
export function withoutSafeForWorkTerms(negativePrompt: string): string {
  return negativePrompt
    .split(',')
    .map((term) => term.trim())
    .filter((term) => term && !SAFE_FOR_WORK_TERMS.has(term.toLowerCase()))
    .join(', ')
}

export function negativePrompt(state: BuilderState, mode: BuilderMode, facts: Facts): string {
  const typed = showsStep(mode, 'finish') ? state.negativePrompt : ''
  const own = isAdultMode(mode) ? withoutSafeForWorkTerms(typed) : typed.trim()
  // Upstream always adds the body terms; here they only apply to prompts with adult content
  const parts = [own, isSafeMode(mode) ? SAFE_NEGATIVES : '', facts.nudity === null ? '' : BODY_NEGATIVES, ANATOMY_NEGATIVES, ...coverageNegatives(facts)]
  return parts.filter(Boolean).join(', ')
}
