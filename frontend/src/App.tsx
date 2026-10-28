import { useCallback, useEffect, useState } from 'react'
import { HistoryPanel } from './components/HistoryPanel'
import { CharactersPanel } from './components/CharactersPanel'
import { CharactersProvider } from './components/CharactersProvider'
import { ResultPanel } from './components/ResultPanel'
import { SettingsPanel, type PromptMode } from './components/SettingsPanel'
import { ErrorNotice, Spinner } from './components/ui'
import { useCharacter, useCharacters } from './lib/characters'
import { promptToSend } from './lib/characterPrompt'
import { useGeneration } from './lib/generation'
import { tabClass } from './lib/styles'
import { useCatalog } from './lib/hooks'
import { useModelStatus } from './lib/modelStatus'
import { characterSettings, findModel, loadSettings, saveSettings, settingsFromItem, variationSettings } from './lib/settings'
import { askToNotify, useRenderAlerts } from './lib/renderAlerts'
import { useUnseenResult } from './lib/unseenResult'
import { useView, type View } from './lib/view'
import type { Catalog, GenerationSettings, HistoryItem } from './types'
import { Sparkles } from 'lucide-react'


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
  return (
    <CharactersProvider>
      <Workspace catalog={catalog.value} />
    </CharactersProvider>
  )
}

/** A character chosen in Create that has since been deleted is let go, so the next render does not fail on it. */
function useForgetDeletedCharacter(characterId: number | null, forget: () => void) {
  const { characters } = useCharacters()
  const deleted = characterId !== null && characters.status === 'settled' && !characters.value.some((character) => character.id === characterId)
  useEffect(() => {
    if (deleted) forget()
  }, [deleted, forget])
}

function Workspace({ catalog }: { catalog: Catalog }) {
  const [settings, setSettings] = useState<GenerationSettings>(() => loadSettings(catalog))
  const [view, setView] = useView()
  const [mode, setMode] = useState<PromptMode>('direct')
  const [lastSeed, setLastSeed] = useState<number | null>(null)
  const { unseen, finished } = useUnseenResult(view)
  const onSuccess = useCallback(
    (item: HistoryItem) => {
      setLastSeed(item.seed)
      finished()
    },
    [finished],
  )
  const generation = useGeneration(onSuccess, finished)
  useRenderAlerts(generation.state, catalog.models)
  // A generation attempt can start a model download, so status is re-checked whenever its state changes
  const [modelStatus, refreshModelStatus] = useModelStatus(generation.state.status)
  useEffect(() => saveSettings(settings), [settings])
  const forgetCharacter = useCallback(() => setSettings((current) => ({ ...current, characterId: null })), [])
  useForgetDeletedCharacter(settings.characterId, forgetCharacter)

  const generating = generation.state.status === 'pending'
  const character = useCharacter(settings.characterId)
  const generateWith = (next: GenerationSettings) => {
    if (generating || !next.prompt.trim()) return
    askToNotify()
    void generation.run({ ...next, prompt: promptToSend(next, character, findModel(catalog, next.modelId)) })
  }
  const openInCreate = (next: GenerationSettings) => {
    setSettings(next)
    setMode('direct')
    setView('create')
  }

  return (
    <div className="flex h-full flex-col">
      <Header view={view} onViewChange={setView} unseenResult={unseen} />
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
            onModelStatusChanged={refreshModelStatus}
            onGenerate={() => generateWith(settings)}
            onChatPrompt={(prompt) => {
              // Grok's prompt is new, so it doesn't have the character's look yet
              const next = { ...settings, prompt, lookIncluded: null }
              setSettings(next)
              generateWith(next)
            }}
          />
        </aside>
        <section aria-label="Result" className="min-h-0 overflow-y-auto">
          <ResultPanel
            state={generation.state}
            models={catalog.models}
            onRetry={generation.retry}
            onCancel={generation.cancel}
            onUseSeed={(seed) => setSettings((current) => ({ ...current, seed, randomSeed: false }))}
          />
        </section>
      </main>
      {view === 'characters' && (
        <main className="min-h-0 flex-1 overflow-y-auto">
          <CharactersPanel
            maxSeed={catalog.limits.max_seed}
            onUse={(character) => openInCreate({ ...settings, ...characterSettings(character) })}
            onShowImages={(character) => setView('history', `?character=${character.id}`)}
          />
        </main>
      )}
      {view === 'history' && (
        <main className="min-h-0 flex-1 overflow-y-auto">
          <HistoryPanel models={catalog.models} onReuse={(item) => openInCreate(settingsFromItem(item, catalog))} onVary={(item) => openInCreate(variationSettings(item, catalog))} />
        </main>
      )}
    </div>
  )
}

interface HeaderProps {
  view: View
  onViewChange: (view: View) => void
  /** A render finished while another view was open: Create shows a red dot until it is opened. */
  unseenResult: boolean
}

function Header({ view, onViewChange, unseenResult }: HeaderProps) {
  const views: { id: View; label: string }[] = [
    { id: 'create', label: 'Create' },
    { id: 'history', label: 'History' },
    { id: 'characters', label: 'Characters' },
  ]
  return (
    <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-5 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <h1 className="flex items-center gap-2 text-sm font-bold tracking-tight">
        <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white"><Sparkles /></span>
        Z-Image Studio
      </h1>
      <nav aria-label="Views" className="flex gap-1 rounded-xl bg-zinc-100 p-1 text-sm dark:bg-zinc-800/70">
        {views.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-current={view === id ? 'page' : undefined}
            onClick={() => onViewChange(id)}
            className={`relative rounded-lg px-4 py-1.5 font-medium transition ${
              tabClass(view === id)
            }`}
          >
            {label}
            {id === 'create' && unseenResult && <NewResultDot />}
          </button>
        ))}
      </nav>
    </header>
  )
}

function NewResultDot() {
  return (
    <>
      <span aria-hidden="true" className="absolute top-1 right-1.5 size-2 rounded-full bg-red-500 ring-2 ring-zinc-100 dark:ring-zinc-800" />
      <span className="sr-only"> (new result)</span>
    </>
  )
}
