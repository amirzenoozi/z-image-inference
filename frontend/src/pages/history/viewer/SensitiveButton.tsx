import { t } from '../../../i18n'
import { useState } from 'react'
import { setSensitive } from '../../../api'
import { errorMessage } from '../../../lib/hooks'
import type { HistoryItem } from '../../../types'
import { IconButton } from '../../../shared/ui/IconButton'
import { Eye, EyeOff } from 'lucide-react'

interface Props {
  item: HistoryItem
  onChanged: (item: HistoryItem) => void
  onFailed: (message: string) => void
  className: string
}

/** Marks the image as sensitive, so lists blur it, or as not; it stays as it was until the server confirms. */
export function SensitiveButton({ item, onChanged, onFailed, className }: Props) {
  const [saving, setSaving] = useState(false)
  const toggle = async () => {
    setSaving(true)
    try {
      onChanged(await setSensitive(item.id, !item.sensitive))
    } catch (error) {
      onFailed(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }
  return (
    <IconButton
      label={item.sensitive ? t('history.markNotSensitive') : t('history.markSensitive')}
      aria-pressed={item.sensitive}
      onClick={() => void toggle()}
      disabled={saving}
      className={className}
    >
      {item.sensitive ? <EyeOff /> : <Eye />}
    </IconButton>
  )
}
