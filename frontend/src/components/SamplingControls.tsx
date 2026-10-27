import type { GenerationSettings, Limits, ModelInfo } from '../types'
import { fieldClass, secondaryButtonClass } from '../lib/styles'

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
        label="Steps"
        value={settings.steps}
        min={1}
        max={model.max_steps}
        step={1}
        recommended={model.default_steps}
        onChange={(steps) => onChange({ steps })}
      />
      {model.uses_guidance && (
        <NumberSlider
          label="Guidance (CFG)"
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
      <div className="flex items-center justify-between text-xs font-medium text-zinc-600 dark:text-zinc-300">
        <label htmlFor={`${label}-number`}>{label}</label>
        <button
          type="button"
          onClick={() => onChange(recommended)}
          className="text-zinc-400 hover:text-violet-600 dark:hover:text-violet-400"
        >
          Recommended: {recommended}
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-3">
        <input
          type="range"
          aria-label={`${label} slider`}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => update(event.target.value)}
          className="flex-1 accent-violet-600"
        />
        <input
          id={`${label}-number`}
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => update(event.target.value)}
          className={`${fieldClass} w-20 tabular-nums`}
        />
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
      <div className="flex items-center justify-between text-xs font-medium text-zinc-600 dark:text-zinc-300">
        <label htmlFor="seed-input">Seed</label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={settings.randomSeed}
            onChange={(event) => onChange({ randomSeed: event.target.checked })}
            className="size-4 accent-violet-600"
          />
          Random each time
        </label>
      </div>
      <div className="flex gap-2">
        <input
          id="seed-input"
          type="number"
          min={0}
          max={limits.max_seed}
          value={settings.seed}
          disabled={settings.randomSeed}
          onChange={(event) => onChange({ seed: clamp(Math.trunc(Number(event.target.value) || 0), 0, limits.max_seed) })}
          className={`${fieldClass} tabular-nums`}
        />
        <button type="button" onClick={rollDice} aria-label="Pick a random seed" title="Pick a random seed" className={secondaryButtonClass}>
          🎲
        </button>
        <button
          type="button"
          onClick={() => lastSeed !== null && onChange({ seed: lastSeed, randomSeed: false })}
          disabled={lastSeed === null}
          title={lastSeed === null ? 'Generate an image first' : `Use seed ${lastSeed}`}
          className={`${secondaryButtonClass} whitespace-nowrap`}
        >
          Use last
        </button>
      </div>
    </div>
  )
}
