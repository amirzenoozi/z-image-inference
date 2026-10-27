import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import {
  ACCESSORIES,
  BOTTOMS,
  CAMERA_ANGLES,
  CLOTHING_COLORS,
  COLOR_GRADINGS,
  DEPTH_OF_FIELD,
  EXPLICIT_PARTNER_ACTIONS,
  EXPLICIT_POSES,
  EXPLICIT_SOLO_ACTIONS,
  HAIRSTYLES,
  HAIR_COLORS,
  LENSES,
  LINGERIE_BOTTOMS,
  LINGERIE_TOPS,
  OUTERWEAR,
  PHOTO_STYLES,
  POSES,
  SCENE_TYPES,
  SHOES,
  SHOT_TYPES,
  TOPS,
} from '../lib/promptBuilder/data'
import {
  INHERIT_SCENE,
  LIGHTING_SETUPS,
  NOT_SET,
  RANDOM,
  REMOVE,
  buildPrompt,
  emptyBuilderState,
  hasRandomChoice,
  type BuilderState,
  type BuildResult,
  type OutfitState,
} from '../lib/promptBuilder/build'
import { loadBuilderState, saveBuilderState } from '../lib/promptBuilder/storage'
import { fieldClass, secondaryButtonClass } from '../lib/styles'
import type { ModelInfo } from '../types'

interface Props {
  model: ModelInfo
  busy: boolean
  onUse: (prompt: string, negativePrompt: string) => void
  onGenerate: (prompt: string, negativePrompt: string) => void
}

export function PromptBuilder({ model, busy, onUse, onGenerate }: Props) {
  const [state, setState] = useState<BuilderState>(loadBuilderState)
  useEffect(() => saveBuilderState(state), [state])
  const result = useMemo(() => buildPrompt(state), [state])
  const set = (patch: Partial<BuilderState>) => setState((current) => ({ ...current, ...patch }))
  const setOutfit = (patch: Partial<OutfitState>) => setState((current) => ({ ...current, outfit: { ...current.outfit, ...patch } }))

  return (
    <div className="space-y-3">
      {model.prompt_style === 'tags' && (
        <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {model.label} reads short comma-separated tags best; builder prompts are full sentences, so results may follow them less closely.
        </p>
      )}
      <TextField label="Subject" value={state.subject} placeholder="e.g. adult woman in her late twenties with freckles" onChange={(subject) => set({ subject })} />
      <ExplicitSwitch state={state} set={set} />
      <StyleGroup state={state} set={set} />
      <PoseGroup state={state} set={set} />
      <Group title="Hair">
        <ChoiceSelect label="Hair colour" value={state.hairColor} groups={[{ options: HAIR_COLORS }]} onChange={(hairColor) => set({ hairColor })} />
        <ChoiceSelect label="Hairstyle" value={state.hairstyle} groups={[{ options: HAIRSTYLES }]} onChange={(hairstyle) => set({ hairstyle })} />
      </Group>
      <OutfitGroup outfit={state.outfit} setOutfit={setOutfit} />
      <SceneGroup state={state} set={set} />
      <MoodGroup state={state} set={set} />
      {state.explicit && <CoverageGroup state={state} set={set} />}
      <BuilderPreview
        result={result}
        canReroll={hasRandomChoice(state)}
        busy={busy}
        onReroll={() => set({ rollSeed: Math.floor(Math.random() * 2 ** 31) })}
        onReset={() => setState(emptyBuilderState())}
        onUse={onUse}
        onGenerate={onGenerate}
      />
    </div>
  )
}

type Setter = (patch: Partial<BuilderState>) => void

function ExplicitSwitch({ state, set }: { state: BuilderState; set: Setter }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-zinc-200 p-3 text-xs dark:border-zinc-800">
      <span>
        <span className="block font-semibold text-zinc-800 dark:text-zinc-100">Explicit content (18+)</span>
        <span className="text-zinc-500 dark:text-zinc-400">Adds explicit poses, actions and coverage controls. Subjects must be adults.</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={state.explicit}
        onChange={(event) => set({ explicit: event.target.checked, ...(event.target.checked ? {} : { explicitAction: NOT_SET }) })}
        className="size-4 shrink-0 accent-violet-600"
      />
    </label>
  )
}

