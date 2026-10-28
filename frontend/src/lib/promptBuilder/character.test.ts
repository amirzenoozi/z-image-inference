import { describe, expect, it } from 'vitest'
import sampleCharacters from '../../../../sample_characters.json'
import type { CharacterTraits } from '../../types'
import { character } from '../../test/fixtures'
import { emptyBuilderState } from './build'
import { characterProblem, surpriseLook, traitsOf, traitsSummary, withTraits } from './character'
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

describe('the sample characters every new database starts with', () => {
  const blank = traitsOf(emptyBuilderState())
  const samples = sampleCharacters.map(({ name, traits }) => ({ name, traits: { ...blank, ...traits } as CharacterTraits }))

  it.each(samples)('$name uses only options the builder offers, and is an adult', ({ name, traits }) => {
    expect(traitsOf(withTraits(emptyBuilderState(), traits))).toEqual(traits)
    expect(characterProblem(name, traits)).toBeNull()
  })

  it('gives each one a different look', () => {
    const looks = samples.map(({ traits }) => traitsSummary(traits))
    expect(new Set(looks).size).toBe(samples.length)
  })
})

describe('a surprise look', () => {
  const seeds = Array.from({ length: 40 }, (_, index) => index * 7919 + 1)

  it.each(seeds)('is a full adult look that fits who it is for (seed %i)', (seed) => {
    const look = surpriseLook({ ...emptyBuilderState(), subject: 'a dancer' }, seed)
    const traits = traitsOf(look)
    expect(['woman', 'man']).toContain(look.who)
    expect(characterProblem('Someone', traits)).toBeNull()
    expect(traitsOf(withTraits(emptyBuilderState(), traits))).toEqual(traits)
    expect(look.subject).toBe('a dancer')
    if (look.who === 'man') expect([look.bust, look.makeup]).toEqual([NOT_SET, NOT_SET])
  })

  it('keeps the chosen "Who"', () => {
    for (const seed of seeds) expect(surpriseLook({ ...emptyBuilderState(), who: 'man' }, seed).who).toBe('man')
  })

  it('gives different looks for different rolls', () => {
    const looks = new Set(seeds.map((seed) => traitsSummary(traitsOf(surpriseLook(emptyBuilderState(), seed)))))
    expect(looks.size).toBeGreaterThan(30)
  })
})
