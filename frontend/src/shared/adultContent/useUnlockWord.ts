import { useEffect, useRef } from 'react'
import { checkUnlockWord } from '../../api'

// The server is asked once typing pauses, with the last keys typed
const PAUSE_MS = 600
const MAX_TYPED = 100

const isTextField = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

/** Calls `onMatch` when the hidden word is typed outside any text field, with nothing shown while typing. */
export function useUnlockWord(enabled: boolean, onMatch: () => void) {
  const matched = useRef(onMatch)
  useEffect(() => {
    matched.current = onMatch
  }, [onMatch])
  useEffect(() => {
    if (!enabled) return
    let typed = ''
    let timer: number | undefined
    const ask = () => {
      const sent = typed
      typed = ''
      checkUnlockWord(sent).then((match) => match && matched.current(), () => {})
    }
    const onKey = (event: KeyboardEvent) => {
      const isModified = event.ctrlKey || event.metaKey || event.altKey
      if (event.key.length !== 1 || isModified || isTextField(event.target)) return
      typed = (typed + event.key).slice(-MAX_TYPED)
      window.clearTimeout(timer)
      timer = window.setTimeout(ask, PAUSE_MS)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.clearTimeout(timer)
    }
  }, [enabled])
}

const TAPS = 5
const TAP_WINDOW_MS = 2500

/** A click handler that calls `onTaps` after five taps in quick succession, for phones, which type only into a field. */
export function useTapsToUnlock(onTaps: () => void): () => void {
  const taps = useRef<number[]>([])
  return () => {
    const now = Date.now()
    taps.current = [...taps.current.filter((time) => now - time < TAP_WINDOW_MS), now]
    if (taps.current.length < TAPS) return
    taps.current = []
    onTaps()
  }
}
