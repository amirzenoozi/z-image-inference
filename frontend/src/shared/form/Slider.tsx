import type { CSSProperties } from 'react'

interface Props {
  label: string
  value: number
  min: number
  max: number
  step: number
  disabled?: boolean
  onChange: (text: string) => void
  className?: string
}

export function Slider({ label, value, min, max, step, disabled, onChange, className = '' }: Props) {
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0
  return (
    <input
      type="range"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      // The custom property is not in React's CSS types, so the style object is widened to include it
      style={{ '--fill': `${fill}%` } as CSSProperties}
      className={`slider ${className}`}
    />
  )
}
