// Prompt assembly ported from ComfyUI Photoreal Prompt Builder's build_prompt and compose_outfit
// (MIT License, Copyright (c) 2025 artokun); see data.ts for the source links.
import {
  ACCESSORIES,
  BOTTOMS,
  CAMERA_ANGLES,
  CLOTHING_COLORS,
  COLOR_GRADINGS,
  DEPTH_OF_FIELD,
  EXPLICIT_PARTNER_ACTIONS,
  EXPLICIT_POSES,
  EXPLICIT_SOLO_ACTIONS,
  HAIRSTYLES,
  HAIR_COLORS,
  LENSES,
  LIGHTING_EXPANSIONS,
  LINGERIE_BOTTOMS,
  LINGERIE_TOPS,
  OUTERWEAR,
  PHOTO_STYLES,
  POSES,
  SCENE_TYPES,
  SHOES,
  SHOT_TYPES,
  TOPS,
} from './data'

export const NOT_SET = ''
export const RANDOM = 'random'
export const REMOVE = 'remove'
export const INHERIT_SCENE = 'inherit from scene'

export const LIGHTING_SETUPS: readonly string[] = Object.keys(LIGHTING_EXPANSIONS)

export interface OutfitState {
  top: string
  topColor: string
  bottom: string
  bottomColor: string
  lingerieTop: string
  lingerieTopColor: string
  lingerieBottom: string
  lingerieBottomColor: string
  outerwear: string
  outerwearColor: string
  shoes: string
  shoesColor: string
  accessories: [string, string, string]
  details: string
}

export interface BuilderState {
  subject: string
  explicit: boolean
  photoStyle: string
  pose: string
  explicitAction: string
  action: string
  hairColor: string
  hairstyle: string
  outfit: OutfitState
  sceneType: string
  environment: string
  lightingSetup: string
  lightingCustom: string
  shotType: string
  cameraAngle: string
  lens: string
  depthOfField: string
  mood: string
  colorGrading: string
  extraDetails: string
  negativePrompt: string
  exposeBreasts: boolean
  removeBra: boolean
  removePanties: boolean
  /** Seeds every "Random" choice, so the preview stays stable until the user re-rolls. */
  rollSeed: number
}

export type BuildResult =
  | { status: 'incomplete'; reason: string }
  | { status: 'blocked'; reason: string }
  | { status: 'ready'; prompt: string; negativePrompt: string }

export function emptyOutfit(): OutfitState {
  return {
    top: NOT_SET, topColor: NOT_SET, bottom: NOT_SET, bottomColor: NOT_SET,
    lingerieTop: NOT_SET, lingerieTopColor: NOT_SET, lingerieBottom: NOT_SET, lingerieBottomColor: NOT_SET,
    outerwear: NOT_SET, outerwearColor: NOT_SET, shoes: NOT_SET, shoesColor: NOT_SET,
    accessories: [NOT_SET, NOT_SET, NOT_SET], details: '',
  }
}

export function emptyBuilderState(): BuilderState {
  return {
    subject: '', explicit: false, photoStyle: NOT_SET, pose: NOT_SET, explicitAction: NOT_SET, action: '',
    hairColor: NOT_SET, hairstyle: NOT_SET, outfit: emptyOutfit(), sceneType: NOT_SET, environment: '',
    lightingSetup: NOT_SET, lightingCustom: '', shotType: NOT_SET, cameraAngle: NOT_SET, lens: NOT_SET,
    depthOfField: NOT_SET, mood: '', colorGrading: NOT_SET, extraDetails: '', negativePrompt: '',
    exposeBreasts: false, removeBra: false, removePanties: false, rollSeed: 1,
  }
}

export function poseOptions(explicit: boolean): string[] {
  return explicit ? [...POSES, ...Object.keys(EXPLICIT_POSES)] : [...POSES]
}