function StyleGroup({ state, set }: { state: BuilderState; set: Setter }) {
  return (
    <Group title="Style & camera">
      <ChoiceSelect label="Photo style" value={state.photoStyle} groups={[{ options: PHOTO_STYLES }]} onChange={(photoStyle) => set({ photoStyle })} />
      <ChoiceSelect label="Shot type" value={state.shotType} groups={[{ options: SHOT_TYPES }]} onChange={(shotType) => set({ shotType })} />
      <ChoiceSelect label="Camera angle" value={state.cameraAngle} groups={[{ options: CAMERA_ANGLES }]} onChange={(cameraAngle) => set({ cameraAngle })} />
      <ChoiceSelect label="Lens" value={state.lens} groups={[{ options: LENSES }]} onChange={(lens) => set({ lens })} />
      <ChoiceSelect label="Depth of field" value={state.depthOfField} groups={[{ options: DEPTH_OF_FIELD }]} onChange={(depthOfField) => set({ depthOfField })} />
    </Group>
  )
}

function PoseGroup({ state, set }: { state: BuilderState; set: Setter }) {
  const poseGroups = [{ options: POSES }, ...(state.explicit ? [{ label: 'Explicit (18+)', options: Object.keys(EXPLICIT_POSES) }] : [])]
  return (
    <Group title="Pose & action">
      <ChoiceSelect label="Pose" value={state.pose} groups={poseGroups} onChange={(pose) => set({ pose })} />
      {state.explicit && (
        <ChoiceSelect
          label="Explicit action"
          value={state.explicitAction}
          groups={[
            { label: 'Solo', options: Object.keys(EXPLICIT_SOLO_ACTIONS) },
            { label: 'With a partner', options: Object.keys(EXPLICIT_PARTNER_ACTIONS) },
          ]}
          onChange={(explicitAction) => set({ explicitAction })}
        />
      )}
      <TextField label="Action" value={state.action} placeholder="e.g. laughing while adjusting her sunglasses" onChange={(action) => set({ action })} wide />
    </Group>
  )
}

type OutfitChoice = Exclude<keyof OutfitState, 'accessories' | 'details'>

const OUTFIT_ROWS: { label: string; item: OutfitChoice; color: OutfitChoice; options: readonly string[] }[] = [
  { label: 'Top', item: 'top', color: 'topColor', options: TOPS },
  { label: 'Bottom', item: 'bottom', color: 'bottomColor', options: BOTTOMS },
  { label: 'Lingerie top', item: 'lingerieTop', color: 'lingerieTopColor', options: LINGERIE_TOPS },
  { label: 'Lingerie bottom', item: 'lingerieBottom', color: 'lingerieBottomColor', options: LINGERIE_BOTTOMS },
  { label: 'Outerwear', item: 'outerwear', color: 'outerwearColor', options: OUTERWEAR },
  { label: 'Shoes', item: 'shoes', color: 'shoesColor', options: SHOES },
]

function OutfitGroup({ outfit, setOutfit }: { outfit: OutfitState; setOutfit: (patch: Partial<OutfitState>) => void }) {
  const setAccessory = (index: number, value: string) =>
    setOutfit({ accessories: outfit.accessories.map((item, i) => (i === index ? value : item)) as OutfitState['accessories'] })
  return (
    <Group title="Outfit">
      {OUTFIT_ROWS.map((row) => (
        <div key={row.item} className="contents">
          <ChoiceSelect label={row.label} value={outfit[row.item]} groups={[{ options: row.options }]} allowRemove onChange={(value) => setOutfit({ [row.item]: value })} />
          <ChoiceSelect label={`${row.label} colour`} value={outfit[row.color]} groups={[{ options: CLOTHING_COLORS }]} onChange={(value) => setOutfit({ [row.color]: value })} />
        </div>
      ))}
      {outfit.accessories.map((value, index) => (
        <ChoiceSelect key={index} label={`Accessory ${index + 1}`} value={value} groups={[{ options: ACCESSORIES }]} onChange={(item) => setAccessory(index, item)} />
      ))}
      <TextField label="Outfit details" value={outfit.details} placeholder="e.g. sleeves rolled up" onChange={(details) => setOutfit({ details })} wide />
    </Group>
  )
}

