import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { buildPrompt, emptyBuilderState, hasRandomChoice, surprise, type BuilderState, type BuildResult, type OutfitState } from '../../lib/promptBuilder/build'
import { loadBuilderState, saveBuilderState } from '../../lib/promptBuilder/storage'
import { secondaryButtonClass } from '../../lib/styles'
import type { ModelInfo } from '../../types'
import { Modal } from '../Modal'
import { AppearanceStep, BodyStep, CameraStep, FinishStep, IntimacyStep, OutfitStep, PoseStep, SceneStep, SubjectStep, type StepProps } from './steps'

export type InsertMode = 'replace' | 'append'

interface Step {
  id: string
  label: string
  Component: ComponentType<StepProps>
  explicitOnly?: boolean
}

const STEPS: Step[] = [
  { id: 'subject', label: 'Subject', Component: SubjectStep },
  { id: 'appearance', label: 'Face & hair', Component: AppearanceStep },
  { id: 'body', label: 'Body', Component: BodyStep },
  { id: 'outfit', label: 'Outfit', Component: OutfitStep },
  { id: 'pose', label: 'Pose & action', Component: PoseStep },
  { id: 'intimacy', label: 'Intimacy (18+)', Component: IntimacyStep, explicitOnly: true },
  { id: 'scene', label: 'Scene & light', Component: SceneStep },
  { id: 'camera', label: 'Camera', Component: CameraStep },
  { id: 'finish', label: 'Mood & finish', Component: FinishStep },
]

const newSeed = () => Math.floor(Math.random() * 2 ** 31)

interface Props {
  model: ModelInfo
  hasExistingPrompt: boolean
  maxPromptLength: number
  onClose: () => void
  onConfirm: (prompt: string, negativePrompt: string, mode: InsertMode) => void
}

export function PromptBuilderDialog({ model, hasExistingPrompt, maxPromptLength, onClose, onConfirm }: Props) {
  const [state, setState] = useState<BuilderState>(loadBuilderState)
  const [stepId, setStepId] = useState(STEPS[0].id)
  useEffect(() => saveBuilderState(state), [state])
  const result = useMemo(() => buildPrompt(state), [state])

  const steps = STEPS.filter((step) => !step.explicitOnly || state.explicit)
  const step = steps.find((candidate) => candidate.id === stepId) ?? steps[0]
  const set = (patch: Partial<BuilderState>) => setState((current) => ({ ...current, ...patch }))
  const setOutfit = (patch: Partial<OutfitState>) => setState((current) => ({ ...current, outfit: { ...current.outfit, ...patch } }))
  const confirm = (mode: InsertMode) => {
    if (result.status !== 'ready') return
    onConfirm(result.prompt, result.negativePrompt, mode)
    onClose()
  }

  return (
    <Modal title="Prompt builder" onClose={onClose} size="xl">
      <div className="grid gap-5 lg:h-[68vh] lg:grid-cols-[170px_minmax(0,1fr)_minmax(0,340px)]">
        <StepNav steps={steps} current={step.id} onSelect={setStepId} />
        <section aria-label={step.label} className="min-h-0 overflow-y-auto pr-1">
          <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{step.label}</h3>
          <step.Component state={state} set={set} setOutfit={setOutfit} />
        </section>
        <PreviewPane
          result={result}
          model={model}
          maxPromptLength={maxPromptLength}
          canReroll={hasRandomChoice(state)}
          onSurprise={() => setState((current) => surprise(current, newSeed()))}
          onReroll={() => set({ rollSeed: newSeed() })}
          onReset={() => setState(emptyBuilderState())}
        />
      </div>
      <DialogFooter result={result} hasExistingPrompt={hasExistingPrompt} tooLong={promptTooLong(result, maxPromptLength)} onCancel={onClose} onConfirm={confirm} />
    </Modal>
  )
}

function promptTooLong(result: BuildResult, maxPromptLength: number): boolean {
  return result.status === 'ready' && result.prompt.length > maxPromptLength
}

function StepNav({ steps, current, onSelect }: { steps: Step[]; current: string; onSelect: (id: string) => void }) {
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
  model: ModelInfo
  maxPromptLength: number
  canReroll: boolean
  onSurprise: () => void
  onReroll: () => void
  onReset: () => void
}

function PreviewPane({ result, model, maxPromptLength, canReroll, onSurprise, onReroll, onReset }: PreviewPaneProps) {
  return (
    <aside aria-label="Preview" className="flex min-h-0 flex-col gap-3 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-950/60">
      <button
        type="button"
        onClick={onSurprise}
        className="rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90"
      >
        🎲 Surprise me
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
      {model.prompt_style === 'tags' && (
        <p className="rounded-lg bg-amber-50 p-2.5 text-[11px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {model.label} reads short tags best, so it may follow this sentence-style prompt less closely.
        </p>
      )}
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

interface FooterProps {
  result: BuildResult
  hasExistingPrompt: boolean
  tooLong: boolean
  onCancel: () => void
  onConfirm: (mode: InsertMode) => void
}

function DialogFooter({ result, hasExistingPrompt, tooLong, onCancel, onConfirm }: FooterProps) {
  const disabled = result.status !== 'ready' || tooLong
  return (
    <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
      <p className="mr-auto text-xs text-zinc-500 dark:text-zinc-400">
        {tooLong ? 'The prompt is too long; remove some details.' : hasExistingPrompt ? 'Use this prompt replaces the text in the Write box.' : 'The prompt goes into the Write box, where you can still edit it.'}
      </p>
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
    </div>
  )
}
