import { useCallback, useState } from 'react'
import { ApiError, CANCELLED_STATUS, cancelJob, fetchVideos, makeVideo } from '../../../../api'
import { errorMessage, useLoadable } from '../../../../lib/hooks'
import { newJobId } from '../../../../lib/jobId'
import type { Loadable, VideoItem } from '../../../../types'

export interface VideoRequestFields {
  prompt: string
  seconds: number
}

export type VideoRender =
  | { status: 'idle' }
  | { status: 'pending'; jobId: string; request: VideoRequestFields; startedAt: number; cancelling: boolean }
  | { status: 'failed'; error: string; request: VideoRequestFields }

export interface ImageVideos {
  videos: Loadable<VideoItem[]>
  reload: () => void
  render: VideoRender
  make: (request: VideoRequestFields) => void
  cancel: () => void
  dismiss: () => void
}

/**
 * The videos made from one image, and the one being made. A render keeps running on the server if the viewer moves
 * on; its video then shows the next time this image's videos load.
 */
export function useImageVideos(imageId: number | null, onMade: (video: VideoItem) => void): ImageVideos {
  // While the image itself is still loading there is nothing to ask for yet
  const load = useCallback((signal: AbortSignal) => (imageId === null ? Promise.resolve([]) : fetchVideos(imageId, signal)), [imageId])
  const [videos, reload] = useLoadable(load)
  const [render, setRender] = useState<VideoRender>({ status: 'idle' })

  const make = (request: VideoRequestFields) => {
    if (imageId === null) return
    const jobId = newJobId()
    setRender({ status: 'pending', jobId, request, startedAt: Date.now(), cancelling: false })
    makeVideo(imageId, request.prompt, request.seconds, jobId).then(
      (video) => {
        setRender({ status: 'idle' })
        reload()
        onMade(video)
      },
      (error: unknown) => {
        const cancelled = error instanceof ApiError && error.status === CANCELLED_STATUS
        setRender(cancelled ? { status: 'idle' } : { status: 'failed', error: errorMessage(error), request })
      },
    )
  }

  const cancel = () => {
    if (render.status !== 'pending') return
    setRender({ ...render, cancelling: true })
    void cancelJob(render.jobId)
  }

  return { videos, reload, render, make, cancel, dismiss: () => setRender({ status: 'idle' }) }
}
