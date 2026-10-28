import { useEffect, type ReactNode } from 'react'
import { IconButton } from './IconButton'
import { X } from 'lucide-react'

const SIZES = {
  md: 'max-h-[92vh] max-w-md',
  lg: 'max-h-[92vh] max-w-5xl',
  xl: 'max-h-[92vh] max-w-7xl',
  // Nearly the whole window, for the image view and its editor
  full: 'h-[94vh] max-w-[96vw]',
} as const

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  /**
   * The dialog's buttons, under a divider at the bottom, secondary action first and main action last: centred on
   * their own, or on the right when `actionsNote` sits beside them on the left.
   */
  actions?: ReactNode
  /** A short line about the actions, shown on the left of them. */
  actionsNote?: ReactNode
  size?: keyof typeof SIZES
}

/** Every dialog: a header with the title and a close button, the content, then the actions. Only the content scrolls. */
export function Modal({ title, onClose, children, actions, actionsNote, size = 'md' }: Props) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className={`flex w-full flex-col rounded-2xl bg-white shadow-2xl dark:bg-zinc-900 ${SIZES[size]}`}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 px-5 pt-5 pb-4">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
          <IconButton label="Close" shortcut="Esc" onClick={onClose} className="flex size-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 [&_svg]:size-5">
            <X />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {actions && (
          <div
            role="group"
            aria-label="Dialog actions"
            className={`flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t border-zinc-200 px-5 py-4 dark:border-zinc-800 ${actionsNote ? 'justify-between' : 'justify-center'}`}
          >
            {actionsNote && <p className="text-xs text-zinc-500 dark:text-zinc-400">{actionsNote}</p>}
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          </div>
        )}
      </div>
    </div>
  )
}
