import { useState } from 'react'
import { downloadModel, removeModel } from '../../api'
import { t } from '../../i18n'
import { formatGb } from '../../lib/format'
import { errorMessage } from '../../lib/hooks'
import { secondaryButtonClass } from '../../lib/styles'
import { IconButton } from '../ui/IconButton'
import { Spinner } from '../ui/ui'
import type { ModelInfo, ModelStatus } from '../../types'
import { Check, X } from 'lucide-react'

type Pending = 'download' | 'remove' | null

/** A model or an add-on: what the download and remove buttons need to know about it. */
export type DownloadItem = Pick<ModelInfo, 'id' | 'label' | 'download_gb' | 'kept_gb'>

interface DownloadActionsProps {
  item: DownloadItem
  state: { status: ModelStatus; sizeBytes: number }
  /** The model in use can't be removed; it shows "In use" instead. */
  inUse: boolean
  freeBytes: number | null
  onChanged: () => void
}

/** Download (after confirming the sizes) or remove a model or an add-on. */
export function DownloadActions({ item, state, inUse, freeBytes, onChanged }: DownloadActionsProps) {
  const [confirming, setConfirming] = useState<Pending>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (action: () => Promise<unknown>) => {
    setWorking(true)
    setError(null)
    try {
      await action()
      setConfirming(null)
      onChanged()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setWorking(false)
    }
  }

  if (error) return <ActionError message={error} onDismiss={() => setError(null)} />
  if (working) return <span className="flex items-center gap-1.5 text-[11px] text-zinc-500"><Spinner className="size-3" /> {t('create.working')}</span>
  if (confirming === 'download') {
    const free = freeBytes === null ? '' : t('create.freeSuffix', { free: formatGb(freeBytes) })
    return <Confirm text={t('create.confirmDownload', { download: item.download_gb, kept: item.kept_gb, free })} action={t('create.download')} onCancel={() => setConfirming(null)} onConfirm={() => void run(() => downloadModel(item.id))} />
  }
  if (confirming === 'remove') {
    return <Confirm text={t('create.confirmRemove', { size: formatGb(state.sizeBytes), download: item.download_gb })} action={t('common.remove')} danger onCancel={() => setConfirming(null)} onConfirm={() => void run(() => removeModel(item.id))} />
  }
  return <ActionButton item={item} state={state} inUse={inUse} onDownload={() => setConfirming('download')} onRemove={() => setConfirming('remove')} />
}

interface ActionButtonProps {
  item: DownloadItem
  state: { status: ModelStatus; sizeBytes: number }
  inUse: boolean
  onDownload: () => void
  onRemove: () => void
}

function ActionButton({ item, state, inUse, onDownload, onRemove }: ActionButtonProps) {
  const small = `${secondaryButtonClass} px-2 py-1 text-[11px]`
  if (state.status === 'missing' || state.status === 'failed') {
    return (
      <button type="button" onClick={onDownload} aria-label={t('create.downloadModel', { model: item.label })} className={`${small} border-violet-400 text-violet-700 dark:border-violet-700 dark:text-violet-300`}>
        {t('create.downloadButton')}
      </button>
    )
  }
  if (state.status !== 'ready') return <span />
  if (inUse) return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-700 dark:text-violet-300"><Check className="size-3.5" /> {t('create.inUse')}</span>
  return (
    <button type="button" onClick={onRemove} aria-label={t('create.removeModel', { model: item.label })} className={`${small} text-zinc-500`}>
      {t('create.removeWithSize', { size: formatGb(state.sizeBytes) })}
    </button>
  )
}

interface ConfirmProps {
  text: string
  action: string
  danger?: boolean
  onCancel: () => void
  onConfirm: () => void
}

function Confirm({ text, action, danger = false, onCancel, onConfirm }: ConfirmProps) {
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-300">
      <span>{text}</span>
      <button type="button" onClick={onCancel} className={`${secondaryButtonClass} px-2 py-0.5 text-[11px]`}>
        {t('common.cancel')}
      </button>
      <button
        type="button"
        onClick={onConfirm}
        className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold text-white pointer-coarse:min-h-10 pointer-coarse:px-3 ${danger ? 'bg-red-600 hover:bg-red-500' : 'bg-violet-600 hover:bg-violet-500'}`}
      >
        {action}
      </button>
    </span>
  )
}

function ActionError({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <span role="alert" className="flex items-center gap-1.5 text-[11px] text-red-600 dark:text-red-400">
      {message}
      <IconButton label={t('create.dismiss')} onClick={onDismiss} className="inline-flex items-center">
        <X className="size-3.5" />
      </IconButton>
    </span>
  )
}
