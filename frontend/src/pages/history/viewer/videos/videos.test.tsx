import { act, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../../../../api'
import { ApiError } from '../../../../api'
import { deferred, video } from '../../../../test/fixtures'
import type { Loadable, VideoItem } from '../../../../types'
import { useImageVideos, type VideoRender } from './useImageVideos'
import { VideoStrip } from './VideoStrip'

vi.mock('../../../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../api')>()),
  fetchVideos: vi.fn(),
  makeVideo: vi.fn(),
  cancelJob: vi.fn(),
  fetchJobProgress: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(api.fetchVideos).mockReset().mockResolvedValue([])
  vi.mocked(api.makeVideo).mockReset()
  vi.mocked(api.cancelJob).mockReset().mockResolvedValue()
  vi.mocked(api.fetchJobProgress).mockReset().mockResolvedValue({ phase: 'loading', step: 0, total: 1 })
})

function strip(videos: Loadable<VideoItem[]>, rendering: VideoRender = { status: 'idle' }) {
  const handlers = { reload: vi.fn(), cancel: vi.fn(), make: vi.fn(), dismiss: vi.fn(), onPlay: vi.fn() }
  const view = render(<VideoStrip videos={videos} render={rendering} playingId={null} {...handlers} />)
  return { ...handlers, view }
}

describe('VideoStrip', () => {
  it('shows placeholders while the videos load, not an empty list', () => {
    strip({ status: 'pending' })
    expect(screen.getByText('Loading videos')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows an error with a retry when the videos fail to load', async () => {
    const { reload } = strip({ status: 'failed', error: 'Server down' })
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(reload).toHaveBeenCalledOnce()
  })

  it('shows nothing when the image has no videos and none is being made', () => {
    const { view } = strip({ status: 'settled', value: [] })
    expect(view.container).toBeEmptyDOMElement()
  })

  it('lists the videos newest first, each playable, with a sensitive one blurred', async () => {
    const { onPlay } = strip({ status: 'settled', value: [video({ id: 2, seconds: 4 }), video({ id: 1, sensitive: true })] })
    expect(screen.getByRole('heading')).toHaveTextContent('Videos 2')
    await userEvent.click(screen.getByRole('button', { name: 'Play the 4 s video' }))
    expect(onPlay).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 2 }))
    expect(screen.getByText('Sensitive')).toBeInTheDocument()
  })

  it('shows the video being made with its phase and a cancel', async () => {
    const request = { prompt: 'waves', seconds: 2 }
    const { cancel } = strip({ status: 'settled', value: [] }, { status: 'pending', jobId: 'job', request, startedAt: Date.now(), cancelling: false })
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for the previous render')
    // Its phase comes from polling the job, once a second
    expect(await screen.findByText(/Loading the video model/, undefined, { timeout: 3000 })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(cancel).toHaveBeenCalledOnce()
  })
})

describe('useImageVideos', () => {
  it('asks for nothing while the image is still loading', () => {
    renderHook(() => useImageVideos(null, vi.fn()))
    expect(api.fetchVideos).not.toHaveBeenCalled()
  })

  it('makes a video once, then plays it and reloads the list', async () => {
    const pending = deferred<VideoItem>()
    vi.mocked(api.makeVideo).mockReturnValue(pending.promise)
    const onMade = vi.fn()
    const { result } = renderHook(() => useImageVideos(3, onMade))

    act(() => result.current.make({ prompt: 'waves', seconds: 2 }))
    expect(result.current.render.status).toBe('pending')
    expect(onMade).not.toHaveBeenCalled()

    await act(async () => pending.resolve(video({ id: 8, image_id: 3 })))
    expect(onMade).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 8 }))
    expect(result.current.render.status).toBe('idle')
    expect(api.fetchVideos).toHaveBeenCalledTimes(2)
  })

  it('goes back to idle when cancelled, and keeps the request when it fails so it can be retried', async () => {
    vi.mocked(api.makeVideo).mockRejectedValueOnce(new ApiError('Cancelled', 409)).mockRejectedValueOnce(new ApiError('Out of memory', 500))
    const { result } = renderHook(() => useImageVideos(3, vi.fn()))

    await act(async () => result.current.make({ prompt: 'waves', seconds: 2 }))
    expect(result.current.render.status).toBe('idle')
    await act(async () => result.current.make({ prompt: 'wind', seconds: 4 }))
    expect(result.current.render).toEqual({ status: 'failed', error: 'Out of memory', request: { prompt: 'wind', seconds: 4 } })
  })

  it('stops a running video through its job', () => {
    vi.mocked(api.makeVideo).mockReturnValue(deferred<VideoItem>().promise)
    const { result } = renderHook(() => useImageVideos(3, vi.fn()))
    act(() => result.current.make({ prompt: 'waves', seconds: 2 }))
    act(() => result.current.cancel())
    expect(api.cancelJob).toHaveBeenCalledOnce()
    expect(result.current.render).toMatchObject({ status: 'pending', cancelling: true })
  })
})
