import { t } from '../../i18n'
import type { Catalog, GenerationSettings, GenerationState, Loadable, ModelStatusReport } from '../../types'
import { ResultPanel } from './ResultPanel'
import { SettingsPanel, type PromptMode } from './SettingsPanel'

interface Props {
  catalog: Catalog
  settings: GenerationSettings
  onSettingsChange: (settings: GenerationSettings) => void
  mode: PromptMode
  onModeChange: (mode: PromptMode) => void
  generation: { state: GenerationState; retry: () => void; cancel: () => void }
  lastSeed: number | null
  modelStatus: Loadable<ModelStatusReport>
  onModelStatusChanged: () => void
  onGenerate: () => void
  onChatPrompt: (prompt: string) => void
  /** Kept mounted while another page shows, so a render in progress and the settings stay as they are. */
  hidden: boolean
}

/** The settings on the left, the result on the right. */
export function CreatePage({ catalog, settings, onSettingsChange, generation, hidden, ...props }: Props) {
  return (
    <main className={`grid min-h-0 flex-1 lg:grid-cols-[440px_minmax(0,1fr)] ${hidden ? 'hidden' : ''}`}>
      <aside className="min-h-0 border-zinc-200 bg-white lg:border-r dark:border-zinc-800 dark:bg-zinc-950">
        <SettingsPanel
          catalog={catalog}
          settings={settings}
          onChange={onSettingsChange}
          mode={props.mode}
          onModeChange={props.onModeChange}
          generating={generation.state.status === 'pending'}
          lastSeed={props.lastSeed}
          modelStatus={props.modelStatus}
          onModelStatusChanged={props.onModelStatusChanged}
          onGenerate={props.onGenerate}
          onChatPrompt={props.onChatPrompt}
        />
      </aside>
      <section aria-label={t('create.resultLabel')} className="min-h-0 overflow-y-auto">
        <ResultPanel
          state={generation.state}
          models={catalog.models}
          onRetry={generation.retry}
          onCancel={generation.cancel}
          onUseSeed={(seed) => onSettingsChange({ ...settings, seed, randomSeed: false })}
        />
      </section>
    </main>
  )
}
