import type { ModelInfo } from '../types'
import { chipClass } from '../lib/styles'

interface Props {
  models: ModelInfo[]
  selectedId: string
  onSelect: (model: ModelInfo) => void
}

export function ModelPicker({ models, selectedId, onSelect }: Props) {
  return (
    <div role="radiogroup" aria-label="Model" className="grid gap-2">
      {models.map((model) => {
        const selected = model.id === selectedId
        return (
          <button
            key={model.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onSelect(model)}
            className={`rounded-xl border p-3 text-left transition ${chipClass(selected)}`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">{model.label}</span>
              <span className="shrink-0 rounded-full bg-zinc-200/70 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {model.speed_hint}
              </span>
            </span>
            <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">{model.description}</span>
          </button>
        )
      })}
    </div>
  )
}