function SceneGroup({ state, set }: { state: BuilderState; set: Setter }) {
  return (
    <Group title="Scene & lighting">
      <ChoiceSelect label="Scene" value={state.sceneType} groups={[{ options: SCENE_TYPES }]} onChange={(sceneType) => set({ sceneType })} />
      <ChoiceSelect label="Lighting" value={state.lightingSetup} groups={[{ options: LIGHTING_SETUPS }]} allowInherit onChange={(lightingSetup) => set({ lightingSetup })} />
      <TextField label="Environment (overrides scene)" value={state.environment} placeholder="e.g. a rooftop bar in Tokyo at dusk" onChange={(environment) => set({ environment })} wide />
      <TextField label="Extra lighting" value={state.lightingCustom} placeholder="e.g. neon sign glow from the left" onChange={(lightingCustom) => set({ lightingCustom })} wide />
    </Group>
  )
}

function MoodGroup({ state, set }: { state: BuilderState; set: Setter }) {
  return (
    <Group title="Mood & details">
      <TextField label="Mood" value={state.mood} placeholder="e.g. playful" onChange={(mood) => set({ mood })} />
      <ChoiceSelect label="Colour grading" value={state.colorGrading} groups={[{ options: COLOR_GRADINGS }]} onChange={(colorGrading) => set({ colorGrading })} />
      <TextField label="Extra details" value={state.extraDetails} placeholder="Anything else to include" onChange={(extraDetails) => set({ extraDetails })} wide />
      <TextField label="Extra negative prompt" value={state.negativePrompt} placeholder="Added before the automatic negatives" onChange={(negativePrompt) => set({ negativePrompt })} wide />
    </Group>
  )
}

function CoverageGroup({ state, set }: { state: BuilderState; set: Setter }) {
  const toggles: { key: 'exposeBreasts' | 'removeBra' | 'removePanties'; label: string; disabled?: boolean }[] = [
    { key: 'exposeBreasts', label: 'Expose breasts' },
    { key: 'removeBra', label: 'No bra', disabled: !state.exposeBreasts },
    { key: 'removePanties', label: 'No panties' },
  ]
  return (
    <Group title="Coverage (18+)" open>
      <p className="col-span-2 text-xs text-zinc-500 dark:text-zinc-400">When off, the prompt keeps those areas covered and adds matching negatives.</p>
      {toggles.map(({ key, label, disabled }) => (
        <label key={key} className={`flex items-center gap-2 text-xs ${disabled ? 'opacity-40' : ''}`}>
          <input type="checkbox" checked={state[key]} disabled={disabled} onChange={(event) => set({ [key]: event.target.checked })} className="size-4 accent-violet-600" />
          {label}
        </label>
      ))}
    </Group>
  )
}

function Group({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group rounded-xl border border-zinc-200 dark:border-zinc-800">
      <summary className="cursor-pointer list-none px-3 py-2.5 text-xs font-semibold text-zinc-700 select-none dark:text-zinc-200">
        <span className="mr-1.5 inline-block transition group-open:rotate-90">▸</span>
        {title}
      </summary>
      <div className="grid grid-cols-2 gap-x-2 gap-y-2.5 px-3 pb-3">{children}</div>
    </details>
  )
}

interface ChoiceSelectProps {
  label: string
  value: string
  groups: { label?: string; options: readonly string[] }[]
  allowRemove?: boolean
  allowInherit?: boolean
  onChange: (value: string) => void
}

