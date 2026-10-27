import type { ReactNode } from 'react'

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

export function Spinner({ className = 'size-5' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  )
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
      <p>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-3 rounded-lg bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-500">
          Retry
        </button>
      )}
    </div>
  )
}
