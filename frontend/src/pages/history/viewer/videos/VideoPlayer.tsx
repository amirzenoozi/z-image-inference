import { useState } from 'react'
import { deleteVideo, videoDownloadUrl, videoPosterUrl, videoUrl } from '../../../../api'
import { t } from '../../../../i18n'
import { errorMessage } from '../../../../lib/hooks'
import { IconButton, IconLink } from '../../../../shared/ui/IconButton'
import type { VideoItem } from '../../../../types'
import { ArrowLeft, Download, Trash2 } from 'lucide-react'

const overlayClass = 'flex size-9 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/75 disabled:opacity-40'

interface Props {
  video: VideoItem
  onBack: () => void
  onDeleted: () => void
}

/** Plays a clip where the image was, looping, with the way back to the image, a download and a delete. */
export function VideoPlayer({ video, onBack, onDeleted }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const remove = async () => {
    try {
      await deleteVideo(video.id)
      onDeleted()
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }
  return (
    <>
      <video
        key={video.id}
        src={videoUrl(video.id)}
        poster={videoPosterUrl(video.id)}
        aria-label={t('history.videoOf', { prompt: video.prompt })}
        controls
        autoPlay
        loop
        playsInline
        className="max-h-full max-w-full"
      />
      <div className="absolute top-3 left-3 flex gap-2">
        <IconButton label={t('history.backToImage')} onClick={onBack} className={overlayClass}>
          <ArrowLeft />
        </IconButton>
      </div>
      <div className="absolute top-3 right-3 flex items-center gap-2">
        {error && <span role="alert" className="rounded-full bg-red-600 px-2.5 py-1 text-xs text-white">{error}</span>}
        <IconLink label={t('history.downloadVideo')} href={videoDownloadUrl(video.id)} download className={overlayClass}>
          <Download />
        </IconLink>
        {confirming ? (
          <button type="button" onClick={() => void remove()} className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 pointer-coarse:min-h-11">
            {t('history.deleteVideoConfirm')}
          </button>
        ) : (
          <IconButton label={t('history.deleteVideo')} onClick={() => setConfirming(true)} className={overlayClass}>
            <Trash2 />
          </IconButton>
        )}
      </div>
    </>
  )
}
