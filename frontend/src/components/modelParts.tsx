import { formatGb, gigabytes } from '../lib/format'
import type { Loadable, ModelInfo, ModelStatusReport } from '../types'
import { Spinner } from './ui'

export function HuggingFaceLink({ model }: { model: ModelInfo }) {
  return (
    <a
      href={`https://huggingface.co/${model.repo_id}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${model.label} on Hugging Face`}
      className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-zinc-500 hover:bg-zinc-200/70 hover:text-violet-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-violet-300"
    >
      Hugging Face ↗
    </a>
  )
}

export function DownloadBadge({ model, status }: { model: ModelInfo; status: Loadable<ModelStatusReport> }) {
  if (status.status === 'pending') return <span className="mt-1.5 block text-[11px] text-zinc-400">Checking download…</span>
  if (status.status !== 'settled') return null
  const state = status.value.models[model.id]
  const size = `~${model.download_gb} GB`
  switch (state?.status) {
    case 'missing':
      return <span className="mt-1.5 block text-[11px] text-zinc-500 dark:text-zinc-400">Not downloaded · {size}</span>
    case 'queued':
      return <span className="mt-1.5 block text-[11px] text-zinc-500 dark:text-zinc-400">Queued for download · {size}</span>
    case 'downloading':
      return <DownloadProgress model={model} receivedBytes={state.size_bytes} />
    case 'failed':
      return <span className="mt-1.5 block text-[11px] text-red-600 dark:text-red-400">Download failed · try again</span>
    default:
      return null
  }
}

function DownloadProgress({ model, receivedBytes }: { model: ModelInfo; receivedBytes: number }) {
  const total = gigabytes(model.download_gb)
  // Measured from the folder size, so it can briefly pass the estimate before the download completes
  const percent = Math.min(99, Math.round((receivedBytes / total) * 100))
  return (
    <span className="mt-2 block">
      <span className="flex items-center gap-1.5 text-[11px] font-medium text-violet-700 dark:text-violet-300">
        <Spinner className="size-3" /> Downloading · {formatGb(receivedBytes)} of {model.download_gb} GB
      </span>
      <span
        role="progressbar"
        aria-label={`${model.label} download`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="mt-1 block h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700"
      >
        <span className="block h-full rounded-full bg-violet-600 transition-all" style={{ width: `${percent}%` }} />
      </span>
    </span>
  )
}
