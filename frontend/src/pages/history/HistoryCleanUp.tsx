import { t, tn } from '../../i18n'
import { useState } from 'react'
import { deleteHistoryOlderThan, fetchHistorySummary } from '../../api'
import { formatSize } from '../../lib/format'
import { errorMessage, useLoadable } from '../../lib/hooks'
import { chipClass, secondaryButtonClass } from '../../lib/styles'
import type { HistorySummary, Loadable } from '../../types'
import { Modal } from '../../shared/ui/Modal'
import { ErrorNotice, Spinner } from '../../shared/ui/ui'

type DeleteState = { status: 'idle' } | { status: 'deleting' } | { status: 'failed'; error: string }

/** How much space History uses, and a dialog to delete images older than a chosen age. */
export function HistoryCleanUp({ onCleaned }: { onCleaned: () => void }) {
  const [summary, retry] = useLoadable(fetchHistorySummary)
  const [open, setOpen] = useState(false)
  return (
    <>
      <StorageSize summary={summary} />
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100">
        {t('history.cleanUp')}
      </button>
      {open && <CleanUpDialog summary={summary} onRetry={retry} onClose={() => setOpen(false)} onCleaned={onCleaned} />}
    </>
  )
}

function StorageSize({ summary }: { summary: Loadable<HistorySummary> }) {
  if (summary.status === 'pending') return <span aria-hidden="true" className="h-4 w-14 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
  // The size is extra information: when it cannot load it is left out, and the dialog shows the error with a retry
  if (summary.status === 'failed') return null
  return <span className="text-sm text-zinc-500 dark:text-zinc-400">{t('history.storageUsed', { size: formatSize(summary.value.bytes) })}</span>
}

interface DialogProps {
  summary: Loadable<HistorySummary>
  onRetry: () => void
  onClose: () => void
  onCleaned: () => void
}

function CleanUpDialog({ summary, onRetry, onClose, onCleaned }: DialogProps) {
  const [days, setDays] = useState(30)
  const [state, setState] = useState<DeleteState>({ status: 'idle' })
  // null while the counts are unknown (loading or failed), so the button never reads as "nothing to delete" then
  const count = summary.status === 'settled' ? (summary.value.older_than.find((age) => age.days === days)?.count ?? 0) : null

  const remove = async () => {
    setState({ status: 'deleting' })
    try {
      await deleteHistoryOlderThan(days)
      onCleaned()
      onClose()
    } catch (error) {
      setState({ status: 'failed', error: errorMessage(error) })
    }
  }

  return (
    <Modal
      title={t('history.cleanUpTitle')}
      onClose={onClose}
      actions={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            {t('common.cancel')}
          </button>
          <DeleteOldButton count={count} days={days} deleting={state.status === 'deleting'} onDelete={() => void remove()} />
        </>
      }
    >
      <CleanUpContent summary={summary} days={days} onDaysChange={setDays} onRetry={onRetry} />
      {state.status === 'failed' && (
        <div className="mt-5">
          <ErrorNotice message={state.error} />
        </div>
      )}
    </Modal>
  )
}

interface ContentProps {
  summary: Loadable<HistorySummary>
  days: number
  onDaysChange: (days: number) => void
  onRetry: () => void
}

function CleanUpContent({ summary, days, onDaysChange, onRetry }: ContentProps) {
  if (summary.status === 'pending') {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-zinc-500">
        <Spinner className="size-4" /> {t('history.countingImages')}
      </p>
    )
  }
  if (summary.status === 'failed') return <ErrorNotice message={summary.error} onRetry={onRetry} />
  return <AgeChoices summary={summary.value} days={days} onDaysChange={onDaysChange} />
}

function AgeChoices({ summary, days, onDaysChange }: { summary: HistorySummary; days: number; onDaysChange: (days: number) => void }) {
  return (
    <div className="space-y-5 py-1">
      <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
        {t('history.cleanUpUsage', { size: formatSize(summary.bytes), count: summary.total })}
      </p>
      <div role="radiogroup" aria-label={t('history.age')} className="grid grid-cols-3 gap-3">
        {summary.older_than.map((age) => (
          <button
            key={age.days}
            type="button"
            role="radio"
            aria-checked={days === age.days}
            onClick={() => onDaysChange(age.days)}
            className={`rounded-lg border px-3 py-3 text-sm ${chipClass(days === age.days)}`}
          >
            {tn('history.days', age.days)}
            <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">{tn('history.imageCount', age.count)}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{t('history.favouritesKept')}</p>
    </div>
  )
}

function deleteLabel(count: number | null, days: number): string {
  if (count === null) return t('common.delete')
  if (count === 0) return t('history.noneOlderThan', { days })
  return tn('history.deleteImages', count)
}

function DeleteOldButton({ count, days, deleting, onDelete }: { count: number | null; days: number; deleting: boolean; onDelete: () => void }) {
  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={deleting || !count}
      className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
    >
      {deleting ? t('common.deleting') : deleteLabel(count, days)}
    </button>
  )
}
