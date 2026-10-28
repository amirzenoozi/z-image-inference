import { useState } from 'react'
import { IconButton } from '../../shared/ui/IconButton'
import type { Category, Limits, ModelInfo, ResolutionInfo } from '../../types'
import { CATEGORY_LABELS } from '../../lib/categories'
import { fitsModel, snapSide } from '../../lib/settings'
import { chipClass, fieldButtonClass, fieldLabelClass, tabClass } from '../../lib/styles'
import { NumberInput } from '../../shared/form/NumberInput'
import { ArrowLeftRight } from 'lucide-react'
import { t } from '../../i18n'

type Tab = Category | 'custom'

function tabLabel(tab: Tab): string {
  return tab === 'custom' ? t('create.categoryCustom') : CATEGORY_LABELS[tab]
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
      <div role="tablist" aria-label={t('create.resolutionCategory')} className="grid grid-cols-5 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800/70">
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
            {tabLabel(name)}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={tabLabel(tab)}>
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
      title={allowed ? undefined : t('create.maxSide', { model: model.label, max: model.max_side })}
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
        <SideInput label={t('create.width')} value={width} limits={limits} maxSide={model.max_side} onCommit={(w) => commit(w, height)} />
        <IconButton label={t('create.swapSides')} onClick={() => commit(height, width)} className={fieldButtonClass}>
          <ArrowLeftRight />
        </IconButton>
        <SideInput label={t('create.height')} value={height} limits={limits} maxSide={model.max_side} onCommit={(h) => commit(width, h)} />
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {t('create.customSizeHint', { step: limits.side_step, min: limits.min_side, max: model.max_side, model: model.label })}
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
  const id = `side-${label.toLowerCase()}`
  return (
    <div className="flex-1">
      <label htmlFor={id} className={fieldLabelClass}>
        {label}
      </label>
      <NumberInput
        id={id}
        label={label}
        min={limits.min_side}
        max={maxSide}
        step={limits.side_step}
        value={draft ?? value}
        onChange={setDraft}
        onStep={onCommit}
        onBlur={commit}
        onKeyDown={(event) => event.key === 'Enter' && commit()}
        className="mt-1"
      />
    </div>
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