export const EXPLICIT_ACTIONS: Readonly<Record<string, string>> = { ...EXPLICIT_SOLO_ACTIONS, ...EXPLICIT_PARTNER_ACTIONS }

// ── Age safeguard ────────────────────────────────────────────────────────────
// Sexual or lingerie content must describe adults; these words point to a minor.
const MINOR_TERMS =
  /\b(?:child(?:ren)?|kids?|minors?|under-?age(?:d)?|teen(?:s|age|aged|ager|agers)?|pre-?teens?|tweens?|school ?(?:girl|boy)s?|lol(?:i|ita)|shota|toddlers?|infants?|bab(?:y|ies)(?![\s-]*(?:blue|pink|doll|oil|powder))|girls?|boys?|daughters?|sons?|nieces?|nephews?|juveniles?|adolescents?|(?:[1-9]|1[0-7])\s*(?:yo|y\/o|y\.o\.|-?\s*years?[\s-]*old|-year-old))\b/i

function usesAdultContent(state: BuilderState): boolean {
  const wearsLingerie = [state.outfit.lingerieTop, state.outfit.lingerieBottom].some((item) => item !== NOT_SET && item !== REMOVE)
  return state.explicit || wearsLingerie
}

/** The first word that suggests a minor, when the prompt would include adult content. */
export function minorTermIn(state: BuilderState): string | null {
  if (!usesAdultContent(state)) return null
  const freeText = [state.subject, state.action, state.environment, state.mood, state.extraDetails, state.outfit.details].join(' ')
  return MINOR_TERMS.exec(freeText)?.[0] ?? null
}

// ── Random choices ───────────────────────────────────────────────────────────
function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Each field rolls independently, so changing one "Random" field never changes another's pick. */
function pick(options: readonly string[], seed: number, field: string): string {
  let t = (seed ^ hash(field)) + 0x6d2b79f5
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  const unit = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  return options[Math.floor(unit * options.length)] ?? NOT_SET
}

function resolve(value: string, options: readonly string[], seed: number, field: string): string {
  return value === RANDOM ? pick(options, seed, field) : value
}

export function hasRandomChoice(state: BuilderState): boolean {
  const { outfit } = state
  const values = [
    state.photoStyle, state.pose, state.explicitAction, state.hairColor, state.hairstyle, state.sceneType,
    state.lightingSetup, state.shotType, state.cameraAngle, state.lens, state.depthOfField, state.colorGrading,
    outfit.top, outfit.topColor, outfit.bottom, outfit.bottomColor, outfit.lingerieTop, outfit.lingerieTopColor,
    outfit.lingerieBottom, outfit.lingerieBottomColor, outfit.outerwear, outfit.outerwearColor, outfit.shoes,
    outfit.shoesColor, ...outfit.accessories,
  ]
  return values.includes(RANDOM)
}

// ── Sentences ────────────────────────────────────────────────────────────────
const capitalise = (text: string) => (text ? text[0].toUpperCase() + text.slice(1) : text)
const isSet = (value: string) => value !== NOT_SET

function expand(label: string): string {
  return EXPLICIT_POSES[label] ?? EXPLICIT_ACTIONS[label] ?? label
}

function openerSentence(state: BuilderState, seed: number): string {
  const style = resolve(state.photoStyle, PHOTO_STYLES, seed, 'photoStyle')
  const pose = resolve(state.pose, poseOptions(state.explicit), seed, 'pose')
  const opener = isSet(style) ? `${capitalise(style)} photo of ${state.subject.trim()}` : `Photo of ${state.subject.trim()}`
  return isSet(pose) ? `${opener}, ${expand(pose)}` : opener
}

function actionSentences(state: BuilderState, seed: number): string[] {
  const explicitAction = state.explicit ? resolve(state.explicitAction, Object.keys(EXPLICIT_ACTIONS), seed, 'explicitAction') : NOT_SET
  return [isSet(explicitAction) ? expand(explicitAction) : '', expand(state.action.trim())]
}

