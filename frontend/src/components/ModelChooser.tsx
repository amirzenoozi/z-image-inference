import { useState } from 'react'
import { IconButton } from './IconButton'
import { downloadModel, removeModel } from '../api'
import { formatGb } from '../lib/format'
import { errorMessage } from '../lib/hooks'
import { chipClass, secondaryButtonClass, tabClass } from '../lib/styles'
import type { Loadable, ModelCategory, ModelInfo, ModelStatus, ModelStatusReport } from '../types'
import { Spinner } from './ui'
import { Check, X } from 'lucide-react'
import { t } from '../i18n'
import { DownloadBadge, HuggingFaceLink } from './modelParts'
import { modelCategoryLabel, modelDescription } from '../lib/categories'

const ALL = 'all'

interface Props {
  models: ModelInfo[]
  categories: ModelCategory[]
  selectedId: string
  status: Loadable<ModelStatusReport>
  serverDown: boolean
  onSelect: (model: ModelInfo) => void
  /** Re-checks model status after a download or remove. */
  onChanged: () => void
}

/** All models, filterable by category tab; "All" groups them under category headings. */
export function ModelChooser({ models, categories, selectedId, status, serverDown, onSelect, onChanged }: Props) {
  const [tab, setTab] = useState(ALL)
  const tabs = [{ id: ALL, label: t('create.tabAll'), count: models.length }, ...categories.map((category) => ({ ...category, label: modelCategoryLabel(category), count: models.filter((m) => m.category === category.id).length }))]
  const groups = tab === ALL ? categories : categories.filter((category) => category.id === tab)
  const option = (model: ModelInfo) => (
    <ModelOption
      key={model.id}
      model={model}
      selected={model.id === selectedId}
      status={status}
      serverDown={serverDown}
      onSelect={() => onSelect(model)}
      onChanged={onChanged}
    />
  )
  return (
    <div className="space-y-4">
      <StorageSummary status={status} />
      <div role="tablist" aria-label={t('create.modelCategoryLabel')} className="flex flex-wrap gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800/70">
        {tabs.map(({ id, label, count }) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${tabClass(tab === id)}`}>
            {label} <span className="tabular-nums text-zinc-400">{count}</span>
          </button>
        ))}
      </div>
      <div role="radiogroup" aria-label={t('create.modelLabel')} className="space-y-5">
        {groups.map((category) => (
          <section key={category.id} aria-label={modelCategoryLabel(category)}>
            {tab === ALL && <h3 className="mb-2 text-xs font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400">{modelCategoryLabel(category)}</h3>}
            <div className="grid gap-3 sm:grid-cols-2">{models.filter((model) => model.category === category.id).map(option)}</div>
          </section>
        ))}
      </div>
    </div>
  )
}

function StorageSummary({ status }: { status: Loadable<ModelStatusReport> }) {
  if (status.status !== 'settled' || status.value.free_bytes === null) return null
  const used = Object.values(status.value.models).reduce((total, model) => total + model.size_bytes, 0)
  return (
    <p className="text-xs text-zinc-500 dark:text-zinc-400">
      <StorageText used={formatGb(used)} free={formatGb(status.value.free_bytes)} />
    </p>
  )
}

function modelState(status: Loadable<ModelStatusReport>, modelId: string): { status: ModelStatus; sizeBytes: number } | null {
  if (status.status !== 'settled' || !status.value.server_running) return null
  const state = status.value.models[modelId]
  return state ? { status: state.status, sizeBytes: state.size_bytes } : null
}

interface ModelOptionProps {
  model: ModelInfo
  selected: boolean
  status: Loadable<ModelStatusReport>
  serverDown: boolean
  onSelect: () => void
  onChanged: () => void
}

function ModelOption({ model, selected, status, serverDown, onSelect, onChanged }: ModelOptionProps) {
  const state = modelState(status, model.id)
  // Only block selection when the model is known not to be ready; unknown status never locks the user out
  const notReady = state !== null && state.status !== 'ready'
  return (
    <div className={`flex h-full flex-col rounded-xl border transition ${chipClass(selected)}`}>
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        disabled={notReady}
        title={notReady ? t('create.downloadToUse') : undefined}
        onClick={onSelect}
        className="flex-1 p-4 pb-2 text-left disabled:cursor-not-allowed"
      >
        <span className="flex items-start justify-between gap-2">
          <span className="text-sm font-semibold">{model.label}</span>
          <span className="shrink-0 rounded-full bg-zinc-200/70 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {model.speed_hint}
          </span>
        </span>
        <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">{modelDescription(model)}</span>
        {!serverDown && <DownloadBadge model={model} status={status} />}
      </button>
      {/* Actions and the link sit outside the radio button: buttons and links cannot be nested inside it */}
      <div className="flex items-center justify-between gap-2 px-4 pb-3">
        {state ? <ModelActions model={model} state={state} selected={selected} freeBytes={status.status === 'settled' ? status.value.free_bytes : null} onChanged={onChanged} /> : <span />}
        <HuggingFaceLink model={model} />
      </div>
    </div>
  )
}

type Pending = 'download' | 'remove' | null

interface ModelActionsProps {
  model: ModelInfo
  state: { status: ModelStatus; sizeBytes: number }
  selected: boolean
  freeBytes: number | null
  onChanged: () => void
}

function ModelActions({ model, state, selected, freeBytes, onChanged }: ModelActionsProps) {
  const [confirming, setConfirming] = useState<Pending>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (action: () => Promise<unknown>) => {
    setWorking(true)
    setError(null)
    try {
      await action()
      setConfirming(null)
      onChanged()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setWorking(false)
    }
  }

  if (error) return <ActionError message={error} onDismiss={() => setError(null)} />
  if (working) return <span className="flex items-center gap-1.5 text-[11px] text-zinc-500"><Spinner className="size-3" /> {t('create.working')}</span>
  if (confirming === 'download') {
    const free = freeBytes === null ? '' : t('create.freeSuffix', { free: formatGb(freeBytes) })
    return <Confirm text={t('create.confirmDownload', { download: model.download_gb, kept: model.kept_gb, free })} action={t('create.download')} onCancel={() => setConfirming(null)} onConfirm={() => void run(() => downloadModel(model.id))} />
  }
  if (confirming === 'remove') {
    return <Confirm text={t('create.confirmRemove', { size: formatGb(state.sizeBytes), download: model.download_gb })} action={t('common.remove')} danger onCancel={() => setConfirming(null)} onConfirm={() => void run(() => removeModel(model.id))} />
  }
  return <ActionButton model={model} state={state} selected={selected} onDownload={() => setConfirming('download')} onRemove={() => setConfirming('remove')} />
}

interface ActionButtonProps {
  model: ModelInfo
  state: { status: ModelStatus; sizeBytes: number }
  selected: boolean
  onDownload: () => void
  onRemove: () => void
}

function ActionButton({ model, state, selected, onDownload, onRemove }: ActionButtonProps) {
  const small = `${secondaryButtonClass} px-2 py-1 text-[11px]`
  if (state.status === 'missing' || state.status === 'failed') {
    return (
      <button type="button" onClick={onDownload} aria-label={t('create.downloadModel', { model: model.label })} className={`${small} border-violet-400 text-violet-700 dark:border-violet-700 dark:text-violet-300`}>
        {t('create.downloadButton')}
      </button>
    )
  }
  if (state.status !== 'ready') return <span />
  if (selected) return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-700 dark:text-violet-300"><Check className="size-3.5" /> {t('create.inUse')}</span>
  return (
    <button type="button" onClick={onRemove} aria-label={t('create.removeModel', { model: model.label })} className={`${small} text-zinc-500`}>
      {t('create.removeWithSize', { size: formatGb(state.sizeBytes) })}
    </button>
  )
}

interface ConfirmProps {
  text: string
  action: string
  danger?: boolean
  onCancel: () => void
  onConfirm: () => void
}

function Confirm({ text, action, danger = false, onCancel, onConfirm }: ConfirmProps) {
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-300">
      <span>{text}</span>
      <button type="button" onClick={onCancel} className={`${secondaryButtonClass} px-2 py-0.5 text-[11px]`}>
        {t('common.cancel')}
      </button>
      <button
        type="button"
        onClick={onConfirm}
        className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold text-white ${danger ? 'bg-red-600 hover:bg-red-500' : 'bg-violet-600 hover:bg-violet-500'}`}
      >
        {action}
      </button>
    </span>
  )
}

function ActionError({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <span role="alert" className="flex items-center gap-1.5 text-[11px] text-red-600 dark:text-red-400">
      {message}
      <IconButton label={t('create.dismiss')} onClick={onDismiss} className="inline-flex items-center">
        <X className="size-3.5" />
      </IconButton>
    </span>
  )
}

/** Keeps the two sizes bold inside the translated sentence. */
function StorageText({ used, free }: { used: string; free: string }) {
  const parts = t('create.modelsUse').split(/(\{used\}|\{free\})/)
  return (
    <>
      {parts.map((part, index) => {
        if (part === '{used}') return <span key={index} className="font-semibold tabular-nums">{used}</span>
        if (part === '{free}') return <span key={index} className="font-semibold tabular-nums">{free}</span>
        return part
      })}
    </>
  )
}
