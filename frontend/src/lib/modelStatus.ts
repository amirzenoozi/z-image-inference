import { useEffect, useState } from 'react'
import { fetchModelStatus } from '../api'
import type { Loadable, ModelStatusReport } from '../types'
import { errorMessage } from './hooks'

export const STATUS_POLL_MS = 15_000

/**
 * Model download status from the model server. Re-checks whenever `refreshKey` changes (for example after a
 * generation attempt, which may start a download) and every 15 seconds while a download is running or queued.
 */
export function useModelStatus(refreshKey: unknown): Loadable<ModelStatusReport> {
  const [state, setState] = useState<Loadable<ModelStatusReport>>({ status: 'pending' })
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetchModelStatus(controller.signal).then(
      (value) => setState({ status: 'settled', value }),
      (error: unknown) => !controller.signal.aborted && setState({ status: 'failed', error: errorMessage(error) }),
    )
    return () => controller.abort()
  }, [refreshKey, tick])

  const statuses = state.status === 'settled' ? Object.values(state.value.models) : []
  const downloading = statuses.includes('downloading') || statuses.includes('queued')
  useEffect(() => {
    if (!downloading) return
    const timer = setTimeout(() => setTick((n) => n + 1), STATUS_POLL_MS)
    return () => clearTimeout(timer)
  }, [downloading, tick])

  return state
}
