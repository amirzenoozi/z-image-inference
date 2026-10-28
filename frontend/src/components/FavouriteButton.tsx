import { useState, type Ref } from 'react'
import { setFavourite } from '../api'
import { errorMessage } from '../lib/hooks'
import type { HistoryItem } from '../types'

interface Props {
  item: HistoryItem
  onChanged: (item: HistoryItem) => void
  onFailed: (message: string) => void
  className?: string
  ref?: Ref<HTMLButtonElement>
}

/** The star stays as it was until the server confirms the change. */
export function FavouriteButton({ item, onChanged, onFailed, className = '', ref }: Props) {
  const [saving, setSaving] = useState(false)
  const toggle = async () => {
    setSaving(true)
    try {
      onChanged(await setFavourite(item.id, !item.favourite))
    } catch (error) {
      onFailed(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }
  return (
    <button
      ref={ref}
      type="button"
      onClick={() => void toggle()}
      disabled={saving}
      aria-pressed={item.favourite}
      aria-label={item.favourite ? 'Remove from favourites' : 'Add to favourites'}
      className={`flex size-8 items-center justify-center rounded-full bg-black/45 text-lg leading-none backdrop-blur-sm transition hover:bg-black/60 disabled:opacity-50 ${
        item.favourite ? 'text-amber-300' : 'text-white'
      } ${className}`}
    >
      {item.favourite ? '★' : '☆'}
    </button>
  )
}
