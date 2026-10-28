import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { buildPrompt, emptyBuilderState, hasRandomChoice, surprise, switchMode, type BuilderState, type BuildResult, type OutfitState } from '../../lib/promptBuilder/build'
import { FALLBACK_MODE, isAdultMode, parseModes, type BuilderMode, type StepId } from '../../lib/promptBuilder/modes'
import { loadBuilderState, saveBuilderState } from '../../lib/promptBuilder/storage'
import { secondaryButtonClass } from '../../lib/styles'
import { withTraits } from '../../lib/promptBuilder/character'
import type { BuilderModeData, Character, ModelInfo } from '../../types'
import { CharacterSummary, SaveAsCharacter } from './CharacterParts'
import { Modal } from '../Modal'
import { ModePicker } from './ModePicker'
import { AppearanceStep, BodyStep, CameraStep, FinishStep, IntimacyStep, OutfitStep, PoseStep, SceneStep, SubjectStep, type StepProps } from './steps'
import { Dices } from 'lucide-react'

export type InsertMode = 'replace' | 'append'

interface Step {
  id: StepId
  label: string
  Component: ComponentType<StepProps>
}

const STEPS: Step[] = [
  { id: 'subject', label: 'Subject', Component: SubjectStep },
  { id: 'appearance', label: 'Face & hair', Component: AppearanceStep },
  { id: 'body', label: 'Body', Component: BodyStep },
  { id: 'outfit', label: 'Outfit', Component: OutfitStep },
  { id: 'pose', label: 'Pose & action', Component: PoseStep },
  { id: 'intimacy', label: 'Intimacy (18+)', Component: IntimacyStep },
  { id: 'scene', label: 'Scene & light', Component: SceneStep },
  { id: 'camera', label: 'Camera', Component: CameraStep },
  { id: 'finish', label: 'Mood & finish', Component: FinishStep },
]

const newSeed = () => Math.floor(Math.random() * 2 ** 31)

// A chosen character fixes these steps, so one Character step shows its look in their place
const CHARACTER_STEPS: ReadonlySet<StepId> = new Set(['appearance', 'body'])

/** A character with an uploaded face photo is kept safe for work, so the 18+ purposes are not offered for it. */
function modesFor(modes: BuilderMode[], character: Character | null): BuilderMode[] {
  if (!character?.face_uploaded) return modes
  const everyday = modes.filter((mode) => !isAdultMode(mode))
  return everyday.length ? everyday : [FALLBACK_MODE]
}

function stepsFor(mode: BuilderMode, character: Character | null): Step[] {
  const shown = STEPS.filter((step) => mode.steps.includes(step.id))
  if (!character) return shown
  return shown.filter((step) => !CHARACTER_STEPS.has(step.id)).map((step) => (step.id === 'subject' ? { ...step, label: 'Character' } : step))
}

interface Props {
  model: ModelInfo
  /** The modes from prompt_modes.json; the builder checks them and leaves out any it cannot use. */
  modes: readonly BuilderModeData[]
  /** The character chosen in Create: its look replaces the Subject, Face & hair and Body choices. */
  character: Character | null
  onCharacterSaved: (character: Character) => void
  hasExistingPrompt: boolean
  maxPromptLength: number
  onClose: () => void
  /** `explicit` says the prompt has explicit content, so the editor can drop negatives such as "nsfw" that fight it. */
  onConfirm: (prompt: string, negativePrompt: string, mode: InsertMode, explicit: boolean) => void
}

