import { t, tn } from '../../i18n'
import { useCallback, useEffect, useRef, useState } from 'react'
import { clearHistory, fetchHistory, historyExportUrl } from '../../api'
import { useHistoryAddress, type AddressChange } from '../../lib/historyAddress'
import { NO_FILTERS, isFiltered } from '../../lib/historyFilters'
import { errorMessage } from '../../lib/hooks'
import { secondaryButtonClass } from '../../lib/styles'
import type { HistoryFilters, HistoryItem, HistoryPageData, Loadable, ModelInfo } from '../../types'
import { CompareDialog } from './CompareDialog'
import { HistoryViewer, type ViewerStart } from './viewer/HistoryViewer'
import { HistoryCleanUp } from './HistoryCleanUp'
import { HistoryFilterBar } from './HistoryFilters'
import { HistoryGrid } from './HistoryGrid'
import { Modal } from '../../shared/ui/Modal'
import { Pagination } from '../../shared/ui/Pagination'
import { ErrorNotice } from '../../shared/ui/ui'

export const PAGE_SIZE = 30

type ActionState = { status: 'idle' } | { status: 'loading' } | { status: 'failed'; error: string }

/** One page of History; loading it again shows the placeholder first. */
function useHistoryPage(filters: HistoryFilters, pageNumber: number) {
  const [page, setPage] = useState<Loadable<HistoryPageData>>({ status: 'pending' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetchHistory((pageNumber - 1) * PAGE_SIZE, PAGE_SIZE, filters, controller.signal).then(
      (value) => setPage({ status: 'settled', value }),
      (error: unknown) => !controller.signal.aborted && setPage({ status: 'failed', error: errorMessage(error) }),
    )
    return () => controller.abort()
  }, [filters, pageNumber, attempt])

  const reload = () => {
    setPage({ status: 'pending' })
    setAttempt((n) => n + 1)
  }
  const replace = useCallback((value: HistoryPageData) => setPage({ status: 'settled', value }), [])
  return { page, reload, replace }
}

/** Adds or removes an image from the compare selection, which holds at most two. */
function toggleInSelection(selection: HistoryItem[], item: HistoryItem): HistoryItem[] {
  if (selection.some((picked) => picked.id === item.id)) return selection.filter((picked) => picked.id !== item.id)
  return selection.length < 2 ? [...selection, item] : selection
}

interface Props {
  models: ModelInfo[]
  onReuse: (item: HistoryItem) => void
  onVary: (item: HistoryItem) => void
}

