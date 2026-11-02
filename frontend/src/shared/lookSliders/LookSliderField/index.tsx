import { RotateCcw } from 'lucide-react'
import type { CSSProperties } from 'react'
import { t } from '../../../i18n'
import { addonLabel } from '../../../lib/addons'
import type { AddonInfo } from '../../../types'
import { Slider } from '../../form/Slider'
import { IconButton } from '../../ui/IconButton'

interface Props {
  addon: AddonInfo
  value: number
  /** Where the slider starts (the character's look, or what the matching choice says), and where reset takes it back. */
  defaultValue: number
  onChange: (value: number) => void
  onReset: () => void
}

/**
 * One look slider, the same in Create's Look section, the prompt builder and the character dialog: on one line its name, its range
 * around the bar (with a mark at 0), its strength, and a reset once it is moved.
 */
export function LookSliderField({ addon, value, defaultValue, onChange, onReset }: Props) {
  if (!addon.slider) return null
  const { minimum, maximum, step } = addon.slider
  const label = addonLabel(addon.id, addon.label)
  const at = (strength: number) => ({ left: `calc(0.5rem + (100% - 1rem) * ${(strength - minimum) / (maximum - minimum)})` }) as CSSProperties
  return (
    <div className="flex items-center gap-2 py-2 text-xs">
      <span className="w-24 shrink-0 truncate font-medium text-zinc-600 dark:text-zinc-300">{label}</span>
      <span aria-hidden="true" className="w-5 text-right text-[11px] text-zinc-400 tabular-nums dark:text-zinc-500">{minimum}</span>
      {/* The 0 mark sits under the bar and comes first, so the handle is drawn over it */}
      <div className="relative flex h-7 flex-1 items-center">
        {minimum < 0 && maximum > 0 && <span aria-hidden="true" data-mark="zero" className="pointer-events-none absolute top-[calc(50%+5px)] h-1.5 w-px -translate-x-1/2 bg-zinc-400 dark:bg-zinc-500" style={at(0)} />}
        <Slider label={t('create.sliderLabel', { label })} min={minimum} max={maximum} step={step} value={value} onChange={(text) => onChange(Number(text))} className="relative w-full" />
      </div>
      <span aria-hidden="true" className="w-5 text-[11px] text-zinc-400 tabular-nums dark:text-zinc-500">{maximum}</span>
      <span className="w-6 text-right font-medium text-zinc-800 tabular-nums dark:text-zinc-100">{value}</span>
      {/* Always there and only hidden at the default, so the row keeps its size when it shows */}
      <IconButton
        label={t('create.lookResetSlider', { label })}
        onClick={onReset}
        style={value === defaultValue ? { visibility: 'hidden' } : undefined}
        className="shrink-0 text-zinc-400 hover:text-violet-600 dark:hover:text-violet-400"
      >
        <RotateCcw />
      </IconButton>
    </div>
  )
}
