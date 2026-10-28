import { describe, expect, it } from 'vitest'
import shippedModes from '../../../../prompt_modes.json'
import type { BuilderModeData } from '../../types'
import { buildPrompt, choicesFor, emptyBuilderState, type BuilderState } from './build'
import { parseModes } from './modes'
import { explicitDetailOptions } from './rules'
import { loadBuilderState } from './storage'

const { modes } = parseModes(shippedModes as unknown as BuilderModeData[])
const mode = (id: string) => modes.find((candidate) => candidate.id === id)!
const state = (patch: Partial<BuilderState>): BuilderState => ({ ...emptyBuilderState(), age: 'late 20s', mode: 'explicit', nudity: 'nude', ...patch })
const promptOf = (patch: Partial<BuilderState>, style: 'prose' | 'tags' = 'prose', modeId = 'explicit') => {
  const result = buildPrompt(state({ mode: modeId, ...patch }), mode(modeId), style)
  if (result.status !== 'ready') throw new Error(result.status)
  return result.prompt
}

describe('who and when the new options are offered', () => {
  it('offers a penis size with a man in the scene in the Explicit purpose, whatever the nudity, which comes in a later step', () => {
    expect(choicesFor('penis', state({ who: 'couple' }), mode('explicit'))).toContain('giant penis')
    expect(choicesFor('penis', state({ who: 'man', nudity: 'clothed' }), mode('explicit'))).toContain('giant penis')
    expect(choicesFor('penis', state({ who: 'woman' }), mode('explicit'))).toEqual([])
    expect(choicesFor('penis', state({ who: 'man', nudity: 'topless', mode: 'glamour' }), mode('glamour'))).toEqual([])
  })

  it('offers nipples with a woman in an 18+ purpose, and pubic hair in Explicit, whatever the nudity', () => {
    expect(choicesFor('nipples', state({ who: 'woman', nudity: 'clothed', mode: 'glamour' }), mode('glamour'))).toContain('puffy nipples')
    expect(choicesFor('nipples', state({ who: 'man' }), mode('explicit'))).toEqual([])
    expect(choicesFor('pubicHair', state({ who: 'woman', nudity: 'implied' }), mode('explicit'))).toContain('trimmed')
    expect(choicesFor('pubicHair', state({ who: 'woman', mode: 'general' }), mode('general'))).toEqual([])
  })

  it('writes them into the prompt only when the nudity shows them', () => {
    const choices = { who: 'couple', penis: 'giant penis', nipples: 'puffy nipples', pubicHair: 'trimmed' }
    expect(promptOf({ ...choices, nudity: 'clothed' })).not.toMatch(/penis is|giant|puffy|pubic hair/)
    const topless = promptOf({ ...choices, nudity: 'topless' })
    expect(topless).toContain('puffy nipples')
    expect(topless).not.toMatch(/giant|pubic hair/)
  })

  it('offers the bigger bust and butt sizes wherever the field is', () => {
    expect(choicesFor('bust', state({ who: 'woman', mode: 'general' }), mode('general'))).toContain('gigantic breasts')
    expect(choicesFor('hips', state({ who: 'man', mode: 'general' }), mode('general'))).toContain('huge butt')
  })

  it('offers each explicit detail only for the subject and nudity it needs, and none outside Explicit', () => {
    const couple = explicitDetailOptions(state({ who: 'couple' }), mode('explicit'))
    expect(couple).toEqual(expect.arrayContaining(['cum on face', 'creampie', 'squirting', 'erect penis', 'hickeys']))
    const woman = explicitDetailOptions(state({ who: 'woman' }), mode('explicit'))
    expect(woman).toEqual(expect.arrayContaining(['squirting', 'wet pussy', 'hickeys']))
    expect(woman).not.toContain('cum on face')
    expect(explicitDetailOptions(state({ who: 'man' }), mode('explicit'))).toEqual(expect.arrayContaining(['cum on stomach', 'erect penis']))
    expect(explicitDetailOptions(state({ who: 'two women' }), mode('explicit'))).not.toContain('cum on stomach')
    expect(explicitDetailOptions(state({ who: 'woman', nudity: 'topless' }), mode('explicit'))).not.toContain('squirting')
    expect(explicitDetailOptions(state({ who: 'couple', mode: 'glamour' }), mode('glamour'))).toEqual([])
  })
})

describe('the prompt', () => {
  const details: Partial<BuilderState> = { who: 'couple', penis: 'giant penis', nipples: 'puffy nipples', pubicHair: 'trimmed', explicitDetails: ['cum on breasts', 'squirting'] }

  it('says whose each detail is, in a sentence', () => {
    const prompt = promptOf(details)
    expect(prompt).toContain('The man has a giant, massively thick penis.')
    expect(prompt).toContain('The woman has puffy nipples.')
    expect(prompt).toContain('They have neatly trimmed pubic hair.')
    expect(prompt).toContain('With thick cum on the breasts and squirting, with fluid spraying.')
  })

  it('writes them as tags for the tag-based models', () => {
    expect(promptOf(details, 'tags')).toEqual(expect.stringContaining('gigantic penis, puffy nipples, trimmed pubic hair, cum on breasts, squirting, female ejaculation'))
  })

  it('leaves out details that no longer fit, such as a penis size after switching to a woman alone', () => {
    const prompt = promptOf({ ...details, who: 'woman' })
    expect(prompt).not.toMatch(/penis|cum on/)
    expect(prompt).toContain('squirting')
  })

  it('still needs "Who" and an adult age, and refuses a minor, with the new details', () => {
    expect(buildPrompt(state({ ...details, who: 'couple', age: '' }), mode('explicit')).status).toBe('incomplete')
    expect(buildPrompt(state({ ...details, subject: 'a teen' }), mode('explicit')).status).toBe('blocked')
  })
})

it('keeps choices saved before the new fields existed, giving them their defaults', () => {
  const { penis: _p, nipples: _n, pubicHair: _h, explicitDetails: _d, ...older } = state({ who: 'woman', hairColor: 'auburn' })
  localStorage.setItem('z-image-studio.prompt-builder.v3', JSON.stringify(older))
  expect(loadBuilderState()).toMatchObject({ who: 'woman', hairColor: 'auburn', penis: '', explicitDetails: [] })
})
