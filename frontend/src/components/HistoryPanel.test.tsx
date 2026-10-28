import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as api from '../api'
import { catalog, deferred, historyItem } from '../test/fixtures'
import type { HistoryFilters, HistoryItem, HistoryPage } from '../types'
import { SEARCH_DELAY_MS } from './HistoryFilters'
import { NO_FILTERS } from '../lib/historyFilters'
import { HistoryPanel, PAGE_SIZE } from './HistoryPanel'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  fetchHistory: vi.fn(),
  deleteHistoryItem: vi.fn(),
  clearHistory: vi.fn(),
  fetchHistorySummary: vi.fn(),
  deleteHistoryOlderThan: vi.fn(),
  setFavourite: vi.fn(),
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

  expect(fetchHistory).toHaveBeenLastCalledWith(PAGE_SIZE, PAGE_SIZE, NO_FILTERS)
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

afterEach(() => vi.useRealTimers())

function pageOf(items: HistoryItem[]): HistoryPage {
  return { items, total: items.length }
}

it('searches once typing pauses, not on every key', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  fetchHistory.mockResolvedValue(page(2))
  renderHistory()
  await screen.findByText('2 images')

  await user.type(screen.getByLabelText('Search prompts'), 'fox')
  expect(fetchHistory).toHaveBeenCalledOnce()

  await act(() => vi.advanceTimersByTimeAsync(SEARCH_DELAY_MS))
  expect(fetchHistory).toHaveBeenCalledTimes(2)
  expect(fetchHistory).toHaveBeenLastCalledWith(0, PAGE_SIZE, { ...NO_FILTERS, search: 'fox' }, expect.any(AbortSignal))
})

it('keeps the newest filter results when an older request answers late', async () => {
  const slow = deferred<HistoryPage>()
  fetchHistory.mockImplementation((_offset: number, _limit: number, filters: HistoryFilters) => {
    if (filters.model === 'z-image-turbo') return slow.promise
    if (filters.model === 'wai-illustrious') return Promise.resolve(pageOf([historyItem({ id: 7, prompt: 'anime image' })]))
    return Promise.resolve(page(2))
  })
  renderHistory()
  await screen.findByText('2 images')

  await userEvent.selectOptions(screen.getByLabelText('Model'), 'z-image-turbo')
  await userEvent.selectOptions(screen.getByLabelText('Model'), 'wai-illustrious')
  expect(await screen.findByRole('button', { name: 'Open: anime image' })).toBeInTheDocument()

  await act(async () => slow.resolve(pageOf([historyItem({ id: 9, prompt: 'late photo' })])))
  expect(screen.queryByRole('button', { name: 'Open: late photo' })).not.toBeInTheDocument()
  expect(screen.getByText('1 matching')).toBeInTheDocument()
})

it('tells "no matches" apart from an empty History, and clears the filters', async () => {
  fetchHistory.mockImplementation((_offset: number, _limit: number, filters: HistoryFilters) =>
    Promise.resolve(filters.favouritesOnly ? page(0) : page(2)),
  )
  renderHistory()
  await screen.findByText('2 images')

  await userEvent.click(screen.getByRole('button', { name: '★ Favourites' }))
  expect(await screen.findByText('No images match.')).toBeInTheDocument()
  expect(screen.queryByText(/No images yet/)).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Delete all' })).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(await screen.findByText('2 images')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '★ Favourites' })).toHaveAttribute('aria-pressed', 'false')
  expect(fetchHistory).toHaveBeenLastCalledWith(0, PAGE_SIZE, NO_FILTERS, expect.any(AbortSignal))
})

it('stars an image once, and leaves the star as it was when saving fails', async () => {
  fetchHistory.mockResolvedValue(page(1))
  const saving = deferred<HistoryItem>()
  vi.mocked(api.setFavourite).mockReturnValueOnce(saving.promise).mockRejectedValueOnce(new Error('Could not reach the app server'))
  renderHistory()

  const star = await screen.findByRole('button', { name: 'Add to favourites' })
  await userEvent.click(star)
  await userEvent.click(star)
  expect(api.setFavourite).toHaveBeenCalledOnce()
  expect(api.setFavourite).toHaveBeenCalledWith(1, true)

  await act(async () => saving.resolve(historyItem({ id: 1, prompt: 'image 1', favourite: true })))
  const starred = screen.getByRole('button', { name: 'Remove from favourites' })
  expect(starred).toHaveAttribute('aria-pressed', 'true')

  await userEvent.click(starred)
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the app server')
  expect(screen.getByRole('button', { name: 'Remove from favourites' })).toHaveAttribute('aria-pressed', 'true')
})

it('drops an unstarred image from the Favourites view', async () => {
  const starred = [historyItem({ id: 1, prompt: 'image 1', favourite: true }), historyItem({ id: 2, prompt: 'image 2', favourite: true })]
  fetchHistory.mockImplementation((_offset: number, _limit: number, filters: HistoryFilters) => Promise.resolve(filters.favouritesOnly ? pageOf(starred) : page(3)))
  vi.mocked(api.setFavourite).mockResolvedValue(historyItem({ id: 1, prompt: 'image 1', favourite: false }))
  renderHistory()
  await screen.findByText('3 images')

  await userEvent.click(screen.getByRole('button', { name: '★ Favourites' }))
  await screen.findByText('2 matching')
  await userEvent.click(screen.getAllByRole('button', { name: 'Remove from favourites' })[0])

  expect(await screen.findByText('1 matching')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Open: image 1' })).not.toBeInTheDocument()
})

it('compares at most two images and highlights the facts that differ', async () => {
  fetchHistory.mockResolvedValue(
    pageOf([historyItem({ id: 1, prompt: 'image 1', seed: 1 }), historyItem({ id: 2, prompt: 'image 2', seed: 2 }), historyItem({ id: 3, prompt: 'image 3' })]),
  )
  renderHistory()
  await screen.findByText('3 images')

  await userEvent.click(screen.getByRole('button', { name: 'Compare' }))
  expect(screen.getByRole('button', { name: 'Pick 2 more' })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'Select: image 1' }))
  await userEvent.click(screen.getByRole('button', { name: 'Select: image 2' }))
  await userEvent.click(screen.getByRole('button', { name: 'Select: image 3' }))
  expect(screen.getByRole('button', { name: 'Select: image 3' })).toHaveAttribute('aria-pressed', 'false')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Compare 2 images' }))
  const dialog = screen.getByRole('dialog', { name: 'Compare images' })
  expect(within(dialog).getByText('seed 1').closest('li')).toHaveTextContent('(differs)')
  expect(within(dialog).getAllByText('512×512')[0].closest('li')).not.toHaveTextContent('(differs)')
})
