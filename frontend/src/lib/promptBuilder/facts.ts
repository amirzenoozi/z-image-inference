import type { Nudity, Who } from './extraData'

export interface Pronoun {
  they: string
  their: string
  have: string
  are: string
}

const SINGULAR_SHE: Pronoun = { they: 'she', their: 'her', have: 'has', are: 'is' }
const SINGULAR_HE: Pronoun = { they: 'he', their: 'his', have: 'has', are: 'is' }
const PLURAL: Pronoun = { they: 'they', their: 'their', have: 'have', are: 'are' }

export function pronounFor(who: Who | null): Pronoun {
  if (who === 'woman') return SINGULAR_SHE
  if (who === 'man') return SINGULAR_HE
  return PLURAL
}

export interface Labelled {
  /** The option's short name, used as a tag. */
  label: string
  /** The option's full wording, used in sentences. */
  text: string
}

/** Every choice resolved to plain text, '' when unset; what both the sentence and the tag writers work from. */
export interface Facts {
  who: Who | null
  hasWoman: boolean
  hasMan: boolean
  pronoun: Pronoun
  /** "an adult woman in her mid 20s", or the free-text subject alone. */
  subject: string
  age: string
  ethnicity: string
  subjectExtra: string
  photoStyle: string
  pose: Labelled & { explicit: boolean }
  action: Labelled
  freeAction: string
  /** null when explicit content is off. */
  nudity: Nudity | null
  intimacy: string[]
  eyes: string
  expression: string
  makeup: string
  skinTone: string
  skinDetails: string[]
  appearanceExtra: string
  hair: { length: string; color: string; style: string }
  body: { type: string; height: string; bust: string; hips: string; marks: string[]; extra: string }
  /** Garments and accessories still worn after the nudity level, lower-case, with their colours. */
  clothing: string[]
  removed: string[]
  outfitDetails: string
  /** Where the scene is, with its preposition: "in a bedroom setting", "on a sunny beach". */
  place: string
  sceneType: string
  time: string
  weather: string
  extraDetails: string
  lighting: Labelled
  lightingCustom: string
  shot: string
  angle: string
  lens: string
  depthOfField: string
  mood: string
  grading: string
  realism: string[]
}

export const capitalise = (text: string) => (text ? text[0].toUpperCase() + text.slice(1) : text)

/** "a", "a and b", "a, b and c". */
export function joinPieces(pieces: readonly string[]): string {
  const kept = pieces.filter(Boolean)
  if (kept.length <= 2) return kept.join(' and ')
  return `${kept.slice(0, -1).join(', ')} and ${kept[kept.length - 1]}`
}

// Singular words that end in "s", so they are not taken for plurals
const SINGULAR_ENDING_IN_S = new Set(['lens', 'canvas', 'bus'])

/** Adds "a" or "an" to a singular phrase; plurals ("jeans", "parted lips") and "no …" phrases are left as they are. */
export function withArticle(phrase: string): string {
  const last = phrase.split(' ').pop() ?? ''
  const plural = last.endsWith('s') && !last.endsWith('ss') && !SINGULAR_ENDING_IN_S.has(last)
  if (!phrase || plural || phrase.startsWith('no ')) return phrase
  return /^[aeiou8]/i.test(phrase) ? `an ${phrase}` : `a ${phrase}`
}
