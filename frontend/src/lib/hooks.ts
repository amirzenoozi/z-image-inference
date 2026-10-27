import { useCallback, useEffect, useState } from 'react'
import { fetchCatalog } from '../api'
import type { Catalog, Loadable } from '../types'

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong'
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

/** Runs `load` on mount and whenever `retry` is called, tracking pending, failed and settled states. */
export function useLoadable<T>(load: (signal: AbortSignal) => Promise<T>): [Loadable<T>, () => void] {
  const [state, setState] = useState<Loadable<T>>({ status: 'pending' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal).then(
      (value) => setState({ status: 'settled', value }),
      (error: unknown) => {
        if (!isAbort(error)) setState({ status: 'failed', error: errorMessage(error) })
      },
    )
    return () => controller.abort()
  }, [load, attempt])

  const retry = useCallback(() => {
    setState({ status: 'pending' })
    setAttempt((n) => n + 1)
  }, [])
  return [state, retry]
}

export function useCatalog(): [Loadable<Catalog>, () => void] {
  return useLoadable(fetchCatalog)
}

/** Whole seconds since `startedAt`, ticking every second; 0 when not running. */
export function useElapsedSeconds(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (startedAt === null) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [startedAt])
  return startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000))
}

export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  return minutes ? `${minutes}m ${String(seconds % 60).padStart(2, '0')}s` : `${seconds}s`
}
