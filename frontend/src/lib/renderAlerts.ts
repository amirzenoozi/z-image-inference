import { useEffect, useRef } from 'react'
import { imageUrl } from '../api'
import type { GenerationState, HistoryItem, ModelInfo } from '../types'
import { formatDuration } from './hooks'
import { t } from '../i18n'

export const APP_TITLE = 'Z-Image Studio'
/** The app's icon as a PNG, since notifications can't show SVG; public/app-icon.svg is its source. */
export const APP_ICON = '/app-icon.png'
// A newer notification replaces the last one instead of stacking up
const NOTIFICATION_TAG = 'z-image-render'
const PROMPT_EXCERPT_LENGTH = 70

export interface RenderAlertContext {
  models: ModelInfo[]
  /** The character's name for an image made for one, or null. */
  characterName: (id: number) => string | null
  /** Clicking a notification opens the result: the app's Create view. */
  onOpen: () => void
}

interface NotificationContent {
  title: string
  body: string
  icon: string
}

function notificationsSupported(): boolean {
  return typeof Notification !== 'undefined'
}

/** Browsers only allow asking right after a click, so this is called when Generate is pressed. */
export function askToNotify(): void {
  if (notificationsSupported() && Notification.permission === 'default') void Notification.requestPermission()
}

function notify(content: NotificationContent, onOpen: () => void): void {
  if (!notificationsSupported() || Notification.permission !== 'granted') return
  const notification = new Notification(content.title, { body: content.body, icon: content.icon, tag: NOTIFICATION_TAG })
  notification.onclick = () => {
    window.focus()
    onOpen()
    notification.close()
  }
}

/** "RealVisXL V5.0 (SDXL)" reads as "RealVisXL V5.0" in a notification's short text. */
function shortLabel(models: ModelInfo[], id: string): string {
  const label = models.find((model) => model.id === id)?.label ?? id
  return label.replace(/\s*\([^)]*\)$/, '')
}

/** The start of the prompt, cut at a word so it never ends half way through one. */
function excerpt(prompt: string): string {
  const text = prompt.trim().replace(/\s+/g, ' ')
  if (text.length <= PROMPT_EXCERPT_LENGTH) return text
  const cut = text.slice(0, PROMPT_EXCERPT_LENGTH + 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:]+$/, '')}…`
}

/**
 * The finished image as the icon, with the start of its prompt; a sensitive image shows the app's icon and no
 * prompt instead, since a notification can appear on screen where anyone sees it.
 */
function readyContent(item: HistoryItem, context: RenderAlertContext): NotificationContent {
  const name = item.character_id === null ? null : context.characterName(item.character_id)
  const parts = [
    shortLabel(context.models, item.model),
    item.duration_seconds === null ? null : formatDuration(Math.round(item.duration_seconds)),
    item.sensitive || !item.prompt.trim() ? null : `“${excerpt(item.prompt)}”`,
  ]
  return {
    title: name ? t('create.notifyReadyFor', { name }) : t('create.notifyReady'),
    body: parts.filter(Boolean).join(' · '),
    icon: item.sensitive ? APP_ICON : imageUrl(item.id, true),
  }
}

function failedContent(error: string): NotificationContent {
  return { title: t('create.notifyFailed'), body: t('create.notifyTryAgain', { error: error.replace(/\.?$/, '.'), app: APP_TITLE }), icon: APP_ICON }
}

/** A cancelled render goes back to idle: the title just returns to normal. */
function announceEnd(state: GenerationState, context: RenderAlertContext): void {
  if (state.status === 'settled') {
    document.title = t('create.titleReady', { app: APP_TITLE })
    notify(readyContent(state.item, context), context.onOpen)
  } else if (state.status === 'failed') {
    document.title = t('create.titleFailed', { app: APP_TITLE })
    notify(failedContent(state.error), context.onOpen)
  } else {
    document.title = APP_TITLE
  }
}

/**
 * Shows a running render in the tab title, and when one ends while the tab is hidden, says so in the title and
 * a notification until the tab is visible again. A cancelled render goes back to idle, so it never alerts.
 */
export function useRenderAlerts(state: GenerationState, context: RenderAlertContext): void {
  const previous = useRef(state.status)
  // Read when a render ends, so a new context object on each render doesn't count as a change
  const latestContext = useRef(context)
  useEffect(() => {
    latestContext.current = context
  })

  useEffect(() => {
    const wasPending = previous.current === 'pending'
    previous.current = state.status
    if (state.status === 'pending') document.title = t('create.titleGenerating', { app: APP_TITLE })
    else if (wasPending && document.hidden) announceEnd(state, latestContext.current)
    else document.title = APP_TITLE
  }, [state])

  useEffect(() => {
    const resetWhenSeen = () => {
      if (!document.hidden && previous.current !== 'pending') document.title = APP_TITLE
    }
    document.addEventListener('visibilitychange', resetWhenSeen)
    return () => document.removeEventListener('visibilitychange', resetWhenSeen)
  }, [])
}
