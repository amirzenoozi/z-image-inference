import { useCharacters } from '../lib/characters'
import type { Character, ModelInfo } from '../types'
import { Select } from './form/Select'
import { ErrorNotice } from './ui'

const NONE = ''

interface Props {
  characterId: number | null
  model: ModelInfo
  /** Whether Generate puts the character's look in front of the prompt, or the prompt has it already. */
  addsLook: boolean
  onChange: (character: Character | null) => void
}

/** The character the next images are made for: Generate adds its look to the prompt, and History can filter by it. */
export function CharacterPicker({ characterId, model, addsLook, onChange }: Props) {
  const { characters, reload } = useCharacters()
  if (characters.status === 'failed') return <ErrorNotice message={`Characters could not be loaded: ${characters.error}`} onRetry={reload} />
  if (characters.status === 'pending') {
    return <div aria-busy="true" aria-label="Loading characters" className="h-9 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
  }
  if (characters.value.length === 0) return null
  const pick = (value: string) => onChange(characters.value.find((character) => String(character.id) === value) ?? null)
  const chosen = characters.value.find((character) => character.id === characterId) ?? null
  return (
    <div className="space-y-1.5">
      <Select
        label="Character"
        value={characterId === null ? NONE : String(characterId)}
        groups={[{ options: [{ value: NONE, label: 'No character' }, ...characters.value.map((character) => ({ value: String(character.id), label: character.name }))] }]}
        onChange={pick}
      />
      {chosen && <LookNote character={chosen} addsLook={addsLook} />}
      {chosen && <FaceLockNote character={chosen} model={model} />}
      {chosen?.face_uploaded && <SafeForWorkNote name={chosen.name} />}
    </div>
  )
}

function LookNote({ character, addsLook }: { character: Character; addsLook: boolean }) {
  const text = addsLook ? `${character.name}'s look is added to the start of your prompt.` : `Your prompt already has ${character.name}'s look.`
  return <p className="text-xs text-zinc-500 dark:text-zinc-400">{text}</p>
}

function SafeForWorkNote({ name }: { name: string }) {
  return <p className="text-xs text-amber-700 dark:text-amber-300">{name}'s face is an uploaded photo, so images of {name} are kept safe for work.</p>
}

/** Whether the character's face is kept in the next render, which only the SDXL models can do. */
function FaceLockNote({ character, model }: { character: Character; model: ModelInfo }) {
  if (character.face_id === null && !character.face_uploaded) return null
  const from = character.face_uploaded ? 'the uploaded photo' : `image #${character.face_id}`
  const text = model.supports_face_lock
    ? `Face locked to ${from} at ${Math.round(character.face_strength * 100)}%.`
    : `${model.label} can't lock a face, so ${character.name}'s look comes from the description only. WAI-Illustrious and Anime Desire keep the face.`
  return <p className="text-xs text-zinc-500 dark:text-zinc-400">{text}</p>
}
