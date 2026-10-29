import type { InputHTMLAttributes } from 'react'
import { Check } from 'lucide-react'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'>

/** The box only; wrap it in a label with its text. The real checkbox stays underneath for keyboards and screen readers. */
export function Checkbox(input: Props) {
  return (
    <span className="relative flex size-[18px] shrink-0 items-center justify-center pointer-coarse:size-6">
      <input
        type="checkbox"
        {...input}
        className="peer absolute inset-0 cursor-pointer appearance-none rounded-[5px] border border-zinc-300 bg-white transition checked:border-violet-600 checked:bg-violet-600 focus-visible:ring-2 focus-visible:ring-violet-500/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:checked:bg-violet-600"
      />
      <Check className="pointer-events-none relative hidden size-3 stroke-3 text-white peer-checked:block" />
    </span>
  )
}
