import { useLayoutEffect, useRef, useState } from 'react'

const GAP_PX = 6
const EDGE_PX = 8

interface Position {
  top: number
  left: number
}

/** Above the trigger, or below it when there is no room above; always inside the window. */
function placeBeside(anchor: DOMRect, width: number, height: number): Position {
  const above = anchor.top - height - GAP_PX
  const top = above >= EDGE_PX ? above : anchor.bottom + GAP_PX
  const centred = anchor.left + anchor.width / 2 - width / 2
  const left = Math.min(Math.max(centred, EDGE_PX), window.innerWidth - width - EDGE_PX)
  return { top, left }
}

export function TooltipBubble({ anchor, label, shortcut }: { anchor: DOMRect; label: string; shortcut?: string }) {
  const bubble = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<Position | null>(null)
  useLayoutEffect(() => {
    const element = bubble.current
    if (element) setPosition(placeBeside(anchor, element.offsetWidth, element.offsetHeight))
  }, [anchor])
  return (
    // Screen readers already read the button's own label, which this repeats
    <div
      ref={bubble}
      aria-hidden="true"
      data-tooltip=""
      style={{ top: position?.top ?? 0, left: position?.left ?? 0, visibility: position ? 'visible' : 'hidden' }}
      className="pointer-events-none fixed z-[70] flex items-center gap-1.5 rounded-md bg-zinc-900 px-2 py-1 text-xs font-medium whitespace-nowrap text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900"
    >
      {label}
      {shortcut && (
        <kbd className="rounded border border-white/25 px-1 font-sans text-[10px] text-zinc-300 dark:border-zinc-900/25 dark:text-zinc-600">{shortcut}</kbd>
      )}
    </div>
  )
}
