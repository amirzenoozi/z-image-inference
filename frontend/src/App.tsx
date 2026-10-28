import { useCallback, useEffect, useState } from 'react'
import { HistoryPanel } from './components/HistoryPanel'
import { ResultPanel } from './components/ResultPanel'
import { SettingsPanel, type PromptMode } from './components/SettingsPanel'
import { ErrorNotice, Spinner } from './components/ui'
import { useGeneration } from './lib/generation'
import { useCatalog } from './lib/hooks'
import { useModelStatus } from './lib/modelStatus'
import { loadSettings, saveSettings, settingsFromItem } from './lib/settings'
import type { Catalog, GenerationSettings, HistoryItem } from './types'

type View = 'create' | 'history'

export default function App() {
  const [catalog, retry] = useCatalog()
  if (catalog.status === 'pending') {
    return (
      <div className="flex h-full items-center justify-center gap-3 text-sm text-zinc-500" role="status">
        <Spinner /> Loading…
      </div>
    )
  }
  if (catalog.status === 'failed') {
    return (
      <div className="mx-auto max-w-md p-8">
        <ErrorNotice message={catalog.error} onRetry={retry} />
      </div>
    )
  }
  return <Workspace catalog={catalog.value} />
}

function Workspace({ catalog }: { catalog: Catalog }) {
  const [settings, setSettings] = useState<GenerationSettings>(() => loadSettings(catalog))
  const [view, setView] = useState<View>('create')
  const [mode, setMode] = useState<PromptMode>('direct')
  const [lastSeed, setLastSeed] = useState<number | null>(null)
  const onSuccess = useCallback((item: HistoryItem) => setLastSeed(item.seed), [])
  const generation = useGeneration(onSuccess)
  // A generation attempt can start a model download, so status is re-checked whenever its state changes
  const modelStatus = useModelStatus(generation.state.status)
  useEffect(() => saveSettings(settings), [settings])

  const generating = generation.state.status === 'pending'
  const generateWith = (prompt: string) => {
    if (!generating && prompt.trim()) void generation.run({ ...settings, prompt })
  }
  const reuse = (item: HistoryItem) => {
    setSettings(settingsFromItem(item, catalog))
    setMode('direct')
    setView('create')
  }

  return (
    <div className="flex h-full flex-col">
      <Header view={view} onViewChange={setView} />
      <main className={`grid min-h-0 flex-1 lg:grid-cols-[440px_minmax(0,1fr)] ${view === 'create' ? '' : 'hidden'}`}>
        <aside className="min-h-0 border-zinc-200 bg-white lg:border-r dark:border-zinc-800 dark:bg-zinc-950">
          <SettingsPanel
            catalog={catalog}
            settings={settings}
            onChange={setSettings}
            mode={mode}
            onModeChange={setMode}
            generating={generating}
            lastSeed={lastSeed}
            modelStatus={modelStatus}
            onGenerate={() => generateWith(settings.prompt)}
            onChatPrompt={(prompt) => {
              setSettings((current) => ({ ...current, prompt }))
              generateWith(prompt)
            }}
          />
        </aside>
        <section aria-label="Result" className="min-h-0 overflow-y-auto">
          <ResultPanel
            state={generation.state}
            models={catalog.models}
            onRetry={generation.retry}
            onUseSeed={(seed) => setSettings((current) => ({ ...current, seed, randomSeed: false }))}
          />
        </section>
      </main>
      {view === 'history' && (
        <main className="min-h-0 flex-1 overflow-y-auto">
          <HistoryPanel models={catalog.models} onReuse={reuse} />
        </main>
      )}
    </div>
  )
}

function Header({ view, onViewChange }: { view: View; onViewChange: (view: View) => void }) {
  const views: { id: View; label: string }[] = [
    { id: 'create', label: 'Create' },
    { id: 'history', label: 'History' },
  ]
  return (
    <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-5 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <h1 className="flex items-center gap-2 text-sm font-bold tracking-tight">
        <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">✦</span>
        Z-Image Studio
      </h1>
      <nav aria-label="Views" className="flex gap-1 rounded-xl bg-zinc-100 p-1 text-sm dark:bg-zinc-800/70">
        {views.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-current={view === id ? 'page' : undefined}
            onClick={() => onViewChange(id)}
            className={`rounded-lg px-4 py-1.5 font-medium transition ${
              view === id ? 'bg-white shadow-sm dark:bg-zinc-950' : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>
    </header>
  )
}
