import type { KeyboardEvent } from 'react'

export function isModEnter(event: KeyboardEvent): boolean {
  return event.key === 'Enter' && (event.metaKey || event.ctrlKey)
}
