import { useState } from 'react'
import { deleteCharacter, imageUrl } from '../api'
import { useCharacters } from '../lib/characters'
import { errorMessage } from '../lib/hooks'
import { traitsSummary } from '../lib/promptBuilder/character'
import { secondaryButtonClass } from '../lib/styles'
import type { Character } from '../types'
import { CharacterEditor } from './CharacterEditor'
import { Modal } from './Modal'
import { ErrorNotice } from './ui'
import { Plus, UserRound } from 'lucide-react'

interface Props {
  maxSeed: number
  /** Opens Create with this character chosen. */
  onUse: (character: Character) => void
  /** Opens History filtered to this character's images. */
  onShowImages: (character: Character) => void
}

/** Editing holds the character being edited, or null while a new one is being made. */
type Editing = { character: Character | null } | null

export function CharactersPanel({ maxSeed, onUse, onShowImages }: Props) {
  const { characters, reload } = useCharacters()
  const [editing, setEditing] = useState<Editing>(null)
  const [deleting, setDeleting] = useState<Character | null>(null)
  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{countLabel(characters.status === 'settled' ? characters.value.length : null)}</p>
        <button type="button" onClick={() => setEditing({ character: null })} className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-500">
          <Plus /> New character
        </button>
      </div>
      {characters.status === 'pending' && <CharactersSkeleton />}
      {characters.status === 'failed' && <ErrorNotice message={characters.error} onRetry={reload} />}
      {characters.status === 'settled' && characters.value.length === 0 && <NoCharacters />}
      {characters.status === 'settled' && characters.value.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {characters.value.map((character) => (
            <CharacterCard
              key={character.id}
              character={character}
              onUse={() => onUse(character)}
              onShowImages={() => onShowImages(character)}
              onEdit={() => setEditing({ character })}
              onDelete={() => setDeleting(character)}
            />
          ))}
        </ul>
      )}
      {editing && <CharacterEditor character={editing.character} maxSeed={maxSeed} onClose={() => setEditing(null)} />}
      {deleting && <ConfirmDelete character={deleting} onClose={() => setDeleting(null)} />}
    </div>
  )
}

function countLabel(count: number | null): string {
  if (count === null) return 'Loading characters…'
  return count === 1 ? '1 character' : `${count} characters`
}

interface CardProps {
  character: Character
  onUse: () => void
  onShowImages: () => void
  onEdit: () => void
  onDelete: () => void
}

function CharacterCard({ character, onUse, onShowImages, onEdit, onDelete }: CardProps) {
  const images = character.image_count === 1 ? '1 image' : `${character.image_count} images`
  return (
    <li aria-label={character.name} className="flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <CharacterCover character={character} />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">{character.name}</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{traitsSummary(character.traits)}</p>
          <p className="mt-1 text-xs text-zinc-400 tabular-nums">
            {images}
            {character.seed !== null && ` · seed ${character.seed}`}
            {character.face_id !== null && ' · face locked'}
          </p>
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-2">
          <button type="button" onClick={onUse} className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-500">
            Use
          </button>
          <button type="button" onClick={onShowImages} disabled={character.image_count === 0} className={`${secondaryButtonClass} disabled:opacity-50`}>
            Show images
          </button>
          <button type="button" onClick={onEdit} className={secondaryButtonClass}>
            Edit
          </button>
          <button type="button" onClick={onDelete} className="ml-auto text-sm font-medium text-red-600 hover:text-red-500">
            Delete
          </button>
        </div>
      </div>
    </li>
  )
}

function CharacterCover({ character }: { character: Character }) {
  if (character.cover_id === null) {
    return (
      <div className="flex aspect-square items-center justify-center bg-zinc-100 text-zinc-400 dark:bg-zinc-800 [&_svg]:size-12">
        <UserRound />
      </div>
    )
  }
  return <img src={imageUrl(character.cover_id, true)} alt="" className="aspect-square w-full bg-zinc-100 object-cover dark:bg-zinc-800" />
}

function CharactersSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading characters" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="aspect-[3/4] animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
      ))}
    </div>
  )
}

function NoCharacters() {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
      No characters yet. Create one here, or save one from the Subject step of the prompt builder.
    </div>
  )
}

type DeleteState = { status: 'idle' } | { status: 'deleting' } | { status: 'failed'; error: string }

function ConfirmDelete({ character, onClose }: { character: Character; onClose: () => void }) {
  const { reload } = useCharacters()
  const [state, setState] = useState<DeleteState>({ status: 'idle' })
  const remove = async () => {
    setState({ status: 'deleting' })
    try {
      await deleteCharacter(character.id)
      reload()
      onClose()
    } catch (error) {
      setState({ status: 'failed', error: errorMessage(error) })
    }
  }
  return (
    <Modal
      title={`Delete ${character.name}?`}
      onClose={onClose}
      actions={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            Cancel
          </button>
          <button type="button" onClick={() => void remove()} disabled={state.status === 'deleting'} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50">
            {state.status === 'deleting' ? 'Deleting…' : 'Delete'}
          </button>
        </>
      }
    >
      <p className="text-sm text-zinc-600 dark:text-zinc-300">Its images stay in History, no longer linked to {character.name}.</p>
      {state.status === 'failed' && (
        <div className="mt-3">
          <ErrorNotice message={state.error} />
        </div>
      )}
    </Modal>
  )
}
