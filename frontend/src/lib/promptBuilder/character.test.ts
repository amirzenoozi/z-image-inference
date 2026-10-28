import { expect, it } from 'vitest'
import { character } from '../../test/fixtures'
import { emptyBuilderState } from './build'
import { characterProblem, traitsOf, traitsSummary, withTraits } from './character'
import { NOT_SET } from './constants'

it('keeps who the person is and how they look, not what they wear or do', () => {
  const state = { ...emptyBuilderState(), who: 'woman', age: 'late 20s', hairColor: 'auburn', tattoos: ['thigh tattoo'], pose: 'standing', subject: '  a dancer ' }
  const traits = traitsOf(state)

  expect(traits).toMatchObject({ who: 'woman', age: 'late 20s', hairColor: 'auburn', tattoos: ['thigh tattoo'], subject: 'a dancer' })
  expect(traits).not.toHaveProperty('pose')
  expect(withTraits(emptyBuilderState(), traits)).toMatchObject({ who: 'woman', hairColor: 'auburn', tattoos: ['thigh tattoo'], subject: 'a dancer', pose: NOT_SET })
})

it('leaves out values the builder no longer offers instead of writing them as they are', () => {
  const { traits } = character({ traits: { ...character().traits, hairColor: 'plaid', tattoos: ['thigh tattoo', 'made up'] } })
  const state = withTraits(emptyBuilderState(), traits)
  expect(state.hairColor).toBe(NOT_SET)
  expect(state.tattoos).toEqual(['thigh tattoo'])
})

it('needs a name, and an adult with an age range', () => {
  const { traits } = character()
  expect(characterProblem('  ', traits)).toBe('Give the character a name.')
  expect(characterProblem('Ava', { ...traits, age: NOT_SET })).toBe('A character needs “Who” and an adult age range.')
  expect(characterProblem('Schoolgirl Ava', traits)).toBe('Characters must be adults. Remove “Schoolgirl”.')
  expect(characterProblem('Ava', { ...traits, bodyExtra: 'teen figure' })).toBe('Characters must be adults. Remove “teen”.')
  expect(characterProblem('Ava', traits)).toBeNull()
})

it('sums the character up in a line', () => {
  expect(traitsSummary(character().traits)).toBe('woman, late 20s, green eyes, long auburn hair')
})
