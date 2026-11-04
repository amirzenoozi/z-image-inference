import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi, type Mock } from 'vitest'
import { catalog, deferred, fastModel, historyItem, weightSlider } from '../test/fixtures'
import { initialSettings } from '../lib/settings'
import type { AbTest } from '../lib/abTest'
import type { GenerationSettings, HistoryItem, SentSettings } from '../types'
import { useAbTest } from './useAbTest'

const model = { ...fastModel, addons: [...fastModel.addons, weightSlider] }
const settings = { ...initialSettings(catalog), prompt: 'a woman', seed: 5, randomSeed: false }
const weight: AbTest = { settings: [{ kind: 'slider', addonId: 'weight' }], versions: [[-4], [2], [6]] }

type Generate = (settings: GenerationSettings, testSet: SentSettings['testSet']) => Promise<HistoryItem | null>

function renderTest(generate: Mock<Generate>) {
  return renderHook(() => useAbTest({ settings, setSettings: vi.fn(), model, modes: [], maxSeed: 100, generate }))
}

beforeEach(() => localStorage.clear())

it('makes each image in turn under one set id, showing which one while it renders, then opens them to compare', async () => {
  const pending = [deferred<HistoryItem | null>(), deferred<HistoryItem | null>(), deferred<HistoryItem | null>()]
  const generate = vi.fn<Generate>().mockImplementation(() => pending[generate.mock.calls.length - 1].promise)
  const { result } = renderTest(generate)
  act(() => result.current.controls.start(weight))
  let run: Promise<void> = Promise.resolve()
  act(() => {
    run = result.current.run()
  })
  expect(result.current.controls.progress).toEqual({ index: 1, total: 3 })
  expect(generate).toHaveBeenCalledTimes(1)
  for (const [index, each] of pending.entries()) {
    await act(async () => each.resolve(historyItem({ id: index + 1 })))
  }
  await act(() => run)
  const sets = generate.mock.calls.map(([, testSet]) => testSet)
  expect(sets.map((testSet) => testSet?.label)).toEqual(['Weight -4', 'Weight 2', 'Weight 6'])
  expect(new Set(sets.map((testSet) => testSet?.id)).size).toBe(1)
  expect(result.current.controls.progress).toBeNull()
  expect(result.current.results?.map((item) => item.id)).toEqual([1, 2, 3])
})

it('stops at the first image that fails or is cancelled, and compares what was made', async () => {
  const generate = vi.fn<Generate>().mockResolvedValueOnce(historyItem({ id: 1 })).mockResolvedValueOnce(historyItem({ id: 2 })).mockResolvedValueOnce(null)
  const { result } = renderTest(generate)
  act(() => result.current.controls.start({ ...weight, versions: [[-4], [2], [6], [8]] }))
  await act(() => result.current.run())
  expect(generate).toHaveBeenCalledTimes(3)
  expect(result.current.results?.map((item) => item.id)).toEqual([1, 2])
})

it('leaves a test, and Undo brings it back', () => {
  const { result } = renderTest(vi.fn<Generate>())
  act(() => result.current.controls.start(weight))
  act(() => result.current.controls.leave())
  expect([result.current.controls.test, result.current.controls.left]).toEqual([null, weight])
  act(() => result.current.controls.undoLeave())
  expect([result.current.controls.test, result.current.controls.left]).toEqual([weight, null])
})
