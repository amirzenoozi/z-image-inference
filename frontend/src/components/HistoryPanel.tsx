import { useCallback, useEffect, useRef, useState } from 'react'
import { clearHistory, deleteHistoryItem, fetchHistory, imageUrl } from '../api'
import { NO_FILTERS, isFiltered } from '../lib/historyFilters'
import { errorMessage } from '../lib/hooks'
import { secondaryButtonClass } from '../lib/styles'
import type { HistoryFilters, HistoryItem, HistoryPage, Loadable, ModelInfo } from '../types'
import { ColourPalette } from './ColourPalette'
import { CompareDialog } from './CompareDialog'
import { FavouriteButton } from './FavouriteButton'
import { HistoryCleanUp } from './HistoryCleanUp'
import { HistoryFilterBar } from './HistoryFilters'
import { HistoryGrid } from './HistoryGrid'
import { ImageFacts } from './ImageFacts'
import { Modal } from './Modal'
import { Pagination } from './Pagination'
import { ErrorNotice, PromptBlock } from './ui'

export const PAGE_SIZE = 30

type ActionState = { status: 'idle' } | { status: 'loading' } | { status: 'failed'; error: string }

/** One page of History at a time; loading another page, or the same one again, shows the placeholder first. */
function useHistoryPage(filters: HistoryFilters) {
  const [pageNumber, setPageNumber] = useState(1)
  const [page, setPage] = useState<Loadable<HistoryPage>>({ status: 'pending' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetchHistory((pageNumber - 1) * PAGE_SIZE, PAGE_SIZE, filters, controller.signal).then(
      (value) => setPage({ status: 'settled', value }),
      (error: unknown) => !controller.signal.aborted && setPage({ status: 'failed', error: errorMessage(error) }),
    )
    return () => controller.abort()
  }, [filters, pageNumber, attempt])

  const load = (number: number) => {
    setPage({ status: 'pending' })
    setPageNumber(number)
    setAttempt((n) => n + 1)
  }
  const replace = useCallback((value: HistoryPage) => setPage({ status: 'settled', value }), [])
  return { page, pageNumber, load, replace }
}

/** Adds or removes an image from the compare selection, which holds at most two. */
function toggleInSelection(selection: HistoryItem[], item: HistoryItem): HistoryItem[] {
  if (selection.some((picked) => picked.id === item.id)) return selection.filter((picked) => picked.id !== item.id)
  return selection.length < 2 ? [...selection, item] : selection
}

interface Props {
  models: ModelInfo[]
  onReuse: (item: HistoryItem) => void
}

export function HistoryPanel({ models, onReuse }: Props) {
  const [filters, setFilters] = useState<HistoryFilters>(NO_FILTERS)
  // Remounts the filter bar when the filters are cleared, so its search box empties too
  const [filtersVersion, setFiltersVersion] = useState(0)
  // Kept across filter changes, so two images found by different searches can be compared
  const [selection, setSelection] = useState<HistoryItem[] | null>(null)
  const [comparing, setComparing] = useState<[HistoryItem, HistoryItem] | null>(null)
  const labelOf = (id: string) => models.find((model) => model.id === id)?.label ?? id
  const top = useRef<HTMLDivElement>(null)

  const clearFilters = () => {
    setFilters(NO_FILTERS)
    setFiltersVersion((n) => n + 1)
  }
  const compare = () => {
    if (selection?.length === 2) setComparing([selection[0], selection[1]])
  }

  return (
    <div ref={top} className="space-y-5 p-6">
      <HistoryFilterBar
        key={filtersVersion}
        models={models}
        filters={filters}
        onChange={setFilters}
        comparing={selection !== null}
        selectedCount={selection?.length ?? 0}
        onCompareToggle={() => setSelection((current) => (current === null ? [] : null))}
        onCompare={compare}
      />
      {/* A new set of filters starts from a fresh first page; results of the old ones are dropped */}
      <HistoryResults
        key={JSON.stringify(filters)}
        filters={filters}
        labelOf={labelOf}
        onReuse={onReuse}
        onClearFilters={clearFilters}
        selectedIds={selection?.map((item) => item.id) ?? null}
        onSelect={(item) => setSelection((current) => toggleInSelection(current ?? [], item))}
        onPageChanged={() => top.current?.scrollIntoView({ block: 'start' })}
      />
      {comparing && <CompareDialog items={comparing} labelOf={labelOf} onClose={() => setComparing(null)} />}
    </div>
  )
}

interface ResultsProps {
  filters: HistoryFilters
  labelOf: (id: string) => string
  onReuse: (item: HistoryItem) => void
  onClearFilters: () => void
  selectedIds: number[] | null
  onSelect: (item: HistoryItem) => void
  onPageChanged: () => void
}

