import { useCallback, useEffect, useState } from 'react'
import { clearHistory, deleteHistoryItem, fetchHistory, imageUrl } from '../api'
import { errorMessage } from '../lib/hooks'
import type { HistoryItem, HistoryPage, Loadable, ModelInfo } from '../types'
import { HistoryCleanUp } from './HistoryCleanUp'
import { Modal } from './Modal'
import { ImageFacts } from './ResultPanel'
import { secondaryButtonClass } from '../lib/styles'
import { ErrorNotice, Spinner } from './ui'

export const PAGE_SIZE = 30

type MoreState = { status: 'idle' } | { status: 'loading' } | { status: 'failed'; error: string }

function useHistoryPages() {
  const [page, setPage] = useState<Loadable<HistoryPage>>({ status: 'pending' })
  const [more, setMore] = useState<MoreState>({ status: 'idle' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetchHistory(0, PAGE_SIZE, controller.signal).then(
      (value) => setPage({ status: 'settled', value }),
      (error: unknown) => !controller.signal.aborted && setPage({ status: 'failed', error: errorMessage(error) }),
    )
    return () => controller.abort()
  }, [attempt])

  const loadMore = async (loaded: HistoryItem[]) => {
    setMore({ status: 'loading' })
    try {
      const next = await fetchHistory(loaded.length, PAGE_SIZE)
      setPage({ status: 'settled', value: { items: [...loaded, ...next.items], total: next.total } })
      setMore({ status: 'idle' })
    } catch (error) {
      setMore({ status: 'failed', error: errorMessage(error) })
    }
  }

  const replace = useCallback((value: HistoryPage) => setPage({ status: 'settled', value }), [])
  const reload = () => {
    setPage({ status: 'pending' })
    setAttempt((n) => n + 1)
  }
  return { page, more, loadMore, replace, reload }
}

interface Props {
  models: ModelInfo[]
  onReuse: (item: HistoryItem) => void
}

export function HistoryPanel({ models, onReuse }: Props) {
  const { page, more, loadMore, replace, reload } = useHistoryPages()
  const [selected, setSelected] = useState<HistoryItem | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  if (page.status === 'pending') return <HistorySkeleton />
  if (page.status === 'failed') return <div className="p-6"><ErrorNotice message={page.error} onRetry={reload} /></div>

  const { items, total } = page.value
  const removeItem = (id: number) => replace({ items: items.filter((item) => item.id !== id), total: total - 1 })
  const labelOf = (id: string) => models.find((model) => model.id === id)?.label ?? id

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{total === 1 ? '1 image' : `${total} images`}</p>
        {total > 0 && (
          <div className="flex items-center gap-4">
            <HistoryCleanUp onCleaned={reload} />
            <button type="button" onClick={() => setConfirmClear(true)} className="text-sm font-medium text-red-600 hover:text-red-500">
              Delete all
            </button>
          </div>
        )}
      </div>
      {total === 0 ? <EmptyHistory /> : <HistoryGrid items={items} labelOf={labelOf} onOpen={setSelected} />}
      {items.length < total && <LoadMore state={more} onLoad={() => void loadMore(items)} />}
      {selected && (
        <HistoryDetail
          item={selected}
          label={labelOf(selected.model)}
          onClose={() => setSelected(null)}
          onReuse={() => onReuse(selected)}
          onDeleted={() => {
            removeItem(selected.id)
            setSelected(null)
          }}
        />
      )}
      {confirmClear && <ConfirmClear total={total} onClose={() => setConfirmClear(false)} onCleared={() => replace({ items: [], total: 0 })} />}
    </div>
  )
}

function HistorySkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading history" className="grid grid-cols-2 gap-3 p-6 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: 10 }, (_, index) => (
        <div key={index} className="aspect-square animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
      ))}
    </div>
  )
}

function EmptyHistory() {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
      No images yet. Everything you generate is saved here.
    </div>
  )
}

