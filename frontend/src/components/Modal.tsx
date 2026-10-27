import { useEffect, type ReactNode } from 'react'

const SIZES = { md: 'max-w-md', lg: 'max-w-5xl', xl: 'max-w-7xl' } as const

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  size?: keyof typeof SIZES
}

export function Modal({ title, onClose, children, size = 'md' }: Props) {
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
        className={`max-h-[92vh] w-full overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-zinc-900 ${SIZES[size]}`}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-xl leading-none text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
