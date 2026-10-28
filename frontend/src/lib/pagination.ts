export type PageItem = number | 'gap'

/**
 * The page buttons to show: the first and last pages, and the current one with its neighbours. Runs of
 * hidden pages become a gap, except a single hidden page, which is shown since a gap would take the same room.
 */
export function pageItems(current: number, pageCount: number): PageItem[] {
  const shown = [...new Set([1, current - 1, current, current + 1, pageCount])]
    .filter((page) => page >= 1 && page <= pageCount)
    .sort((a, b) => a - b)
  const items: PageItem[] = []
  shown.forEach((page, index) => {
    const skipped = index > 0 ? page - shown[index - 1] - 1 : 0
    if (skipped === 1) items.push(page - 1)
    if (skipped > 1) items.push('gap')
    items.push(page)
  })
  return items
}
