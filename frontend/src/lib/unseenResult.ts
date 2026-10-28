import { useCallback, useEffect, useRef, useState } from 'react'
import type { View } from './view'

/**
 * Whether a render finished (an image or an error) while another view was open, for the dot on the Create tab.
 * It clears once Create is shown. A cancelled render calls nothing, so it never marks a result.
 */
export function useUnseenResult(view: View): { unseen: boolean; finished: () => void } {
  const [unseen, setUnseen] = useState(false)
  // Opening Create shows the result, so the dot goes; set while rendering, as React suggests for state that follows a prop
  if (unseen && view === 'create') setUnseen(false)
  // Read when a render finishes, which happens outside rendering
  const viewNow = useRef(view)
  useEffect(() => {
    viewNow.current = view
  }, [view])
  const finished = useCallback(() => {
    if (viewNow.current !== 'create') setUnseen(true)
  }, [])
  return { unseen, finished }
}
