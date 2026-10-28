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
  const size = `~${model.download_gb} GB`
  switch (status.value.models[model.id]) {
    case 'missing':
      return <span className="mt-1.5 block text-[11px] text-zinc-500 dark:text-zinc-400">Not downloaded yet · {size}</span>
    case 'queued':
      return <span className="mt-1.5 block text-[11px] text-zinc-500 dark:text-zinc-400">Queued for download · {size}</span>
    case 'downloading':
      return (
        <span className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-violet-700 dark:text-violet-300">
          <Spinner className="size-3" /> Downloading · {size}
        </span>
      )
    case 'failed':
      return <span className="mt-1.5 block text-[11px] text-red-600 dark:text-red-400">Download failed · retries when you generate</span>
    default:
      return null
  }
}
