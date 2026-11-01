import { describe, expect, it } from 'vitest'
import { builderModes } from '../../../test/fixtures'
import { buildPrompt, emptyBuilderState, emptyOutfit, surprise, switchMode, type BuilderState, type OutfitState } from '../build'
import { NOT_SET } from '../constants'
import { intimateOptions, intimateSet } from '../intimates'
import { parseModes } from '../modes'

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

  it('never shows nudity: nothing see-through or bare is offered, and covering is in the negative prompt', () => {
    const offered = [...intimateOptions('lingerieTop', state({}), faceless), ...intimateOptions('lingerieBottom', state({}), faceless)]
    expect(offered).toEqual(expect.arrayContaining(['Lace bra', 'Latex corset', 'Micro bikini top', 'Sling bikini', 'G-string bikini bottoms', 'Micro thong']))
    for (const bare of ['Sheer bra', 'Nipple pasties', 'Shelf bra (cupless)', 'Quarter-cup bra', 'Open-cup bra', 'Crotchless panties']) {
      expect(offered).not.toContain(bare)
      expect(intimateOptions(bare === 'Crotchless panties' ? 'lingerieBottom' : 'lingerieTop', state({}), glamour)).toContain(bare)
    }
    expect(built(wearing({ lingerieTop: 'Lace bra', lingerieBottom: 'Sheer panties' })).prompt).not.toMatch(/sheer/i)
    expect(built(wearing({ lingerieTop: 'Lace bra' })).negativePrompt).toContain('exposed nipples')
  })

  it('always keeps her clothed: a top is needed, and nothing can be left off', () => {
    expect(buildPrompt(state({}), faceless)).toMatchObject({ status: 'incomplete', reason: 'Choose a top: this purpose always shows her clothed.' })
    expect(buildPrompt(state(wearing({ lingerieTop: 'Nipple pasties' })), faceless).status).toBe('incomplete')
    expect(buildPrompt(state({ who: 'man', ...wearing({ lingerieBottom: 'Jockstrap' }) }), faceless).status).toBe('ready')
    const removed = built(wearing({ lingerieTop: 'Latex corset', lingerieBottom: 'remove', top: 'remove' })).prompt
    expect(removed).toContain('wearing a latex corset with a wet-look shine moulded tight to the waist and bust.')
    expect(removed).not.toMatch(/\bno (top|lingerie)/)
  })

  it('offers each subject what is cut for them', () => {
    const man = { who: 'man' }
    expect(intimateOptions('lingerieTop', man, faceless)).toEqual(['Unbuttoned shirt', 'Cropped tank top', 'Sleeveless compression top', 'Leather chest harness', 'Mesh tank top'])
    expect(intimateOptions('lingerieTop', { who: 'woman' }, faceless)).not.toContain('Unbuttoned shirt')
    expect(intimateOptions('lingerieBottom', man, faceless)).toEqual([
      'Boxer briefs', 'Low-rise briefs', 'Trunks', 'Jockstrap', 'Pouch briefs', 'Silk boxers', 'Swim briefs', 'Swim trunks', 'Micro swim briefs', 'Square-cut swim trunks', 'Swim thong',
    ])
    expect(intimateOptions('lingerieBottom', { who: 'woman' }, faceless)).not.toContain('Boxer briefs')
  })

  it('dresses Surprise me in a matching set, and keeps every prompt clothed', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const surprised = surprise(state({ who: seed % 3 ? 'woman' : 'man' }), seed, faceless)
      const { lingerieTop, lingerieBottom } = surprised.outfit
      expect(lingerieTop !== NOT_SET || lingerieBottom !== NOT_SET).toBe(true)
      if (seed % 3) expect(lingerieTop).not.toBe(NOT_SET)
      const swim = [lingerieTop, lingerieBottom].filter((item) => item !== NOT_SET).map((item) => /bikini (top|bottoms)|swim/i.test(item))
      expect(new Set(swim).size).toBe(1)
      if (/one-piece/.test(lingerieTop)) expect(lingerieBottom).toBe(NOT_SET)
      const result = buildPrompt(surprised, faceless)
      expect(result.status === 'ready' ? result.prompt : result.reason).not.toMatch(NUDITY)
    }
  })
})

describe('Surprise me for a man in an 18+ purpose', () => {
  it('gives him a spicy top about half the time, and none with swimwear', () => {
    let withTop = 0
    for (let seed = 1; seed <= 200; seed++) {
      const { lingerieTop, lingerieBottom } = intimateSet({ who: 'man' }, faceless, seed)
      if (lingerieTop !== NOT_SET) withTop++
      if (/swim/i.test(lingerieBottom)) expect(lingerieTop).toBe(NOT_SET)
    }
    expect(withTop).toBeGreaterThan(30)
    expect(withTop).toBeLessThan(100)
  })

  it('writes his top in full', () => {
    const prompt = built({ who: 'man', ...wearing({ lingerieTop: 'Unbuttoned shirt', lingerieBottom: 'Boxer briefs' }) }).prompt
    expect(prompt).toContain('He is wearing a shirt hanging fully unbuttoned and open over the bare chest and fitted boxer briefs that hug the thighs.')
  })
})

describe('a faceless prompt never points to the face', () => {
  const EYES = /\beyes?\b|catchlights?|illuminating the face/i

  it('leaves out the eyes from the realism details and writes the lights without the face', () => {
    const prompt = built({ realism: ['sharp focus on the eyes', 'subtle film grain'], lightingSetup: 'ring light', lightingMore: ['screen/monitor glow'], ...wearing({ lingerieTop: 'Lace bra' }) }).prompt
    expect(prompt).toContain('even ring light illumination with minimal shadows')
    expect(prompt).toContain('Subtle film grain.')
    expect(prompt).not.toMatch(EYES)
  })

  it('never mentions the eyes over many Surprise me prompts, and other purposes keep them', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const result = buildPrompt(surprise(state({}), seed, faceless), faceless)
      expect(result.status === 'ready' ? result.prompt : '', `seed ${seed}`).not.toMatch(EYES)
    }
    const general = modes.find((mode) => mode.id === 'general')!
    const portrait = buildPrompt({ ...emptyBuilderState(), who: 'woman', lightingSetup: 'ring light', realism: ['sharp focus on the eyes'] }, general)
    expect(portrait.status === 'ready' && portrait.prompt).toMatch(/catchlights in the eyes.*sharp focus on the eyes/i)
  })
})
