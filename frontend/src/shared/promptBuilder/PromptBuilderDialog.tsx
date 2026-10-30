import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { buildPrompt, emptyBuilderState, hasRandomChoice, surprise, switchMode, type BuilderState, type BuildResult, type OutfitState } from '../../lib/promptBuilder/build'
import { modeLabel, modesForCharacter, parseModes, type BuilderMode, type StepId } from '../../lib/promptBuilder/modes'
import { specFromState, type PromptSpec } from '../../lib/promptBuilder/spec'
import { loadBuilderState, saveBuilderState } from '../../lib/promptBuilder/storage'
import { secondaryButtonClass } from '../../lib/styles'
import { withTraits } from '../../lib/promptBuilder/character'
import type { BuilderModeData, Character, ModelInfo } from '../../types'
import { CharacterSummary, SaveAsCharacter } from './CharacterParts'
import { ClashWarnings } from './ClashWarnings'
import { Modal } from '../ui/Modal'
import { ModePicker } from './ModePicker'
import { AppearanceStep, BodyStep, CameraStep, FinishStep, ImageBodyChoices, IntimacyStep, OutfitStep, PoseStep, SceneStep, SubjectStep, type StepProps } from './steps'
import { t, type MessageKey } from '../../i18n'
import { Dices } from 'lucide-react'

export type InsertMode = 'replace' | 'append'

interface Step {
  id: StepId
  label: MessageKey
  Component: ComponentType<StepProps>
}

const STEPS: Step[] = [
  { id: 'subject', label: 'builder.stepSubject', Component: SubjectStep },
  { id: 'appearance', label: 'builder.stepAppearance', Component: AppearanceStep },
  { id: 'body', label: 'builder.stepBody', Component: BodyStep },
  { id: 'outfit', label: 'builder.stepOutfit', Component: OutfitStep },
  { id: 'pose', label: 'builder.stepPose', Component: PoseStep },
  { id: 'intimacy', label: 'builder.stepIntimacy', Component: IntimacyStep },
  { id: 'scene', label: 'builder.stepScene', Component: SceneStep },
  { id: 'camera', label: 'builder.stepCamera', Component: CameraStep },
  { id: 'finish', label: 'builder.stepFinish', Component: FinishStep },
]

const newSeed = () => Math.floor(Math.random() * 2 ** 31)

// A chosen character fixes these steps, so one Character step shows its look in their place
const CHARACTER_STEPS: ReadonlySet<StepId> = new Set(['appearance', 'body'])

function stepsFor(mode: BuilderMode, character: Character | null): Step[] {
  const shown = STEPS.filter((step) => mode.steps.includes(step.id))
  if (!character) return shown
  return shown.filter((step) => !CHARACTER_STEPS.has(step.id)).map((step) => (step.id === 'subject' ? { ...step, label: 'builder.stepCharacter' } : step))
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
  /** Choices to start from instead of the last ones, such as a JSON prompt opened in the builder. */
  initialState?: BuilderState
  /**
   * `explicit` says the prompt has explicit content, so the editor can drop negatives such as "nsfw" that fight it;
   * `spec` is the same prompt as JSON.
   */
  onConfirm: (prompt: string, negativePrompt: string, mode: InsertMode, explicit: boolean, spec: PromptSpec) => void
}

export function PromptBuilderDialog({ model, modes: modeData, character, onCharacterSaved, hasExistingPrompt, maxPromptLength, initialState, onClose, onConfirm }: Props) {
  const [state, setState] = useState<BuilderState>(() => initialState ?? loadBuilderState())
  const [stepId, setStepId] = useState<StepId>(STEPS[0].id)
  useEffect(() => saveBuilderState(state), [state])
  const { modes: allModes, problems } = useMemo(() => parseModes(modeData), [modeData])
  const modes = modesForCharacter(allModes, character)
  const mode = modes.find((candidate) => candidate.id === state.mode) ?? modes[0]
  // The character's look is applied when building, not saved into the builder, so your own choices come back without it
  const withLook = useMemo(() => (character ? withTraits(state, character.traits) : state), [state, character])
  const result = useMemo(() => buildPrompt(withLook, mode, model.prompt_style), [withLook, mode, model.prompt_style])

  const steps = stepsFor(mode, character)
  const step = steps.find((candidate) => candidate.id === stepId) ?? steps[0]
  const set = (patch: Partial<BuilderState>) => setState((current) => ({ ...current, ...patch }))
  const setOutfit = (patch: Partial<OutfitState>) => setState((current) => ({ ...current, outfit: { ...current.outfit, ...patch } }))
  const confirm = (insert: InsertMode) => {
    if (result.status !== 'ready') return
    onConfirm(result.prompt, result.negativePrompt, insert, result.explicit, specFromState(withLook, mode))
    onClose()
  }

  const tooLong = promptTooLong(result, maxPromptLength)
  return (
    <Modal
      title={t('builder.title')}
      onClose={onClose}
      size="xl"
      actionsNote={actionsNote(tooLong, hasExistingPrompt)}
      actions={<DialogActions ready={result.status === 'ready' && !tooLong} hasExistingPrompt={hasExistingPrompt} onCancel={onClose} onConfirm={confirm} />}
    >
      <ModePicker modes={modes} current={mode.id} problems={problems} onSelect={(next) => setState((current) => switchMode(current, next))} />
      <div className="grid gap-5 lg:h-[62vh] lg:grid-cols-[170px_minmax(0,1fr)_minmax(0,340px)]">
        <StepNav steps={steps} current={step.id} onSelect={setStepId} />
        <section aria-label={t(step.label)} className="min-h-0 overflow-y-auto pr-1">
          <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t(step.label)}</h3>
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
  if (character) {
    return (
      <>
        <CharacterSummary character={character} />
        <ImageBodyChoices state={withTraits(props.state, character.traits)} mode={props.mode} set={props.set} />
      </>
    )
  }
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
  if (model.prompt_style !== 'tags') return t('builder.styleProse', { model: model.label })
  if (Object.keys(mode.weights).length === 0) return t('builder.styleTags', { model: model.label })
  return t('builder.styleTagsWeighted', { model: model.label, purpose: modeLabel(mode) })
}

