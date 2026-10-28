import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as api from '../api'
import type { ModelStatusReport } from '../types'
import { STATUS_POLL_MS, useModelStatus } from './modelStatus'

vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api')>()), fetchModelStatus: vi.fn() }))

const fetchModelStatus = vi.mocked(api.fetchModelStatus)
const report = (status: 'ready' | 'downloading'): ModelStatusReport => ({ server_running: true, models: { 'moss-image-nsfw': status } })

beforeEach(() => {
  fetchModelStatus.mockReset()
  vi.useFakeTimers({ shouldAdvanceTime: true })
})
afterEach(() => vi.useRealTimers())

it('re-checks every 15 seconds while a download runs, and stops once it is done', async () => {
  fetchModelStatus.mockResolvedValueOnce(report('downloading')).mockResolvedValueOnce(report('ready'))
  const { result } = renderHook(() => useModelStatus('idle'))
  await waitFor(() => expect(result.current).toEqual({ status: 'settled', value: report('downloading') }))

  act(() => vi.advanceTimersByTime(STATUS_POLL_MS - 1000))
  expect(fetchModelStatus).toHaveBeenCalledOnce()

  await act(async () => vi.advanceTimersByTime(1000))
  await waitFor(() => expect(result.current).toEqual({ status: 'settled', value: report('ready') }))
  expect(fetchModelStatus).toHaveBeenCalledTimes(2)

  await act(async () => vi.advanceTimersByTime(STATUS_POLL_MS * 3))
  expect(fetchModelStatus).toHaveBeenCalledTimes(2)
})

it('stays pending until the first answer, and re-checks when the refresh key changes', async () => {
  let answer: (value: ModelStatusReport) => void = () => {}
  fetchModelStatus.mockReturnValueOnce(new Promise((resolve) => (answer = resolve))).mockResolvedValue(report('ready'))
  const { result, rerender } = renderHook(({ key }) => useModelStatus(key), { initialProps: { key: 'idle' } })

  expect(result.current).toEqual({ status: 'pending' })
  await act(async () => answer(report('ready')))
  expect(result.current.status).toBe('settled')

  rerender({ key: 'pending' })
  await waitFor(() => expect(fetchModelStatus).toHaveBeenCalledTimes(2))
})
