import { useState } from 'react'
import { updateCharacter } from '../api'
import { useCharacter, useCharacters } from '../lib/characters'
import { errorMessage } from '../lib/hooks'
import type { Character, CharacterChanges, HistoryItem } from '../types'
import { UserRound } from 'lucide-react'

type SaveState = { status: 'idle' } | { status: 'saving' } | { status: 'failed'; error: string }

/** Saves a change to the character, then reloads the characters so every view shows it. */
function useCharacterChange(character: Character | null) {
  const { reload } = useCharacters()
  const [state, setState] = useState<SaveState>({ status: 'idle' })
  const change = async (changes: CharacterChanges) => {
    if (!character) return
    setState({ status: 'saving' })
    try {
      await updateCharacter(character.id, changes)
      setState({ status: 'idle' })
      reload()
    } catch (error) {
      setState({ status: 'failed', error: errorMessage(error) })
    }
  }
  return { state, change }
}

/** The character an image was made for, with ways to make the image its card's cover or the face its renders keep. */
export function ImageCharacter({ item }: { item: HistoryItem }) {
  const character = useCharacter(item.character_id)
  const { state, change } = useCharacterChange(character)
  if (!character) return null
  const saving = state.status === 'saving'
  return (
    <div className="space-y-1">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-600 dark:text-zinc-300">
        <UserRound className="text-violet-500" />
        <span className="font-semibold text-zinc-800 dark:text-zinc-100">{character.name}</span>
        <RoleAction active={character.cover_id === item.id} activeLabel="its cover" label="Set as cover" disabled={saving} onClick={() => void change({ cover_id: item.id })} />
        <RoleAction active={character.face_id === item.id} activeLabel="its face" label="Use as face" disabled={saving} onClick={() => void change({ face_id: item.id })} />
      </p>
      {state.status === 'failed' && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
    </div>
  )
}

interface RoleActionProps {
  active: boolean
  activeLabel: string
  label: string
  disabled: boolean
  onClick: () => void
}

function RoleAction({ active, activeLabel, label, disabled, onClick }: RoleActionProps) {
  if (active) return <span className="text-zinc-400">· {activeLabel}</span>
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="text-violet-600 hover:text-violet-500 disabled:opacity-50 dark:text-violet-400">
      {label}
    </button>
  )
}