function ChoiceSelect({ label, value, groups, allowRemove = false, allowInherit = false, onChange }: ChoiceSelectProps) {
  const id = useId()
  const known = groups.some((group) => group.options.includes(value)) || [NOT_SET, RANDOM, REMOVE, INHERIT_SCENE].includes(value)
  return (
    <div className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={known ? value : NOT_SET} onChange={(event) => onChange(event.target.value)} className={`${fieldClass} mt-1 py-1.5 text-xs`}>
        <option value={NOT_SET}>Not set</option>
        <option value={RANDOM}>🎲 Random</option>
        {allowRemove && <option value={REMOVE}>Remove (without)</option>}
        {allowInherit && <option value={INHERIT_SCENE}>Match the scene</option>}
        {groups.map((group, index) =>
          group.label ? (
            <optgroup key={group.label} label={group.label}>
              {group.options.map((option) => <option key={option} value={option}>{option}</option>)}
            </optgroup>
          ) : (
            group.options.map((option) => <option key={`${index}-${option}`} value={option}>{option}</option>)
          ),
        )}
      </select>
    </div>
  )
}

interface TextFieldProps {
  label: string
  value: string
  placeholder: string
  onChange: (value: string) => void
  wide?: boolean
}

function TextField({ label, value, placeholder, onChange, wide = false }: TextFieldProps) {
  const id = useId()
  return (
    <div className={`text-[11px] font-medium text-zinc-600 dark:text-zinc-300 ${wide ? 'col-span-2' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="text" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className={`${fieldClass} mt-1 py-1.5 text-xs`} />
    </div>
  )
}

interface PreviewProps {
  result: BuildResult
  canReroll: boolean
  busy: boolean
  onReroll: () => void
  onReset: () => void
  onUse: (prompt: string, negativePrompt: string) => void
  onGenerate: (prompt: string, negativePrompt: string) => void
}

function BuilderPreview({ result, canReroll, busy, onReroll, onReset, onUse, onGenerate }: PreviewProps) {
  const ready = result.status === 'ready'
  return (
    <div className="space-y-2.5 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Preview</h3>
        <div className="flex gap-3 text-xs">
          <button type="button" onClick={onReroll} disabled={!canReroll} className="text-violet-600 disabled:text-zinc-400 dark:text-violet-400">
            🎲 Re-roll
          </button>
          <button type="button" onClick={onReset} className="text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
            Reset
          </button>
        </div>
      </div>
      <PreviewBody result={result} />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={!ready} onClick={() => ready && onUse(result.prompt, result.negativePrompt)} className={secondaryButtonClass}>
          Use in editor
        </button>
        <button
          type="button"
          disabled={!ready || busy}
          onClick={() => ready && onGenerate(result.prompt, result.negativePrompt)}
          className="rounded-lg bg-violet-600 py-1.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {busy ? 'Generating…' : 'Generate'}
        </button>
      </div>
    </div>
  )
}

function PreviewBody({ result }: { result: BuildResult }) {
  if (result.status === 'incomplete') return <p className="text-xs text-zinc-500 dark:text-zinc-400">{result.reason}</p>
  if (result.status === 'blocked') {
    return (
      <p role="alert" className="rounded-lg bg-red-50 p-2.5 text-xs text-red-800 dark:bg-red-950/50 dark:text-red-200">
        {result.reason}
      </p>
    )
  }
  return (
    <div className="space-y-2">
      <p aria-label="Built prompt" className="max-h-48 overflow-y-auto text-xs leading-relaxed text-zinc-800 dark:text-zinc-100">{result.prompt}</p>
      <details className="text-[11px] text-zinc-500 dark:text-zinc-400">
        <summary className="cursor-pointer">Negative prompt</summary>
        <p aria-label="Built negative prompt" className="mt-1 leading-relaxed">{result.negativePrompt}</p>
      </details>
    </div>
  )
}