function hairSentence(state: BuilderState, seed: number): string {
  const color = resolve(state.hairColor, HAIR_COLORS, seed, 'hairColor')
  const style = resolve(state.hairstyle, HAIRSTYLES, seed, 'hairstyle')
  // Upstream leaves a lone colour as just "Auburn"; naming the hair makes the prompt clearer
  const hair = isSet(style) ? `${style} hair` : isSet(color) ? 'hair' : ''
  return capitalise([color, hair].filter(Boolean).join(' '))
}

const OUTFIT_SLOTS = [
  { label: 'lingerie top', item: 'lingerieTop', color: 'lingerieTopColor', options: LINGERIE_TOPS },
  { label: 'lingerie bottom', item: 'lingerieBottom', color: 'lingerieBottomColor', options: LINGERIE_BOTTOMS },
  { label: 'top', item: 'top', color: 'topColor', options: TOPS },
  { label: 'bottom', item: 'bottom', color: 'bottomColor', options: BOTTOMS },
  { label: 'outerwear', item: 'outerwear', color: 'outerwearColor', options: OUTERWEAR },
  { label: 'shoes', item: 'shoes', color: 'shoesColor', options: SHOES },
] as const

function joinPieces(pieces: string[]): string {
  if (pieces.length <= 2) return pieces.join(' and ')
  return `${pieces.slice(0, -1).join(', ')}, and ${pieces[pieces.length - 1]}`
}

export function composeOutfit(outfit: OutfitState, seed: number): string {
  const pieces: string[] = []
  const removed: string[] = []
  for (const slot of OUTFIT_SLOTS) {
    const item = resolve(outfit[slot.item], slot.options, seed, slot.item)
    const color = resolve(outfit[slot.color], CLOTHING_COLORS, seed, slot.color)
    if (item === REMOVE) removed.push(slot.label)
    else if (isSet(item)) pieces.push(isSet(color) ? `${color} ${item.toLowerCase()}` : item.toLowerCase())
  }
  const accessories = outfit.accessories.map((item, index) => resolve(item, ACCESSORIES, seed, `accessory${index}`).toLowerCase())
  pieces.push(...new Set(accessories.filter(isSet)))

  const wearing = pieces.length ? `Wearing ${joinPieces(pieces)}` : ''
  const without = removed.length ? `without ${removed.join(', without ')}` : ''
  const clothing = wearing && without ? `${wearing}, ${without}` : wearing || capitalise(without)
  const details = outfit.details.trim()
  return clothing && details ? `${clothing}. ${details}` : clothing || details
}

function exposureSentence(state: BuilderState): string {
  if (!state.explicit) return ''
  const parts = state.exposeBreasts
    ? ['clothing adjusted to expose breasts', ...(state.removeBra ? ['no bra'] : [])]
    : ['nipples fully concealed by clothing, fabric, hands, or hair', 'breasts fully covered by outfit']
  parts.push(state.removePanties ? 'not wearing panties' : 'underwear or lingerie covering intimate areas')
  return capitalise(parts.join(', '))
}

const PREPOSITIONS = ['in ', 'at ', 'on ', 'near ', 'by ', 'inside ', 'outside ', 'under ', 'above ', 'along ', 'within ']

function sceneSentence(environment: string, sceneType: string): string {
  const env = environment.trim()
  if (env) return PREPOSITIONS.some((p) => env.toLowerCase().startsWith(p)) ? capitalise(env) : `In ${env}`
  if (!isSet(sceneType)) return ''
  return `In ${'aeiou'.includes(sceneType[0].toLowerCase()) ? 'an' : 'a'} ${sceneType} setting`
}

