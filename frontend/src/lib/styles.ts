/** Every single-line field, and any button placed beside one, is this tall. */
export const controlHeight = 'h-10'

/** The border, background and focus ring every field shares; focus-within also covers fields with buttons inside. */
export const fieldFrameClass =
  'rounded-lg border border-zinc-300 bg-white text-sm text-zinc-900 shadow-xs transition outline-none ' +
  'focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-500/30 ' +
  'has-[:disabled]:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100'

export const fieldLabelClass = 'text-xs font-medium text-zinc-600 dark:text-zinc-300'

export const secondaryButtonClass =
  'rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 ' +
  'disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800'

/** A secondary button beside a field, matching its height. */
export const fieldButtonClass =
  `inline-flex shrink-0 items-center justify-center rounded-lg border border-zinc-300 px-3 text-sm font-medium text-zinc-700 ${controlHeight} ` +
  'hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800'

export function chipClass(selected: boolean): string {
  return selected
    ? 'border-violet-600 bg-violet-600 text-white dark:border-violet-500 dark:bg-violet-500'
    : 'border-zinc-300 text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
}

/** A selectable card with more text inside than a tag, so it is outlined and tinted rather than filled. */
export function cardClass(selected: boolean): string {
  return selected
    ? 'border-violet-600 bg-violet-50 dark:border-violet-500 dark:bg-violet-950/60'
    : 'border-zinc-300 text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
}

/** Segmented tabs: readable at rest, on hover and when selected, in light and dark mode. */
export function tabClass(selected: boolean): string {
  return selected
    ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-100'
    : 'text-zinc-500 enabled:hover:bg-white/70 enabled:hover:text-zinc-900 ' +
        'dark:text-zinc-400 dark:enabled:hover:bg-zinc-700/70 dark:enabled:hover:text-zinc-100'
}
