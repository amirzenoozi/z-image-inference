import type { Loadable, ModelInfo, ModelStatusReport } from '../types'
import { chipClass } from '../lib/styles'
import { Spinner } from './ui'

interface Props {
  models: ModelInfo[]
  selectedId: string
  status: Loadable<ModelStatusReport>
  onSelect: (model: ModelInfo) => void
}

export function ModelPicker({ models, selectedId, status, onSelect }: Props) {
  const serverDown = status.status === 'failed' || (status.status === 'settled' && !status.value.server_running)
  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label="Model" className="grid gap-2">
        {models.map((model) => {
          const selected = model.id === selectedId
          return (
            <div key={model.id} className="relative">
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onSelect(model)}
                className={`w-full rounded-xl border p-3 pb-8 text-left transition ${chipClass(selected)}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{model.label}</span>
                  <span className="shrink-0 rounded-full bg-zinc-200/70 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {model.speed_hint}
                  </span>
                </span>
                <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">{model.description}</span>
                {!serverDown && <DownloadBadge model={model} status={status} />}
              </button>
              <HuggingFaceLink model={model} />
            </div>
          )
        })}
      </div>
      {serverDown && (
        <p role="status" className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          The model server isn’t running. Start it with <code>uv run python model_server.py</code>.
        </p>
      )}
    </div>
  )
}

/** Beside the card, not inside it: a link inside a button is invalid and would also select the model. */
function HuggingFaceLink({ model }: { model: ModelInfo }) {
  return (
    <a
      href={`https://huggingface.co/${model.repo_id}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${model.label} on Hugging Face`}
      className="absolute right-3 bottom-2.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-zinc-500 hover:bg-zinc-200/70 hover:text-violet-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-violet-300"
    >
      Hugging Face ↗
    </a>
  )
}

function DownloadBadge({ model, status }: { model: ModelInfo; status: Loadable<ModelStatusReport> }) {
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
