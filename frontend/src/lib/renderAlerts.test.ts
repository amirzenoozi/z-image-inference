import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { catalog, historyItem } from '../test/fixtures'
import { initialSettings } from './settings'
import type { GenerationState } from '../types'
import { APP_TITLE, askToNotify, useRenderAlerts } from './renderAlerts'

class FakeNotification {
  static permission: NotificationPermission = 'granted'
  static requestPermission = vi.fn(async () => FakeNotification.permission)
  static shown: { title: string; body: string }[] = []
  onclick: (() => void) | null = null
  constructor(title: string, options: { body: string }) {
    FakeNotification.shown.push({ title, body: options.body })
  }
  close(): void {}
}

let hidden = false
const pending: GenerationState = { status: 'pending', startedAt: 0, request: initialSettings(catalog), jobId: 'job-1', cancelling: false }
const settled: GenerationState = { status: 'settled', item: historyItem({ duration_seconds: 52.3 }) }
const failed: GenerationState = { status: 'failed', error: 'The model server is not running', request: initialSettings(catalog) }

function renderAlerts(state: GenerationState) {
  return renderHook(({ current }: { current: GenerationState }) => useRenderAlerts(current, catalog.models), { initialProps: { current: state } })
}

function setHidden(value: boolean) {
  hidden = value
  act(() => document.dispatchEvent(new Event('visibilitychange')))
}

beforeEach(() => {
  hidden = false
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  FakeNotification.permission = 'granted'
  FakeNotification.shown = []
  FakeNotification.requestPermission.mockClear()
  vi.stubGlobal('Notification', FakeNotification)
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.title = APP_TITLE
})

it('shows a running render in the tab title', () => {
  const { rerender } = renderAlerts({ status: 'idle' })
  expect(document.title).toBe(APP_TITLE)
  rerender({ current: pending })
  expect(document.title).toBe(`Generating… · ${APP_TITLE}`)
})

it('says once, in the title and a notification, that an image is ready while the tab is hidden', () => {
  const { rerender } = renderAlerts(pending)
  setHidden(true)
  rerender({ current: settled })

  expect(document.title).toBe(`✓ Image ready · ${APP_TITLE}`)
  expect(FakeNotification.shown).toEqual([{ title: 'Image ready', body: 'Z-Image-Turbo · 52s' }])

  rerender({ current: { ...settled } })
  expect(FakeNotification.shown).toHaveLength(1)

  setHidden(false)
  expect(document.title).toBe(APP_TITLE)
})

it('reports a failure the same way', () => {
  const { rerender } = renderAlerts(pending)
  setHidden(true)
  rerender({ current: failed })
  expect(document.title).toBe(`✕ Generation failed · ${APP_TITLE}`)
  expect(FakeNotification.shown).toEqual([{ title: 'Generation failed', body: 'The model server is not running' }])
})

it('stays quiet while the tab is watched, and when a render is cancelled', () => {
  const { rerender } = renderAlerts(pending)
  rerender({ current: settled })
  expect(document.title).toBe(APP_TITLE)

  rerender({ current: pending })
  setHidden(true)
  rerender({ current: { status: 'idle' } })
  expect(document.title).toBe(APP_TITLE)
  expect(FakeNotification.shown).toEqual([])
})

it('still changes the title when notifications are declined', () => {
  FakeNotification.permission = 'denied'
  const { rerender } = renderAlerts(pending)
  setHidden(true)
  rerender({ current: settled })
  expect(document.title).toBe(`✓ Image ready · ${APP_TITLE}`)
  expect(FakeNotification.shown).toEqual([])
})

it('asks for permission only while the browser has not been told yet', () => {
  FakeNotification.permission = 'default'
  askToNotify()
  FakeNotification.permission = 'denied'
  askToNotify()
  expect(FakeNotification.requestPermission).toHaveBeenCalledOnce()
})
