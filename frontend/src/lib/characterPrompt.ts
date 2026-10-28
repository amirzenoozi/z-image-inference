import { characterLook } from './promptBuilder/character'
import type { Character, GenerationSettings, ModelInfo } from '../types'

/** Whether Generate puts the character's look in front of the prompt: a character is chosen and the prompt doesn't have its look yet. */
export function addsCharacterLook(settings: GenerationSettings, character: Character | null): character is Character {
  return character !== null && settings.lookIncluded !== character.id
}

/**
 * The prompt Generate sends: with a character chosen, its look first, so a prompt you type still shows that person.
 * A prompt that already has the look (from the prompt builder, or reused from an image made with it) is sent as it is.
 */
export function promptToSend(settings: GenerationSettings, character: Character | null, model: ModelInfo): string {
  if (!addsCharacterLook(settings, character)) return settings.prompt
  const look = characterLook(character, model.prompt_style)
  if (!look) return settings.prompt
  const separator = model.prompt_style === 'tags' ? ', ' : ' '
  return `${look}${separator}${settings.prompt.trim()}`
}
