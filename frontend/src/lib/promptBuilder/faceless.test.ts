import { describe, expect, it } from 'vitest'
import { builderModes } from '../../test/fixtures'
import { buildPrompt, emptyBuilderState, emptyOutfit, surprise, switchMode, type BuilderState, type OutfitState } from './build'
import { NOT_SET } from './constants'
import { intimateOptions } from './intimates'
import { parseModes } from './modes'

const { modes } = parseModes(builderModes)
const faceless = modes.find((mode) => mode.id === 'faceless')!
const glamour = modes.find((mode) => mode.id === 'glamour')!
const state = (patch: Partial<BuilderState>): BuilderState => ({ ...switchMode(emptyBuilderState(), faceless), who: 'woman', age: 'late 20s', ...patch })
const wearing = (outfit: Partial<OutfitState>) => ({ outfit: { ...emptyOutfit(), ...outfit } })

function built(patch: Partial<BuilderState>, style: 'prose' | 'tags' = 'prose') {
  const result = buildPrompt(state(patch), faceless, style)
  if (result.status !== 'ready') throw new Error(result.reason)
  return result
}

const NUDITY = /\b(nude(?! lips)|naked|topless|nipples?|bare breasts|areolae?|genitals?|bottomless|see-through|sheer mesh)\b/i

describe('the Faceless purpose', () => {
  it('keeps the face out: cropped below the chin, no face or hair, and the face in the negative prompt', () => {
    const result = built({ eyeColor: 'green', hairColor: 'auburn', expression: 'soft smile', ...wearing({ lingerieTop: 'Lace bra' }) })
    expect(result.prompt).toMatch(/^A faceless photograph of an adult woman in her late 20s/)
    expect(result.prompt).toContain('neck-down shot cropped just below the chin with the face out of frame')
    expect(result.prompt).not.toMatch(/green eyes|auburn|smile/)
    expect(result.negativePrompt).toContain('face, head, eyes, lips')
  })

  it('needs "Who" and an adult age, as every 18+ purpose does', () => {
    expect(buildPrompt(state({ age: NOT_SET }), faceless).status).toBe('incomplete')
  })

  it('describes each garment in full in a sentence, and by name in tags', () => {
    const outfit = wearing({ lingerieTop: 'Balconette bra', lingerieTopColor: 'black', lingerieBottom: 'Brazilian bikini bottoms' })
    expect(built(outfit).prompt).toContain('wearing a black balconette bra with half-cups and wide-set straps that lift and frame the bust and Brazilian-cut bikini bottoms')
    expect(built(outfit, 'tags').prompt).toContain('black balconette bra')
  })

  it('never shows nudity: nothing see-through is offered, and covering is in the negative prompt', () => {
    const offered = intimateOptions('lingerieTop', state({}), faceless)
    expect(offered).toEqual(expect.arrayContaining(['Lace bra', 'String bikini top', 'Plunging one-piece swimsuit']))
    expect(offered).not.toContain('Sheer bra')
    expect(intimateOptions('lingerieTop', state({}), glamour)).toContain('Sheer bra')
    expect(built(wearing({ lingerieTop: 'Sheer bra' })).prompt).not.toMatch(/sheer/i)
    expect(built({}).negativePrompt).toContain('exposed nipples')
  })

  it('offers each subject what is cut for them', () => {
    const man = { who: 'man' }
    expect(intimateOptions('lingerieTop', man, faceless)).toEqual([])
    expect(intimateOptions('lingerieBottom', man, faceless)).toEqual(['Boxer briefs', 'Low-rise briefs', 'Trunks', 'Swim briefs', 'Swim trunks'])
    expect(intimateOptions('lingerieBottom', { who: 'woman' }, faceless)).not.toContain('Boxer briefs')
  })

  it('dresses Surprise me in a matching set, and keeps every prompt clothed', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const surprised = surprise(state({ who: seed % 3 ? 'woman' : 'man' }), seed, faceless)
      const { lingerieTop, lingerieBottom } = surprised.outfit
      expect(lingerieTop !== NOT_SET || lingerieBottom !== NOT_SET).toBe(true)
      const swim = [lingerieTop, lingerieBottom].filter((item) => item !== NOT_SET).map((item) => /bikini (top|bottoms)|swim/i.test(item))
      expect(new Set(swim).size).toBe(1)
      if (/one-piece/.test(lingerieTop)) expect(lingerieBottom).toBe(NOT_SET)
      const result = buildPrompt(surprised, faceless)
      expect(result.status === 'ready' ? result.prompt : result.reason).not.toMatch(NUDITY)
    }
  })
})
