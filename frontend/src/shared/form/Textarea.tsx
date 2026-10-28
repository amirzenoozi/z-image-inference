import type { TextareaHTMLAttributes } from 'react'
import { fieldFrameClass } from '../../lib/styles'

interface Props extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> {
  className?: string
}

/** Grows with its text up to a limit, then scrolls; where the browser cannot grow it, it keeps its rows. */
export function Textarea({ className = '', ...textarea }: Props) {
  return (
    <textarea
      {...textarea}
      className={`${fieldFrameClass} block max-h-80 min-h-20 w-full resize-none px-3 py-2.5 leading-relaxed [field-sizing:content] placeholder:text-zinc-400 read-only:cursor-not-allowed read-only:opacity-60 disabled:cursor-not-allowed ${className}`}
    />
  )
}
