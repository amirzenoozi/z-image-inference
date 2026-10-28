import { t } from '../i18n'
import type { HistoryItem } from '../types'
import { formatDuration } from './hooks'

/** The facts shown as chips under an image: model, size, steps, guidance, seed and render time. */
export function imageFacts(item: HistoryItem, label: string): string[] {
  const facts = [label, `${item.width}×${item.height}`, t('history.factSteps', { count: item.steps }), t('history.factSeed', { seed: item.seed })]
  if (item.guidance !== null) facts.splice(3, 0, t('history.factGuidance', { value: item.guidance }))
  if (item.duration_seconds !== null) facts.push(formatDuration(Math.round(item.duration_seconds)))
  return facts
}
