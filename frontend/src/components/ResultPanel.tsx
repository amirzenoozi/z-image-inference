import { useState } from 'react'
import { imageUrl } from '../api'
import { formatDuration, useElapsedSeconds } from '../lib/hooks'
import type { GenerationSettings, GenerationState, HistoryItem, ModelInfo } from '../types'
import { secondaryButtonClass } from '../lib/styles'
import { ErrorNotice, Spinner } from './ui'

interface Props {
  state: GenerationState
  models: ModelInfo[]
  onRetry: () => void
  onUseSeed: (seed: number) => void
}

function modelLabel(models: ModelInfo[], id: string): string {
  return models.find((model) => model.id === id)?.label ?? id
}

export function ResultPanel({ state, models, onRetry, onUseSeed }: Props) {
  return (
    <div className="flex h-full min-h-[24rem] items-center justify-center p-6">
      {state.status === 'idle' && <EmptyResult />}
      {state.status === 'pending' && <PendingResult request={state.request} startedAt={state.startedAt} models={models} />}
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
      <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl border-2 border-dashed border-current text-2xl">✦</div>
      <p className="text-sm">Your image will appear here.</p>
      <p className="mt-1 text-xs">Pick a model, write a prompt and press Generate.</p>
    </div>
  )
}

function PendingResult({ request, startedAt, models }: { request: GenerationSettings; startedAt: number; models: ModelInfo[] }) {
  const elapsed = useElapsedSeconds(startedAt)
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
        Generating {request.width}×{request.height} with {model?.label ?? request.modelId} ·{' '}
        <span className="font-semibold tabular-nums">{formatDuration(elapsed)}</span>
        {model && <span className="block text-xs text-zinc-400">Usually {model.speed_hint}</span>}
      </p>
    </div>
  )
}

function SettledResult({ item, label, onUseSeed }: { item: HistoryItem; label: string; onUseSeed: (seed: number) => void }) {
  const [copied, setCopied] = useState(false)
  const copySeed = async () => {
    try {
      await navigator.clipboard.writeText(String(item.seed))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }
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
          <a href={imageUrl(item.id)} download={`z-image-${item.id}-${item.seed}.png`} className={secondaryButtonClass}>
            Download
          </a>
          <button type="button" onClick={copySeed} className={secondaryButtonClass}>
            {copied ? 'Copied' : 'Copy seed'}
          </button>
          <button type="button" onClick={() => onUseSeed(item.seed)} className={secondaryButtonClass}>
            Use this seed
          </button>
        </div>
      </figcaption>
    </figure>
  )
}

export function ImageFacts({ item, label }: { item: HistoryItem; label: string }) {
  const facts = [label, `${item.width}×${item.height}`, `${item.steps} steps`, `seed ${item.seed}`]
  if (item.guidance !== null) facts.splice(3, 0, `CFG ${item.guidance}`)
  return (
    <ul className="flex flex-wrap gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
      {facts.map((fact) => (
        <li key={fact} className="rounded-full bg-zinc-100 px-2.5 py-1 tabular-nums dark:bg-zinc-800">
          {fact}
        </li>
      ))}
    </ul>
  )
}
