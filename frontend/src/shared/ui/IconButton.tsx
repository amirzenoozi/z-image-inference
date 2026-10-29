import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { useTooltip } from '../../lib/useTooltip'

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'title' | 'children'> {
  /** What the button does: its accessible name and its tooltip. */
  label: string
  /** The key that does the same, shown in the tooltip. */
  shortcut?: string
  children: ReactNode
  ref?: Ref<HTMLButtonElement>
}

/** A button that shows only an icon, with a tooltip saying what it does. */
/** On touch screens an icon is hard to hit, so icon buttons and links are at least 44px there. */
const TOUCH_TARGET = 'pointer-coarse:min-h-11 pointer-coarse:min-w-11'

export function IconButton({ label, shortcut, children, type = 'button', className = '', onMouseEnter, onMouseLeave, onFocus, onBlur, onPointerDown, ...button }: Props) {
  const { trigger, tooltip } = useTooltip(label, shortcut)
  return (
    <>
      <button
        type={type}
        aria-label={label}
        className={`${className} ${TOUCH_TARGET}`}
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

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'aria-label' | 'title' | 'children'> {
  label: string
  children: ReactNode
}

/** A link that shows only an icon, such as a download, with a tooltip saying what it does. */
export function IconLink({ label, children, className = '', ...link }: LinkProps) {
  const { trigger, tooltip } = useTooltip(label)
  return (
    <>
      <a aria-label={label} className={`${className} ${TOUCH_TARGET}`} {...link} {...trigger}>
        {children}
      </a>
      {tooltip}
    </>
  )
}
