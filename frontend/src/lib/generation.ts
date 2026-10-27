import { useCallback, useState } from 'react'
import { generateImage } from '../api'
import type { GenerationSettings, GenerationState, HistoryItem } from '../types'
import { errorMessage } from './hooks'

export function useGeneration(onSuccess: (item: HistoryItem) => void) {
  const [state, setState] = useState<GenerationState>({ status: 'idle' })

  const run = useCallback(
    async (request: GenerationSettings) => {
      setState({ status: 'pending', startedAt: Date.now(), request })
      try {
        const item = await generateImage(request)
        setState({ status: 'settled', item })
        onSuccess(item)
      } catch (error) {
        setState({ status: 'failed', error: errorMessage(error), request })
      }
    },
    [onSuccess],
  )

  const retry = () => {
    if (state.status === 'failed') void run(state.request)
  }

  return { state, run, retry }
}
