import { useCallback, useEffect, useState } from 'react'
import type { HistoryFilters, ModelInfo } from '../types'
import { isCategory } from './categories'

export interface HistoryAddress {
  filters: HistoryFilters
  page: number
}

/** 'push' adds a Back entry; 'replace' updates the current one, for changes too small to step back through. */
export type AddressChange = 'push' | 'replace'

/** Reads the page and filters from a query string; values that make no sense fall back to their defaults. */
function readAddress(search: string, models: ModelInfo[]): HistoryAddress {
  const params = new URLSearchParams(search)
  const model = params.get('model')
  const ratio = params.get('ratio') ?? ''
  const page = Number(params.get('page'))
  return {
    filters: {
      model: models.some((candidate) => candidate.id === model) ? model : null,
      search: (params.get('q') ?? '').trim(),
      favouritesOnly: params.get('favourites') === '1',
      ratio: isCategory(ratio) ? ratio : null,
    },
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
}

/** The query string for an address, with only what differs from plain History. */
function queryOf({ filters, page }: HistoryAddress): string {
  const params = new URLSearchParams()
  if (page > 1) params.set('page', String(page))
  if (filters.search) params.set('q', filters.search)
  if (filters.model) params.set('model', filters.model)
  if (filters.ratio) params.set('ratio', filters.ratio)
  if (filters.favouritesOnly) params.set('favourites', '1')
  const query = params.toString()
  return query ? `?${query}` : ''
}

function writeAddress(address: HistoryAddress, change: AddressChange): void {
  const url = `${window.location.pathname}${queryOf(address)}`
  if (url === `${window.location.pathname}${window.location.search}`) return
  if (change === 'push') window.history.pushState(null, '', url)
  else window.history.replaceState(null, '', url)
}

/**
 * History's page and filters, kept in the address so a reload or bookmark reopens them and Back and Forward
 * step through them. `visits` counts Back and Forward moves, so a control holding its own text can refill.
 */
export function useHistoryAddress(models: ModelInfo[]): [HistoryAddress, (next: HistoryAddress, change?: AddressChange) => void, number] {
  const [address, setAddress] = useState(() => readAddress(window.location.search, models))
  const [visits, setVisits] = useState(0)

  useEffect(() => {
    // A link with values that make no sense is tidied, so the address matches what is shown
    writeAddress(readAddress(window.location.search, models), 'replace')
    const followAddress = () => {
      setAddress(readAddress(window.location.search, models))
      setVisits((n) => n + 1)
    }
    window.addEventListener('popstate', followAddress)
    return () => window.removeEventListener('popstate', followAddress)
  }, [models])

  const go = useCallback((next: HistoryAddress, change: AddressChange = 'push') => {
    writeAddress(next, change)
    setAddress(next)
  }, [])

  return [address, go, visits]
}
