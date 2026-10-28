import { useCallback, useEffect, useState } from 'react'

export type View = 'create' | 'history'

const PATHS: Record<View, string> = { create: '/', history: '/history' }

/** Any address other than History's opens Create, so an old or mistyped link never shows a blank page. */
function viewFromPath(path: string): View {
  return path.replace(/\/+$/, '') === PATHS.history ? 'history' : 'create'
}

/** The current view, kept in the address so a reload or bookmark opens it again; Back and Forward move between views. */
export function useView(): [View, (view: View) => void] {
  const [view, setView] = useState<View>(() => viewFromPath(window.location.pathname))

  useEffect(() => {
    const followAddress = () => setView(viewFromPath(window.location.pathname))
    window.addEventListener('popstate', followAddress)
    return () => window.removeEventListener('popstate', followAddress)
  }, [])

  const changeView = useCallback((next: View) => {
    if (viewFromPath(window.location.pathname) !== next) window.history.pushState(null, '', PATHS[next])
    setView(next)
  }, [])

  return [view, changeView]
}
