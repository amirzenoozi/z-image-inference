import { downloadUrl, imageUrl } from '../../api'
import { formatDuration, useCopyToClipboard, useElapsedSeconds } from '../../lib/hooks'
import { useJobProgress } from '../../lib/jobProgress'
import type { GenerationState, HistoryItem, JobPhase, JobProgress, ModelInfo } from '../../types'
import { secondaryButtonClass } from '../../lib/styles'
import { ImageFacts } from '../../shared/images/ImageFacts'
import { ErrorNotice, Spinner } from '../../shared/ui/ui'
import { Sparkles } from 'lucide-react'
import { t, type MessageKey } from '../../i18n'

interface Props {
  state: GenerationState
  models: ModelInfo[]
  onRetry: () => void
  onCancel: () => void
  onUseSeed: (seed: number) => void
}

type PendingState = Extract<GenerationState, { status: 'pending' }>

function modelLabel(models: ModelInfo[], id: string): string {
  return models.find((model) => model.id === id)?.label ?? id
}

export function ResultPanel({ state, models, onRetry, onCancel, onUseSeed }: Props) {
  return (
    <div className="flex h-full min-h-[24rem] items-center justify-center p-4 sm:p-6">
      {state.status === 'idle' && <EmptyResult />}
      {state.status === 'pending' && <PendingResult key={state.jobId} state={state} models={models} onCancel={onCancel} />}
      {state.status === 'failed' && (
        <div className="w-full max-w-md">
          <ErrorNotice message={state.error} onRetry={onRetry} />
        </div>
      )}
      {state.status === 'settled' && <SettledResult item={state.item} label={modelLabel(models, state.item.model)} onUseSeed={onUseSeed} />}
    </div>
  )
}

function EmptyResult() {
  return (
    <div className="text-center text-zinc-400 dark:text-zinc-500">
      <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl border-2 border-dashed border-current"><Sparkles className="size-6" /></div>
      <p className="text-sm">{t('create.emptyResult')}</p>
      <p className="mt-1 text-xs">{t('create.emptyResultHint')}</p>
    </div>
  )
}

function PendingResult({ state, models, onCancel }: { state: PendingState; models: ModelInfo[]; onCancel: () => void }) {
  const { request } = state
  const elapsed = useElapsedSeconds(state.startedAt)
  const progress = useJobProgress(state.jobId)
  const model = models.find((candidate) => candidate.id === request.modelId)
  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-4" aria-busy="true">
      <div
        className="flex w-full max-w-full animate-pulse items-center justify-center rounded-2xl bg-gradient-to-br from-zinc-200 to-zinc-100 dark:from-zinc-800 dark:to-zinc-900"
        style={{ aspectRatio: `${request.width} / ${request.height}`, maxHeight: '70vh' }}
      >
        <Spinner className="size-8 text-violet-500" />
      </div>
      <p role="status" className="text-center text-sm text-zinc-600 dark:text-zinc-300">
        {t('create.generatingWith', { width: request.width, height: request.height, model: model?.label ?? request.modelId })}{' '}
        <span className="font-semibold tabular-nums">{formatDuration(elapsed)}</span>
        {model && <span className="block text-xs text-zinc-400">{t('create.usually', { speed: model.speed_hint })}</span>}
      </p>
      <RenderProgress progress={progress} />
      <button type="button" onClick={onCancel} disabled={state.cancelling} className={secondaryButtonClass}>
        {state.cancelling ? t('create.cancelling') : t('common.cancel')}
      </button>
    </div>
  )
}

const PHASE_KEYS = {
  waiting: 'create.phaseWaiting',
  loading: 'create.phaseLoading',
  encoding: 'create.phaseEncoding',
  finishing: 'create.phaseFinishing',
} as const satisfies Record<Exclude<JobPhase, 'generating'>, MessageKey>

function RenderProgress({ progress }: { progress: JobProgress | null }) {
  if (progress === null) return null
  const label = progress.phase === 'generating' ? t('create.stepOf', { step: progress.step, total: progress.total }) : t(PHASE_KEYS[progress.phase])
  const showsSteps = progress.phase === 'generating' || progress.phase === 'finishing'
  return (
    <div className="w-full max-w-sm space-y-1.5">
      <p className="text-center text-xs font-medium text-zinc-600 tabular-nums dark:text-zinc-300">{label}</p>
      {showsSteps && <StepBar step={progress.step} total={progress.total} />}
    </div>
  )
}

function StepBar({ step, total }: { step: number; total: number }) {
  return (
    <div
      role="progressbar"
      aria-label={t('create.stepsDone')}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={step}
      className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
    >
      <div className="h-full rounded-full bg-violet-500 transition-[width]" style={{ width: `${(100 * step) / Math.max(total, 1)}%` }} />
    </div>
  )
}

function SettledResult({ item, label, onUseSeed }: { item: HistoryItem; label: string; onUseSeed: (seed: number) => void }) {
  const [copied, copy] = useCopyToClipboard()
  const copySeed = () => copy(String(item.seed))
  return (
    <figure className="flex w-full max-w-3xl flex-col items-center gap-4">
      <img
        src={imageUrl(item.id)}
        alt={item.prompt}
        width={item.width}
        height={item.height}
        className="max-h-[72vh] w-auto rounded-2xl object-contain shadow-lg"
      />
      <figcaption className="flex w-full flex-wrap items-center justify-between gap-3">
        <ImageFacts item={item} label={label} />
        <div className="flex gap-2">
          <a href={downloadUrl(item.id)} download={`z-image-${item.id}-${item.seed}.png`} className={secondaryButtonClass}>
            {t('create.download')}
          </a>
          <button type="button" onClick={copySeed} className={secondaryButtonClass}>
            {copied ? t('create.copied') : t('create.copySeed')}
          </button>
          <button type="button" onClick={() => onUseSeed(item.seed)} className={secondaryButtonClass}>
            {t('create.useThisSeed')}
          </button>
        </div>
      </figcaption>
    </figure>
  )
}
