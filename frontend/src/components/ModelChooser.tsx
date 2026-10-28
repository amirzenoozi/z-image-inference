import { useState } from 'react'
import type { Loadable, ModelCategory, ModelInfo, ModelStatusReport } from '../types'
import { chipClass, tabClass } from '../lib/styles'
import { DownloadBadge, HuggingFaceLink } from './modelParts'

const ALL = 'all'

interface Props {
  models: ModelInfo[]
  categories: ModelCategory[]
  selectedId: string
  status: Loadable<ModelStatusReport>
  serverDown: boolean
  onSelect: (model: ModelInfo) => void
}

/** All models, filterable by category tab; "All" groups them under category headings. */
export function ModelChooser({ models, categories, selectedId, status, serverDown, onSelect }: Props) {
  const [tab, setTab] = useState(ALL)
  const tabs = [{ id: ALL, label: 'All', count: models.length }, ...categories.map((category) => ({ ...category, count: models.filter((m) => m.category === category.id).length }))]
  const groups = tab === ALL ? categories : categories.filter((category) => category.id === tab)
  const option = (model: ModelInfo) => (
    <ModelOption key={model.id} model={model} selected={model.id === selectedId} status={status} serverDown={serverDown} onSelect={() => onSelect(model)} />
  )
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Model category" className="flex flex-wrap gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800/70">
        {tabs.map(({ id, label, count }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${tabClass(tab === id)}`}
          >
            {label} <span className="tabular-nums text-zinc-400">{count}</span>
          </button>
        ))}
      </div>
      <div role="radiogroup" aria-label="Model" className="space-y-5">
        {groups.map((category) => (
          <section key={category.id} aria-label={category.label}>
            {tab === ALL && <h3 className="mb-2 text-xs font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400">{category.label}</h3>}
            <div className="grid gap-3 sm:grid-cols-2">{models.filter((model) => model.category === category.id).map(option)}</div>
          </section>
        ))}
      </div>
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
