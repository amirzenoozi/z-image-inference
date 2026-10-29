import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as api from '../api'
import { catalog, deferred, historyItem } from '../test/fixtures'
import type { HistoryItem } from '../types'
import { initialSettings } from './settings'
import { useGeneration } from './generation'

vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api')>()), generateImage: vi.fn() }))

// The server's JOB_ID_PATTERN (generation_request.py)
const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

beforeEach(() => vi.mocked(api.generateImage).mockReset())
afterEach(() => vi.unstubAllGlobals())

it('renders on a page that is not secure, where crypto.randomUUID does not exist, with an id the server accepts', async () => {
  const real = globalThis.crypto
  vi.stubGlobal('crypto', { getRandomValues: <T extends ArrayBufferView<ArrayBuffer>>(bytes: T) => real.getRandomValues(bytes) })
  const pending = deferred<HistoryItem>()
  vi.mocked(api.generateImage).mockReturnValue(pending.promise)
  const { result } = renderHook(() => useGeneration(vi.fn()))

  act(() => void result.current.run({ ...initialSettings(catalog), prompt: 'a fox' }))

  expect(result.current.state.status).toBe('pending')
  const jobId = vi.mocked(api.generateImage).mock.calls[0][1]
  expect(jobId).toMatch(JOB_ID)
  await act(async () => pending.resolve(historyItem()))
  expect(result.current.state.status).toBe('settled')
})

it('uses crypto.randomUUID where the page has it', async () => {
  const pending = deferred<HistoryItem>()
  vi.mocked(api.generateImage).mockReturnValue(pending.promise)
  const randomUUID = vi.spyOn(globalThis.crypto, 'randomUUID')
  const { result } = renderHook(() => useGeneration(vi.fn()))
  act(() => void result.current.run({ ...initialSettings(catalog), prompt: 'a fox' }))
  expect(vi.mocked(api.generateImage).mock.calls[0][1]).toMatch(JOB_ID)
  expect(randomUUID).toHaveBeenCalledOnce()
  await act(async () => pending.resolve(historyItem()))
})
