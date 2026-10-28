import type { Category } from '../types'

/** How the resolution picker and History's ratio filter name each shape. */
export const CATEGORY_LABELS: Record<Category, string> = {
  square: 'Square',
  portrait: 'Portrait',
  landscape: 'Landscape',
  widescreen: 'Widescreen',
}

export function isCategory(value: string): value is Category {
  return Object.hasOwn(CATEGORY_LABELS, value)
}
