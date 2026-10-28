import { useState, type ReactNode } from 'react'
import { createCharacter, updateCharacter } from '../api'
import { t } from '../i18n'
import { useCharacters } from '../lib/characters'
import { errorMessage } from '../lib/hooks'
import { emptyBuilderState, type BuilderState } from '../lib/promptBuilder/build'
import { characterProblem, surpriseLook, traitsOf, withTraits } from '../lib/promptBuilder/character'
import { FALLBACK_MODE } from '../lib/promptBuilder/modes'
import { fieldLabelClass, secondaryButtonClass } from '../lib/styles'
import type { Character } from '../types'
import { faceChanges, initialFace, type FaceLock } from '../lib/characterFace'
import { CharacterFace } from './CharacterFace'
import { TextInput } from './form/TextInput'
import { Modal } from './Modal'
import { AppearanceStep, BodyStep, SubjectStep, type StepProps } from './promptBuilder/steps'
import { Dices } from 'lucide-react'

const newSeed = () => Math.floor(Math.random() * 2 ** 31)

type SaveState = { status: 'idle' } | { status: 'saving' } | { status: 'failed'; error: string }

/** The seed as typed: empty for a new seed each time, or a whole number in range; undefined when it is neither. */
function parseSeed(text: string, maxSeed: number): number | null | undefined {
  if (!text.trim()) return null
  const seed = Number(text)
  return Number.isInteger(seed) && seed >= 0 && seed <= maxSeed ? seed : undefined
}

function problemWith(name: string, state: BuilderState, seed: number | null | undefined, maxSeed: number): string | null {
  if (seed === undefined) return t('characters.seedProblem', { max: String(maxSeed) })
  return characterProblem(name, traitsOf(state))
}

interface Props {
  /** The character to edit; null to create one. */
  character: Character | null
  maxSeed: number
  onClose: () => void
}

/** Creates a character, or edits one: its name, seed, look (chosen with the prompt builder's own steps) and face lock. */
export function CharacterEditor({ character, maxSeed, onClose }: Props) {
  const { reload } = useCharacters()
  const [name, setName] = useState(character?.name ?? '')
  const [seedText, setSeedText] = useState(character?.seed?.toString() ?? '')
  const [state, setState] = useState<BuilderState>(() => (character ? withTraits(emptyBuilderState(), character.traits) : emptyBuilderState()))
  const [face, setFace] = useState<FaceLock>(() => initialFace(character))
  const [save, setSave] = useState<SaveState>({ status: 'idle' })
  const steps: StepProps = { state, mode: FALLBACK_MODE, set: (patch) => setState((current) => ({ ...current, ...patch })), setOutfit: () => {} }

  const submit = async () => {
    const seed = parseSeed(seedText, maxSeed)
    const problem = problemWith(name, state, seed, maxSeed)
    if (problem) return setSave({ status: 'failed', error: problem })
    setSave({ status: 'saving' })
    const changes = { name: name.trim(), traits: traitsOf(state), seed: seed ?? null, ...faceChanges(face) }
    try {
      await (character ? updateCharacter(character.id, changes) : createCharacter(changes))
      reload()
      onClose()
    } catch (error) {
      setSave({ status: 'failed', error: errorMessage(error) })
    }
  }

  return (
    <Modal
      title={character ? t('characters.editTitle', { name: character.name }) : t('characters.newCharacter')}
      onClose={onClose}
      size="lg"
      actions={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            {t('common.cancel')}
          </button>
          <button type="button" onClick={() => void submit()} disabled={save.status === 'saving'} className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50">
            {save.status === 'saving' ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1">
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <label className="block">
            <span className={`${fieldLabelClass} mb-1 block`}>{t('characters.name')}</span>
            <TextInput value={name} maxLength={40} onChange={(event) => setName(event.target.value)} placeholder={t('characters.namePlaceholder')} />
          </label>
          <label className="block">
            <span className={`${fieldLabelClass} mb-1 block`}>{t('characters.seed')}</span>
            <TextInput value={seedText} inputMode="numeric" onChange={(event) => setSeedText(event.target.value)} placeholder={t('characters.seedPlaceholder')} />
          </label>
          <button
            type="button"
            onClick={() => setState((current) => surpriseLook(current, newSeed()))}
            className="flex h-10 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 text-sm font-semibold text-white shadow-sm hover:opacity-90"
          >
            <Dices /> {t('characters.surpriseMe')}
          </button>
        </div>
        <EditorSection title={t('characters.sectionSubject')}>
          <SubjectStep {...steps} />
        </EditorSection>
        <EditorSection title={t('characters.sectionFaceHair')}>
          <AppearanceStep {...steps} />
        </EditorSection>
        <EditorSection title={t('characters.sectionBody')}>
          <BodyStep {...steps} />
        </EditorSection>
        <EditorSection title={t('characters.sectionFaceLock')}>
          <CharacterFace face={face} characterId={character?.id ?? null} name={name} onChange={setFace} />
        </EditorSection>
        {save.status === 'failed' && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {save.error}
          </p>
        )}
      </div>
    </Modal>
  )
}

function EditorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-2">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
      {children}
    </section>
  )
}
