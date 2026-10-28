import { describe, expect, it } from 'vitest'
import shippedModes from '../../../../prompt_modes.json'
import type { BuilderModeData } from '../../types'
import { buildPrompt, emptyBuilderState, type BuilderState } from './build'
import { RANDOM } from './constants'
import { clashesIn } from './conflicts'
import { parseModes } from './modes'
import { picksOf, withPicks } from './multiChoice'
import { loadBuilderState } from './storage'

const { modes } = parseModes(shippedModes as unknown as BuilderModeData[])
const general = modes.find((mode) => mode.id === 'general')!
const state = (patch: Partial<BuilderState>): BuilderState => ({ ...emptyBuilderState(), who: 'woman', age: 'late 20s', ...patch })
const picked = (before: Partial<BuilderState>, field: 'makeup' | 'facialHair' | 'lightingSetup', next: string[]) => {
  const after = { ...state(before), ...withPicks(state(before), field, next) }
  return picksOf(after, field)
}
const promptOf = (patch: Partial<BuilderState>, style: 'prose' | 'tags' = 'prose') => {
  const result = buildPrompt(state(patch), general, style)
  if (result.status !== 'ready') throw new Error(result.status)
  return result.prompt
}

describe('picking several options', () => {
  it('keeps them in the order picked', () => {
    expect(picked({}, 'makeup', ['winged eyeliner', 'bold red lipstick'])).toEqual(['winged eyeliner', 'bold red lipstick'])
  })

  it('lets an exclusive option or Random replace the others, and drops it when another is picked', () => {
    const two = { makeup: 'winged eyeliner', makeupMore: ['bold red lipstick'] }
    expect(picked(two, 'makeup', ['winged eyeliner', 'bold red lipstick', 'no makeup'])).toEqual(['no makeup'])
    expect(picked(two, 'makeup', ['winged eyeliner', 'bold red lipstick', RANDOM])).toEqual([RANDOM])
    expect(picked({ facialHair: 'clean-shaven' }, 'facialHair', ['clean-shaven', 'stubble'])).toEqual(['stubble'])
    expect(picked(two, 'makeup', [])).toEqual([])
  })
})

describe('writing several picks', () => {
  it('names each makeup and light in the paragraph, and gives each its own tag', () => {
    const choices = { makeup: 'winged eyeliner', makeupMore: ['bold red lipstick'], lightingSetup: 'softbox beauty', lightingMore: ['rim light'] }
    expect(promptOf(choices)).toContain('wearing winged eyeliner and bold red lipstick')
    expect(promptOf(choices)).toMatch(/lit by .+ and .+/)
    const tags = promptOf(choices, 'tags').split(', ')
    expect(tags).toEqual(expect.arrayContaining(['winged eyeliner', 'bold red lipstick']))
  })

  it('leaves out the further picks when the first is an exclusive option', () => {
    expect(promptOf({ makeup: 'no makeup', makeupMore: ['bold red lipstick'] })).not.toContain('lipstick')
  })

  it('checks every light picked against the time of day', () => {
    const clashes = clashesIn(state({ timeOfDay: 'midnight', lightingSetup: 'softbox beauty', lightingMore: ['harsh midday sun'] }))
    expect(clashes.map((clash) => clash.kind)).toContain('light')
  })
})

it('loads builder choices saved before these took several, as single picks', () => {
  const { makeupMore: _m, facialHairMore: _f, lightingMore: _l, ...older } = state({ makeup: 'glam makeup' })
  localStorage.setItem('z-image-studio.prompt-builder.v3', JSON.stringify(older))
  expect(picksOf(loadBuilderState(), 'makeup')).toEqual(['glam makeup'])
})
