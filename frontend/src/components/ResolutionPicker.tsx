import { useState } from 'react'
import type { Category, Limits, ModelInfo, ResolutionInfo } from '../types'
import { fitsModel, snapSide } from '../lib/settings'
import { chipClass, fieldClass, secondaryButtonClass, tabClass } from '../lib/styles'

type Tab = Category | 'custom'

const TAB_LABELS: Record<Tab, string> = {
  square: 'Square',
  portrait: 'Portrait',
  landscape: 'Landscape',
  widescreen: 'Widescreen',
  custom: 'Custom',
}

const TAB_SHAPES: Record<Tab, [number, number]> = {
  square: [1, 1],
  portrait: [3, 4],
  landscape: [4, 3],
  widescreen: [16, 9],
  custom: [5, 4],
}

interface Props {
  width: number
  height: number
  model: ModelInfo
  resolutions: ResolutionInfo[]
  categories: Category[]
  limits: Limits
  onChange: (width: number, height: number) => void
}

function presetCategory(width: number, height: number, resolutions: ResolutionInfo[]): Tab {
  return resolutions.find((r) => r.width === width && r.height === height)?.category ?? 'custom'
}

export function ResolutionPicker({ width, height, model, resolutions, categories, limits, onChange }: Props) {
  const [tab, setTab] = useState<Tab>(() => presetCategory(width, height, resolutions))
  const tabs: Tab[] = [...categories, 'custom']

  return (
    <div className="space-y-3">
      <SizeSummary width={width} height={height} />
      <div role="tablist" aria-label="Resolution category" className="grid grid-cols-5 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800/70">
        {tabs.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            onClick={() => setTab(name)}
            className={`flex flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[11px] font-medium transition ${tabClass(tab === name)}`}
          >
            <AspectBox width={TAB_SHAPES[name][0]} height={TAB_SHAPES[name][1]} size={14} />
            {TAB_LABELS[name]}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={TAB_LABELS[tab]}>
        {tab === 'custom' ? (
          <CustomSize width={width} height={height} model={model} limits={limits} onChange={onChange} />
        ) : (
          <PresetGroups
            presets={resolutions.filter((r) => r.category === tab)}
            width={width}
            height={height}
            model={model}
            onChange={onChange}
          />
        )}
      </div>
    </div>
  )
}

function SizeSummary({ width, height }: { width: number; height: number }) {
  const megapixels = ((width * height) / 1_000_000).toFixed(2)
  return (
    <p className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
      <AspectBox width={width} height={height} size={16} />
      <span className="font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">
        {width} × {height}
      </span>
      <span className="text-zinc-400">·</span>
      <span>{megapixels} MP</span>
    </p>
  )
}

interface PresetGroupsProps {
  presets: ResolutionInfo[]
  width: number
  height: number
  model: ModelInfo
  onChange: (width: number, height: number) => void
}

function PresetGroups({ presets, width, height, model, onChange }: PresetGroupsProps) {
  const ratios = [...new Set(presets.map((preset) => preset.ratio))]
  return (
    <div className="space-y-2.5">
      {ratios.map((ratio) => (
        <div key={ratio} className="flex items-start gap-3">
          <span className="w-10 shrink-0 pt-2 text-xs font-semibold text-zinc-500 tabular-nums dark:text-zinc-400">{ratio}</span>
          <div className="flex flex-wrap gap-1.5">
            {presets
              .filter((preset) => preset.ratio === ratio)
              .map((preset) => (
                <PresetChip
                  key={`${preset.width}x${preset.height}`}
                  preset={preset}
                  selected={preset.width === width && preset.height === height}
                  model={model}
                  onSelect={() => onChange(preset.width, preset.height)}
                />
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}

interface PresetChipProps {
  preset: ResolutionInfo
  selected: boolean
  model: ModelInfo
  onSelect: () => void
}

function PresetChip({ preset, selected, model, onSelect }: PresetChipProps) {
  const allowed = fitsModel(preset.width, preset.height, model)
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!allowed}
      aria-pressed={selected}
      title={allowed ? undefined : `${model.label} supports up to ${model.max_side}px per side`}
      className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-35 ${chipClass(selected)}`}
    >
      <AspectBox width={preset.width} height={preset.height} size={14} />
      <span className="font-semibold">{preset.tier}</span>
      <span className="tabular-nums">
        {preset.width}×{preset.height}
      </span>
    </button>
  )
}

interface CustomSizeProps {
  width: number
  height: number
  model: ModelInfo
  limits: Limits
  onChange: (width: number, height: number) => void
}

function CustomSize({ width, height, model, limits, onChange }: CustomSizeProps) {
  const commit = (nextWidth: number, nextHeight: number) =>
    onChange(snapSide(nextWidth, limits, model.max_side), snapSide(nextHeight, limits, model.max_side))

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <SideInput label="Width" value={width} limits={limits} maxSide={model.max_side} onCommit={(w) => commit(w, height)} />
        <button
          type="button"
          onClick={() => commit(height, width)}
          aria-label="Swap width and height"
          className={`${secondaryButtonClass} mb-px h-[38px]`}
        >
          ⇄
        </button>
        <SideInput label="Height" value={height} limits={limits} maxSide={model.max_side} onCommit={(h) => commit(width, h)} />
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Multiples of {limits.side_step}, from {limits.min_side} to {model.max_side} px for {model.label}. Values snap when you leave the field.
      </p>
    </div>
  )
}

interface SideInputProps {
  label: string
  value: number
  limits: Limits
  maxSide: number
  onCommit: (value: number) => void
}

function SideInput({ label, value, limits, maxSide, onCommit }: SideInputProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft !== null) onCommit(Number(draft))
    setDraft(null)
  }
  return (
    <label className="flex-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
      {label}
      <input
        type="number"
        inputMode="numeric"
        min={limits.min_side}
        max={maxSide}
        step={limits.side_step}
        value={draft ?? value}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => event.key === 'Enter' && commit()}
        className={`${fieldClass} mt-1 tabular-nums`}
      />
    </label>
  )
}

export function AspectBox({ width, height, size }: { width: number; height: number; size: number }) {
  const scale = size / Math.max(width, height)
  return (
    <span className="inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <span
        aria-hidden="true"
        className="rounded-[2px] border-[1.5px] border-current opacity-70"
        style={{ width: Math.max(4, width * scale), height: Math.max(4, height * scale) }}
      />
    </span>
  )
}
