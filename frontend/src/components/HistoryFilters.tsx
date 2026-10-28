import { useEffect, useState } from 'react'
import { chipClass, fieldClass } from '../lib/styles'
import type { HistoryFilters, ModelInfo } from '../types'

export const SEARCH_DELAY_MS = 300

interface Props {
  models: ModelInfo[]
  filters: HistoryFilters
  onChange: (filters: HistoryFilters) => void
  comparing: boolean
  selectedCount: number
  onCompareToggle: () => void
  onCompare: () => void
}

export function HistoryFilterBar({ models, filters, onChange, ...compare }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchBox value={filters.search} onSearch={(search) => onChange({ ...filters, search })} />
      <select
        aria-label="Model"
        value={filters.model ?? ''}
        onChange={(event) => onChange({ ...filters, model: event.target.value || null })}
        className={`${fieldClass} w-auto`}
      >
        <option value="">All models</option>
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        aria-pressed={filters.favouritesOnly}
        onClick={() => onChange({ ...filters, favouritesOnly: !filters.favouritesOnly })}
        className={`rounded-lg border px-3 py-2 text-sm ${chipClass(filters.favouritesOnly)}`}
      >
        ★ Favourites
      </button>
      <CompareControls {...compare} />
    </div>
  )
}

/** Searches once typing pauses, so each keystroke does not reload History. */
function SearchBox({ value, onSearch }: { value: string; onSearch: (search: string) => void }) {
  const [text, setText] = useState(value)
  useEffect(() => {
    if (text.trim() === value) return
    const timer = setTimeout(() => onSearch(text.trim()), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [text, value, onSearch])
  return (
    <input
      type="search"
      aria-label="Search prompts"
      placeholder="Search prompts…"
      value={text}
      onChange={(event) => setText(event.target.value)}
      className={`${fieldClass} w-56`}
    />
  )
}

type CompareProps = Pick<Props, 'comparing' | 'selectedCount' | 'onCompareToggle' | 'onCompare'>

function CompareControls({ comparing, selectedCount, onCompareToggle, onCompare }: CompareProps) {
  return (
    <>
      <button type="button" aria-pressed={comparing} onClick={onCompareToggle} className={`rounded-lg border px-3 py-2 text-sm ${chipClass(comparing)}`}>
        Compare
      </button>
      {comparing && (
        <button
          type="button"
          onClick={onCompare}
          disabled={selectedCount < 2}
          className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {selectedCount < 2 ? `Pick ${2 - selectedCount} more` : 'Compare 2 images'}
        </button>
      )}
    </>
  )
}
