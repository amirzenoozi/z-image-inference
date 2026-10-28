import type { InputHTMLAttributes, ReactNode } from 'react'
import { controlHeight, fieldFrameClass } from '../../lib/styles'

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  icon?: ReactNode
  /** Placed inside the field after the text, such as a clear button. */
  end?: ReactNode
  className?: string
}

export function TextInput({ icon, end, className = '', type = 'text', ...input }: Props) {
  return (
    <div className={`${fieldFrameClass} ${controlHeight} flex items-center gap-2 px-3 ${className}`}>
      {icon && <span aria-hidden="true" className="flex shrink-0 text-zinc-400">{icon}</span>}
      <input
        type={type}
        {...input}
        className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed"
      />
      {end}
    </div>
  )
}
