import type { CharacterTraits } from '../../types'
import { minorWordIn, type BuilderState } from './build'
import { CHOICE_OPTIONS } from './choices'
import { NOT_SET } from './constants'
import { EXPLICIT_PIERCINGS, PIERCINGS, SKIN_DETAILS, TATTOOS } from './extraData'

const CHOICE_TRAITS = [
  'who', 'age', 'ethnicity', 'eyeColor', 'makeup', 'skinTone', 'hairColor', 'hairstyle', 'hairLength', 'bodyType', 'height', 'bust', 'hips',
] as const satisfies readonly (keyof CharacterTraits & keyof typeof CHOICE_OPTIONS)[]
const FREE_TEXT_TRAITS = ['subject', 'appearanceExtra', 'bodyExtra'] as const
const LIST_TRAITS = { skinDetails: SKIN_DETAILS, tattoos: TATTOOS, piercings: [...PIERCINGS, ...EXPLICIT_PIERCINGS] } as const

/** The identity choices of the builder: who the person is, their face, hair and body, but not what they wear or do. */
export function traitsOf(state: BuilderState): CharacterTraits {
  const choices = Object.fromEntries(CHOICE_TRAITS.map((key) => [key, state[key]]))
  const texts = Object.fromEntries(FREE_TEXT_TRAITS.map((key) => [key, state[key].trim()]))
  return { ...choices, ...texts, skinDetails: state.skinDetails, tattoos: state.tattoos, piercings: state.piercings } as CharacterTraits
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
  if (!name.trim()) return 'Give the character a name.'
  if (traits.who === NOT_SET || traits.age === NOT_SET) return 'A character needs “Who” and an adult age range.'
  const minorWord = minorWordIn([name, ...FREE_TEXT_TRAITS.map((key) => traits[key])].join(' '))
  return minorWord ? `Characters must be adults. Remove “${minorWord}”.` : null
}

/** A short line describing the character, such as "woman, late 20s, auburn hair". */
export function traitsSummary(traits: CharacterTraits): string {
  const hair = [traits.hairLength, traits.hairColor].filter(Boolean).join(' ')
  const parts = [traits.who, traits.age, traits.ethnicity, traits.eyeColor && `${traits.eyeColor} eyes`, hair && `${hair} hair`, traits.bodyType]
  return parts.filter(Boolean).join(', ')
}
