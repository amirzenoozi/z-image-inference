import { useState } from 'react'
import { deleteCharacter, imageUrl } from '../api'
import { t, tn } from '../i18n'
import { GENDERS, genderLabel, matchesGender, useGenderFilter, type Gender } from '../lib/characterFilter'
import { useCharacters } from '../lib/characters'
import { errorMessage } from '../lib/hooks'
import { traitsSummary } from '../lib/promptBuilder/character'
import { secondaryButtonClass, tabClass } from '../lib/styles'
import type { Character } from '../types'
import { CharacterEditor } from './CharacterEditor'
import { IconButton } from './IconButton'
import { Modal } from './Modal'
import { SensitiveImage } from './SensitiveImage'
import { ErrorNotice } from './ui'
import { Images, Pencil, Plus, Trash2, UserRound } from 'lucide-react'

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
  const [gender, setGender] = useGenderFilter()
  const [editing, setEditing] = useState<Editing>(null)
  const [deleting, setDeleting] = useState<Character | null>(null)
  const all = characters.status === 'settled' ? characters.value : null
  const shown = all?.filter((character) => matchesGender(character, gender)) ?? null
  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <GenderSwitch gender={gender} onChange={setGender} />
        <p className="text-sm text-zinc-500 tabular-nums dark:text-zinc-400">{countLabel(shown?.length ?? null, all?.length ?? null)}</p>
        <button type="button" onClick={() => setEditing({ character: null })} className="ml-auto flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-500">
          <Plus /> {t('characters.newCharacter')}
        </button>
      </div>
      {characters.status === 'pending' && <CharactersSkeleton />}
      {characters.status === 'failed' && <ErrorNotice message={characters.error} onRetry={reload} />}
      {all && shown && (
        <CharacterResults
          all={all}
          shown={shown}
          onShowAll={() => setGender('all')}
          onUse={onUse}
          onShowImages={onShowImages}
          onEdit={(character) => setEditing({ character })}
          onDelete={setDeleting}
        />
      )}
      {editing && <CharacterEditor character={editing.character} maxSeed={maxSeed} onClose={() => setEditing(null)} />}
      {deleting && <ConfirmDelete character={deleting} onClose={() => setDeleting(null)} />}
    </div>
  )
}

interface ResultsProps {
  all: Character[]
  /** The characters the gender filter lets through. */
  shown: Character[]
  onShowAll: () => void
  onUse: (character: Character) => void
  onShowImages: (character: Character) => void
  onEdit: (character: Character) => void
  onDelete: (character: Character) => void
}

/** The loaded characters: the cards, or why there are none (no characters at all, or none of this gender). */
function CharacterResults({ all, shown, onShowAll, ...actions }: ResultsProps) {
  if (all.length === 0) return <NoCharacters />
  if (shown.length === 0) return <NoMatches onShowAll={onShowAll} />
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {shown.map((character) => (
        <CharacterCard
          key={character.id}
          character={character}
          onUse={() => actions.onUse(character)}
          onShowImages={() => actions.onShowImages(character)}
          onEdit={() => actions.onEdit(character)}
          onDelete={() => actions.onDelete(character)}
        />
      ))}
    </ul>
  )
}

/** "13 characters", or "5 of 13 characters" while the filter hides some; null counts are still loading. */
function countLabel(shown: number | null, total: number | null): string {
  if (shown === null || total === null) return t('characters.loadingCharacters')
  const characters = tn('characters.characterCount', total)
  return shown === total ? characters : t('characters.countOfTotal', { shown, characters })
}

function GenderSwitch({ gender, onChange }: { gender: Gender; onChange: (gender: Gender) => void }) {
  return (
    <div role="radiogroup" aria-label={t('characters.gender')} className="flex gap-1 rounded-xl bg-zinc-100 p-1 text-sm dark:bg-zinc-800/70">
      {GENDERS.map((id) => (
        <button key={id} type="button" role="radio" aria-checked={gender === id} onClick={() => onChange(id)} className={`rounded-lg px-3 py-1 font-medium transition ${tabClass(gender === id)}`}>
          {genderLabel(id)}
        </button>
      ))}
    </div>
  )
}

function NoMatches({ onShowAll }: { onShowAll: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
      <p>{t('characters.noMatches')}</p>
      <button type="button" onClick={onShowAll} className={`${secondaryButtonClass} mt-3`}>
        {t('common.showAll')}
      </button>
    </div>
  )
}

interface CardProps {
  character: Character
  onUse: () => void
  onShowImages: () => void
  onEdit: () => void
  onDelete: () => void
}

function CharacterCard({ character, onUse, onShowImages, onEdit, onDelete }: CardProps) {
  return (
    <li aria-label={character.name} className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <CharacterCover character={character} />
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{character.name}</h3>
          <p className="line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">{traitsSummary(character.traits)}</p>
          <p className="mt-1 text-[11px] text-zinc-400 tabular-nums">{cardFacts(character)}</p>
        </div>
        <div className="mt-auto flex items-center gap-1">
          <button type="button" onClick={onUse} className="mr-auto rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-violet-500">
            {t('common.use')}
          </button>
          <IconButton label={t('characters.showImages')} onClick={onShowImages} disabled={character.image_count === 0} className={cardIconClass}>
            <Images />
          </IconButton>
          <IconButton label={t('common.edit')} onClick={onEdit} className={cardIconClass}>
            <Pencil />
          </IconButton>
          <IconButton label={t('common.delete')} onClick={onDelete} className={`${cardIconClass} hover:text-red-600 dark:hover:text-red-400`}>
            <Trash2 />
          </IconButton>
        </div>
      </div>
    </li>
  )
}

/** "2 images · seed 42 · face locked": the image count, and the seed and face lock when the character has them. */
function cardFacts(character: Character): string {
  const faceLocked = character.face_id !== null || character.face_uploaded
  const facts = [
    tn('characters.imageCount', character.image_count),
    character.seed === null ? '' : t('characters.seedNote', { seed: String(character.seed) }),
    faceLocked ? t('characters.faceLocked') : '',
  ]
  return facts.filter(Boolean).join(' · ')
}

const cardIconClass =
  'flex size-7 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'

function CharacterCover({ character }: { character: Character }) {
  if (character.cover_id === null) {
    return (
      <div className="flex aspect-[3/4] items-center justify-center bg-zinc-100 text-zinc-400 dark:bg-zinc-800 [&_svg]:size-10">
        <UserRound />
      </div>
    )
  }
  return <SensitiveImage src={imageUrl(character.cover_id, true)} sensitive={character.cover_sensitive} className="aspect-[3/4] w-full" />
}

function CharactersSkeleton() {
  return (
    <div aria-busy="true" aria-label={t('characters.loadingCharactersLabel')} className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="aspect-[3/5] animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
      ))}
    </div>
  )
}

function NoCharacters() {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
      {t('characters.noCharacters')}
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
      title={t('characters.deleteTitle', { name: character.name })}
      onClose={onClose}
      actions={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            {t('common.cancel')}
          </button>
          <button type="button" onClick={() => void remove()} disabled={state.status === 'deleting'} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50">
            {state.status === 'deleting' ? t('common.deleting') : t('common.delete')}
          </button>
        </>
      }
    >
      <p className="text-sm text-zinc-600 dark:text-zinc-300">{t('characters.deleteNote', { name: character.name })}</p>
      {state.status === 'failed' && (
        <div className="mt-3">
          <ErrorNotice message={state.error} />
        </div>
      )}
    </Modal>
  )
}
