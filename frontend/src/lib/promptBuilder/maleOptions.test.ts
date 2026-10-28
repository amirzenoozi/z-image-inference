import { describe, expect, it } from 'vitest'
import shippedModes from '../../../../prompt_modes.json'
import type { BuilderModeData } from '../../types'
import { buildPrompt, choicesFor, emptyBuilderState, emptyOutfit, type BuilderState } from './build'
import { parseModes } from './modes'

const { modes } = parseModes(shippedModes as unknown as BuilderModeData[])
const mode = (id: string) => modes.find((candidate) => candidate.id === id)!
const state = (patch: Partial<BuilderState>): BuilderState => ({ ...emptyBuilderState(), who: 'man', age: 'late 20s', mode: 'general', ...patch })
const promptOf = (patch: Partial<BuilderState>, style: 'prose' | 'tags' = 'prose') => {
  const chosen = state(patch)
  const result = buildPrompt(chosen, mode(chosen.mode), style)
  if (result.status !== 'ready') throw new Error(result.status)
  return result.prompt
}

describe('who and when the men\'s options are offered', () => {
  it('offers facial hair and a chest with a man in the scene, in any purpose', () => {
    expect(choicesFor('facialHair', state({}), mode('general'))).toContain('full beard')
    expect(choicesFor('chest', state({ who: 'couple' }), mode('general'))).toContain('hairy chest')
    expect(choicesFor('facialHair', state({ who: 'woman' }), mode('general'))).toEqual([])
  })

  it('offers muscles and abs to anyone, body hair in the 18+ purposes, and a bulge only to a clothed man there', () => {
    expect(choicesFor('muscles', state({ who: 'woman' }), mode('general'))).toContain('toned')
    expect(choicesFor('bodyHair', state({}), mode('general'))).toEqual([])
    expect(choicesFor('bodyHair', state({ mode: 'glamour' }), mode('glamour'))).toContain('hairy')
    expect(choicesFor('bulge', state({ mode: 'glamour', nudity: 'topless' }), mode('glamour'))).toContain('large bulge')
    expect(choicesFor('bulge', state({ mode: 'explicit', nudity: 'nude' }), mode('explicit'))).toEqual([])
    expect(choicesFor('bulge', state({ who: 'woman', mode: 'glamour', nudity: 'clothed' }), mode('glamour'))).toEqual([])
  })
})

describe('writing them into the prompt', () => {
  it('describes a beard, the build and the abs in the paragraph and as tags', () => {
    const choices = { facialHair: 'full beard', muscles: 'huge bodybuilder', abs: 'six-pack' }
    expect(promptOf(choices)).toMatch(/full beard[\s\S]*huge bodybuilder physique[\s\S]*six-pack|huge bodybuilder physique[\s\S]*six-pack[\s\S]*full beard/)
    const tags = promptOf(choices, 'tags')
    expect(tags).toContain('beard')
    expect(tags).toContain('bodybuilder')
    expect(tags).toContain('six-pack')
  })

  it('writes the chest only when it would be seen', () => {
    expect(promptOf({ chest: 'hairy chest', outfit: { ...emptyOutfit(), top: 'Hoodie' } })).not.toContain('hairy chest')
    expect(promptOf({ chest: 'hairy chest', outfit: { ...emptyOutfit(), top: 'Tank top' } })).toContain('hairy chest')
    expect(promptOf({ chest: 'hairy chest', mode: 'glamour', nudity: 'topless' })).toContain('hairy chest')
  })

  it('gives the beard and the bulge to the man in a couple', () => {
    const prompt = promptOf({ who: 'couple', mode: 'glamour', nudity: 'clothed', facialHair: 'goatee', bulge: 'large bulge' })
    expect(prompt).toMatch(/man has a goatee/i)
    expect(prompt).toMatch(/man has a large, prominent bulge/i)
  })

  it('leaves out an option that no longer fits who is in the scene', () => {
    expect(promptOf({ who: 'woman', facialHair: 'full beard', chest: 'broad pecs' })).not.toMatch(/beard|pecs/)
  })
})
