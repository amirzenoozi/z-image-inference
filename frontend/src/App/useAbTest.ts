import { useEffect, useState } from 'react'
import { loadTest, saveTest, startTest, testVersions, type AbTest } from '../lib/abTest'
import { newJobId } from '../lib/jobId'
import type { BuilderMode } from '../lib/promptBuilder/modes'
import type { GenerationSettings, HistoryItem, ModelInfo, SentSettings } from '../types'

export interface TestProgress {
  /** The image being made, from 1. */
  index: number
  total: number
}

/** What Create needs to show and change the A/B test. */
export interface AbTestControls {
  test: AbTest | null
  /** The test just left, which Undo brings back; null once another starts. */
  left: AbTest | null
  progress: TestProgress | null
  start: (test: AbTest) => void
  leave: () => void
  undoLeave: () => void
}

interface Options {
  settings: GenerationSettings
  setSettings: (settings: GenerationSettings) => void
  model: ModelInfo
  modes: readonly BuilderMode[]
  maxSeed: number
  /** Renders one image; resolves to it, or null when it failed or was cancelled. */
  generate: (settings: GenerationSettings, testSet: SentSettings['testSet']) => Promise<HistoryItem | null>
}

/** The A/B test: kept across reloads, started over the current settings, and run one image at a time, stopping at the first that fails. */
export function useAbTest({ settings, setSettings, model, modes, maxSeed, generate }: Options) {
  const [test, setTest] = useState<AbTest | null>(loadTest)
  const [left, setLeft] = useState<AbTest | null>(null)
  const [progress, setProgress] = useState<TestProgress | null>(null)
  const [results, setResults] = useState<HistoryItem[] | null>(null)
  useEffect(() => saveTest(test), [test])

  const start = (next: AbTest) => {
    setSettings(startTest(settings, next, modes, () => Math.floor(Math.random() * maxSeed)))
    setTest(next)
    setLeft(null)
  }
  const leave = () => {
    setLeft(test)
    setTest(null)
  }
  const undoLeave = () => {
    if (left) start(left)
  }
  const run = async () => {
    if (!test || progress) return
    const versions = testVersions(settings, test, model, modes)
    const id = newJobId()
    const made: HistoryItem[] = []
    for (const [index, version] of versions.entries()) {
      setProgress({ index: index + 1, total: versions.length })
      const item = await generate(version.settings, { id, label: version.label })
      if (!item) break
      made.push(item)
    }
    setProgress(null)
    if (made.length > 1) setResults(made)
  }
  const controls: AbTestControls = { test, left, progress, start, leave, undoLeave }
  return { controls, run, results, closeResults: () => setResults(null) }
}
