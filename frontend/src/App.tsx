import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { loadLanguage, t } from './i18n'
import { HistoryPage } from './pages/history/HistoryPage'
import { CharactersPage } from './pages/characters/CharactersPage'
import { CharactersProvider } from './shared/characters/CharactersProvider'
import { CreatePage } from './pages/create/CreatePage'
import type { PromptMode } from './pages/create/SettingsPanel'
import { ErrorNotice, Spinner } from './shared/ui/ui'
import { useCharacter, useCharacters } from './lib/characters'
import { promptToSend } from './lib/characterPrompt'
import { addonsToSend } from './lib/addons'
import { useGeneration } from './lib/generation'
import { useCatalog } from './lib/hooks'
import { useModelStatus } from './lib/modelStatus'
import { parseModes } from './lib/promptBuilder/modes'
import { characterSettings, findModel, loadSettings, saveSettings, settingsFromItem, variationSettings } from './lib/settings'
import { askToNotify, useRenderAlerts } from './lib/renderAlerts'
import { useUnseenResult } from './lib/unseenResult'
import { useView, type View } from './lib/view'
import type { Catalog, GenerationSettings, HistoryItem } from './types'
import { Images, Sparkles, UsersRound, WandSparkles, type LucideIcon } from 'lucide-react'


function Loading() {
  return (
    <div className="flex h-full items-center justify-center gap-3 text-sm text-zinc-500" role="status">
      <Spinner /> {t('common.loading')}
    </div>
  )
}

/** Shows the app once its language is loaded; until then, the loading screen (in English, the only one bundled). */
function LanguageGate({ code, children }: { code: string; children: ReactNode }) {
  const [loaded, setLoaded] = useState<string | null>(null)
  useEffect(() => {
    let current = true
    void loadLanguage(code).then(() => current && setLoaded(code))
    return () => {
      current = false
    }
  }, [code])
  return loaded === code ? children : <Loading />
}

export default function App() {
  const [catalog, retry] = useCatalog()
  if (catalog.status === 'pending') return <Loading />
  if (catalog.status === 'failed') {
    return (
      <div className="mx-auto max-w-md p-8">
        <ErrorNotice message={catalog.error} onRetry={retry} />
      </div>
    )
  }
  return (
    <LanguageGate code={catalog.value.language}>
      <CharactersProvider>
        <Workspace catalog={catalog.value} />
      </CharactersProvider>
    </LanguageGate>
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
  const builderModes = useMemo(() => parseModes(catalog.builder_modes).modes, [catalog.builder_modes])
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
  const { characters } = useCharacters()
  const characterName = useCallback(
    (id: number) => (characters.status === 'settled' ? (characters.value.find((character) => character.id === id)?.name ?? null) : null),
    [characters],
  )
  useRenderAlerts(generation.state, { models: catalog.models, characterName, onOpen: () => setView('create') })
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
    const model = findModel(catalog, next.modelId)
    const sent = promptToSend(next, character, model, builderModes)
    if (sent.status !== 'ready') return
    void generation.run({ ...next, prompt: sent.prompt, promptFormat: 'text', promptSpec: sent.spec, addons: addonsToSend(model, next.addons, modelStatus) })
  }
  const openInCreate = (next: GenerationSettings) => {
    setSettings(next)
    setMode('direct')
    setView('create')
  }

  return (
    // On phones the views sit in a bar at the bottom, so the page leaves room for it
    <div className="flex h-dvh flex-col pr-[env(safe-area-inset-right)] pb-[calc(4rem+env(safe-area-inset-bottom))] pl-[env(safe-area-inset-left)] sm:pb-0">
      <Header view={view} onViewChange={setView} unseenResult={unseen} />
      <CreatePage
        catalog={catalog}
        settings={settings}
        onSettingsChange={setSettings}
        mode={mode}
        onModeChange={setMode}
        generation={generation}
        lastSeed={lastSeed}
        modelStatus={modelStatus}
        onModelStatusChanged={refreshModelStatus}
        onGenerate={() => generateWith(settings)}
        onChatPrompt={(prompt) => {
          // Grok's prompt is new, so it doesn't have the character's look yet
          const next: GenerationSettings = { ...settings, prompt, promptFormat: 'text', lookIncluded: null }
          setSettings(next)
          generateWith(next)
        }}
        hidden={view !== 'create'}
      />
      {view === 'characters' && (
        <main className="min-h-0 flex-1 overflow-y-auto">
          <CharactersPage
            maxSeed={catalog.limits.max_seed}
            onUse={(character) => openInCreate({ ...settings, ...characterSettings(character) })}
            onShowImages={(character) => setView('history', `?character=${character.id}`)}
          />
        </main>
      )}
      {view === 'history' && (
        <main className="min-h-0 flex-1 overflow-y-auto">
          <HistoryPage models={catalog.models} video={catalog.video} onReuse={(item) => openInCreate(settingsFromItem(item, catalog))} onVary={(item) => openInCreate(variationSettings(item, catalog))} />
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

const VIEWS: { id: View; label: () => string; Icon: LucideIcon }[] = [
  { id: 'create', label: () => t('create.viewCreate'), Icon: WandSparkles },
  { id: 'history', label: () => t('create.viewHistory'), Icon: Images },
  { id: 'characters', label: () => t('create.viewCharacters'), Icon: UsersRound },
]

// One menu for both layouts: in the header from tablet width up, and a bar at the bottom, within thumb reach, on phones
const NAV_CLASS =
  'fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur ' +
  'dark:border-zinc-800 dark:bg-zinc-950/95 sm:static sm:flex sm:gap-1 sm:rounded-xl sm:border-0 sm:bg-zinc-100 sm:p-1 sm:pb-1 sm:dark:bg-zinc-800/70'

function Header({ view, onViewChange, unseenResult }: HeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 sm:px-5 dark:border-zinc-800 dark:bg-zinc-950">
      <h1 className="flex items-center gap-2 text-sm font-bold tracking-tight">
        <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white"><Sparkles /></span>
        Z-Image Studio
      </h1>
      <nav aria-label={t('create.viewsLabel')} className={NAV_CLASS}>
        {VIEWS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            aria-current={view === id ? 'page' : undefined}
            onClick={() => onViewChange(id)}
            className={`relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition sm:h-auto sm:rounded-lg sm:px-4 sm:py-1.5 sm:text-sm ${navItemClass(view === id)}`}
          >
            <Icon className="size-5 sm:hidden" aria-hidden="true" />
            {label()}
            {id === 'create' && unseenResult && <NewResultDot />}
          </button>
        ))}
      </nav>
    </header>
  )
}

/** On phones the current view is shown in violet; from tablet width up, as the raised tab (as tabClass draws it). */
function navItemClass(current: boolean): string {
  return current
    ? 'text-violet-700 dark:text-violet-300 sm:bg-white sm:text-zinc-900 sm:shadow-sm sm:dark:bg-zinc-950 sm:dark:text-zinc-100'
    : 'text-zinc-500 dark:text-zinc-400 sm:hover:bg-white/70 sm:hover:text-zinc-900 sm:dark:hover:bg-zinc-700/70 sm:dark:hover:text-zinc-100'
}

function NewResultDot() {
  return (
    <>
      <span aria-hidden="true" className="absolute top-2 right-[calc(50%-1.25rem)] size-2 rounded-full bg-red-500 ring-2 ring-white sm:top-1 sm:right-1.5 sm:ring-zinc-100 dark:ring-zinc-950 sm:dark:ring-zinc-800" />
      <span className="sr-only">{t('create.newResult')}</span>
    </>
  )
}
