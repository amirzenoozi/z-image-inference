import { t } from '../../i18n'
import { useState, type Ref } from 'react'
import { IconButton } from '../../shared/ui/IconButton'
import { setFavourite } from '../../api'
import { errorMessage } from '../../lib/hooks'
import type { HistoryItem } from '../../types'
import { Star } from 'lucide-react'

interface Props {
  item: HistoryItem
  onChanged: (item: HistoryItem) => void
  onFailed: (message: string) => void
  className?: string
  /** The key that stars or unstars, shown in the tooltip where one works. */
  shortcut?: string
  ref?: Ref<HTMLButtonElement>
}

/** The star stays as it was until the server confirms the change. */
export function FavouriteButton({ item, onChanged, onFailed, className = '', shortcut, ref }: Props) {
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
    <IconButton
      ref={ref}
      onClick={() => void toggle()}
      disabled={saving}
      aria-pressed={item.favourite}
      label={item.favourite ? t('history.removeFavourite') : t('history.addFavourite')}
      shortcut={shortcut}
      className={`flex size-8 items-center justify-center rounded-full bg-black/45 backdrop-blur-sm [&_svg]:size-[18px] transition hover:bg-black/60 disabled:opacity-50 ${
        item.favourite ? 'text-amber-300' : 'text-white'
      } ${className}`}
    >
      <Star className={item.favourite ? 'fill-current' : ''} />
    </IconButton>
  )
}
