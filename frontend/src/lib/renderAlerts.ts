import { useEffect, useRef } from 'react'
import type { GenerationState, ModelInfo } from '../types'
import { formatDuration } from './hooks'

export const APP_TITLE = 'Z-Image Studio'

function notificationsSupported(): boolean {
  return typeof Notification !== 'undefined'
}

/** Browsers only allow asking right after a click, so this is called when Generate is pressed. */
export function askToNotify(): void {
  if (notificationsSupported() && Notification.permission === 'default') void Notification.requestPermission()
}

function notify(title: string, body: string): void {
  if (!notificationsSupported() || Notification.permission !== 'granted') return
  const notification = new Notification(title, { body })
  notification.onclick = () => {
    window.focus()
    notification.close()
  }
}

/** A cancelled render goes back to idle: the title just returns to normal. */
function announceEnd(state: GenerationState, models: ModelInfo[]): void {
  if (state.status === 'settled') {
    const model = models.find((candidate) => candidate.id === state.item.model)?.label ?? state.item.model
    const time = state.item.duration_seconds === null ? '' : ` · ${formatDuration(Math.round(state.item.duration_seconds))}`
    document.title = `✓ Image ready · ${APP_TITLE}`
    notify('Image ready', `${model}${time}`)
  } else if (state.status === 'failed') {
    document.title = `✕ Generation failed · ${APP_TITLE}`
    notify('Generation failed', state.error)
  } else {
    document.title = APP_TITLE
  }
}

/**
 * Shows a running render in the tab title, and when one ends while the tab is hidden, says so in the title and
 * a notification until the tab is visible again. A cancelled render goes back to idle, so it never alerts.
 */
export function useRenderAlerts(state: GenerationState, models: ModelInfo[]): void {
  const previous = useRef(state.status)

  useEffect(() => {
    const wasPending = previous.current === 'pending'
    previous.current = state.status
    if (state.status === 'pending') document.title = `Generating… · ${APP_TITLE}`
    else if (wasPending && document.hidden) announceEnd(state, models)
    else document.title = APP_TITLE
  }, [state, models])

  useEffect(() => {
    const resetWhenSeen = () => {
      if (!document.hidden && previous.current !== 'pending') document.title = APP_TITLE
    }
    document.addEventListener('visibilitychange', resetWhenSeen)
    return () => document.removeEventListener('visibilitychange', resetWhenSeen)
  }, [])
}
