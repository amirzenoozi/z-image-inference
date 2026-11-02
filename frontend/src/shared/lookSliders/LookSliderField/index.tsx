import { t } from '../../../i18n'
import { addonLabel } from '../../../lib/addons'
import { fieldLabelClass } from '../../../lib/styles'
import type { AddonInfo } from '../../../types'
import { Slider } from '../../form/Slider'

interface Props {
  addon: AddonInfo
  value: number
  onChange: (value: number) => void
}

/** One look slider, the same in Create's Look section, the prompt builder and the character dialog: its name, strength, a tick per step and its range. */
export function LookSliderField({ addon, value, onChange }: Props) {
  if (!addon.slider) return null
  const { minimum, maximum, step } = addon.slider
  const label = addonLabel(addon.id, addon.label)
  return (
    <div>
      <div className={`flex items-center justify-between ${fieldLabelClass}`}>
        <span>{label}</span>
        <span className="tabular-nums">{value === 0 ? t('create.lookOff') : value}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-zinc-400 tabular-nums dark:text-zinc-500">
        <span aria-hidden="true">{minimum}</span>
        <div className="relative flex flex-1 items-center">
          <Slider label={t('create.sliderLabel', { label })} min={minimum} max={maximum} step={step} value={value} onChange={(text) => onChange(Number(text))} className="w-full" />
          <StepTicks count={Math.round((maximum - minimum) / step) + 1} />
        </div>
        <span aria-hidden="true">{maximum}</span>
      </div>
    </div>
  )
}

/** A tick for every step, drawn on the bar; inset by half the thumb, so each sits where the thumb stops. */
function StepTicks({ count }: { count: number }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-2 flex justify-between">
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className="h-2.5 w-px bg-zinc-400/70 dark:bg-zinc-500/70" />
      ))}
    </div>
  )
}