export function PromptBuilderDialog({ model, modes: modeData, character, onCharacterSaved, hasExistingPrompt, maxPromptLength, onClose, onConfirm }: Props) {
  const [state, setState] = useState<BuilderState>(loadBuilderState)
  const [stepId, setStepId] = useState<StepId>(STEPS[0].id)
  useEffect(() => saveBuilderState(state), [state])
  const { modes: allModes, problems } = useMemo(() => parseModes(modeData), [modeData])
  const modes = modesFor(allModes, character)
  const mode = modes.find((candidate) => candidate.id === state.mode) ?? modes[0]
  // The character's look is applied when building, not saved into the builder, so your own choices come back without it
  const result = useMemo(
    () => buildPrompt(character ? withTraits(state, character.traits) : state, mode, model.prompt_style),
    [state, character, mode, model.prompt_style],
  )

  const steps = stepsFor(mode, character)
  const step = steps.find((candidate) => candidate.id === stepId) ?? steps[0]
  const set = (patch: Partial<BuilderState>) => setState((current) => ({ ...current, ...patch }))
  const setOutfit = (patch: Partial<OutfitState>) => setState((current) => ({ ...current, outfit: { ...current.outfit, ...patch } }))
  const confirm = (mode: InsertMode) => {
    if (result.status !== 'ready') return
    onConfirm(result.prompt, result.negativePrompt, mode, result.explicit)
    onClose()
  }

  const tooLong = promptTooLong(result, maxPromptLength)
  return (
    <Modal
      title="Prompt builder"
      onClose={onClose}
      size="xl"
      actionsNote={actionsNote(tooLong, hasExistingPrompt)}
      actions={<DialogActions ready={result.status === 'ready' && !tooLong} hasExistingPrompt={hasExistingPrompt} onCancel={onClose} onConfirm={confirm} />}
    >
      <ModePicker modes={modes} current={mode.id} problems={problems} onSelect={(next) => setState((current) => switchMode(current, next))} />
      <div className="grid gap-5 lg:h-[62vh] lg:grid-cols-[170px_minmax(0,1fr)_minmax(0,340px)]">
        <StepNav steps={steps} current={step.id} onSelect={setStepId} />
        <section aria-label={step.label} className="min-h-0 overflow-y-auto pr-1">
          <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{step.label}</h3>
          <StepContent step={step} character={character} onCharacterSaved={onCharacterSaved} state={state} mode={mode} set={set} setOutfit={setOutfit} />
        </section>
        <PreviewPane
          result={result}
          styleNote={styleNote(model, mode)}
          maxPromptLength={maxPromptLength}
          canReroll={hasRandomChoice(state)}
          onSurprise={() => setState((current) => surprise(current, newSeed(), mode))}
          onReroll={() => set({ rollSeed: newSeed() })}
          onReset={() => setState(switchMode(emptyBuilderState(), mode))}
        />
      </div>
    </Modal>
  )
}

interface StepContentProps extends StepProps {
  step: Step
  character: Character | null
  onCharacterSaved: (character: Character) => void
}

function StepContent({ step, character, onCharacterSaved, ...props }: StepContentProps) {
  if (step.id !== 'subject') return <step.Component {...props} />
  if (character) return <CharacterSummary character={character} />
  return (
    <>
      <step.Component {...props} />
      <SaveAsCharacter state={props.state} onSaved={onCharacterSaved} />
    </>
  )
}

function promptTooLong(result: BuildResult, maxPromptLength: number): boolean {
  return result.status === 'ready' && result.prompt.length > maxPromptLength
}

function styleNote(model: ModelInfo, mode: BuilderMode): string {
  if (model.prompt_style !== 'tags') return `Written as a detailed description for ${model.label}.`
  const weighted = Object.keys(mode.weights).length > 0
  return `Written as tags for ${model.label}${weighted ? `, with the key ${mode.label.toLowerCase()} tags weighted higher` : ''}.`
}

