import { useState, type KeyboardEvent } from 'react'
import { createCharacter, updateCharacter } from '../../api'
import { t, type MessageKey } from '../../i18n'
import { useCharacters } from '../../lib/characters'
import { errorMessage } from '../../lib/hooks'
import { emptyBuilderState, type BuilderState } from '../../lib/promptBuilder/build'
import { characterProblem, surpriseLook, traitsOf, withTraits } from '../../lib/promptBuilder/character'
import { FALLBACK_MODE } from '../../lib/promptBuilder/modes'
import { NOT_SET } from '../../lib/promptBuilder/constants'
import { fieldLabelClass, secondaryButtonClass, tabClass } from '../../lib/styles'
import type { Character } from '../../types'
import { faceChanges, initialFace, type FaceLock } from '../../lib/characterFace'
import { CharacterFace } from './CharacterFace'
import { TextInput } from '../../shared/form/TextInput'
import { Modal } from '../../shared/ui/Modal'
import { AppearanceStep, BodyStep, SubjectStep, type StepProps } from '../../shared/promptBuilder/steps'
import { Dices } from 'lucide-react'

const newSeed = () => Math.floor(Math.random() * 2 ** 31)

type SaveState = { status: 'idle' } | { status: 'saving' } | { status: 'failed'; error: string }

/** The seed as typed: empty for a new seed each time, or a whole number in range; undefined when it is neither. */
function parseSeed(text: string, maxSeed: number): number | null | undefined {
  if (!text.trim()) return null
  const seed = Number(text)
  return Number.isInteger(seed) && seed >= 0 && seed <= maxSeed ? seed : undefined
}

type TabId = 'subject' | 'appearance' | 'body' | 'face'

const TABS: readonly { id: TabId; label: MessageKey }[] = [
  { id: 'subject', label: 'characters.sectionSubject' },
  { id: 'appearance', label: 'characters.sectionFaceHair' },
  { id: 'body', label: 'characters.sectionBody' },
  { id: 'face', label: 'characters.sectionFaceLock' },
]

/** The tab whose fields a failed save points at: "Who" and the age are on Subject. */
function tabForProblem(state: BuilderState, current: TabId): TabId {
  return state.who === NOT_SET || state.age === NOT_SET ? 'subject' : current
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
  const [tab, setTab] = useState<TabId>('subject')
  const steps: StepProps = { state, mode: FALLBACK_MODE, set: (patch) => setState((current) => ({ ...current, ...patch })), setOutfit: () => {} }

  const submit = async () => {
    const seed = parseSeed(seedText, maxSeed)
    const problem = problemWith(name, state, seed, maxSeed)
    if (problem) {
      setTab(tabForProblem(state, tab))
      return setSave({ status: 'failed', error: problem })
    }
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
        <EditorTabs current={tab} onSelect={setTab} />
        <div role="tabpanel" id={`character-panel-${tab}`} aria-labelledby={`character-tab-${tab}`}>
          {tab === 'subject' && <SubjectStep {...steps} />}
          {tab === 'appearance' && <AppearanceStep {...steps} />}
          {tab === 'body' && <BodyStep {...steps} />}
          {tab === 'face' && <CharacterFace face={face} characterId={character?.id ?? null} name={name} onChange={setFace} />}
        </div>
        {save.status === 'failed' && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {save.error}
          </p>
        )}
      </div>
    </Modal>
  )
}

const ARROW_STEPS: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowLeft: -1 }

/** One tab per part of the look, so only that part's fields show; the arrow keys move between them. */
function EditorTabs({ current, onSelect }: { current: TabId; onSelect: (id: TabId) => void }) {
  const moveWithArrows = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = ARROW_STEPS[event.key]
    if (!step) return
    const index = (TABS.findIndex((tab) => tab.id === current) + step + TABS.length) % TABS.length
    onSelect(TABS[index].id)
    event.currentTarget.querySelector<HTMLButtonElement>(`#character-tab-${TABS[index].id}`)?.focus()
  }
  return (
    <div role="tablist" aria-label={t('characters.tabsLabel')} onKeyDown={moveWithArrows} className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1 text-xs font-medium sm:grid-cols-4 dark:bg-zinc-800/70">
      {TABS.map(({ id, label }) => (
        <TabButton key={id} id={id} label={t(label)} selected={id === current} onSelect={onSelect} />
      ))}
    </div>
  )
}

function TabButton({ id, label, selected, onSelect }: { id: TabId; label: string; selected: boolean; onSelect: (id: TabId) => void }) {
  return (
    <button
      type="button"
      role="tab"
      id={`character-tab-${id}`}
      aria-selected={selected}
      aria-controls={`character-panel-${id}`}
      tabIndex={selected ? 0 : -1}
      onClick={() => onSelect(id)}
      className={`rounded-lg py-1.5 transition ${tabClass(selected)}`}
    >
      {label}
    </button>
  )
}
