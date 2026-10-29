import { useCallback, useRef, useState } from 'react'
import { ApiError, CANCELLED_STATUS, cancelJob, generateImage } from '../api'
import type { GenerationSettings, GenerationState, HistoryItem } from '../types'
import { errorMessage } from './hooks'

/**
 * A job id in the format the server checks (a lower-case UUID). crypto.randomUUID only exists on secure pages (HTTPS
 * or localhost), so over plain Wi-Fi from a phone the id is built from crypto.getRandomValues, which works anywhere.
 */
function newJobId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function isCancelled(error: unknown): boolean {
  return error instanceof ApiError && error.status === CANCELLED_STATUS
}

/** `onFailure` runs when the server answers with an error, not when the user cancels. */
export function useGeneration(onSuccess: (item: HistoryItem) => void, onFailure: () => void = () => {}) {
  const [state, setState] = useState<GenerationState>({ status: 'idle' })
  // What the result area showed before the current generation, restored when it is cancelled
  const lastOutcome = useRef<GenerationState>({ status: 'idle' })

  const settle = useCallback((outcome: GenerationState) => {
    lastOutcome.current = outcome
    setState(outcome)
  }, [])

  const run = useCallback(
    async (request: GenerationSettings) => {
      const jobId = newJobId()
      setState({ status: 'pending', startedAt: Date.now(), request, jobId, cancelling: false })
      try {
        const item = await generateImage(request, jobId)
        settle({ status: 'settled', item })
        onSuccess(item)
      } catch (error) {
        if (isCancelled(error)) return setState(lastOutcome.current)
        settle({ status: 'failed', error: errorMessage(error), request })
        onFailure()
      }
    },
    [onSuccess, onFailure, settle],
  )

  const retry = () => {
    if (state.status === 'failed') void run(state.request)
  }

  const cancel = () => {
    if (state.status !== 'pending' || state.cancelling) return
    const { jobId } = state
    setState({ ...state, cancelling: true })
    // If the request fails, the generation goes on, so Cancel can be tried again
    cancelJob(jobId).catch(() =>
      setState((current) => (current.status === 'pending' && current.jobId === jobId ? { ...current, cancelling: false } : current)),
    )
  }

  return { state, run, retry, cancel }
}