function HistoryGrid({ items, labelOf, onOpen }: { items: HistoryItem[]; labelOf: (id: string) => string; onOpen: (item: HistoryItem) => void }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onOpen(item)}
            aria-label={`Open: ${item.prompt}`}
            className="group relative block aspect-square w-full overflow-hidden rounded-xl bg-zinc-100 focus:ring-2 focus:ring-violet-500 focus:outline-none dark:bg-zinc-800"
          >
            <img src={imageUrl(item.id, true)} alt="" loading="lazy" className="size-full object-cover transition group-hover:scale-105" />
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-left text-[11px] text-white opacity-0 transition group-hover:opacity-100">
              {labelOf(item.model)} · {item.width}×{item.height}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function LoadMore({ state, onLoad }: { state: MoreState; onLoad: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3">
      {state.status === 'failed' && <ErrorNotice message={state.error} />}
      <button type="button" onClick={onLoad} disabled={state.status === 'loading'} className={`${secondaryButtonClass} flex items-center gap-2`}>
        {state.status === 'loading' && <Spinner className="size-4" />}
        {state.status === 'failed' ? 'Try again' : 'Load more'}
      </button>
    </div>
  )
}

interface DetailProps {
  item: HistoryItem
  label: string
  onClose: () => void
  onReuse: () => void
  onDeleted: () => void
}

function HistoryDetail({ item, label, onClose, onReuse, onDeleted }: DetailProps) {
  const [deleteState, setDeleteState] = useState<MoreState>({ status: 'idle' })
  const remove = async () => {
    setDeleteState({ status: 'loading' })
    try {
      await deleteHistoryItem(item.id)
      onDeleted()
    } catch (error) {
      setDeleteState({ status: 'failed', error: errorMessage(error) })
    }
  }
  return (
    <Modal title="Image details" onClose={onClose} size="lg">
      <div className="grid gap-5 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <img src={imageUrl(item.id)} alt={item.prompt} className="max-h-[70vh] w-full rounded-xl bg-zinc-100 object-contain dark:bg-zinc-800" />
        <div className="space-y-4 text-sm">
          <ImageFacts item={item} label={label} />
          <PromptBlock title="Prompt" text={item.prompt} />
          {item.negative_prompt && <PromptBlock title="Negative prompt" text={item.negative_prompt} />}
          <p className="text-xs text-zinc-400">Created {new Date(`${item.created_at}Z`).toLocaleString()}</p>
          {deleteState.status === 'failed' && <ErrorNotice message={deleteState.error} />}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onReuse} className="rounded-lg bg-violet-600 px-3 py-1.5 font-semibold text-white hover:bg-violet-500">
              Reuse settings
            </button>
            <a href={imageUrl(item.id)} download={`z-image-${item.id}-${item.seed}.png`} className={secondaryButtonClass}>
              Download
            </a>
            <button type="button" onClick={() => void remove()} disabled={deleteState.status === 'loading'} className={`${secondaryButtonClass} text-red-600 dark:text-red-400`}>
              {deleteState.status === 'loading' ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function PromptBlock({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h3 className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">{title}</h3>
      <p className="mt-1 max-h-48 overflow-y-auto rounded-lg bg-zinc-50 p-3 text-xs leading-relaxed whitespace-pre-wrap text-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-200">{text}</p>
    </div>
  )
}

function ConfirmClear({ total, onClose, onCleared }: { total: number; onClose: () => void; onCleared: () => void }) {
  const [state, setState] = useState<MoreState>({ status: 'idle' })
  const clear = async () => {
    setState({ status: 'loading' })
    try {
      await clearHistory()
      onCleared()
      onClose()
    } catch (error) {
      setState({ status: 'failed', error: errorMessage(error) })
    }
  }
  return (
    <Modal title="Delete all images?" onClose={onClose}>
      <p className="text-sm text-zinc-600 dark:text-zinc-300">This permanently deletes all {total} images from your history.</p>
      {state.status === 'failed' && <div className="mt-3"><ErrorNotice message={state.error} /></div>}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={secondaryButtonClass}>
          Cancel
        </button>
        <button type="button" onClick={() => void clear()} disabled={state.status === 'loading'} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50">
          {state.status === 'loading' ? 'Deleting…' : 'Delete all'}
        </button>
      </div>
    </Modal>
  )
}
