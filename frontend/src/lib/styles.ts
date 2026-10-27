export const fieldClass =
  'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-xs outline-none ' +
  'focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30 disabled:opacity-50 ' +
  'dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100'

export const secondaryButtonClass =
  'rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 ' +
  'disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800'

export function chipClass(selected: boolean): string {
  return selected
    ? 'border-violet-500 bg-violet-50 text-violet-900 ring-2 ring-violet-500/30 dark:bg-violet-950/60 dark:text-violet-100'
    : 'border-zinc-300 text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
}
