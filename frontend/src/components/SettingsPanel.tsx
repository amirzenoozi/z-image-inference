import { useState } from 'react'
import type { Catalog, GenerationSettings, Loadable, ModelInfo, ModelStatusReport } from '../types'
import { isServerDown } from '../lib/modelStatus'
import { differsFromDefaults, findModel, modelDefaults, switchModel } from '../lib/settings'
import { useTooltip } from '../lib/useTooltip'
import { tabClass } from '../lib/styles'
import { ChatPanel } from './ChatPanel'
import { ModelPicker } from './ModelPicker'
import { PromptEditor } from './PromptEditor'
import { ResolutionPicker } from './ResolutionPicker'
import { SamplingControls } from './SamplingControls'
import { StartImageBlock } from './StartImageBlock'
import { Section, Spinner } from './ui'

export type PromptMode = 'direct' | 'chat'

interface Props {
  catalog: Catalog
  settings: GenerationSettings
  onChange: (settings: GenerationSettings) => void
  mode: PromptMode
  onModeChange: (mode: PromptMode) => void
  generating: boolean
  lastSeed: number | null
  onGenerate: () => void
  onChatPrompt: (prompt: string) => void
  modelStatus: Loadable<ModelStatusReport>
  onModelStatusChanged: () => void
}

export function SettingsPanel(props: Props) {
  const { catalog, settings, onChange, generating, lastSeed, onGenerate } = props
  const model = findModel(catalog, settings.modelId)
  const reason = blockedReason(settings, model, isServerDown(props.modelStatus))
  // The same rule for the button and for ⌘/Ctrl + Enter in the prompt box
  const generate = () => {
    if (reason === null && !generating) onGenerate()
  }
  const [defaultsHintFor, setDefaultsHintFor] = useState<string | null>(null)
  const patch = (changes: Partial<GenerationSettings>) => onChange({ ...settings, ...changes })
  const applyDefaults = () => {
    patch(modelDefaults(model))
    setDefaultsHintFor(null)
  }
  const selectModel = (next: ModelInfo) => {
    const switched = switchModel(settings, next)
    onChange(switched)
    setDefaultsHintFor(differsFromDefaults(switched, next) ? next.id : null)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-7 overflow-y-auto p-5">
        <Section title="Model">
          <ModelPicker models={catalog.models} categories={catalog.model_categories} selectedId={model.id} status={props.modelStatus} onSelect={selectModel} onStatusChanged={props.onModelStatusChanged} />
          {defaultsHintFor === model.id && <DefaultsHint model={model} onApply={applyDefaults} onDismiss={() => setDefaultsHintFor(null)} />}
        </Section>
        <PromptSection {...props} onGenerate={generate} model={model} patch={patch} />
        <Section title="Resolution">
          <ResolutionPicker
            width={settings.width}
            height={settings.height}
            model={model}
            resolutions={catalog.resolutions}
            categories={catalog.categories}
            limits={catalog.limits}
            onChange={(width, height) => patch({ width, height })}
          />
        </Section>
        <Section
          title="Sampling"
          aside={
            <button type="button" onClick={applyDefaults} disabled={!differsFromDefaults(settings, model)} className="text-xs text-violet-600 hover:text-violet-500 disabled:text-zinc-400 dark:text-violet-400">
              Reset to model defaults
            </button>
          }
        >
          <SamplingControls settings={settings} model={model} limits={catalog.limits} lastSeed={lastSeed} onChange={patch} />
        </Section>
      </div>
      <GenerateBar reason={reason} generating={generating} onGenerate={generate} />
    </div>
  )
}

export const SERVER_DOWN_REASON = "The model server isn't running yet. Start it with: uv run python model_server.py"

/** Why Generate can't run now, shown in its tooltip; null when it can. A start image the model can't use blocks it, rather than being ignored. */
function blockedReason(settings: GenerationSettings, model: ModelInfo, serverDown: boolean): string | null {
  if (serverDown) return SERVER_DOWN_REASON
  if (!settings.prompt.trim()) return 'Write a prompt first'
  if (settings.startImage && !model.supports_variations) return `${model.label} can't start from an image`
  return null
}

function DefaultsHint({ model, onApply, onDismiss }: { model: ModelInfo; onApply: () => void; onDismiss: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-violet-50 p-3 text-xs text-violet-900 dark:bg-violet-950/50 dark:text-violet-100">
      <span>Sampling was reset to {model.label}’s defaults. Use its default size and negative prompt too?</span>
      <span className="flex shrink-0 gap-2">
        <button type="button" onClick={onDismiss} className="text-violet-600 dark:text-violet-300">
          Keep mine
        </button>
        <button type="button" onClick={onApply} className="rounded-md bg-violet-600 px-2 py-1 font-semibold text-white hover:bg-violet-500">
          Use defaults
        </button>
      </span>
    </div>
  )
}

interface PromptSectionProps extends Props {
  model: ModelInfo
  patch: (changes: Partial<GenerationSettings>) => void
}

function PromptSection(props: PromptSectionProps) {
  const { catalog, settings, mode, onModeChange, generating, onGenerate, model, patch } = props
  const modes: { id: PromptMode; label: string; enabled: boolean }[] = [
    { id: 'direct', label: 'Write prompt', enabled: true },
    { id: 'chat', label: 'Chat with Grok', enabled: catalog.chat_available },
  ]
  return (
    <Section title="Prompt">
      <div role="tablist" aria-label="Prompt mode" className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1 text-xs font-medium dark:bg-zinc-800/70">
        {modes.map(({ id, label, enabled }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            disabled={!enabled}
            title={enabled ? undefined : 'Set XAI_API_KEY in .env to enable chat'}
            onClick={() => onModeChange(id)}
            className={`rounded-lg py-1.5 transition disabled:cursor-not-allowed disabled:opacity-40 ${
              tabClass(mode === id)
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === 'direct' && (
        <PromptEditor settings={settings} model={model} limits={catalog.limits} builderModes={catalog.builder_modes} onChange={patch} onSubmit={onGenerate} />
      )}
      {mode === 'chat' && <ChatPanel busy={generating} onPromptReady={props.onChatPrompt} />}
      {settings.startImage && <StartImageBlock startImage={settings.startImage} model={model} onChange={(startImage) => patch({ startImage })} />}
    </Section>
  )
}

/**
 * Blocked, it stays hoverable and focusable (aria-disabled rather than disabled), so its tooltip can say why;
 * a disabled button gets no hover or focus at all.
 */
function GenerateBar({ reason, generating, onGenerate }: { reason: string | null; generating: boolean; onGenerate: () => void }) {
  const { trigger, tooltip } = useTooltip(reason ?? '')
  return (
    <div className="border-t border-zinc-200 bg-white/80 p-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <button
        type="button"
        onClick={onGenerate}
        aria-disabled={reason !== null || generating}
        aria-description={reason ?? undefined}
        {...(reason ? trigger : {})}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-sm font-semibold text-white shadow-sm transition not-aria-disabled:hover:bg-violet-500 aria-disabled:opacity-50"
      >
        {generating && <Spinner className="size-4" />}
        {generating ? 'Generating…' : 'Generate'}
      </button>
      {tooltip}
    </div>
  )
}