function StepNav({ steps, current, onSelect }: { steps: Step[]; current: StepId; onSelect: (id: StepId) => void }) {
  return (
    // On phones the steps stay at the top while a long step scrolls under them
    <nav aria-label={t('builder.stepsLabel')} className="sticky top-0 z-10 -mx-1 flex gap-1 overflow-x-auto bg-white px-1 py-1 lg:static lg:flex-col lg:overflow-visible lg:bg-transparent lg:py-0 dark:bg-zinc-900 lg:dark:bg-transparent">
      {steps.map((step, index) => (
        <button
          key={step.id}
          type="button"
          aria-current={step.id === current ? 'step' : undefined}
          onClick={() => onSelect(step.id)}
          className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium whitespace-nowrap transition pointer-coarse:min-h-11 ${
            step.id === current
              ? 'bg-violet-50 text-violet-900 dark:bg-violet-950/60 dark:text-violet-100'
              : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
          }`}
        >
          <span className="flex size-5 items-center justify-center rounded-full bg-zinc-200 text-[10px] tabular-nums dark:bg-zinc-700">{index + 1}</span>
          {t(step.label)}
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
    <aside aria-label={t('builder.preview')} className="flex min-h-0 flex-col gap-3 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-950/60">
      <button
        type="button"
        onClick={onSurprise}
        className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90"
      >
        <Dices /> {t('builder.surprise')}
      </button>
      <div className="flex items-center justify-between text-xs">
        <h3 className="font-semibold text-zinc-700 dark:text-zinc-200">{t('builder.preview')}</h3>
        <span className="flex gap-3">
          <button type="button" onClick={onReroll} disabled={!canReroll} title={t('builder.rerollHint')} className="text-violet-600 disabled:text-zinc-400 dark:text-violet-400">
            {t('builder.reroll')}
          </button>
          <button type="button" onClick={onReset} className="text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
            {t('builder.resetAll')}
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
      <ClashWarnings clashes={result.clashes} />
      <p aria-label={t('builder.builtPrompt')} className="text-xs leading-relaxed text-zinc-800 dark:text-zinc-100">{result.prompt}</p>
      <p className={`text-right text-[11px] tabular-nums ${tooLong ? 'font-semibold text-red-600' : 'text-zinc-400'}`}>
        {result.prompt.length}/{maxPromptLength}
      </p>
      <details className="text-[11px] text-zinc-500 dark:text-zinc-400">
        <summary className="cursor-pointer">{t('builder.negativePrompt')}</summary>
        <p aria-label={t('builder.builtNegativePrompt')} className="mt-1 leading-relaxed">{result.negativePrompt}</p>
      </details>
    </div>
  )
}

function actionsNote(tooLong: boolean, hasExistingPrompt: boolean): string {
  if (tooLong) return t('builder.noteTooLong')
  return t(hasExistingPrompt ? 'builder.noteReplaces' : 'builder.noteInsert')
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
        {t('common.cancel')}
      </button>
      {hasExistingPrompt && (
        <button type="button" onClick={() => onConfirm('append')} disabled={disabled} className={secondaryButtonClass}>
          {t('builder.append')}
        </button>
      )}
      <button type="button" onClick={() => onConfirm('replace')} disabled={disabled} className="rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50">
        {t('builder.useThis')}
      </button>
    </>
  )
}
