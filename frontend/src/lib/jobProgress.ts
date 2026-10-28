import { useEffect, useState } from 'react'
import { fetchJobProgress } from '../api'
import type { JobProgress } from '../types'

export const PROGRESS_POLL_MS = 1_000

/**
 * A running generation's progress, checked every second. Null until the first answer, and again after a
 * failed check: progress is extra information, so the result area then shows only the elapsed time rather
 * than an error while the generation itself goes on.
 */
export function useJobProgress(jobId: string): JobProgress | null {
  const [progress, setProgress] = useState<JobProgress | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const poll = () => {
      fetchJobProgress(jobId, controller.signal)
        .then(setProgress, () => setProgress(null))
        .finally(() => {
          if (!controller.signal.aborted) timer = setTimeout(poll, PROGRESS_POLL_MS)
        })
    }
    timer = setTimeout(poll, PROGRESS_POLL_MS)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [jobId])

  return progress
}
