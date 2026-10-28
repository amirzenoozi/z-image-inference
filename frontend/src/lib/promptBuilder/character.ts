import { optionLabel, t } from '../../i18n'
import type { Character, CharacterTraits } from '../../types'
import { buildPrompt, emptyBuilderState, minorWordIn, type BuilderState, type PromptStyle } from './build'
import { CHOICE_OPTIONS } from './choices'
import { NOT_SET } from './constants'
import { EXPLICIT_PIERCINGS, FACIAL_HAIR, MAKEUP, PIERCINGS, SKIN_DETAILS, TATTOOS } from './extraData'
import { FALLBACK_MODE, type BuilderMode } from './modes'
import { pick, pickSome } from './random'
import { choicesFor, includesWoman } from './rules'
import { pickFitting } from './settle'

const CHOICE_TRAITS = [
  'who', 'age', 'ethnicity', 'eyeColor', 'makeup', 'skinTone', 'hairColor', 'hairstyle', 'hairLength', 'facialHair', 'bodyType', 'height', 'bust', 'hips',
  'muscles', 'abs', 'chest',
] as const satisfies readonly (keyof CharacterTraits & keyof typeof CHOICE_OPTIONS)[]
const FREE_TEXT_TRAITS = ['subject', 'appearanceExtra', 'bodyExtra'] as const
const LIST_TRAITS = {
  skinDetails: SKIN_DETAILS, tattoos: TATTOOS, piercings: [...PIERCINGS, ...EXPLICIT_PIERCINGS], makeupMore: MAKEUP, facialHairMore: FACIAL_HAIR,
} as const

/** The identity choices of the builder: who the person is, their face, hair and body, but not what they wear or do. */
export function traitsOf(state: BuilderState): CharacterTraits {
  const choices = Object.fromEntries(CHOICE_TRAITS.map((key) => [key, state[key]]))
  const texts = Object.fromEntries(FREE_TEXT_TRAITS.map((key) => [key, state[key].trim()]))
  const { skinDetails, tattoos, piercings, makeupMore, facialHairMore } = state
  return { ...choices, ...texts, skinDetails, tattoos, piercings, makeupMore, facialHairMore } as CharacterTraits
}

const known = (options: readonly string[]) => (value: string) => options.includes(value)

/** The builder state with the character's look; a value the builder no longer offers is left unset rather than written as it is. */
export function withTraits(state: BuilderState, traits: CharacterTraits): BuilderState {
  const choices = Object.fromEntries(
    CHOICE_TRAITS.map((key) => [key, known(CHOICE_OPTIONS[key])(traits[key]) ? traits[key] : NOT_SET]),
  )
  const texts = Object.fromEntries(FREE_TEXT_TRAITS.map((key) => [key, traits[key]]))
  const lists = Object.fromEntries(
    Object.entries(LIST_TRAITS).map(([key, options]) => [key, traits[key as keyof typeof LIST_TRAITS].filter(known(options))]),
  )
  return { ...state, ...choices, ...texts, ...lists }
}

/** Why the character can't be saved, or null. A character can be used in the 18+ purposes, so it must be an adult. */
export function characterProblem(name: string, traits: CharacterTraits): string | null {
  if (!name.trim()) return t('characters.problemNoName')
  if (traits.who === NOT_SET || traits.age === NOT_SET) return t('characters.problemNoAge')
  const minorWord = minorWordIn([name, ...FREE_TEXT_TRAITS.map((key) => traits[key])].join(' '))
  return minorWord ? t('characters.problemMinor', { word: minorWord }) : null
}

/** "long auburn", "long" or "auburn": the hair's length and colour, as the language orders them. */
function hairOf(traits: CharacterTraits): string {
  const [length, colour] = [traits.hairLength, traits.hairColor].map((value) => (value ? optionLabel(value) : ''))
  return length && colour ? t('characters.summaryHairLengthColour', { length, colour }) : length || colour
}

/** A short line describing the character, such as "woman, late 20s, auburn hair", with each option in the UI's language. */
export function traitsSummary(traits: CharacterTraits): string {
  const hair = hairOf(traits)
  const label = (value: string) => (value ? optionLabel(value) : '')
  const parts = [
    label(traits.who), label(traits.age), label(traits.ethnicity),
    traits.eyeColor && t('characters.summaryEyes', { colour: optionLabel(traits.eyeColor) }),
    hair && t('characters.summaryHair', { hair }), label(traits.bodyType),
  ]
  return parts.filter(Boolean).join(', ')
}

// Only who the character is and how they look; the typed prompt says the rest
const LOOK_MODE: BuilderMode = { ...FALLBACK_MODE, id: 'look', label: 'Look', steps: ['subject', 'appearance', 'body'] }

/** The character's look, written for the model the way the prompt builder writes it; null if it can't be written. */
export function characterLook(character: Character, style: PromptStyle): string | null {
  const result = buildPrompt(withTraits(emptyBuilderState(), character.traits), LOOK_MODE, style)
  return result.status === 'ready' ? result.prompt : null
}

// Hair length before hairstyle, so the style fits it
const SURPRISE_TRAITS = ['hairLength', ...CHOICE_TRAITS.filter((trait) => trait !== 'who' && trait !== 'hairLength')] as const
// One in three looks gets a detail of each kind, so most surprises stay plain
const DETAIL_ODDS = ['0', '0', '1']

function sometimes(options: readonly string[], seed: number, field: string): string[] {
  return pick(DETAIL_ODDS, seed, `${field}Count`) === '1' ? pickSome(options, 1, seed, field) : []
}

/**
 * A random look for a character: every Subject, Face & hair and Body choice from the builder's options, fitting
 * "Who" (kept if chosen, else a woman or a man). Free text is kept, and only everyday piercings are picked.
 */
export function surpriseLook(state: BuilderState, seed: number): BuilderState {
  const who = state.who === NOT_SET ? pick(['woman', 'man'], seed, 'who') : state.who
  const withWho = { ...state, who }
  // Settled in order, so the hairstyle fits the hair length picked before it
  const settled = SURPRISE_TRAITS.reduce<BuilderState>((next, trait) => {
    const value = choicesFor(trait, next, FALLBACK_MODE).length ? pickFitting(trait, next, FALLBACK_MODE, seed) : NOT_SET
    return { ...next, [trait]: value }
  }, withWho)
  const choices = Object.fromEntries(SURPRISE_TRAITS.map((trait) => [trait, settled[trait]]))
  return {
    ...withWho,
    ...choices,
    makeup: includesWoman(who) ? choices.makeup : NOT_SET,
    makeupMore: [],
    facialHairMore: [],
    skinDetails: sometimes(SKIN_DETAILS, seed, 'skinDetails'),
    tattoos: sometimes(TATTOOS, seed, 'tattoos'),
    piercings: sometimes(PIERCINGS, seed, 'piercings'),
  }
}
