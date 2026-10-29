import { useRef, type PointerEvent } from 'react'

// A swipe must travel this far, and mostly sideways, so a tap or a scroll is never taken for one
const MIN_DISTANCE_PX = 50
const MOSTLY_SIDEWAYS = 1.5

/** Pointer handlers that turn a sideways finger swipe into "next" (to the left) or "previous" (to the right). */
export function useSwipe(onPrevious: () => void, onNext: () => void, enabled = true) {
  const start = useRef<{ x: number; y: number } | null>(null)
  return {
    onPointerDown: (event: PointerEvent) => {
      start.current = enabled && event.pointerType === 'touch' ? { x: event.clientX, y: event.clientY } : null
    },
    onPointerUp: (event: PointerEvent) => {
      const from = start.current
      start.current = null
      if (!from) return
      const dx = event.clientX - from.x
      const dy = event.clientY - from.y
      if (Math.abs(dx) < MIN_DISTANCE_PX || Math.abs(dx) < Math.abs(dy) * MOSTLY_SIDEWAYS) return
      if (dx < 0) onNext()
      else onPrevious()
    },
    onPointerCancel: () => {
      start.current = null
    },
  }
}
