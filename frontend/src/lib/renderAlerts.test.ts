import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { catalog, historyItem } from '../test/fixtures'
import { initialSettings } from './settings'
import type { GenerationState } from '../types'
import { APP_ICON, APP_TITLE, askToNotify, useRenderAlerts } from './renderAlerts'

interface Shown {
  title: string
  body: string
  icon: string
  tag: string
}

class FakeNotification {
  static permission: NotificationPermission = 'granted'
  static requestPermission = vi.fn(async () => FakeNotification.permission)
  static shown: Shown[] = []
  static last: FakeNotification | null = null
  onclick: (() => void) | null = null
  closed = false
  constructor(title: string, options: { body: string; icon: string; tag: string }) {
    FakeNotification.shown.push({ title, body: options.body, icon: options.icon, tag: options.tag })
    FakeNotification.last = this
  }
  close(): void {
    this.closed = true
  }
}

let hidden = false
const pending: GenerationState = { status: 'pending', startedAt: 0, request: initialSettings(catalog), jobId: 'job-1', cancelling: false }
const settled: GenerationState = { status: 'settled', item: historyItem({ id: 7, prompt: 'a red fox in the snow', duration_seconds: 52.3 }) }
const failed: GenerationState = { status: 'failed', error: 'The model server is not running', request: initialSettings(catalog) }

const onOpen = vi.fn()
const characterName = (id: number) => (id === 3 ? 'Ava' : null)

function renderAlerts(state: GenerationState) {
  return renderHook(({ current }: { current: GenerationState }) => useRenderAlerts(current, { models: catalog.models, characterName, onOpen }), {
    initialProps: { current: state },
  })
}

function finishHidden(end: GenerationState) {
  const { rerender } = renderAlerts(pending)
  setHidden(true)
  rerender({ current: end })
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
  FakeNotification.last = null
  FakeNotification.requestPermission.mockClear()
  onOpen.mockClear()
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
  expect(FakeNotification.shown).toEqual([
    { title: 'Your image is ready', body: 'Z-Image-Turbo · 52s · “a red fox in the snow”', icon: '/api/history/7/image?thumb=true', tag: 'z-image-render' },
  ])

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
  expect(FakeNotification.shown).toEqual([
    { title: "Couldn't make your image", body: `The model server is not running. Open ${APP_TITLE} to try again.`, icon: APP_ICON, tag: 'z-image-render' },
  ])
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

it('names the character, shortens the model name and trims a long prompt', () => {
  const prompt = 'A photograph of an adult man in his 40s with a grey beard, squatting on a sunny balcony at dawn, orange sweater'
  finishHidden({ status: 'settled', item: historyItem({ id: 9, model: 'wai-illustrious', character_id: 3, prompt, duration_seconds: 75 }) })

  const [shown] = FakeNotification.shown
  expect(shown.title).toBe("Ava's image is ready")
  expect(shown.body).toBe('WAI-Illustrious · 1m 15s · “A photograph of an adult man in his 40s with a grey beard, squatting…”')
})

it('shows the app icon and no prompt for a sensitive image', () => {
  finishHidden({ status: 'settled', item: historyItem({ prompt: 'a nude woman', sensitive: true, duration_seconds: 40 }) })
  expect(FakeNotification.shown).toEqual([{ title: 'Your image is ready', body: 'Z-Image-Turbo · 40s', icon: APP_ICON, tag: 'z-image-render' }])
})

it('opens the result when the notification is clicked', () => {
  const focus = vi.spyOn(window, 'focus').mockImplementation(() => {})
  finishHidden(settled)

  FakeNotification.last?.onclick?.()
  expect(focus).toHaveBeenCalledOnce()
  expect(onOpen).toHaveBeenCalledOnce()
  expect(FakeNotification.last?.closed).toBe(true)
})

it('uses one tag, so a newer notification replaces the last one', () => {
  const { rerender } = renderAlerts(pending)
  setHidden(true)
  rerender({ current: settled })
  rerender({ current: pending })
  rerender({ current: failed })
  expect(new Set(FakeNotification.shown.map((shown) => shown.tag))).toEqual(new Set(['z-image-render']))
})
