import { useContext, useEffect, useMemo, useState, type ComponentType } from 'react'
import { buildPrompt, emptyBuilderState, hasRandomChoice, surprise, surpriseStep, switchMode, toggleLock, type BuilderState, type BuildResult, type OutfitState } from '../../../lib/promptBuilder/build'
import { modeLabel, modesForCharacter, parseModes, type BuilderMode, type StepId } from '../../../lib/promptBuilder/modes'
import { customClothesProblems } from '../../../lib/promptBuilder/customClothes'
import { specFromState, type PromptSpec } from '../../../lib/promptBuilder/spec'
import { loadBuilderState, saveBuilderState } from '../../../lib/promptBuilder/storage'
import { secondaryButtonClass } from '../../../lib/styles'
import { withOwnTraits, withTraits } from '../../../lib/promptBuilder/character'
import { lookStrength, withMoved } from '../../../lib/lookSliders'
import { LookSlidersContext, slidersOf } from '../../lookSliders/LookSlidersContext'
import type { BuilderModeData, Character, ModelInfo } from '../../../types'
import { CharacterSummary, SaveAsCharacter } from './components/CharacterParts'
import { ClashWarnings } from './components/ClashWarnings'
import { Modal } from '../../ui/Modal'
import { ModePicker } from './components/ModePicker'
import { AppearanceStep, BodyStep, CameraStep, CharacterLookSliders, FinishStep, ImageBodyChoices, IntimacyStep, OutfitStep, PoseStep, SceneStep, SubjectStep, type StepProps } from '../steps'
import { t, type MessageKey } from '../../../i18n'
import { IconButton } from '../../ui/IconButton'
import { Dices, Lock, LockOpen } from 'lucide-react'
import { AbTestContext } from '../../abTest/AbTestContext'

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
  const [state, setState] = useState<BuilderState>(() => (initialState ? withCharacterMoves(initialState, character) : loadBuilderState()))
  const [stepId, setStepId] = useState<StepId>(STEPS[0].id)
  useEffect(() => saveBuilderState(state), [state])
  const { modes: allModes, problems } = useMemo(() => parseModes(modeData), [modeData])
  const modes = modesForCharacter(allModes, character)
  const mode = modes.find((candidate) => candidate.id === state.mode) ?? modes[0]
  // The character's look is applied when building, not saved into the builder, so your own choices come back without it
  // Sliders moved in the Character step change this prompt's look only
  const withLook = useMemo(() => (character ? withMoved(withTraits(state, character.traits), state.lookMoved) : state), [state, character])
  const sliders = slidersOf(useContext(LookSlidersContext), model)
  const result = useMemo(() => buildPrompt(withLook, mode, model.prompt_style), [withLook, mode, model.prompt_style])

  // An A/B test changes one choice between images, so nothing that picks again at random runs during one
  const testing = useContext(AbTestContext) !== null
  const steps = stepsFor(mode, character)
  const step = steps.find((candidate) => candidate.id === stepId) ?? steps[0]
  const set = (patch: Partial<BuilderState>) => setState((current) => ({ ...current, ...patch }))
  // Surprise me picks for who the character is, then the builder keeps its own look choices
  const surpriseWithLook = (change: (looked: BuilderState) => BuilderState) =>
    setState((current) => (character ? withOwnTraits(change(withTraits(current, character.traits)), current) : change(current)))
  const setOutfit = (patch: Partial<OutfitState>) => setState((current) => ({ ...current, outfit: { ...current.outfit, ...patch } }))
  const confirm = (insert: InsertMode) => {
    if (result.status !== 'ready') return
    onConfirm(result.prompt, result.negativePrompt, insert, result.explicit, specFromState(withLook, mode))
    onClose()
  }

  const tooLong = promptTooLong(result, maxPromptLength)
  return (
    <LookSlidersContext.Provider value={sliders}>
      <Modal
        title={t('builder.title')}
        onClose={onClose}
        size="xl"
        actionsNote={actionsNote(tooLong, hasExistingPrompt)}
        actions={<DialogActions ready={result.status === 'ready' && !tooLong} hasExistingPrompt={hasExistingPrompt} onCancel={onClose} onConfirm={confirm} />}
      >
        <ModePicker modes={modes} current={mode.id} problems={[...problems, ...customClothesProblems()]} onSelect={(next) => setState((current) => switchMode(current, next))} />
        <div className="grid gap-5 lg:h-[62vh] lg:grid-cols-[170px_minmax(0,1fr)_minmax(0,340px)]">
          <StepNav steps={steps} current={step.id} locked={state.lockedSteps} onSelect={setStepId} />
          <section aria-label={t(step.label)} className="min-h-0 overflow-y-auto pr-1">
            <StepHeading
              step={step}
              canSurprise={!(character && step.id === 'subject')}
              testing={testing}
              locked={state.lockedSteps.includes(step.id)}
              onSurprise={() => surpriseWithLook((looked) => surpriseStep(looked, step.id, newSeed(), mode))}
              onToggleLock={() => setState((current) => toggleLock(current, step.id))}
            />
            {/* The steps offer what fits the character, so a woman's Outfit has bras and dresses her with a top */}
            <StepContent step={step} character={character} onCharacterSaved={testing ? null : onCharacterSaved} state={withLook} mode={mode} set={set} setOutfit={setOutfit} />
          </section>
          <PreviewPane
            result={result}
            styleNote={styleNote(model, mode)}
            maxPromptLength={maxPromptLength}
            canReroll={hasRandomChoice(state)}
            testing={testing}
            onSurprise={() => surpriseWithLook((looked) => surprise(looked, newSeed(), mode))}
            onReroll={() => set({ rollSeed: newSeed() })}
            onReset={() => setState(switchMode(emptyBuilderState(), mode))}
          />
        </div>
      </Modal>
    </LookSlidersContext.Provider>
  )
}

