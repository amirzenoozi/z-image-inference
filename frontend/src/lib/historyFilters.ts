import type { HistoryFilters } from '../types'

export const NO_FILTERS: HistoryFilters = { model: null, search: '', favouritesOnly: false, ratio: null, character: null }

export function isFiltered(filters: HistoryFilters): boolean {
  return [filters.model !== null, filters.search !== '', filters.favouritesOnly, filters.ratio !== null, filters.character !== null].some(Boolean)
}
