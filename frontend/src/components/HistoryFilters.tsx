import { useEffect, useState } from 'react'
import { chipClass, controlHeight } from '../lib/styles'
import { SearchInput } from './form/SearchInput'
import { Select } from './form/Select'
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
      <Select
        label="Model"
        hideLabel
        value={filters.model ?? ''}
        groups={[{ options: [{ value: '', label: 'All models' }, ...models.map((model) => ({ value: model.id, label: model.label }))] }]}
        onChange={(model) => onChange({ ...filters, model: model || null })}
        className="w-60"
      />
      <button
        type="button"
        aria-pressed={filters.favouritesOnly}
        onClick={() => onChange({ ...filters, favouritesOnly: !filters.favouritesOnly })}
        className={`rounded-lg border px-3 text-sm ${controlHeight} ${chipClass(filters.favouritesOnly)}`}
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
  return <SearchInput label="Search prompts" placeholder="Search prompts…" value={text} onChange={setText} className="w-64" />
}

type CompareProps = Pick<Props, 'comparing' | 'selectedCount' | 'onCompareToggle' | 'onCompare'>

function CompareControls({ comparing, selectedCount, onCompareToggle, onCompare }: CompareProps) {
  return (
    <>
      <button type="button" aria-pressed={comparing} onClick={onCompareToggle} className={`rounded-lg border px-3 text-sm ${controlHeight} ${chipClass(comparing)}`}>
        Compare
      </button>
      {comparing && (
        <button
          type="button"
          onClick={onCompare}
          disabled={selectedCount < 2}
          className={`rounded-lg bg-violet-600 px-3 text-sm font-semibold ${controlHeight} text-white hover:bg-violet-500 disabled:opacity-50`}
        >
          {selectedCount < 2 ? `Pick ${2 - selectedCount} more` : 'Compare 2 images'}
        </button>
      )}
    </>
  )
}