function lightingSentence(state: BuilderState, sceneType: string, seed: number): string {
  const setup = resolve(state.lightingSetup, LIGHTING_SETUPS, seed, 'lightingSetup')
  const fromScene = isSet(sceneType) ? `lighting natural to a ${sceneType} setting` : ''
  const prose = setup === INHERIT_SCENE ? fromScene : LIGHTING_EXPANSIONS[setup] ?? ''
  return capitalise([prose, state.lightingCustom.trim()].filter(Boolean).join(', '))
}

function technicalSentence(state: BuilderState, seed: number): string {
  const shot = resolve(state.shotType, SHOT_TYPES, seed, 'shotType')
  const angle = resolve(state.cameraAngle, CAMERA_ANGLES, seed, 'cameraAngle')
  const lens = resolve(state.lens, LENSES, seed, 'lens')
  const dof = resolve(state.depthOfField, DEPTH_OF_FIELD, seed, 'depthOfField')
  const words = dof.split(' ')
  return [
    capitalise(shot),
    angle,
    isSet(lens) ? `${lens} lens` : '',
    isSet(dof) ? `${words[0]} depth of field at ${words[words.length - 1]}` : '',
  ].filter(Boolean).join(', ')
}

function moodSentence(state: BuilderState, seed: number): string {
  const grading = resolve(state.colorGrading, COLOR_GRADINGS, seed, 'colorGrading')
  const mood = state.mood.trim()
  return [
    mood ? `${capitalise(mood)} mood` : '',
    isSet(grading) && grading !== 'natural' ? `${capitalise(grading)} color grading` : '',
  ].filter(Boolean).join('. ')
}

const ANATOMY_NEGATIVES =
  'extra fingers, extra hands, extra limbs, missing fingers, fused fingers, mutated hands, deformed hands, phantom limb, ' +
  'floating hand, disembodied hand, extra arms, bad anatomy, malformed limbs, wrong number of fingers, six fingers, ' +
  'disfigured, ugly, blurry, watermark, text, logo, signature'
const BODY_NEGATIVES = 'saggy breasts, torpedo breasts, droopy breasts, pendulous breasts, tubular breasts, uneven breasts, deflated breasts'

function coverageNegatives(state: BuilderState): string[] {
  if (!state.explicit) return []
  return [
    state.exposeBreasts ? '' : 'exposed nipples, bare breasts, lifted shirt, shirt pulled up, topless, areola visible',
    state.removePanties ? '' : 'exposed genitals, no underwear, pantyless, bottomless',
  ]
}

function negativePrompt(state: BuilderState): string {
  // Upstream always adds the body terms; here they only apply to explicit prompts
  const parts = [state.negativePrompt.trim(), state.explicit ? BODY_NEGATIVES : '', ANATOMY_NEGATIVES, ...coverageNegatives(state)]
  return parts.filter(Boolean).join(', ')
}

export function buildPrompt(state: BuilderState): BuildResult {
  if (!state.subject.trim()) return { status: 'incomplete', reason: 'Describe the subject to start building a prompt.' }
  const minorTerm = minorTermIn(state)
  if (minorTerm) {
    return {
      status: 'blocked',
      reason: `Prompts with explicit content or lingerie must describe adults. Remove “${minorTerm}” (for example, write “adult woman” or “adult man”).`,
    }
  }
  const seed = state.rollSeed
  const sceneType = resolve(state.sceneType, SCENE_TYPES, seed, 'sceneType')
  const sentences = [
    openerSentence(state, seed),
    ...actionSentences(state, seed),
    hairSentence(state, seed),
    composeOutfit(state.outfit, seed),
    exposureSentence(state),
    sceneSentence(state.environment, sceneType),
    capitalise(state.extraDetails.trim()),
    lightingSentence(state, sceneType, seed),
    technicalSentence(state, seed),
    moodSentence(state, seed),
  ]
  const prompt = sentences
    .map((sentence) => sentence.trim().replace(/\.+$/, ''))
    .filter(Boolean)
    .join('. ')
  return { status: 'ready', prompt: `${prompt}.`, negativePrompt: negativePrompt(state) }
}
