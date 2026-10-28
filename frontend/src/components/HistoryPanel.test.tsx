import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import * as api from '../api'
import { catalog, deferred, historyItem } from '../test/fixtures'
import type { HistoryPage } from '../types'
import { HistoryPanel, PAGE_SIZE } from './HistoryPanel'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  fetchHistory: vi.fn(),
  deleteHistoryItem: vi.fn(),
  clearHistory: vi.fn(),
  fetchHistorySummary: vi.fn(),
  deleteHistoryOlderThan: vi.fn(),
}))

const fetchHistory = vi.mocked(api.fetchHistory)

function page(count: number, total = count, firstId = 1): HistoryPage {
  return { items: Array.from({ length: count }, (_, n) => historyItem({ id: firstId + n, prompt: `image ${firstId + n}` })), total }
}

const summary = {
  total: 2,
  bytes: 29_000_000,
  older_than: [
    { days: 7, count: 2 },
    { days: 30, count: 1 },
    { days: 90, count: 0 },
  ],
}

beforeEach(() => {
  fetchHistory.mockReset()
  vi.mocked(api.fetchHistorySummary).mockReset().mockResolvedValue(summary)
  vi.mocked(api.deleteHistoryOlderThan).mockReset()
})

function renderHistory() {
  const onReuse = vi.fn()
  render(<HistoryPanel models={catalog.models} onReuse={onReuse} />)
  return onReuse
}

it('shows a loading placeholder, not the empty state, while the first page is pending', () => {
  fetchHistory.mockReturnValue(deferred<HistoryPage>().promise)
  renderHistory()
  expect(screen.getByLabelText('Loading history')).toBeInTheDocument()
  expect(screen.queryByText(/No images yet/)).not.toBeInTheDocument()
})

it('shows the empty state once an empty history has loaded', async () => {
  fetchHistory.mockResolvedValue(page(0))
  renderHistory()
  expect(await screen.findByText(/No images yet/)).toBeInTheDocument()
})

it('shows an error that can be retried, instead of an empty history', async () => {
  fetchHistory.mockRejectedValueOnce(new Error('Could not reach the app server')).mockResolvedValueOnce(page(2))
  renderHistory()

  expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the app server')
  expect(screen.queryByText(/No images yet/)).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

  expect(await screen.findAllByRole('button', { name: /^Open:/ })).toHaveLength(2)
})

it('loads the next page after the ones already shown', async () => {
  fetchHistory.mockResolvedValueOnce(page(PAGE_SIZE, PAGE_SIZE + 1)).mockResolvedValueOnce(page(1, PAGE_SIZE + 1, 99))
  renderHistory()

  await userEvent.click(await screen.findByRole('button', { name: 'Load more' }))

  expect(fetchHistory).toHaveBeenLastCalledWith(PAGE_SIZE, PAGE_SIZE)
  expect(await screen.findByRole('button', { name: 'Open: image 99' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
})

it('opens an image to reuse its settings or delete it', async () => {
  fetchHistory.mockResolvedValue(page(2))
  vi.mocked(api.deleteHistoryItem).mockResolvedValue()
  const onReuse = renderHistory()

  await userEvent.click(await screen.findByRole('button', { name: 'Open: image 1' }))
  const dialog = screen.getByRole('dialog', { name: 'Image details' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Reuse settings' }))
  expect(onReuse).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))

  await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
  expect(api.deleteHistoryItem).toHaveBeenCalledWith(1)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByText('1 image')).toBeInTheDocument()
})

it('asks before deleting everything', async () => {
  fetchHistory.mockResolvedValue(page(2))
  vi.mocked(api.clearHistory).mockResolvedValue()
  renderHistory()

  await userEvent.click(await screen.findByRole('button', { name: 'Delete all' }))
  expect(api.clearHistory).not.toHaveBeenCalled()
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete all' }))

  expect(api.clearHistory).toHaveBeenCalledOnce()
  expect(await screen.findByText(/No images yet/)).toBeInTheDocument()
})

it('shows how much space History uses, with a placeholder until it is known', async () => {
  const pending = deferred<typeof summary>()
  vi.mocked(api.fetchHistorySummary).mockReturnValue(pending.promise)
  fetchHistory.mockResolvedValue(page(2))
  renderHistory()

  await screen.findByText('2 images')
  expect(screen.queryByText(/used$/)).not.toBeInTheDocument()

  pending.resolve(summary)
  expect(await screen.findByText('29 MB used')).toBeInTheDocument()
})

it('cleans up the images older than the chosen age, once, then reloads History', async () => {
  fetchHistory.mockResolvedValueOnce(page(2)).mockResolvedValue(page(1))
  vi.mocked(api.deleteHistoryOlderThan).mockResolvedValue(1)
  renderHistory()

  await userEvent.click(await screen.findByRole('button', { name: 'Clean up' }))
  const dialog = screen.getByRole('dialog', { name: 'Clean up history' })
  expect(within(dialog).getByRole('radio', { name: /30 days/ })).toBeChecked()
  await userEvent.click(within(dialog).getByRole('radio', { name: /7 days/ }))
  await userEvent.click(within(dialog).getByRole('button', { name: 'Delete 2 images' }))

  expect(api.deleteHistoryOlderThan).toHaveBeenCalledOnce()
  expect(api.deleteHistoryOlderThan).toHaveBeenCalledWith(7)
  expect(await screen.findByText('1 image')).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('offers no delete when nothing is that old', async () => {
  fetchHistory.mockResolvedValue(page(2))
  renderHistory()

  await userEvent.click(await screen.findByRole('button', { name: 'Clean up' }))
  await userEvent.click(screen.getByRole('radio', { name: /90 days/ }))

  expect(screen.getByRole('button', { name: 'No images older than 90 days' })).toBeDisabled()
})

it('shows the counting state, then an error with a retry when the counts cannot load', async () => {
  const pending = deferred<typeof summary>()
  vi.mocked(api.fetchHistorySummary).mockReturnValueOnce(pending.promise).mockResolvedValue(summary)
  fetchHistory.mockResolvedValue(page(2))
  renderHistory()

  await userEvent.click(await screen.findByRole('button', { name: 'Clean up' }))
  expect(screen.getByRole('status')).toHaveTextContent('Counting images…')
  expect(screen.queryByRole('radio')).not.toBeInTheDocument()

  pending.reject(new Error('Could not reach the app server'))
  await userEvent.click(await screen.findByRole('button', { name: 'Retry' }))

  expect(await screen.findByRole('radio', { name: /30 days/ })).toBeInTheDocument()
})
