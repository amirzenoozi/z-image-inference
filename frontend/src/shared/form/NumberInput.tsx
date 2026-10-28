import { t } from '../../i18n'
import type { KeyboardEvent, ReactNode } from 'react'
import { IconButton } from '../ui/IconButton'
import { controlHeight, fieldFrameClass } from '../../lib/styles'
import { Minus, Plus } from 'lucide-react'

interface Props {
  id?: string
  label?: string
  value: number | string
  min: number
  max: number
  step?: number
  disabled?: boolean
  /** Called with the text as it is typed. */
  onChange: (text: string) => void
  /** Called by the − and + buttons; defaults to onChange. */
  onStep?: (value: number) => void
  onBlur?: () => void
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void
  className?: string
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Snaps to the step and drops floating-point noise, so 6.9 + 0.1 is 7, not 7.000000000000001. */
function snapToStep(value: number, step: number): number {
  const decimals = String(step).split('.')[1]?.length ?? 0
  return Number((Math.round(value / step) * step).toFixed(decimals))
}

/** A number field with its own − and + buttons in place of the browser's arrows. */
export function NumberInput({ id, label, value, min, max, step = 1, disabled = false, onChange, onStep, onBlur, onKeyDown, className = '' }: Props) {
  const current = Number(value) || 0
  const stepBy = (direction: number) => {
    const next = clamp(snapToStep(current + direction * step, step), min, max)
    if (onStep) onStep(next)
    else onChange(String(next))
  }
  return (
    <div className={`${fieldFrameClass} ${controlHeight} flex items-center ${className}`}>
      <StepButton label={t('common.decrease', { name: label ?? t('common.value') })} disabled={disabled || current <= min} onClick={() => stepBy(-1)}>
        <Minus />
      </StepButton>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        aria-label={id ? undefined : label}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        className="no-native-spinner h-full w-full min-w-0 bg-transparent text-center tabular-nums outline-none disabled:cursor-not-allowed"
      />
      <StepButton label={t('common.increase', { name: label ?? t('common.value') })} disabled={disabled || current >= max} onClick={() => stepBy(1)}>
        <Plus />
      </StepButton>
    </div>
  )
}

function StepButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <IconButton
      tabIndex={-1}
      label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-full w-8 shrink-0 items-center justify-center text-base text-zinc-500 hover:text-violet-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-400 dark:hover:text-violet-400"
    >
      {children}
    </IconButton>
  )
}
