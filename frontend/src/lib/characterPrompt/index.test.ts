import { expect, it } from 'vitest'
import sampleCharacters from '../../../../sample_characters.json'
import { animeModel, catalog, character, fastModel, historyItem, weightSlider } from '../../test/fixtures'
import type { Character, CharacterTraits, GenerationSettings, ModelInfo } from '../../types'
import { addsCharacterLook, promptToSend, renderStrength } from './.'
import { traitsOf } from '../promptBuilder/character'
import { emptyBuilderState } from '../promptBuilder/build'
import { initialSettings, settingsFromItem } from '../settings'

const ivySample = sampleCharacters.find((sample) => sample.name === 'Ivy')!
const ivy: Character = character({ id: 13, name: 'Ivy', traits: { ...traitsOf(emptyBuilderState()), ...ivySample.traits } as CharacterTraits })
const sentText = (...args: [GenerationSettings, Character | null, ModelInfo]) => {
  const sent = promptToSend(...args, [])
  return sent.status === 'ready' ? sent.prompt : sent.reason
}
const typed = { ...initialSettings(catalog), prompt: 'a girl under the rain in the middle of the street in new York. ', characterId: 13 }

it('puts the character’s look in front of a typed prompt, as a sentence for models that read prose', () => {
  expect(sentText(typed, ivy, fastModel)).toBe(
    'A photograph of an adult mixed-race woman in her early 20s. She has green eyes, wearing smoky eye makeup. Her skin is tan, with freckles. ' +
      'She is short with a curvy figure, full natural breasts and thick thighs. She has script tattoo on the ribs and a floral shoulder tattoo. ' +
      'Her very long lavender hair is styled in loose curls. a girl under the rain in the middle of the street in new York.',
  )
})

it('writes the look as tags for the tag-based models', () => {
  expect(sentText(typed, ivy, animeModel)).toMatch(/^masterpiece, best quality, amazing quality, 1girl, solo, adult woman, early 20s, mixed-race, green eyes, .*lavender hair.*, a girl under the rain/)
})

it('leaves a prompt alone without a character, or when it already has the look', () => {
  expect(sentText({ ...typed, characterId: null }, null, fastModel)).toBe(typed.prompt)
  expect(addsCharacterLook({ ...typed, lookIncluded: 13 }, ivy)).toBe(false)
  expect(sentText({ ...typed, lookIncluded: 13 }, ivy, fastModel)).toBe(typed.prompt)
  // The look of another character the prompt had doesn't count for this one
  expect(addsCharacterLook({ ...typed, lookIncluded: 4 }, ivy)).toBe(true)
})

it('treats the prompt of an image made for a character as already having its look', () => {
  expect(settingsFromItem(historyItem({ character_id: 13 }), catalog).lookIncluded).toBe(13)
  expect(settingsFromItem(historyItem(), catalog).lookIncluded).toBeNull()
})

it('writes a look slider moved in Create into the character’s look, for a model with that slider', () => {
  const withSlider: ModelInfo = { ...fastModel, addons: [...fastModel.addons, weightSlider] }
  expect(sentText({ ...typed, strengths: { weight: 3 } }, ivy, withSlider)).toContain('with a voluptuous figure')
  expect(sentText({ ...typed, strengths: { weight: -5 } }, ivy, withSlider)).toContain('with a slim build')
  expect(sentText({ ...typed, strengths: { weight: -5 } }, ivy, fastModel)).toContain('with a curvy figure')
})

it('takes a render’s strengths from the JSON prompt the builder wrote, else from Create’s Look section and the character', () => {
  const withSlider: ModelInfo = { ...fastModel, addons: [...fastModel.addons, weightSlider] }
  const spec = { version: 1 as const, purpose: 'general', body: { type: 'plus-size figure' }, look: { weight: 8 } }
  expect(renderStrength('weight', { status: 'ready', prompt: 'x', spec }, { ...typed, strengths: { weight: -4 } }, ivy, withSlider)).toBe(8)
  expect(renderStrength('weight', { status: 'ready', prompt: 'x' }, { ...typed, strengths: { weight: -4 } }, ivy, withSlider)).toBe(-4)
  expect(renderStrength('weight', { status: 'ready', prompt: 'x' }, typed, ivy, withSlider)).toBe(2)
  expect(renderStrength('weight', { status: 'ready', prompt: 'x' }, typed, null, withSlider)).toBe(0)
})
