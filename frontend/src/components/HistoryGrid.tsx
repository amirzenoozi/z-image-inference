import { imageUrl } from '../api'
import type { HistoryItem } from '../types'
import { FavouriteButton } from './FavouriteButton'

interface Props {
  items: HistoryItem[]
  labelOf: (id: string) => string
  /** Ids picked for comparing, or null when not comparing: then a click opens the image. */
  selectedIds: number[] | null
  onActivate: (item: HistoryItem) => void
  onFavouriteChanged: (item: HistoryItem) => void
  onFavouriteFailed: (message: string) => void
}

export function HistoryGrid({ items, labelOf, selectedIds, onActivate, onFavouriteChanged, onFavouriteFailed }: Props) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => (
        <li key={item.id} className="relative">
          <CardButton item={item} label={labelOf(item.model)} selected={selectedIds && selectedIds.includes(item.id)} onClick={() => onActivate(item)} />
          <FavouriteButton item={item} onChanged={onFavouriteChanged} onFailed={onFavouriteFailed} className="absolute top-2 right-2" />
        </li>
      ))}
    </ul>
  )
}

function CardButton({ item, label, selected, onClick }: { item: HistoryItem; label: string; selected: boolean | null; onClick: () => void }) {
  const comparing = selected !== null
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${comparing ? 'Select' : 'Open'}: ${item.prompt}`}
      aria-pressed={comparing ? selected : undefined}
      className={`group relative block aspect-square w-full overflow-hidden rounded-xl bg-zinc-100 focus:ring-2 focus:ring-violet-500 focus:outline-none dark:bg-zinc-800 ${
        selected ? 'ring-4 ring-violet-500' : ''
      }`}
    >
      <img src={imageUrl(item.id, true)} alt="" loading="lazy" className="size-full object-cover transition group-hover:scale-105" />
      {selected && <span className="absolute top-2 left-2 flex size-7 items-center justify-center rounded-full bg-violet-600 text-sm text-white">✓</span>}
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-left text-[11px] text-white opacity-0 transition group-hover:opacity-100">
        {label} · {item.width}×{item.height}
      </span>
    </button>
  )
}
