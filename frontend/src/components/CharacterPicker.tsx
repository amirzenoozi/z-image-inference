import { useCharacters } from '../lib/characters'
import type { Character } from '../types'
import { Select } from './form/Select'
import { ErrorNotice } from './ui'

const NONE = ''

interface Props {
  characterId: number | null
  onChange: (character: Character | null) => void
}

/** The character the next images are made for; the builder writes its look and History can filter by it. */
export function CharacterPicker({ characterId, onChange }: Props) {
  const { characters, reload } = useCharacters()
  if (characters.status === 'failed') return <ErrorNotice message={`Characters could not be loaded: ${characters.error}`} onRetry={reload} />
  if (characters.status === 'pending') {
    return <div aria-busy="true" aria-label="Loading characters" className="h-9 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
  }
  if (characters.value.length === 0) return null
  const pick = (value: string) => onChange(characters.value.find((character) => String(character.id) === value) ?? null)
  return (
    <Select
      label="Character"
      value={characterId === null ? NONE : String(characterId)}
      groups={[{ options: [{ value: NONE, label: 'No character' }, ...characters.value.map((character) => ({ value: String(character.id), label: character.name }))] }]}
      onChange={pick}
    />
  )
}
