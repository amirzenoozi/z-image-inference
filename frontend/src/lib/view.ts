import { useCallback, useEffect, useState } from 'react'

export type View = 'create' | 'history' | 'characters'

const PATHS: Record<View, string> = { create: '/', history: '/history', characters: '/characters' }

/** Any address other than History's or Characters' opens Create, so an old or mistyped link never shows a blank page. */
function viewFromPath(path: string): View {
  const trimmed = path.replace(/\/+$/, '')
  return (Object.keys(PATHS) as View[]).find((view) => view !== 'create' && PATHS[view] === trimmed) ?? 'create'
}

/** The current view, kept in the address so a reload or bookmark opens it again; Back and Forward move between views. */
/** `query` opens the view with it, such as History filtered to a character ("?character=3"). */
export function useView(): [View, (view: View, query?: string) => void] {
  const [view, setView] = useState<View>(() => viewFromPath(window.location.pathname))

  useEffect(() => {
    const followAddress = () => setView(viewFromPath(window.location.pathname))
    window.addEventListener('popstate', followAddress)
    return () => window.removeEventListener('popstate', followAddress)
  }, [])

  const changeView = useCallback((next: View, query = '') => {
    const sameView = viewFromPath(window.location.pathname) === next
    if (!sameView || query) window.history.pushState(null, '', `${PATHS[next]}${query}`)
    setView(next)
  }, [])

  return [view, changeView]
}