function HistoryResults({ filters, labelOf, onReuse, onClearFilters, selectedIds, onSelect, onPageChanged }: ResultsProps) {
  const { page, pageNumber, load, replace } = useHistoryPage(filters)
  const [opened, setOpened] = useState<HistoryItem | null>(null)
  const [favouriteError, setFavouriteError] = useState<string | null>(null)

  if (page.status === 'pending') return <HistorySkeleton />
  if (page.status === 'failed') return <ErrorNotice message={page.error} onRetry={() => load(pageNumber)} />

  const { items, total } = page.value
  const filtered = isFiltered(filters)
  const goToPage = (number: number) => {
    load(number)
    onPageChanged()
  }
  // The page refills from the next one; when its only image goes, the page before it is shown instead
  const removeItem = () => load(items.length === 1 && pageNumber > 1 ? pageNumber - 1 : pageNumber)
  const updateItem = (item: HistoryItem) => {
    setFavouriteError(null)
    setOpened((current) => (current?.id === item.id ? item : current))
    // With the Favourites filter on, an unstarred image no longer belongs in the list
    if (filters.favouritesOnly && !item.favourite) removeItem()
    else replace({ items: items.map((current) => (current.id === item.id ? item : current)), total })
  }

  return (
    <>
      <HistoryHeader
        total={total}
        firstShown={(pageNumber - 1) * PAGE_SIZE + 1}
        lastShown={(pageNumber - 1) * PAGE_SIZE + items.length}
        filtered={filtered}
        onCleaned={() => load(1)}
        onCleared={() => load(1)}
      />
      {favouriteError && <ErrorNotice message={favouriteError} />}
      {total === 0 ? (
        <EmptyResults filtered={filtered} onClearFilters={onClearFilters} />
      ) : (
        <HistoryGrid
          items={items}
          labelOf={labelOf}
          selectedIds={selectedIds}
          onActivate={selectedIds === null ? setOpened : onSelect}
          onFavouriteChanged={updateItem}
          onFavouriteFailed={setFavouriteError}
        />
      )}
      <Pagination page={pageNumber} pageCount={Math.ceil(total / PAGE_SIZE)} onChange={goToPage} />
      {opened && (
        <HistoryDetail
          item={opened}
          label={labelOf(opened.model)}
          onClose={() => setOpened(null)}
          onReuse={() => onReuse(opened)}
          onDeleted={() => {
            removeItem()
            setOpened(null)
          }}
          onFavouriteChanged={updateItem}
          onFavouriteFailed={setFavouriteError}
        />
      )}
    </>
  )
}

interface HeaderProps {
  total: number
  firstShown: number
  lastShown: number
  filtered: boolean
  onCleaned: () => void
  onCleared: () => void
}

/** The image count, and the clean-up and delete-all actions, which only make sense for the whole History. */
function HistoryHeader({ total, firstShown, lastShown, filtered, onCleaned, onCleared }: HeaderProps) {
  const [confirmClear, setConfirmClear] = useState(false)
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-zinc-500 dark:text-zinc-400 tabular-nums">{countLabel(total, firstShown, lastShown, filtered)}</p>
      {total > 0 && !filtered && (
        <div className="flex items-center gap-4">
          <HistoryCleanUp onCleaned={onCleaned} />
          <button type="button" onClick={() => setConfirmClear(true)} className="text-sm font-medium text-red-600 hover:text-red-500">
            Delete all
          </button>
        </div>
      )}
      {confirmClear && <ConfirmClear total={total} onClose={() => setConfirmClear(false)} onCleared={onCleared} />}
    </div>
  )
}

function countLabel(total: number, firstShown: number, lastShown: number, filtered: boolean): string {
  const count = filtered ? `${total} matching` : total === 1 ? '1 image' : `${total} images`
  return total > PAGE_SIZE ? `Showing ${firstShown}–${lastShown} of ${count}` : count
}

function EmptyResults({ filtered, onClearFilters }: { filtered: boolean; onClearFilters: () => void }) {
  if (!filtered) return <EmptyHistory />
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
      <p>No images match.</p>
      <button type="button" onClick={onClearFilters} className={`${secondaryButtonClass} mt-3`}>
        Clear filters
      </button>
    </div>
  )
}

function HistorySkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading history" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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

interface DetailProps {
  item: HistoryItem
  label: string
  onClose: () => void
  onReuse: () => void
  onDeleted: () => void
  onFavouriteChanged: (item: HistoryItem) => void
  onFavouriteFailed: (message: string) => void
}

function HistoryDetail({ item, label, onClose, onReuse, onDeleted, ...favourite }: DetailProps) {
  const [deleteState, setDeleteState] = useState<ActionState>({ status: 'idle' })
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
        <div className="relative">
          <img src={imageUrl(item.id)} alt={item.prompt} className="max-h-[70vh] w-full rounded-xl bg-zinc-100 object-contain dark:bg-zinc-800" />
          <FavouriteButton item={item} onChanged={favourite.onFavouriteChanged} onFailed={favourite.onFavouriteFailed} className="absolute top-3 right-3" />
        </div>
        <div className="space-y-4 text-sm">
          <ImageFacts item={item} label={label} />
          <ColourPalette itemId={item.id} />
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

function ConfirmClear({ total, onClose, onCleared }: { total: number; onClose: () => void; onCleared: () => void }) {
  const [state, setState] = useState<ActionState>({ status: 'idle' })
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
      <p className="text-sm text-zinc-600 dark:text-zinc-300">This permanently deletes all {total} images from your history, favourites included.</p>
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
