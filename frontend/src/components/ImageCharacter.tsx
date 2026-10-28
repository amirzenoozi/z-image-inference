import { useState } from 'react'
import { updateCharacter } from '../api'
import { useCharacter, useCharacters } from '../lib/characters'
import { errorMessage } from '../lib/hooks'
import type { HistoryItem } from '../types'
import { UserRound } from 'lucide-react'

type CoverState = { status: 'idle' } | { status: 'saving' } | { status: 'failed'; error: string }

/** The character an image was made for, with a way to put the image on the character's card. */
export function ImageCharacter({ item }: { item: HistoryItem }) {
  const character = useCharacter(item.character_id)
  const { reload } = useCharacters()
  const [cover, setCover] = useState<CoverState>({ status: 'idle' })
  if (!character) return null
  const isCover = character.cover_id === item.id
  const setAsCover = async () => {
    setCover({ status: 'saving' })
    try {
      await updateCharacter(character.id, { cover_id: item.id })
      setCover({ status: 'idle' })
      reload()
    } catch (error) {
      setCover({ status: 'failed', error: errorMessage(error) })
    }
  }
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
        <UserRound className="text-violet-500" />
        <span className="font-semibold text-zinc-800 dark:text-zinc-100">{character.name}</span>
        {isCover ? (
          <span className="text-zinc-400">· its cover</span>
        ) : (
          <button type="button" onClick={() => void setAsCover()} disabled={cover.status === 'saving'} className="text-violet-600 hover:text-violet-500 disabled:opacity-50 dark:text-violet-400">
            {cover.status === 'saving' ? 'Setting…' : 'Set as cover'}
          </button>
        )}
      </p>
      {cover.status === 'failed' && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {cover.error}
        </p>
      )}
    </div>
  )
}
