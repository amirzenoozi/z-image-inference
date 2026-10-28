import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as api from '../../api'
import { PROGRESS_POLL_MS } from '../../lib/jobProgress'
import { initialSettings } from '../../lib/settings'
import { catalog, deferred, historyItem } from '../../test/fixtures'
import type { GenerationState, JobProgress } from '../../types'
import { ResultPanel } from './ResultPanel'

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  fetchJobProgress: vi.fn(),
}))

function renderResult(state: GenerationState) {
  const handlers = { onRetry: vi.fn(), onCancel: vi.fn(), onUseSeed: vi.fn() }
  const view = render(<ResultPanel state={state} models={catalog.models} {...handlers} />)
  return { ...handlers, rerender: (next: GenerationState) => view.rerender(<ResultPanel state={next} models={catalog.models} {...handlers} />) }
}

function pending(overrides: Partial<Extract<GenerationState, { status: 'pending' }>> = {}): GenerationState {
  return { status: 'pending', startedAt: Date.now(), request: initialSettings(catalog), jobId: 'job-1', cancelling: false, ...overrides }
}

beforeEach(() => {
  vi.mocked(api.fetchJobProgress).mockReset()
})
afterEach(() => vi.useRealTimers())

it('shows the empty state before anything is generated', () => {
  renderResult({ status: 'idle' })
  expect(screen.getByText('Your image will appear here.')).toBeInTheDocument()
})

it('shows a placeholder and a running timer while waiting, never the empty state', () => {
  vi.useFakeTimers()
  vi.mocked(api.fetchJobProgress).mockReturnValue(new Promise(() => {}))
  const request = { ...initialSettings(catalog), width: 512, height: 512 }
  renderResult(pending({ request }))

  expect(screen.getByRole('status')).toHaveTextContent('Generating 512×512 with Z-Image-Turbo · 0s')
  expect(screen.queryByText('Your image will appear here.')).not.toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()

  act(() => vi.advanceTimersByTime(65_000))
  expect(screen.getByRole('status')).toHaveTextContent('1m 05s')
})

it('shows the error with a retry', async () => {
  const { onRetry } = renderResult({ status: 'failed', error: 'The model server is not running', request: initialSettings(catalog) })
  expect(screen.getByRole('alert')).toHaveTextContent('The model server is not running')
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(onRetry).toHaveBeenCalledOnce()
})

it('shows the image with its settings and actions', async () => {
  const { onUseSeed } = renderResult({ status: 'settled', item: historyItem({ id: 7, seed: 42 }) })
  expect(screen.getByRole('img')).toHaveAttribute('src', '/api/history/7/image')
  expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute('download', 'z-image-7-42.png')
  expect(screen.getByText('seed 42')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Use this seed' }))
  expect(onUseSeed).toHaveBeenCalledWith(42)
})

it('shows only the elapsed time until the first progress arrives, then the step and bar', async () => {
  vi.useFakeTimers()
  const progress = deferred<JobProgress>()
  vi.mocked(api.fetchJobProgress).mockReturnValue(progress.promise)
  renderResult(pending())

  await act(() => vi.advanceTimersByTimeAsync(PROGRESS_POLL_MS))
  expect(api.fetchJobProgress).toHaveBeenCalledWith('job-1', expect.any(AbortSignal))
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  expect(screen.queryByText(/Step/)).not.toBeInTheDocument()

  await act(async () => progress.resolve({ phase: 'generating', step: 3, total: 9 }))
  expect(screen.getByText('Step 3 of 9')).toBeInTheDocument()
  expect(screen.getByRole('progressbar', { name: 'Steps done' })).toHaveAttribute('aria-valuenow', '3')
})

it('names the phase before the steps start', async () => {
  vi.useFakeTimers()
  vi.mocked(api.fetchJobProgress).mockResolvedValue({ phase: 'loading', step: 0, total: 9 })
  renderResult(pending())

  await act(() => vi.advanceTimersByTimeAsync(PROGRESS_POLL_MS))
  expect(screen.getByText('Loading the model')).toBeInTheDocument()
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
})

it('falls back to the elapsed time, without an error, when a progress check fails', async () => {
  vi.useFakeTimers()
  vi.mocked(api.fetchJobProgress).mockResolvedValueOnce({ phase: 'generating', step: 2, total: 9 }).mockRejectedValue(new Error('down'))
  renderResult(pending())

  await act(() => vi.advanceTimersByTimeAsync(PROGRESS_POLL_MS))
  expect(screen.getByText('Step 2 of 9')).toBeInTheDocument()
  await act(() => vi.advanceTimersByTimeAsync(PROGRESS_POLL_MS))
  expect(screen.queryByText(/Step/)).not.toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Generating')
})

it('stops checking progress once the image arrives', async () => {
  vi.useFakeTimers()
  vi.mocked(api.fetchJobProgress).mockResolvedValue({ phase: 'generating', step: 1, total: 9 })
  const { rerender } = renderResult(pending())
  await act(() => vi.advanceTimersByTimeAsync(PROGRESS_POLL_MS))
  expect(api.fetchJobProgress).toHaveBeenCalledOnce()

  rerender({ status: 'settled', item: historyItem() })
  await act(() => vi.advanceTimersByTimeAsync(5 * PROGRESS_POLL_MS))
  expect(api.fetchJobProgress).toHaveBeenCalledOnce()
})

it('offers Cancel while generating, and shows that it is cancelling', async () => {
  vi.mocked(api.fetchJobProgress).mockReturnValue(new Promise(() => {}))
  const { onCancel, rerender } = renderResult(pending())

  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(onCancel).toHaveBeenCalledOnce()

  rerender(pending({ cancelling: true }))
  expect(screen.getByRole('button', { name: 'Cancelling…' })).toBeDisabled()
})

it('shows how long the image took, and nothing for images made before times were recorded', () => {
  const { rerender } = renderResult({ status: 'settled', item: historyItem({ duration_seconds: 52.3 }) })
  expect(screen.getByText('52s')).toBeInTheDocument()

  rerender({ status: 'settled', item: historyItem({ duration_seconds: null }) })
  expect(screen.queryByText(/^\d+s$/)).not.toBeInTheDocument()
})
