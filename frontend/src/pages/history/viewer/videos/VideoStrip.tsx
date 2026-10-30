import { useEffect, useState } from 'react'
import { videoPosterUrl } from '../../../../api'
import { t, tn, type MessageKey } from '../../../../i18n'
import { useJobProgress } from '../../../../lib/jobProgress'
import { secondaryButtonClass } from '../../../../lib/styles'
import { SensitiveImage } from '../../../../shared/images/SensitiveImage'
import { ErrorNotice, Spinner } from '../../../../shared/ui/ui'
import type { JobPhase, VideoItem } from '../../../../types'
import { Play } from 'lucide-react'
import type { ImageVideos } from './useImageVideos'

interface Props extends Pick<ImageVideos, 'videos' | 'reload' | 'render' | 'cancel' | 'make' | 'dismiss'> {
  playingId: number | null
  onPlay: (video: VideoItem) => void
}

/** The image's videos as poster tiles, newest first, with the one being made in front. */
export function VideoStrip({ videos, reload, render, cancel, make, dismiss, playingId, onPlay }: Props) {
  if (videos.status === 'failed') return <ErrorNotice message={videos.error} onRetry={reload} />
  const listed = videos.status === 'settled' ? videos.value : []
  if (videos.status === 'settled' && listed.length === 0 && render.status === 'idle') return null
  return (
    <section aria-label={t('history.videos')} className="space-y-2">
      <h3 className="text-xs font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400">
        {t('history.videos')} {videos.status === 'settled' && <span className="tabular-nums">{listed.length}</span>}
      </h3>
      {render.status === 'failed' && (
        <div className="space-y-2">
          <ErrorNotice message={render.error} onRetry={() => make(render.request)} />
          <button type="button" onClick={dismiss} className={`${secondaryButtonClass} text-xs`}>{t('create.dismiss')}</button>
        </div>
      )}
      <ul className="grid grid-cols-3 gap-2">
        {render.status === 'pending' && <RenderingTile jobId={render.jobId} startedAt={render.startedAt} seconds={render.request.seconds} cancelling={render.cancelling} onCancel={cancel} />}
        {videos.status === 'pending' && <LoadingTiles />}
        {listed.map((video) => (
          <li key={video.id}>
            <button
              type="button"
              aria-label={t('history.playVideo', { seconds: video.seconds })}
              aria-pressed={video.id === playingId}
              onClick={() => onPlay(video)}
              className={`relative block aspect-square w-full overflow-hidden rounded-lg ${video.id === playingId ? 'ring-2 ring-violet-600' : ''}`}
            >
              <SensitiveImage src={videoPosterUrl(video.id, true)} sensitive={video.sensitive} compact className="size-full" />
              <span className="absolute right-1 bottom-1 flex items-center gap-0.5 rounded bg-black/60 px-1 text-[10px] text-white tabular-nums">
                <Play className="size-2.5 fill-current" /> {t('history.videoSeconds', { seconds: video.seconds })}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function LoadingTiles() {
  return (
    <>
      {[0, 1, 2].map((tile) => (
        <li key={tile} aria-hidden="true" className="aspect-square animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
      ))}
      <li className="sr-only">{t('history.loadingVideos')}</li>
    </>
  )
}

const PHASE_TEXT: Record<JobPhase, MessageKey> = {
  waiting: 'history.videoPhaseWaiting',
  loading: 'history.videoPhaseLoading',
  encoding: 'history.videoPhaseGenerating',
  generating: 'history.videoPhaseGenerating',
  finishing: 'history.videoPhaseFinishing',
}

function useElapsedSeconds(startedAt: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return Math.max(0, Math.round((now - startedAt) / 1000))
}

interface RenderingTileProps {
  jobId: string
  startedAt: number
  seconds: number
  cancelling: boolean
  onCancel: () => void
}

/** The clip being made: where it is (the engine reports phases, not steps) and how long it has taken so far. */
function RenderingTile({ jobId, startedAt, seconds, cancelling, onCancel }: RenderingTileProps) {
  const progress = useJobProgress(jobId)
  const elapsed = useElapsedSeconds(startedAt)
  return (
    <li role="status" aria-busy="true" className="col-span-3 flex items-center gap-3 rounded-lg border border-violet-300 bg-violet-50 p-3 text-xs text-violet-900 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-100">
      <Spinner className="size-4 shrink-0" />
      <span className="flex-1">
        {t(PHASE_TEXT[progress?.phase ?? 'waiting'])} · {tn('history.videoElapsed', elapsed)}
        <span className="block text-violet-700/80 dark:text-violet-300/80">{t('history.videoMaking', { seconds })}</span>
      </span>
      <button type="button" onClick={onCancel} disabled={cancelling} className={`${secondaryButtonClass} text-xs`}>
        {cancelling ? t('history.videoCancelling') : t('common.cancel')}
      </button>
    </li>
  )
}
