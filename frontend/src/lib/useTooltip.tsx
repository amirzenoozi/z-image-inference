import { useCallback, useEffect, useRef, useState, type FocusEvent, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { TooltipBubble } from '../shared/ui/TooltipBubble'

export const TOOLTIP_DELAY_MS = 400
function shownByKeyboard(element: HTMLElement): boolean {
  try {
    return element.matches(':focus-visible')
  } catch {
    // Browsers without :focus-visible show the tooltip on every focus
    return true
  }
}

export interface TooltipTrigger {
  onMouseEnter: (event: MouseEvent<HTMLElement>) => void
  onMouseLeave: () => void
  onFocus: (event: FocusEvent<HTMLElement>) => void
  onBlur: () => void
  onPointerDown: () => void
}

/**
 * A tooltip for an icon button: spread `trigger` on the button and render `tooltip` beside it. It shows after a
 * short pause on hover and at once on keyboard focus, and hides on leaving, blur, click and Escape.
 */
export function useTooltip(label: string, shortcut?: string): { trigger: TooltipTrigger; tooltip: ReactNode } {
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const hide = useCallback(() => {
    clearTimeout(timer.current)
    setAnchor(null)
  }, [])
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    if (!anchor) return
    const hideOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && hide()
    window.addEventListener('keydown', hideOnEscape)
    window.addEventListener('scroll', hide, true)
    return () => {
      window.removeEventListener('keydown', hideOnEscape)
      window.removeEventListener('scroll', hide, true)
    }
  }, [anchor, hide])

  const trigger: TooltipTrigger = {
    onMouseEnter: (event) => {
      const element = event.currentTarget
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setAnchor(element.getBoundingClientRect()), TOOLTIP_DELAY_MS)
    },
    onMouseLeave: hide,
    onFocus: (event) => {
      if (shownByKeyboard(event.currentTarget)) setAnchor(event.currentTarget.getBoundingClientRect())
    },
    onBlur: hide,
    onPointerDown: hide,
  }
  // A full-screen element hides everything outside it, so the tooltip goes inside it then
  const tooltip = anchor ? createPortal(<TooltipBubble anchor={anchor} label={label} shortcut={shortcut} />, document.fullscreenElement ?? document.body) : null
  return { trigger, tooltip }
}
