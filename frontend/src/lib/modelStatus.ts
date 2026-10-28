import { useCallback, useEffect, useState } from 'react'
import { fetchModelStatus } from '../api'
import type { Loadable, ModelStatusReport } from '../types'
import { errorMessage } from './hooks'

export const STATUS_POLL_MS = 5_000

/**
 * Model download status from the model server. Re-checks whenever `refreshKey` changes (for example after a
 * generation attempt), when `refresh` is called (after a download or remove), and every 5 seconds while a
 * download is running or queued, so its progress bar moves, or while the model server is down.
 */
/** The model server is not running, or its status could not be read at all; nothing can be generated either way. */
export function isServerDown(status: Loadable<ModelStatusReport>): boolean {
  return status.status === 'failed' || (status.status === 'settled' && !status.value.server_running)
}

export function useModelStatus(refreshKey: unknown): [Loadable<ModelStatusReport>, () => void] {
  const [state, setState] = useState<Loadable<ModelStatusReport>>({ status: 'pending' })
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    fetchModelStatus(controller.signal).then(
      (value) => setState({ status: 'settled', value }),
      (error: unknown) => !controller.signal.aborted && setState({ status: 'failed', error: errorMessage(error) }),
    )
    return () => controller.abort()
  }, [refreshKey, tick])

  const statuses = state.status === 'settled' ? Object.values(state.value.models).map((model) => model.status) : []
  const downloading = statuses.includes('downloading') || statuses.includes('queued')
  // While the server is down it is checked again too, so the app notices as soon as it starts
  const waiting = downloading || isServerDown(state)
  useEffect(() => {
    if (!waiting) return
    const timer = setTimeout(refresh, STATUS_POLL_MS)
    return () => clearTimeout(timer)
  }, [waiting, tick, refresh])

  return [state, refresh]
}
