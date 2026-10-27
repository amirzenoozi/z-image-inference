import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { initialSettings } from '../lib/settings'
import { catalog, historyItem } from '../test/fixtures'
import type { GenerationState } from '../types'
import { ResultPanel } from './ResultPanel'

function renderResult(state: GenerationState) {
  const handlers = { onRetry: vi.fn(), onUseSeed: vi.fn() }
  render(<ResultPanel state={state} models={catalog.models} {...handlers} />)
  return handlers
}

afterEach(() => vi.useRealTimers())

it('shows the empty state before anything is generated', () => {
  renderResult({ status: 'idle' })
  expect(screen.getByText('Your image will appear here.')).toBeInTheDocument()
})

it('shows a placeholder and a running timer while waiting, never the empty state', () => {
  vi.useFakeTimers()
  const request = { ...initialSettings(catalog), width: 512, height: 512 }
  renderResult({ status: 'pending', startedAt: Date.now(), request })

  expect(screen.getByRole('status')).toHaveTextContent('Generating 512×512 with Z-Image-Turbo · 0s')
  expect(screen.queryByText('Your image will appear here.')).not.toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()

  act(() => vi.advanceTimersByTime(65_000))
  expect(screen.getByRole('status')).toHaveTextContent('1m 05s')
})

it('shows the error with a retry', async () => {
  const { onRetry } = renderResult({ status: 'failed', error: 'The model server is not running', request: initialSettings(catalog) })
  expect(screen.getByRole('alert')).toHaveTextContent('The model server is not running')
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(onRetry).toHaveBeenCalledOnce()
})

it('shows the image with its settings and actions', async () => {
  const { onUseSeed } = renderResult({ status: 'settled', item: historyItem({ id: 7, seed: 42 }) })
  expect(screen.getByRole('img')).toHaveAttribute('src', '/api/history/7/image')
  expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute('download', 'z-image-7-42.png')
  expect(screen.getByText('seed 42')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Use this seed' }))
  expect(onUseSeed).toHaveBeenCalledWith(42)
})
