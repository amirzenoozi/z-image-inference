import type { GenerationSettings, Limits, ModelInfo } from '../types'
import { IconButton } from './IconButton'
import { fieldButtonClass, fieldLabelClass } from '../lib/styles'
import { Checkbox } from './form/Checkbox'
import { NumberInput } from './form/NumberInput'
import { Slider } from './form/Slider'
import { Dices } from 'lucide-react'
import { t } from '../i18n'

type SamplingPatch = Partial<Pick<GenerationSettings, 'steps' | 'guidance' | 'seed' | 'randomSeed'>>

interface Props {
  settings: GenerationSettings
  model: ModelInfo
  limits: Limits
  lastSeed: number | null
  onChange: (patch: SamplingPatch) => void
}

export function SamplingControls({ settings, model, limits, lastSeed, onChange }: Props) {
  return (
    <div className="space-y-4">
      <NumberSlider
        label={t('create.steps')}
        value={settings.steps}
        min={1}
        max={model.max_steps}
        step={1}
        recommended={model.default_steps}
        onChange={(steps) => onChange({ steps })}
      />
      {model.uses_guidance && (
        <NumberSlider
          label={t('create.guidance')}
          value={settings.guidance}
          min={0}
          max={20}
          step={0.1}
          recommended={model.default_guidance}
          onChange={(guidance) => onChange({ guidance })}
        />
      )}
      <SeedControl settings={settings} limits={limits} lastSeed={lastSeed} onChange={onChange} />
    </div>
  )
}

interface NumberSliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  recommended: number
  onChange: (value: number) => void
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function NumberSlider({ label, value, min, max, step, recommended, onChange }: NumberSliderProps) {
  const update = (raw: string) => {
    const parsed = Number(raw)
    if (raw !== '' && Number.isFinite(parsed)) onChange(clamp(parsed, min, max))
  }
  return (
    <div>
      <div className={`flex items-center justify-between ${fieldLabelClass}`}>
        <label htmlFor={`${label}-number`}>{label}</label>
        <button
          type="button"
          onClick={() => onChange(recommended)}
          className="text-zinc-400 hover:text-violet-600 dark:hover:text-violet-400"
        >
          {t('create.recommended', { value: recommended })}
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-3">
        <Slider label={t('create.sliderLabel', { label })} min={min} max={max} step={step} value={value} onChange={update} className="flex-1" />
        <NumberInput id={`${label}-number`} label={label} min={min} max={max} step={step} value={value} onChange={update} className="w-32" />
      </div>
    </div>
  )
}

interface SeedControlProps {
  settings: GenerationSettings
  limits: Limits
  lastSeed: number | null
  onChange: (patch: SamplingPatch) => void
}

function SeedControl({ settings, limits, lastSeed, onChange }: SeedControlProps) {
  const rollDice = () => onChange({ seed: Math.floor(Math.random() * limits.max_seed), randomSeed: false })
  return (
    <div className="space-y-2">
      <div className={`flex items-center justify-between ${fieldLabelClass}`}>
        <label htmlFor="seed-input">{t('create.seed')}</label>
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox checked={settings.randomSeed} onChange={(event) => onChange({ randomSeed: event.target.checked })} />
          {t('create.randomEachTime')}
        </label>
      </div>
      <div className="flex gap-2">
        <NumberInput
          id="seed-input"
          label={t('create.seed')}
          min={0}
          max={limits.max_seed}
          value={settings.seed}
          disabled={settings.randomSeed}
          onChange={(text) => onChange({ seed: clamp(Math.trunc(Number(text) || 0), 0, limits.max_seed) })}
          className="min-w-0 flex-1"
        />
        <IconButton label={t('create.pickRandomSeed')} onClick={rollDice} className={fieldButtonClass}>
          <Dices />
        </IconButton>
        <button
          type="button"
          onClick={() => lastSeed !== null && onChange({ seed: lastSeed, randomSeed: false })}
          disabled={lastSeed === null}
          title={lastSeed === null ? t('create.generateFirst') : t('create.useSeedNumber', { seed: lastSeed })}
          className={`${fieldButtonClass} whitespace-nowrap`}
        >
          {t('create.useLast')}
        </button>
      </div>
    </div>
  )
}
