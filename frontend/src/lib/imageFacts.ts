import type { HistoryItem } from '../types'
import { formatDuration } from './hooks'

/** The facts shown as chips under an image: model, size, steps, guidance, seed and render time. */
export function imageFacts(item: HistoryItem, label: string): string[] {
  const facts = [label, `${item.width}×${item.height}`, `${item.steps} steps`, `seed ${item.seed}`]
  if (item.guidance !== null) facts.splice(3, 0, `CFG ${item.guidance}`)
  if (item.duration_seconds !== null) facts.push(formatDuration(Math.round(item.duration_seconds)))
  return facts
}
