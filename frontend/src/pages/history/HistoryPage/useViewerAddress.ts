import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, fetchHistoryPosition } from '../../../api'
import type { AddressChange, HistoryAddress } from '../../../lib/historyAddress'
import { errorMessage } from '../../../lib/hooks'
import type { HistoryFilters, HistoryItem } from '../../../types'
import type { ViewerStart } from './components/HistoryViewer'

/** Where the viewer opens, and the filters it belongs to; it closes if Back or Forward changes them. */
export type ViewerOpen = ViewerStart & { filtersKey: string }

/** Opening an image named in the address: looked up, gone (or hidden by the filters), or failed. */
export type LinkState = { status: 'idle' } | { status: 'loading' } | { status: 'missing'; id: number } | { status: 'failed'; error: string }

interface Options {
  address: HistoryAddress
  go: (next: HistoryAddress, change?: AddressChange) => void
  hideSensitive: boolean
  pageSize: number
}

const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'

/**
 * The image viewer, kept in History's address (`?image=`): opening an image adds it, moving through the viewer updates it,
 * closing removes it, and a link or a reload with one opens it where the list puts it.
 */
export function useViewerAddress({ address, go, hideSensitive, pageSize }: Options) {
  const { filters, page, image } = address
  const [viewing, setViewing] = useState<ViewerOpen | null>(null)
  const [link, setLink] = useState<LinkState>({ status: 'idle' })
  const [attempt, setAttempt] = useState(0)
  // Open, the viewer keeps the address in step with itself; only a link, a reload or Forward has an image to look up
  const active = useRef(false)
  const pageOf = useCallback((index: number) => Math.floor(index / pageSize) + 1, [pageSize])

  // Back past the viewer, or a filter change, closes it (the viewer shows only while the address names an image);
  // Forward to it again looks the image up afresh
  useEffect(() => {
    if (image === null) active.current = false
  }, [image])

  useEffect(() => {
    if (image === null || active.current) return
    const controller = new AbortController()
    setLink({ status: 'loading' })
    fetchHistoryPosition(image, filters, hideSensitive, controller.signal)
      .then(({ item, index, total }) => {
        active.current = true
        setViewing({ index, item, total, filtersKey: JSON.stringify(filters) })
        setLink({ status: 'idle' })
      })
      .catch((error: unknown) => {
        if (isAbort(error)) return
        if (!(error instanceof ApiError && error.status === 404)) return setLink({ status: 'failed', error: errorMessage(error) })
        setLink({ status: 'missing', id: image })
        go({ filters, page, image: null }, 'replace')
      })
    return () => controller.abort()
  }, [image, filters, page, hideSensitive, attempt, go])

  const open = (start: ViewerStart, inFilters: HistoryFilters = filters) => {
    active.current = true
    setViewing({ ...start, filtersKey: JSON.stringify(inFilters) })
    setLink({ status: 'idle' })
    go({ filters: inFilters, page: pageOf(start.index), image: start.item.id }, 'push')
  }
  // The page behind the viewer follows it as it moves, so closing the viewer shows where it ended
  const follow = (index: number) => {
    if (pageOf(index) !== page) go({ filters, page: pageOf(index), image }, 'replace')
  }
  // Once the image it moved to has loaded, the address names it
  const show = useCallback(
    (item: HistoryItem) => {
      if (item.id !== image) go({ filters, page, image: item.id }, 'replace')
    },
    [filters, page, image, go],
  )
  const close = () => {
    active.current = false
    setViewing(null)
    go({ filters, page, image: null }, 'push')
  }
  return { viewing: image === null ? null : viewing, link, open, follow, show, close, retry: () => setAttempt((n) => n + 1), dismiss: () => setLink({ status: 'idle' }) }
}
