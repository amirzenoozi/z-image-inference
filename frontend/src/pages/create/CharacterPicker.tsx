import { useCharacters } from '../../lib/characters'
import type { Character, ModelInfo } from '../../types'
import { Select } from '../../shared/form/Select'
import { ErrorNotice } from '../../shared/ui/ui'
import { t } from '../../i18n'

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
  if (characters.status === 'failed') return <ErrorNotice message={t('create.charactersLoadFailed', { error: characters.error })} onRetry={reload} />
  if (characters.status === 'pending') {
    return <div aria-busy="true" aria-label={t('create.loadingCharacters')} className="h-9 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
  }
  if (characters.value.length === 0) return null
  const pick = (value: string) => onChange(characters.value.find((character) => String(character.id) === value) ?? null)
  const chosen = characters.value.find((character) => character.id === characterId) ?? null
  return (
    <div className="space-y-1.5">
      <Select
        label={t('create.character')}
        value={characterId === null ? NONE : String(characterId)}
        groups={[{ options: [{ value: NONE, label: t('create.noCharacter') }, ...characters.value.map((character) => ({ value: String(character.id), label: character.name }))] }]}
        onChange={pick}
      />
      {chosen && <LookNote character={chosen} addsLook={addsLook} />}
      {chosen && <FaceLockNote character={chosen} model={model} />}
      {chosen?.face_uploaded && <SafeForWorkNote name={chosen.name} />}
    </div>
  )
}

function LookNote({ character, addsLook }: { character: Character; addsLook: boolean }) {
  const text = addsLook ? t('create.lookAdded', { name: character.name }) : t('create.lookIncluded', { name: character.name })
  return <p className="text-xs text-zinc-500 dark:text-zinc-400">{text}</p>
}

function SafeForWorkNote({ name }: { name: string }) {
  return <p className="text-xs text-amber-700 dark:text-amber-300">{t('create.safeForWorkNote', { name })}</p>
}

/** Whether the character's face is kept in the next render, which only the SDXL models can do. */
function FaceLockNote({ character, model }: { character: Character; model: ModelInfo }) {
  if (character.face_id === null && !character.face_uploaded) return null
  const from = character.face_uploaded ? t('create.faceFromUpload') : t('create.faceFromImage', { id: character.face_id ?? '' })
  const text = model.supports_face_lock
    ? t('create.faceLocked', { from, percent: Math.round(character.face_strength * 100) })
    : t('create.cantLockFace', { model: model.label, name: character.name })
  return <p className="text-xs text-zinc-500 dark:text-zinc-400">{text}</p>
}
