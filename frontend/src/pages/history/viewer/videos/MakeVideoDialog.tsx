import { useState } from 'react'
import { t } from '../../../../i18n'
import { useModelStatus } from '../../../../lib/modelStatus'
import { secondaryButtonClass, tabClass } from '../../../../lib/styles'
import { Textarea } from '../../../../shared/form/Textarea'
import { DownloadActions } from '../../../../shared/models/DownloadActions'
import { DownloadBadge } from '../../../../shared/models/DownloadBadge'
import { Modal } from '../../../../shared/ui/Modal'
import type { Loadable, ModelStatusReport, VideoModelInfo } from '../../../../types'
import type { VideoRequestFields } from './useImageVideos'

interface Props {
  video: VideoModelInfo
  onMake: (request: VideoRequestFields) => void
  onClose: () => void
}

/** What to animate and for how long; the video model is downloaded here the first time. */
export function MakeVideoDialog({ video, onMake, onClose }: Props) {
  const [prompt, setPrompt] = useState(() => t('history.videoDefaultPrompt'))
  const [seconds, setSeconds] = useState(video.lengths[0])
  const [status, refresh] = useModelStatus(null)
  const ready = status.status === 'settled' && status.value.models[video.id]?.status === 'ready'
  const make = () => {
    onMake({ prompt: prompt.trim(), seconds })
    onClose()
  }
  return (
    <Modal
      title={t('history.makeVideo')}
      onClose={onClose}
      actions={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            {t('common.cancel')}
          </button>
          <button type="button" onClick={make} disabled={!ready || !prompt.trim()} className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50">
            {t('history.generateVideo')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">{t('history.videoPrompt')}</span>
          <Textarea value={prompt} rows={3} onChange={(event) => setPrompt(event.target.value)} />
        </label>
        <fieldset>
          <legend className="mb-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">{t('history.videoLength')}</legend>
          <div role="radiogroup" className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1 text-sm dark:bg-zinc-800/70">
            {video.lengths.map((length) => (
              <button key={length} type="button" role="radio" aria-checked={seconds === length} onClick={() => setSeconds(length)} className={`rounded-lg py-1.5 font-medium ${tabClass(seconds === length)}`}>
                {t('history.videoSeconds', { seconds: length })}
              </button>
            ))}
          </div>
        </fieldset>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{t('history.videoHowLong')}</p>
        <VideoModelState video={video} status={status} onChanged={refresh} />
      </div>
    </Modal>
  )
}

/** Shown until the video model is downloaded: its download, with progress, or a placeholder while the status loads. */
function VideoModelState({ video, status, onChanged }: { video: VideoModelInfo; status: Loadable<ModelStatusReport>; onChanged: () => void }) {
  const state = status.status === 'settled' ? status.value.models[video.id] : undefined
  if (state?.status === 'ready') return null
  return (
    <div className="space-y-2 rounded-xl border border-zinc-200 p-3 text-xs dark:border-zinc-800">
      <p className="font-medium text-zinc-800 dark:text-zinc-100">{t('history.videoModelNeeded', { model: video.label })}</p>
      <DownloadBadge model={video} status={status} />
      {state && (
        <DownloadActions
          item={{ ...video, kept_gb: video.download_gb }}
          state={{ status: state.status, sizeBytes: state.size_bytes }}
          inUse={false}
          freeBytes={status.status === 'settled' ? status.value.free_bytes : null}
          onChanged={onChanged}
        />
      )}
    </div>
  )
}
