import { useEffect, useRef, useState } from 'react'
import { t } from '../../i18n'
import type { Catalog, GenerationSettings, GenerationState, Loadable, ModelStatusReport } from '../../types'
import { ResultPanel } from './ResultPanel'
import { SettingsPanel, type PromptMode } from './SettingsPanel'
import { PaneSwitch, type Pane } from './PaneSwitch'

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

/**
 * Below desktop width only one pane shows at a time: Generate opens Result, and a result that arrives while
 * Settings is open marks the Result tab until it is seen.
 */
function usePane(status: GenerationState['status']): { pane: Pane; setPane: (pane: Pane) => void; unseen: boolean } {
  const [pane, setPaneState] = useState<Pane>('settings')
  const [unseen, setUnseen] = useState(false)
  const paneRef = useRef(pane)
  const previous = useRef(status)
  const setPane = (next: Pane) => {
    paneRef.current = next
    setPaneState(next)
    if (next === 'result') setUnseen(false)
  }
  useEffect(() => {
    const wasPending = previous.current === 'pending'
    previous.current = status
    if (status === 'pending' && !wasPending) {
      paneRef.current = 'result'
      setPaneState('result')
    } else if (wasPending && status !== 'idle' && paneRef.current === 'settings') {
      setUnseen(true)
    }
  }, [status])
  return { pane, setPane, unseen }
}

/** The settings on the left, the result on the right; below desktop width, one at a time. */
export function CreatePage({ catalog, settings, onSettingsChange, generation, hidden, ...props }: Props) {
  const { pane, setPane, unseen } = usePane(generation.state.status)
  return (
    <main className={`grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[440px_minmax(0,1fr)] lg:grid-rows-1 ${hidden ? 'hidden' : ''}`}>
      <PaneSwitch pane={pane} onChange={setPane} resultUnseen={unseen} />
      <aside className={`min-h-0 border-zinc-200 bg-white lg:block lg:border-r dark:border-zinc-800 dark:bg-zinc-950 ${pane === 'settings' ? '' : 'hidden'}`}>
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
      <section aria-label={t('create.resultLabel')} className={`min-h-0 overflow-y-auto lg:block ${pane === 'result' ? '' : 'hidden'}`}>
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
