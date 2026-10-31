import { useState, type ReactNode } from 'react'
import { useAdultContent } from '../../lib/adultContent'
import type { AdultContentInfo } from '../../types'
import { UnlockDialog } from './UnlockDialog'
import { useTapsToUnlock, useUnlockWord } from './useUnlockWord'

/**
 * The two ways to type the hidden word, when .env allows adult content and sets one: on the Create page with no field
 * focused (`listening`), or, on a phone, in the dialog five taps on the app's title open.
 */
export function useUnlock(info: AdultContentInfo, listening: boolean): { onTitleTap: () => void; dialog: ReactNode } {
  const { toggle } = useAdultContent()
  const [open, setOpen] = useState(false)
  const canUnlock = info.available && info.word_lock
  useUnlockWord(canUnlock && listening, toggle)
  const onTitleTap = useTapsToUnlock(() => setOpen(canUnlock))
  return { onTitleTap, dialog: open && <UnlockDialog onMatch={toggle} onClose={() => setOpen(false)} /> }
}
