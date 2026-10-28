import { useState, type ReactNode } from 'react'
import { createCharacter, updateCharacter } from '../api'
import { useCharacters } from '../lib/characters'
import { errorMessage } from '../lib/hooks'
import { emptyBuilderState, type BuilderState } from '../lib/promptBuilder/build'
import { characterProblem, traitsOf, withTraits } from '../lib/promptBuilder/character'
import { FALLBACK_MODE } from '../lib/promptBuilder/modes'
import { fieldLabelClass, secondaryButtonClass } from '../lib/styles'
import type { Character } from '../types'
import { CharacterFace, type FaceLock } from './CharacterFace'
import { TextInput } from './form/TextInput'
import { Modal } from './Modal'
import { AppearanceStep, BodyStep, SubjectStep, type StepProps } from './promptBuilder/steps'

type SaveState = { status: 'idle' } | { status: 'saving' } | { status: 'failed'; error: string }

/** The seed as typed: empty for a new seed each time, or a whole number in range; undefined when it is neither. */
function parseSeed(text: string, maxSeed: number): number | null | undefined {
  if (!text.trim()) return null
  const seed = Number(text)
  return Number.isInteger(seed) && seed >= 0 && seed <= maxSeed ? seed : undefined
}

function problemWith(name: string, state: BuilderState, seed: number | null | undefined, maxSeed: number): string | null {
  if (seed === undefined) return `The seed must be a whole number from 0 to ${maxSeed}, or empty.`
  return characterProblem(name, traitsOf(state))
}

interface Props {
  /** The character to edit; null to create one. */
  character: Character | null
  maxSeed: number
  onClose: () => void
}

const DEFAULT_FACE_STRENGTH = 0.6

/** Creates a character, or edits one: its name, seed, look (chosen with the prompt builder's own steps) and face lock. */
export function CharacterEditor({ character, maxSeed, onClose }: Props) {
  const { reload } = useCharacters()
  const [name, setName] = useState(character?.name ?? '')
  const [seedText, setSeedText] = useState(character?.seed?.toString() ?? '')
  const [state, setState] = useState<BuilderState>(() => (character ? withTraits(emptyBuilderState(), character.traits) : emptyBuilderState()))
  const [face, setFace] = useState<FaceLock>({ id: character?.face_id ?? null, strength: character?.face_strength ?? DEFAULT_FACE_STRENGTH })
  const [save, setSave] = useState<SaveState>({ status: 'idle' })
  const steps: StepProps = { state, mode: FALLBACK_MODE, set: (patch) => setState((current) => ({ ...current, ...patch })), setOutfit: () => {} }

  const submit = async () => {
    const seed = parseSeed(seedText, maxSeed)
    const problem = problemWith(name, state, seed, maxSeed)
    if (problem) return setSave({ status: 'failed', error: problem })
    setSave({ status: 'saving' })
    const changes = { name: name.trim(), traits: traitsOf(state), seed: seed ?? null, face_id: face.id, face_strength: face.strength }
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
      title={character ? `Edit ${character.name}` : 'New character'}
      onClose={onClose}
      size="lg"
      actions={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            Cancel
          </button>
          <button type="button" onClick={() => void submit()} disabled={save.status === 'saving'} className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50">
            {save.status === 'saving' ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={`${fieldLabelClass} mb-1 block`}>Name</span>
            <TextInput value={name} maxLength={40} onChange={(event) => setName(event.target.value)} placeholder="e.g. Ava" />
          </label>
          <label className="block">
            <span className={`${fieldLabelClass} mb-1 block`}>Seed</span>
            <TextInput value={seedText} inputMode="numeric" onChange={(event) => setSeedText(event.target.value)} placeholder="Empty: a new seed each time" />
          </label>
        </div>
        <EditorSection title="Subject">
          <SubjectStep {...steps} />
        </EditorSection>
        <EditorSection title="Face & hair">
          <AppearanceStep {...steps} />
        </EditorSection>
        <EditorSection title="Body">
          <BodyStep {...steps} />
        </EditorSection>
        <EditorSection title="Face lock">
          <CharacterFace face={face} onChange={setFace} />
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
