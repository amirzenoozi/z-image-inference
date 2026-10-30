import { useState } from 'react'
import { formatGb } from '../../../lib/format'
import { cardClass, tabClass } from '../../../lib/styles'
import type { Loadable, ModelCategory, ModelInfo, ModelStatus, ModelStatusReport } from '../../../types'
import { t } from '../../../i18n'
import { SourceLink } from './modelParts'
import { DownloadBadge } from '../../../shared/models/DownloadBadge'
import { DownloadActions } from '../../../shared/models/DownloadActions'
import { AddonCards } from './AddonCards'
import { modelCategoryLabel, modelDescription } from '../../../lib/categories'

const ALL = 'all'
// The add-ons of the selected model, after the model categories
const ADDONS = 'addons'

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
  const selected = models.find((model) => model.id === selectedId) ?? models[0]
  const tabs = [
    { id: ALL, label: t('create.tabAll'), count: models.length },
    ...categories.map((category) => ({ ...category, label: modelCategoryLabel(category), count: models.filter((m) => m.category === category.id).length })),
    { id: ADDONS, label: t('create.addonsHeading'), count: selected.addons.length },
  ]
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
      {tab === ADDONS ? (
        <AddonCards model={selected} status={status} onChanged={onChanged} />
      ) : (
        <div role="radiogroup" aria-label={t('create.modelLabel')} className="space-y-5">
          {groups.map((category) => (
            <section key={category.id} aria-label={modelCategoryLabel(category)}>
              {tab === ALL && <h3 className="mb-2 text-xs font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400">{modelCategoryLabel(category)}</h3>}
              <div className="grid gap-3 sm:grid-cols-2">{models.filter((model) => model.category === category.id).map(option)}</div>
            </section>
          ))}
        </div>
      )}
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
    <div className={`flex h-full flex-col rounded-xl border transition ${cardClass(selected)}`}>
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
        {state ? <DownloadActions item={model} state={state} inUse={selected} freeBytes={status.status === 'settled' ? status.value.free_bytes : null} onChanged={onChanged} /> : <span />}
        <SourceLink model={model} />
      </div>
    </div>
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
