import { useCallback, useRef, useState } from 'react'
import { ApiError, CANCELLED_STATUS, cancelJob, generateImage } from '../api'
import type { GenerationState, HistoryItem, SentSettings } from '../types'
import { errorMessage } from './hooks'
import { newJobId } from './jobId'

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
    async (request: SentSettings) => {
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
