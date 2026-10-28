import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { useTooltip } from '../lib/useTooltip'

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'title' | 'children'> {
  /** What the button does: its accessible name and its tooltip. */
  label: string
  /** The key that does the same, shown in the tooltip. */
  shortcut?: string
  children: ReactNode
  ref?: Ref<HTMLButtonElement>
}

/** A button that shows only an icon, with a tooltip saying what it does. */
export function IconButton({ label, shortcut, children, type = 'button', onMouseEnter, onMouseLeave, onFocus, onBlur, onPointerDown, ...button }: Props) {
  const { trigger, tooltip } = useTooltip(label, shortcut)
  return (
    <>
      <button
        type={type}
        aria-label={label}
        {...button}
        onMouseEnter={(event) => {
          trigger.onMouseEnter(event)
          onMouseEnter?.(event)
        }}
        onMouseLeave={(event) => {
          trigger.onMouseLeave()
          onMouseLeave?.(event)
        }}
        onFocus={(event) => {
          trigger.onFocus(event)
          onFocus?.(event)
        }}
        onBlur={(event) => {
          trigger.onBlur()
          onBlur?.(event)
        }}
        onPointerDown={(event) => {
          trigger.onPointerDown()
          onPointerDown?.(event)
        }}
      >
        {children}
      </button>
      {tooltip}
    </>
  )
}