export function HistoryPage({ models, onReuse, onVary }: Props) {
  const [address, go, visits] = useHistoryAddress(models)
  const { filters, page } = address
  // Remounts the filter bar when the filters are cleared, so its search box empties too
  const [filtersVersion, setFiltersVersion] = useState(0)
  // Kept across filter changes, so two images found by different searches can be compared
  const [selection, setSelection] = useState<HistoryItem[] | null>(null)
  const [comparing, setComparing] = useState<[HistoryItem, HistoryItem] | null>(null)
  // The viewer belongs to the filters it opened with; it closes if Back or Forward changes them
  const [viewing, setViewing] = useState<(ViewerStart & { filtersKey: string }) | null>(null)
  // Bumped after the viewer stars or deletes, so the page behind it reloads
  const [listVersion, setListVersion] = useState(0)
  const filtersKey = JSON.stringify(filters)
  const labelOf = (id: string) => models.find((model) => model.id === id)?.label ?? id
  const top = useRef<HTMLDivElement>(null)

  // A filter change starts again from the first page; typing a search updates the current Back entry instead of adding one
  const changeFilters = (next: HistoryFilters) => go({ filters: next, page: 1 }, next.search === filters.search ? 'push' : 'replace')
  const changePage = useCallback(
    (number: number, change: AddressChange = 'push') => {
      go({ filters, page: number }, change)
      top.current?.scrollIntoView({ block: 'start' })
    },
    [filters, go],
  )
  const clearFilters = () => {
    go({ filters: NO_FILTERS, page: 1 })
    setFiltersVersion((n) => n + 1)
  }
  const compare = () => {
    if (selection?.length === 2) setComparing([selection[0], selection[1]])
  }
  // The page behind the viewer follows it, so closing the viewer shows where it ended
  // A saved edit is the newest image: filters are cleared so it is in the list, and the viewer opens on it
  const openEdited = async (item: HistoryItem) => {
    setListVersion((n) => n + 1)
    const newest = await fetchHistory(0, 1, NO_FILTERS).catch(() => null)
    go({ filters: NO_FILTERS, page: 1 })
    setFiltersVersion((n) => n + 1)
    setViewing({ index: 0, item, total: newest?.total ?? 1, filtersKey: JSON.stringify(NO_FILTERS) })
  }
  const followViewer = (index: number) => {
    const pageOfImage = Math.floor(index / PAGE_SIZE) + 1
    if (pageOfImage !== page) go({ filters, page: pageOfImage })
  }

  return (
    <div ref={top} className="space-y-5 p-6">
      <HistoryFilterBar
        key={`${filtersVersion}-${visits}`}
        models={models}
        filters={filters}
        onChange={changeFilters}
        comparing={selection !== null}
        selectedCount={selection?.length ?? 0}
        onCompareToggle={() => setSelection((current) => (current === null ? [] : null))}
        onCompare={compare}
      />
      {/* Each page and set of filters starts fresh, with its placeholder; results of the old ones are dropped */}
      <HistoryResults
        key={`${filtersKey}-${page}-${listVersion}`}
        filters={filters}
        pageNumber={page}
        labelOf={labelOf}
        onOpen={(item, indexOnPage, total) => setViewing({ index: (page - 1) * PAGE_SIZE + indexOnPage, item, total, filtersKey })}
        onClearFilters={clearFilters}
        selectedIds={selection?.map((item) => item.id) ?? null}
        onSelect={(item) => setSelection((current) => toggleInSelection(current ?? [], item))}
        onPageChange={changePage}
      />
      {comparing && <CompareDialog items={comparing} labelOf={labelOf} onClose={() => setComparing(null)} />}
      {viewing?.filtersKey === filtersKey && (
        <HistoryViewer
          key={`${viewing.filtersKey}-${viewing.item.id}`}
          filters={filters}
          start={viewing}
          labelOf={labelOf}
          onIndexChange={followViewer}
          onListChanged={() => setListVersion((n) => n + 1)}
          onReuse={onReuse}
          onVary={onVary}
          onEdited={(item) => void openEdited(item)}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  )
}

interface ResultsProps {
  filters: HistoryFilters
  pageNumber: number
  labelOf: (id: string) => string
  onOpen: (item: HistoryItem, indexOnPage: number, total: number) => void
  onClearFilters: () => void
  selectedIds: number[] | null
  onSelect: (item: HistoryItem) => void
  onPageChange: (page: number, change?: AddressChange) => void
}

function HistoryResults({ filters, pageNumber, labelOf, onOpen, onClearFilters, selectedIds, onSelect, onPageChange }: ResultsProps) {
  const { page, reload, replace } = useHistoryPage(filters, pageNumber)
  const [favouriteError, setFavouriteError] = useState<string | null>(null)
  const lastPage = page.status === 'settled' ? Math.max(1, Math.ceil(page.value.total / PAGE_SIZE)) : null

  // A page past the end, from an old link or after deleting images, shows the last page instead
  useEffect(() => {
    if (lastPage !== null && pageNumber > lastPage) onPageChange(lastPage, 'replace')
  }, [lastPage, pageNumber, onPageChange])

  if (page.status === 'pending') return <HistorySkeleton />
  if (page.status === 'failed') return <ErrorNotice message={page.error} onRetry={reload} />

  const { items, total } = page.value
  const filtered = isFiltered(filters)
  const showPage = (number: number) => (number === pageNumber ? reload() : onPageChange(number))
  // The page refills from the next one; when its only image goes, the page before it is shown instead
  const removeItem = () => showPage(items.length === 1 && pageNumber > 1 ? pageNumber - 1 : pageNumber)
  const updateItem = (item: HistoryItem) => {
    setFavouriteError(null)
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
        exportUrl={historyExportUrl(filters)}
        onCleaned={() => showPage(1)}
        onCleared={() => showPage(1)}
      />
      {favouriteError && <ErrorNotice message={favouriteError} />}
      {total === 0 ? (
        <EmptyResults filtered={filtered} onClearFilters={onClearFilters} />
      ) : (
        <HistoryGrid
          items={items}
          labelOf={labelOf}
          selectedIds={selectedIds}
          onActivate={selectedIds === null ? (item) => onOpen(item, items.indexOf(item), total) : onSelect}
          onFavouriteChanged={updateItem}
          onFavouriteFailed={setFavouriteError}
        />
      )}
      <Pagination page={pageNumber} pageCount={Math.ceil(total / PAGE_SIZE)} onChange={onPageChange} />
    </>
  )
}

interface HeaderProps {
  total: number
  firstShown: number
  lastShown: number
  filtered: boolean
  exportUrl: string
  onCleaned: () => void
  onCleared: () => void
}

/** The image count, and the clean-up and delete-all actions, which only make sense for the whole History. */
function HistoryHeader({ total, firstShown, lastShown, filtered, exportUrl, onCleaned, onCleared }: HeaderProps) {
  const [confirmClear, setConfirmClear] = useState(false)
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-zinc-500 dark:text-zinc-400 tabular-nums">{countLabel(total, firstShown, lastShown, filtered)}</p>
      {total > 0 && (
        <div className="flex items-center gap-4">
          <a href={exportUrl} download className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100">
            {filtered ? t('history.exportThese') : t('history.export')}
          </a>
          {!filtered && <WholeHistoryActions onCleaned={onCleaned} onDeleteAll={() => setConfirmClear(true)} />}
        </div>
      )}
      {confirmClear && <ConfirmClear total={total} onClose={() => setConfirmClear(false)} onCleared={onCleared} />}
    </div>
  )
}

/** Clean up and Delete all act on the whole History, so they are hidden while a filter is on. */
function WholeHistoryActions({ onCleaned, onDeleteAll }: { onCleaned: () => void; onDeleteAll: () => void }) {
  return (
    <>
      <HistoryCleanUp onCleaned={onCleaned} />
      <button type="button" onClick={onDeleteAll} className="text-sm font-medium text-red-600 hover:text-red-500">
        {t('history.deleteAll')}
      </button>
    </>
  )
}

function countLabel(total: number, firstShown: number, lastShown: number, filtered: boolean): string {
  const count = filtered ? t('history.matchingCount', { count: total }) : tn('history.imageCount', total)
  return total > PAGE_SIZE ? t('history.showingRange', { first: firstShown, last: lastShown, count }) : count
}

function EmptyResults({ filtered, onClearFilters }: { filtered: boolean; onClearFilters: () => void }) {
  if (!filtered) return <EmptyHistory />
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
      <p>{t('history.noMatches')}</p>
      <button type="button" onClick={onClearFilters} className={`${secondaryButtonClass} mt-3`}>
        {t('history.clearFilters')}
      </button>
    </div>
  )
}

function HistorySkeleton() {
  return (
    <div aria-busy="true" aria-label={t('history.loadingHistory')} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: 10 }, (_, index) => (
        <div key={index} className="aspect-square animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
      ))}
    </div>
  )
}

function EmptyHistory() {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
      {t('history.empty')}
    </div>
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
    <Modal
      title={t('history.deleteAllTitle')}
      onClose={onClose}
      actions={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            {t('common.cancel')}
          </button>
          <button type="button" onClick={() => void clear()} disabled={state.status === 'loading'} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50">
            {state.status === 'loading' ? t('common.deleting') : t('history.deleteAll')}
          </button>
        </>
      }
    >
      <p className="text-sm text-zinc-600 dark:text-zinc-300">{t('history.deleteAllBody', { count: total })}</p>
      {state.status === 'failed' && <div className="mt-3"><ErrorNotice message={state.error} /></div>}
    </Modal>
  )
}
