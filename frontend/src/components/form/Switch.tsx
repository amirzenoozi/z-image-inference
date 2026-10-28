import type { InputHTMLAttributes } from 'react'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'role' | 'className'>

/** The toggle only; wrap it in a label with its text. */
export function Switch(input: Props) {
  return (
    <span className="relative inline-flex h-6 w-11 shrink-0">
      <input
        type="checkbox"
        role="switch"
        {...input}
        className="peer absolute inset-0 cursor-pointer appearance-none rounded-full bg-zinc-300 transition checked:bg-violet-600 focus-visible:ring-2 focus-visible:ring-violet-500/40 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-700 dark:checked:bg-violet-600 dark:focus-visible:ring-offset-zinc-900"
      />
      <span aria-hidden="true" className="pointer-events-none absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
    </span>
  )
}
