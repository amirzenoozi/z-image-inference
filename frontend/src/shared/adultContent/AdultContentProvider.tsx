import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AdultContentContext, loadUnlocked, saveUnlocked } from '../../lib/adultContent'
import { t } from '../../i18n'
import type { AdultContentInfo } from '../../types'

const NOTICE_MS = 2000

/** This browser's lock on adult content, for the whole app; a short notice says when it switches, and nothing more. */
export function AdultContentProvider({ info, children }: { info: AdultContentInfo; children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(loadUnlocked)
  const [notice, setNotice] = useState<string | null>(null)
  const toggle = useCallback(() => {
    saveUnlocked(!unlocked)
    setUnlocked(!unlocked)
    setNotice(t(unlocked ? 'common.adultHidden' : 'common.adultShown'))
  }, [unlocked])
  useEffect(() => {
    if (notice === null) return
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice])
  // Without a hidden word there is no lock in the browser: what .env allows is shown
  const shown = info.available && (!info.word_lock || unlocked)
  const value = useMemo(() => ({ shown, toggle }), [shown, toggle])
  return (
    <AdultContentContext.Provider value={value}>
      {children}
      {notice && (
        <div role="status" className="fixed inset-x-0 top-[calc(4rem+env(safe-area-inset-top))] z-50 flex justify-center px-4">
          <span className="rounded-full bg-zinc-900/85 px-3 py-1.5 text-xs font-medium text-white dark:bg-zinc-100/90 dark:text-zinc-900">{notice}</span>
        </div>
      )}
    </AdultContentContext.Provider>
  )
}
