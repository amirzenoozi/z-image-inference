import { formatGb, gigabytes } from '../../../lib/format'
import type { Loadable, ModelInfo, ModelStatusReport } from '../../../types'
import { Spinner } from '../../../shared/ui/ui'
import { ExternalLink } from 'lucide-react'
import { t } from '../../../i18n'

/** The model's page on the site it comes from. */
export function SourceLink({ model }: { model: Pick<ModelInfo, 'label' | 'page_url' | 'source_name'> }) {
  return (
    <a
      href={model.page_url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t('create.openOnSite', { model: model.label, site: model.source_name })}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-zinc-500 hover:bg-zinc-200/70 hover:text-violet-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-violet-300"
    >
      {model.source_name} <ExternalLink className="size-3" />
    </a>
  )
}

/** A model's or an add-on's download state, from the status report. */
export function DownloadBadge({ model, status }: { model: Downloadable; status: Loadable<ModelStatusReport> }) {
  if (status.status === 'pending') return <span className="mt-1.5 block text-[11px] text-zinc-400">{t('create.checkingDownload')}</span>
  if (status.status !== 'settled') return null
  const state = status.value.models[model.id]
  const size = `~${model.download_gb} GB`
  switch (state?.status) {
    case 'missing':
      return <span className="mt-1.5 block text-[11px] text-zinc-500 dark:text-zinc-400">{t('create.notDownloaded', { size })}</span>
    case 'queued':
      return <span className="mt-1.5 block text-[11px] text-zinc-500 dark:text-zinc-400">{t('create.queuedDownload', { size })}</span>
    case 'downloading':
      return <DownloadProgress model={model} receivedBytes={state.size_bytes} />
    case 'failed':
      return <span className="mt-1.5 block text-[11px] text-red-600 dark:text-red-400">{t('create.downloadFailed')}</span>
    default:
      return null
  }
}

type Downloadable = Pick<ModelInfo, 'id' | 'label' | 'download_gb'>

function DownloadProgress({ model, receivedBytes }: { model: Downloadable; receivedBytes: number }) {
  const total = gigabytes(model.download_gb)
  // Measured from the folder size, so it can briefly pass the estimate before the download completes
  const percent = Math.min(99, Math.round((receivedBytes / total) * 100))
  return (
    <span className="mt-2 block">
      <span className="flex items-center gap-1.5 text-[11px] font-medium text-violet-700 dark:text-violet-300">
        <Spinner className="size-3" /> {t('create.downloadingProgress', { received: formatGb(receivedBytes), total: model.download_gb })}
      </span>
      <span
        role="progressbar"
        aria-label={t('create.downloadProgressLabel', { model: model.label })}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="mt-1 block h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700"
      >
        <span className="block h-full rounded-full bg-violet-600 transition-all" style={{ width: `${percent}%` }} />
      </span>
    </span>
  )
}
