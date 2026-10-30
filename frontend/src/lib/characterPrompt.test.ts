import { expect, it } from 'vitest'
import sampleCharacters from '../../../sample_characters.json'
import { animeModel, catalog, character, fastModel, historyItem } from '../test/fixtures'
import type { Character, CharacterTraits, GenerationSettings, ModelInfo } from '../types'
import { addsCharacterLook, promptToSend } from './characterPrompt'
import { traitsOf } from './promptBuilder/character'
import { emptyBuilderState } from './promptBuilder/build'
import { initialSettings, settingsFromItem } from './settings'

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