/** A prompt reopened with a character: its strengths that differ from the character's own look were moved for this prompt, so they stay moved. */
function withCharacterMoves(state: BuilderState, character: Character | null): BuilderState {
  if (!character) return state
  const lookMoved = Object.fromEntries(Object.entries(state.strengths).filter(([id, strength]) => strength !== lookStrength(id, character.traits)))
  return { ...state, lookMoved }
}

interface StepContentProps extends StepProps {
  step: Step
  character: Character | null
  /** Null while saving a new character is off (an A/B test keeps its character). */
  onCharacterSaved: ((character: Character) => void) | null
}

function StepContent({ step, character, onCharacterSaved, ...props }: StepContentProps) {
  if (step.id !== 'subject') return <step.Component {...props} />
  if (character) {
    return (
      <>
        <CharacterSummary character={character} />
        <CharacterLookSliders state={props.state} set={props.set} character={character} />
        <ImageBodyChoices state={props.state} mode={props.mode} set={props.set} />
      </>
    )
  }
  return (
    <>
      <step.Component {...props} />
      {onCharacterSaved && <SaveAsCharacter state={props.state} onSaved={onCharacterSaved} />}
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

function StepNav({ steps, current, locked, onSelect }: { steps: Step[]; current: StepId; locked: readonly StepId[]; onSelect: (id: StepId) => void }) {
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
          {locked.includes(step.id) && <LockedMark />}
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
  /** An A/B test is on: Surprise me, Reroll and Reset are off. */
  testing: boolean
  onSurprise: () => void
  onReroll: () => void
  onReset: () => void
}

function PreviewPane({ result, styleNote, maxPromptLength, canReroll, testing, onSurprise, onReroll, onReset }: PreviewPaneProps) {
  const lockedTitle = testing ? t('create.abLocked') : undefined
  return (
    <aside aria-label={t('builder.preview')} className="flex min-h-0 flex-col gap-3 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-950/60">
      <button
        type="button"
        onClick={onSurprise}
        disabled={testing}
        title={lockedTitle}
        className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 py-2 text-sm font-semibold text-white shadow-sm not-disabled:hover:opacity-90 disabled:opacity-50"
      >
        <Dices /> {t('builder.surprise')}
      </button>
      <div className="flex items-center justify-between text-xs">
        <h3 className="font-semibold text-zinc-700 dark:text-zinc-200">{t('builder.preview')}</h3>
        <span className="flex gap-3">
          <button type="button" onClick={onReroll} disabled={!canReroll || testing} title={lockedTitle ?? t('builder.rerollHint')} className="text-violet-600 disabled:text-zinc-400 dark:text-violet-400">
            {t('builder.reroll')}
          </button>
          <button type="button" onClick={onReset} disabled={testing} title={lockedTitle} className="text-zinc-500 hover:text-zinc-800 disabled:opacity-50 dark:hover:text-zinc-200">
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

interface StepHeadingProps {
  step: Step
  /** A chosen character's look is fixed, so its step has nothing of its own to pick again or lock. */
  canSurprise: boolean
  /** Surprise me leaves the step as it is, and its own Surprise me is off. */
  locked: boolean
  /** An A/B test is on, so the step's own Surprise me is off. */
  testing: boolean
  onSurprise: () => void
  onToggleLock: () => void
}

const headingButtonClass =
  'flex size-8 items-center justify-center rounded-full text-violet-600 hover:bg-violet-50 disabled:opacity-40 disabled:hover:bg-transparent pointer-coarse:size-11 dark:text-violet-300 dark:hover:bg-violet-950/40'

/** The step's title, its own Surprise me, which picks again only this step's choices, and the lock against Surprise me. */
function StepHeading({ step, canSurprise, locked, testing, onSurprise, onToggleLock }: StepHeadingProps) {
  const name = t(step.label)
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{name}</h3>
      {canSurprise && (
        <div className="flex items-center gap-1">
          <IconButton label={t(locked ? 'builder.unlockStep' : 'builder.lockStep', { step: name })} aria-pressed={locked} onClick={onToggleLock} className={headingButtonClass}>
            {locked ? <Lock /> : <LockOpen />}
          </IconButton>
          <IconButton label={testing ? t('create.abLocked') : t('builder.surpriseStep', { step: name })} onClick={onSurprise} disabled={locked || testing} className={headingButtonClass}>
            <Dices />
          </IconButton>
        </div>
      )}
    </div>
  )
}

/** Shows in the step list that Surprise me leaves the step as it is. */
function LockedMark() {
  return (
    <>
      <Lock aria-hidden="true" className="size-3.5 text-violet-600 dark:text-violet-300" />
      <span className="sr-only"> {t('builder.stepLockedNote')}</span>
    </>
  )
}
