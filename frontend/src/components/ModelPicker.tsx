import { useState } from 'react'
import type { Loadable, ModelInfo, ModelStatusReport } from '../types'
import { chipClass, secondaryButtonClass } from '../lib/styles'
import { Modal } from './Modal'
import { Spinner } from './ui'

interface Props {
  models: ModelInfo[]
  selectedId: string
  status: Loadable<ModelStatusReport>
  onSelect: (model: ModelInfo) => void
}

/** The sidebar shows only the selected model; the full list opens in a dialog. */
export function ModelPicker({ models, selectedId, status, onSelect }: Props) {
  const [choosing, setChoosing] = useState(false)
  const selected = models.find((model) => model.id === selectedId) ?? models[0]
  const serverDown = status.status === 'failed' || (status.status === 'settled' && !status.value.server_running)
  return (
    <div className="space-y-2">
      <SelectedModel model={selected} status={status} serverDown={serverDown} onChange={() => setChoosing(true)} />
      {serverDown && (
        <p role="status" className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          The model server isn’t running. Start it with <code>uv run python model_server.py</code>.
        </p>
      )}
      {choosing && (
        <Modal title="Choose a model" onClose={() => setChoosing(false)} size="lg">
          <div role="radiogroup" aria-label="Model" className="grid gap-3 sm:grid-cols-2">
            {models.map((model) => (
              <ModelOption
                key={model.id}
                model={model}
                selected={model.id === selected.id}
                status={status}
                serverDown={serverDown}
                onSelect={() => {
                  onSelect(model)
                  setChoosing(false)
                }}
              />
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}

interface SelectedModelProps {
  model: ModelInfo
  status: Loadable<ModelStatusReport>
  serverDown: boolean
  onChange: () => void
}

function SelectedModel({ model, status, serverDown, onChange }: SelectedModelProps) {
  return (
    <div role="group" aria-label="Selected model" className="rounded-xl border border-violet-500 bg-violet-50/60 p-3 dark:bg-violet-950/40">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-violet-900 dark:text-violet-100">{model.label}</span>
        <button type="button" onClick={onChange} className={`${secondaryButtonClass} shrink-0 bg-white py-1 text-xs dark:bg-zinc-900`}>
          Change
        </button>
      </div>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{model.description}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{model.speed_hint}</span>
        <HuggingFaceLink model={model} />
      </div>
      {!serverDown && <DownloadBadge model={model} status={status} />}
    </div>
  )
}

interface ModelOptionProps {
  model: ModelInfo
  selected: boolean
  status: Loadable<ModelStatusReport>
  serverDown: boolean
  onSelect: () => void
}

function ModelOption({ model, selected, status, serverDown, onSelect }: ModelOptionProps) {
  return (
    <div className="relative">
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={onSelect}
        className={`h-full w-full rounded-xl border p-4 pb-9 text-left transition ${chipClass(selected)}`}
      >
        <span className="flex items-start justify-between gap-2">
          <span className="text-sm font-semibold">{model.label}</span>
          <span className="shrink-0 rounded-full bg-zinc-200/70 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {model.speed_hint}
          </span>
        </span>
        <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">{model.description}</span>
        {!serverDown && <DownloadBadge model={model} status={status} />}
      </button>
      {/* Beside the card, not inside it: a link inside a button is invalid and would also select the model */}
      <span className="absolute right-3 bottom-2.5">
        <HuggingFaceLink model={model} />
      </span>
    </div>
  )
}

function HuggingFaceLink({ model }: { model: ModelInfo }) {
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