function StepNav({ steps, current, onSelect }: { steps: Step[]; current: StepId; onSelect: (id: StepId) => void }) {
  return (
    <nav aria-label="Builder steps" className="-mx-1 flex gap-1 overflow-x-auto px-1 lg:flex-col lg:overflow-visible">
      {steps.map((step, index) => (
        <button
          key={step.id}
          type="button"
          aria-current={step.id === current ? 'step' : undefined}
          onClick={() => onSelect(step.id)}
          className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium whitespace-nowrap transition ${
            step.id === current
              ? 'bg-violet-50 text-violet-900 dark:bg-violet-950/60 dark:text-violet-100'
              : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
          }`}
        >
          <span className="flex size-5 items-center justify-center rounded-full bg-zinc-200 text-[10px] tabular-nums dark:bg-zinc-700">{index + 1}</span>
          {step.label}
        </button>
      ))}
    </nav>
  )
}

interface PreviewPaneProps {
  result: BuildResult
  styleNote: string
  maxPromptLength: number
  canReroll: boolean
  onSurprise: () => void
  onReroll: () => void
  onReset: () => void
}

function PreviewPane({ result, styleNote, maxPromptLength, canReroll, onSurprise, onReroll, onReset }: PreviewPaneProps) {
  return (
    <aside aria-label="Preview" className="flex min-h-0 flex-col gap-3 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-950/60">
      <button
        type="button"
        onClick={onSurprise}
        className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90"
      >
        <Dices /> Surprise me
      </button>
      <div className="flex items-center justify-between text-xs">
        <h3 className="font-semibold text-zinc-700 dark:text-zinc-200">Preview</h3>
        <span className="flex gap-3">
          <button type="button" onClick={onReroll} disabled={!canReroll} title="Pick new values for fields set to Random" className="text-violet-600 disabled:text-zinc-400 dark:text-violet-400">
            Re-roll
          </button>
          <button type="button" onClick={onReset} className="text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
            Reset all
          </button>
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <PreviewBody result={result} maxPromptLength={maxPromptLength} />
      </div>
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
        {styleNote}
      </p>
    </aside>
  )
}

function PreviewBody({ result, maxPromptLength }: { result: BuildResult; maxPromptLength: number }) {
  if (result.status === 'incomplete') return <p className="text-xs text-zinc-500 dark:text-zinc-400">{result.reason}</p>
  if (result.status === 'blocked') {
    return <p role="alert" className="rounded-lg bg-red-50 p-2.5 text-xs text-red-800 dark:bg-red-950/50 dark:text-red-200">{result.reason}</p>
  }
  const tooLong = result.prompt.length > maxPromptLength
  return (
    <div className="space-y-2">
      <p aria-label="Built prompt" className="text-xs leading-relaxed text-zinc-800 dark:text-zinc-100">{result.prompt}</p>
      <p className={`text-right text-[11px] tabular-nums ${tooLong ? 'font-semibold text-red-600' : 'text-zinc-400'}`}>
        {result.prompt.length}/{maxPromptLength}
      </p>
      <details className="text-[11px] text-zinc-500 dark:text-zinc-400">
        <summary className="cursor-pointer">Negative prompt</summary>
        <p aria-label="Built negative prompt" className="mt-1 leading-relaxed">{result.negativePrompt}</p>
      </details>
    </div>
  )
}

function actionsNote(tooLong: boolean, hasExistingPrompt: boolean): string {
  if (tooLong) return 'The prompt is too long; remove some details.'
  return hasExistingPrompt ? 'Use this prompt replaces the text in the Write box.' : 'The prompt goes into the Write box, where you can still edit it.'
}

interface ActionsProps {
  ready: boolean
  hasExistingPrompt: boolean
  onCancel: () => void
  onConfirm: (mode: InsertMode) => void
}

function DialogActions({ ready, hasExistingPrompt, onCancel, onConfirm }: ActionsProps) {
  const disabled = !ready
  return (
    <>
      <button type="button" onClick={onCancel} className={secondaryButtonClass}>
        Cancel
      </button>
      {hasExistingPrompt && (
        <button type="button" onClick={() => onConfirm('append')} disabled={disabled} className={secondaryButtonClass}>
          Append to prompt
        </button>
      )}
      <button type="button" onClick={() => onConfirm('replace')} disabled={disabled} className="rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50">
        Use this prompt
      </button>
    </>
  )
}
