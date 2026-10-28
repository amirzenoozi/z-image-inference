import { useEffect, useState } from 'react'
import { chipClass, controlHeight } from '../lib/styles'
import { SearchInput } from './form/SearchInput'
import { Select } from './form/Select'
import { CATEGORY_LABELS, isCategory } from '../lib/categories'
import { useCharacters } from '../lib/characters'
import type { HistoryFilters, ModelInfo } from '../types'
import { Star } from 'lucide-react'

export const SEARCH_DELAY_MS = 300

const RATIO_GROUPS = [
  { options: [{ value: '', label: 'All ratios' }, ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))] },
]

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
      <Select
        label="Ratio"
        hideLabel
        value={filters.ratio ?? ''}
        groups={RATIO_GROUPS}
        onChange={(ratio) => onChange({ ...filters, ratio: isCategory(ratio) ? ratio : null })}
        className="w-44"
      />
      <CharacterFilter value={filters.character} onChange={(character) => onChange({ ...filters, character })} />
      <button
        type="button"
        aria-pressed={filters.favouritesOnly}
        onClick={() => onChange({ ...filters, favouritesOnly: !filters.favouritesOnly })}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 text-sm ${controlHeight} ${chipClass(filters.favouritesOnly)}`}
      >
        <Star className={filters.favouritesOnly ? 'fill-current text-amber-500' : ''} /> Favourites
      </button>
      <CompareControls {...compare} />
    </div>
  )
}

/** Shown once there are characters, or while a link filters by one. */
function CharacterFilter({ value, onChange }: { value: number | null; onChange: (character: number | null) => void }) {
  const { characters } = useCharacters()
  const listed = characters.status === 'settled' ? characters.value : []
  if (listed.length === 0 && value === null) return null
  const options = listed.map((character) => ({ value: String(character.id), label: character.name }))
  // A link can name a character that was deleted or has not loaded yet; it still shows, so the filter can be cleared
  const unknown = value !== null && !listed.some((character) => character.id === value) ? [{ value: String(value), label: 'Unknown character' }] : []
  return (
    <Select
      label="Character"
      hideLabel
      value={value === null ? '' : String(value)}
      groups={[{ options: [{ value: '', label: 'All characters' }, ...options, ...unknown] }]}
      onChange={(next) => onChange(next ? Number(next) : null)}
      className="w-48"
    />
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
