import { characterLook } from './promptBuilder/character'
import { modesForCharacter, type BuilderMode } from './promptBuilder/modes'
import { parseSpec, promptFromSpec, type PromptSpec } from './promptBuilder/spec'
import type { Character, GenerationSettings, ModelInfo } from '../types'

export type SentPrompt = { status: 'ready'; prompt: string; spec?: PromptSpec } | { status: 'problem'; reason: string }

/** Whether Generate puts the character's look in front of the prompt: a character is chosen and the prompt doesn't have its look yet. */
export function addsCharacterLook(settings: GenerationSettings, character: Character | null): character is Character {
  return character !== null && settings.lookIncluded !== character.id
}

/** The prompt as text, without a look Generate adds: a JSON prompt is written for the model, within the purposes open to the character. */
export function writtenPrompt(settings: GenerationSettings, character: Character | null, model: ModelInfo, modes: readonly BuilderMode[]): SentPrompt {
  if (settings.promptFormat === 'text') return { status: 'ready', prompt: settings.prompt }
  const parsed = parseSpec(settings.prompt)
  if (!parsed.ok) return { status: 'problem', reason: parsed.reason }
  const result = promptFromSpec(parsed.spec, modesForCharacter(modes, character), model.prompt_style)
  return result.status === 'ready' ? { status: 'ready', prompt: result.prompt, spec: parsed.spec } : { status: 'problem', reason: result.reason }
}

/**
 * The prompt Generate sends: with a character chosen, its look first, so a prompt you type still shows that person.
 * A prompt that already has the look (from the prompt builder, or reused from an image made with it) is sent as it is.
 */
export function promptToSend(settings: GenerationSettings, character: Character | null, model: ModelInfo, modes: readonly BuilderMode[]): SentPrompt {
  const written = writtenPrompt(settings, character, model, modes)
  if (written.status !== 'ready' || !addsCharacterLook(settings, character)) return written
  const look = characterLook(character, model.prompt_style)
  if (!look) return written
  const separator = model.prompt_style === 'tags' ? ', ' : ' '
  return { ...written, prompt: `${look}${separator}${written.prompt.trim()}` }
}
