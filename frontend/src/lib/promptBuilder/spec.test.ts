import { describe, expect, it } from 'vitest'
import example from '../../test/promptSpecExample.json'
import { builderModes } from '../../test/fixtures'
import { buildPrompt, emptyBuilderState, surprise, type BuilderState, type PromptStyle } from './build'
import { RANDOM } from './constants'
import { modesForCharacter, parseModes } from './modes'
import { parseSpec, promptFromSpec, specFromState, specText, stateFromSpec, type PromptSpec } from './spec'

const { modes } = parseModes(builderModes)
const modeOf = (id: string) => modes.find((mode) => mode.id === id)!
const exampleText = JSON.stringify(example)

function written(spec: PromptSpec, style: PromptStyle = 'prose', open = modes): string {
  const result = promptFromSpec(spec, open, style)
  return result.status === 'ready' ? result.prompt : `${result.status}: ${result.reason}`
}

function parsed(text: string): PromptSpec {
  const result = parseSpec(text)
  if (!result.ok) throw new Error(result.reason)
  return result.spec
}

describe('the JSON prompt', () => {
  it('reads the example both sides share and writes it for each kind of model', () => {
    const spec = parsed(exampleText)
    expect(written(spec)).toMatch(/^A fitness photograph of an adult Southeast Asian woman in her late 20s/)
    expect(written(spec)).toContain('lifting a heavy barbell in a deadlift')
    expect(written(spec)).toMatch(/chalk dust in the air/i)
    expect(written(spec, 'tags')).toContain('deadlift')
  })

  it.each(modes.map((mode) => mode.id))('writes what the builder writes, for the %s purpose', (id) => {
    const mode = modeOf(id)
    for (let seed = 1; seed <= 25; seed++) {
      const state: BuilderState = surprise({ ...emptyBuilderState(), mode: id }, seed, mode)
      const spec = parsed(specText(specFromState(state, mode)))
      for (const style of ['prose', 'tags'] as const) {
        const built = buildPrompt(state, mode, style)
        expect(written(spec, style)).toBe(built.status === 'ready' ? built.prompt : `${built.status}: ${built.reason}`)
      }
      expect(specFromState(stateFromSpec(spec), mode)).toEqual(spec)
    }
  })

  it('settles Random choices and leaves unset ones out', () => {
    const mode = modeOf('general')
    const state = { ...emptyBuilderState(), who: 'man', pose: RANDOM, outfit: { ...emptyBuilderState().outfit, accessories: [RANDOM, '', ''] as [string, string, string] } }
    const spec = specFromState(state, mode)
    expect(specText(spec)).not.toContain(RANDOM)
    expect(Object.keys(spec)).toEqual(['version', 'purpose', 'subject', 'pose', 'outfit'])
    expect(written(spec)).toBe((buildPrompt(state, mode) as { prompt: string }).prompt)
  })

  it.each([
    ['{ "version": 1, ', /can't be read/],
    ['[]', /JSON must be a JSON object/],
    [JSON.stringify({ ...example, version: 2 }), /version 2/],
    [JSON.stringify({ ...example, mood: 'calm' }), /doesn't know: mood/],
    [JSON.stringify({ ...example, hair: { colour: 'red' } }), /doesn't know: hair\.colour/],
    [JSON.stringify({ ...example, hair: { color: 'sparkly' } }), /"sparkly" is not an option for hair\.color/],
    [JSON.stringify({ ...example, appearance: { makeup: 'natural makeup' } }), /appearance\.makeup must be a list/],
    [JSON.stringify({ ...example, outfit: { top: { color: 'black' } } }), /outfit\.top needs an "item"/],
    [JSON.stringify({ ...example, outfit: { accessories: ['Anklet', 'Anklet', 'Anklet', 'Anklet'] } }), /outfit\.accessories must be a list/],
    [JSON.stringify({ ...example, pose: { pose: RANDOM } }), /"random" is not an option for pose\.pose/],
  ])('says what is wrong with %s', (text, reason) => {
    const result = parseSpec(text)
    expect(result.ok).toBe(false)
    expect(result.ok ? '' : result.reason).toMatch(reason)
  })
})

describe('the builder rules still apply to a JSON prompt', () => {
  const explicit = (subject: Record<string, string>): PromptSpec => ({ version: 1, purpose: 'explicit', subject })

  it('needs an adult for adult content and refuses words that suggest a minor', () => {
    expect(written(explicit({ who: 'woman' }))).toMatch(/^incomplete/)
    expect(written(explicit({ who: 'woman', age: 'late 20s', description: 'a schoolgirl' }))).toMatch(/^blocked: .*schoolgirl/)
    expect(written(explicit({ who: 'woman', age: 'late 20s' }))).toMatch(/adult woman/)
  })

  it('keeps the 18+ purposes away from a character with an uploaded face', () => {
    const safeOnly = modesForCharacter(modes, { face_uploaded: true })
    expect(written(explicit({ who: 'woman', age: 'late 20s' }), 'prose', safeOnly)).toMatch(/^blocked: .*"explicit" doesn't exist/)
  })

  it('leaves out a spicy cut once no adult is chosen, as the builder does', () => {
    const spec = { ...parsed(exampleText), subject: { who: 'woman' }, outfit: { top: { item: 'Low-cut sports bra' } } }
    expect(written(spec)).not.toMatch(/low-cut/i)
  })
})
