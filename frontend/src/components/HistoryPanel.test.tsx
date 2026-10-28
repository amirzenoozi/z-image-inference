import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as api from '../api'
import { catalog, deferred, historyItem } from '../test/fixtures'
import type { HistoryFilters, HistoryItem, HistoryPage } from '../types'
import { SEARCH_DELAY_MS } from './HistoryFilters'
import { NO_FILTERS } from '../lib/historyFilters'
import { HistoryPanel, PAGE_SIZE } from './HistoryPanel'
import { chooseOption } from '../test/select'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  fetchHistory: vi.fn(),
  deleteHistoryItem: vi.fn(),
  clearHistory: vi.fn(),
  fetchHistorySummary: vi.fn(),
  deleteHistoryOlderThan: vi.fn(),
  setFavourite: vi.fn(),
  fetchPalette: vi.fn(),
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
  vi.mocked(api.fetchPalette).mockReset().mockResolvedValue([])
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

it('moves between pages, showing a placeholder while the next one loads', async () => {
  const second = deferred<HistoryPage>()
  fetchHistory.mockResolvedValueOnce(page(PAGE_SIZE, PAGE_SIZE + 1)).mockReturnValueOnce(second.promise)
  renderHistory()

  expect(await screen.findByText(`Showing 1–${PAGE_SIZE} of ${PAGE_SIZE + 1} images`)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '‹ Previous' })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'Next ›' }))

  expect(fetchHistory).toHaveBeenLastCalledWith(PAGE_SIZE, PAGE_SIZE, NO_FILTERS, expect.any(AbortSignal))
  expect(screen.getByLabelText('Loading history')).toBeInTheDocument()
  expect(screen.queryByText(/No images/)).not.toBeInTheDocument()

  await act(async () => second.resolve(page(1, PAGE_SIZE + 1, 99)))
  expect(screen.getByRole('button', { name: 'Open: image 99' })).toBeInTheDocument()
  expect(screen.getByText(`Showing ${PAGE_SIZE + 1}–${PAGE_SIZE + 1} of ${PAGE_SIZE + 1} images`)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('button', { name: 'Next ›' })).toBeDisabled()
})

it('shows no page buttons when everything fits on one page', async () => {
  fetchHistory.mockResolvedValue(page(3))
  renderHistory()
  await screen.findByText('3 images')
  expect(screen.queryByRole('navigation', { name: 'Pages' })).not.toBeInTheDocument()
})

it('collapses long runs of pages into a gap', async () => {
  fetchHistory.mockResolvedValue(page(PAGE_SIZE, PAGE_SIZE * 12))
  renderHistory()
  await screen.findByText(/Showing 1–/)

  const pages = () => within(screen.getByRole('navigation', { name: 'Pages' })).getAllByRole('button', { name: /^Page / }).map((button) => button.textContent)
  expect(pages()).toEqual(['1', '2', '12'])

  await userEvent.click(screen.getByRole('button', { name: 'Page 12' }))
  await screen.findByRole('button', { name: 'Page 11' })
  await userEvent.click(screen.getByRole('button', { name: 'Page 11' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Page 10' }))
  await screen.findByRole('button', { name: 'Page 9' })
  expect(pages()).toEqual(['1', '9', '10', '11', '12'])
  expect(fetchHistory).toHaveBeenLastCalledWith(PAGE_SIZE * 9, PAGE_SIZE, NO_FILTERS, expect.any(AbortSignal))
})

it('starts from the first page again when a filter changes', async () => {
  fetchHistory.mockResolvedValue(page(PAGE_SIZE, PAGE_SIZE * 3))
  renderHistory()
  await userEvent.click(await screen.findByRole('button', { name: 'Page 3' }))
  await screen.findByRole('button', { name: 'Page 3', current: 'page' })

  await userEvent.click(screen.getByRole('button', { name: '★ Favourites' }))

  expect(fetchHistory).toHaveBeenLastCalledWith(0, PAGE_SIZE, { ...NO_FILTERS, favouritesOnly: true }, expect.any(AbortSignal))
  expect(await screen.findByRole('button', { name: 'Page 1', current: 'page' })).toBeInTheDocument()
})

it('goes back a page when the only image on the last page is deleted', async () => {
  serveHistory(PAGE_SIZE + 1)
  renderHistory()
  await userEvent.click(await screen.findByRole('button', { name: 'Page 2' }))

  await userEvent.click(await screen.findByRole('button', { name: 'Open: image 1' }))
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))

  const dialog = screen.getByRole('dialog', { name: 'Image details' })
  expect(await within(dialog).findByRole('img', { name: 'image 2' })).toBeInTheDocument()
  expect(within(dialog).getByText(`${PAGE_SIZE} of ${PAGE_SIZE}`)).toBeInTheDocument()
  expect(window.location.search).toBe('')
  expect(await screen.findByText(`${PAGE_SIZE} images`)).toBeInTheDocument()
})

it('shows an error with a retry when a page fails to load, not an empty page', async () => {
  fetchHistory
    .mockResolvedValueOnce(page(PAGE_SIZE, PAGE_SIZE + 1))
    .mockRejectedValueOnce(new Error('Could not reach the app server'))
    .mockResolvedValueOnce(page(1, PAGE_SIZE + 1, 99))
  renderHistory()
  await userEvent.click(await screen.findByRole('button', { name: 'Page 2' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the app server')
  expect(screen.queryByText(/No images/)).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

  expect(await screen.findByRole('button', { name: 'Open: image 99' })).toBeInTheDocument()
  expect(fetchHistory).toHaveBeenLastCalledWith(PAGE_SIZE, PAGE_SIZE, NO_FILTERS, expect.any(AbortSignal))
})

it('opens an image to reuse its settings or delete it, then shows the next one', async () => {
  serveHistory(2)
  const onReuse = renderHistory()

  await userEvent.click(await screen.findByRole('button', { name: 'Open: image 2' }))
  const dialog = screen.getByRole('dialog', { name: 'Image details' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Reuse settings' }))
  expect(onReuse).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }))

  await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
  expect(api.deleteHistoryItem).toHaveBeenCalledExactlyOnceWith(2)
  expect(await within(dialog).findByRole('img', { name: 'image 1' })).toBeInTheDocument()
  expect(within(dialog).getByText('1 of 1')).toBeInTheDocument()
  expect(await screen.findByText('1 image')).toBeInTheDocument()

  await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('asks before deleting everything', async () => {
  fetchHistory.mockResolvedValueOnce(page(2)).mockResolvedValue(page(0))
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

afterEach(() => {
  vi.useRealTimers()
  window.history.replaceState(null, '', '/')
})

/** A fake History of `count` images, newest (highest id) first, answering any page or position; deleting removes one. */
function serveHistory(count: number): HistoryItem[] {
  let images = Array.from({ length: count }, (_, n) => historyItem({ id: count - n, prompt: `image ${count - n}` }))
  fetchHistory.mockImplementation(async (offset: number, limit: number) => ({ items: images.slice(offset, offset + limit), total: images.length }))
  vi.mocked(api.deleteHistoryItem).mockImplementation(async (id: number) => {
    images = images.filter((item) => item.id !== id)
  })
  return images
}

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

  await chooseOption(screen.getByLabelText('Model'), 'Z-Image-Turbo')
  await chooseOption(screen.getByLabelText('Model'), 'WAI-Illustrious')
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
  let starred = [historyItem({ id: 1, prompt: 'image 1', favourite: true }), historyItem({ id: 2, prompt: 'image 2', favourite: true })]
  fetchHistory.mockImplementation((_offset: number, _limit: number, filters: HistoryFilters) => Promise.resolve(filters.favouritesOnly ? pageOf(starred) : page(3)))
  vi.mocked(api.setFavourite).mockImplementation(async (id: number) => {
    starred = starred.filter((item) => item.id !== id)
    return historyItem({ id, prompt: `image ${id}`, favourite: false })
  })
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

it('filters by ratio, and back to all ratios', async () => {
  fetchHistory.mockResolvedValue(page(2))
  renderHistory()
  await screen.findByText('2 images')

  await chooseOption(screen.getByLabelText('Ratio'), 'Portrait')
  expect(fetchHistory).toHaveBeenLastCalledWith(0, PAGE_SIZE, { ...NO_FILTERS, ratio: 'portrait' }, expect.any(AbortSignal))

  await chooseOption(screen.getByLabelText('Ratio'), 'All ratios')
  expect(fetchHistory).toHaveBeenLastCalledWith(0, PAGE_SIZE, NO_FILTERS, expect.any(AbortSignal))
})

it('shows the colour palette when an image is opened: placeholder, then swatches that copy their colour', async () => {
  const palette = deferred<{ hex: string; share: number }[]>()
  vi.mocked(api.fetchPalette).mockReturnValue(palette.promise)
  const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
  fetchHistory.mockResolvedValue(page(1))
  renderHistory()

  await userEvent.click(await screen.findByRole('button', { name: 'Open: image 1' }))
  const section = screen.getByRole('region', { name: 'Colour palette' })
  expect(within(section).getByLabelText('Working out the colours')).toBeInTheDocument()
  expect(api.fetchPalette).toHaveBeenCalledWith(1, expect.any(AbortSignal))

  await act(async () => palette.resolve([{ hex: '#FF0000', share: 0.594 }, { hex: '#0000FF', share: 0.297 }]))
  expect(within(section).getByText('59%')).toBeInTheDocument()
  await userEvent.click(within(section).getByRole('button', { name: 'Copy #FF0000' }))

  expect(writeText).toHaveBeenCalledWith('#FF0000')
  expect(within(section).getByText('Copied')).toBeInTheDocument()
})

it('shows an error with a retry when the palette cannot be worked out', async () => {
  vi.mocked(api.fetchPalette).mockRejectedValueOnce(new Error('Image not found')).mockResolvedValueOnce([{ hex: '#123456', share: 1 }])
  fetchHistory.mockResolvedValue(page(1))
  renderHistory()

  await userEvent.click(await screen.findByRole('button', { name: 'Open: image 1' }))
  const section = screen.getByRole('region', { name: 'Colour palette' })
  expect(await within(section).findByRole('alert')).toHaveTextContent('Image not found')
  await userEvent.click(within(section).getByRole('button', { name: 'Retry' }))

  expect(await within(section).findByRole('button', { name: 'Copy #123456' })).toBeInTheDocument()
})

it('opens the page and filters named in the address, and fills the controls', async () => {
  window.history.replaceState(null, '', '/history?page=2&q=fox&model=wai-illustrious&ratio=portrait&favourites=1')
  fetchHistory.mockResolvedValue(page(PAGE_SIZE, PAGE_SIZE * 3))
  renderHistory()

  await screen.findByRole('button', { name: 'Page 2', current: 'page' })
  expect(fetchHistory).toHaveBeenCalledOnce()
  expect(fetchHistory).toHaveBeenCalledWith(PAGE_SIZE, PAGE_SIZE, { model: 'wai-illustrious', search: 'fox', favouritesOnly: true, ratio: 'portrait' }, expect.any(AbortSignal))
  expect(screen.getByLabelText('Search prompts')).toHaveValue('fox')
  expect(screen.getByLabelText('Model')).toHaveTextContent('WAI-Illustrious')
  expect(screen.getByLabelText('Ratio')).toHaveTextContent('Portrait')
  expect(screen.getByRole('button', { name: '★ Favourites' })).toHaveAttribute('aria-pressed', 'true')
})

it('writes changes to the address: a Back entry for pages and filters, the current entry for a search', async () => {
  fetchHistory.mockResolvedValue(page(PAGE_SIZE, PAGE_SIZE * 3))
  const push = vi.spyOn(window.history, 'pushState')
  const replace = vi.spyOn(window.history, 'replaceState')
  renderHistory()

  await userEvent.click(await screen.findByRole('button', { name: 'Page 2' }))
  expect(window.location.search).toBe('?page=2')
  await userEvent.click(await screen.findByRole('button', { name: '★ Favourites' }))
  expect(window.location.search).toBe('?favourites=1')
  expect(push).toHaveBeenCalledTimes(2)

  await userEvent.type(screen.getByLabelText('Search prompts'), 'fox')
  await waitFor(() => expect(window.location.search).toBe('?q=fox&favourites=1'))
  expect(push).toHaveBeenCalledTimes(2)
  expect(replace).toHaveBeenLastCalledWith(null, '', '/?q=fox&favourites=1')
})

it('follows Back and Forward, refilling the search box', async () => {
  fetchHistory.mockResolvedValue(page(2))
  renderHistory()
  await screen.findByText('2 images')
  await userEvent.click(screen.getByRole('button', { name: '★ Favourites' }))

  await act(async () => window.history.back())

  await waitFor(() => expect(screen.getByRole('button', { name: '★ Favourites' })).toHaveAttribute('aria-pressed', 'false'))
  expect(fetchHistory).toHaveBeenLastCalledWith(0, PAGE_SIZE, NO_FILTERS, expect.any(AbortSignal))

  await act(async () => {
    window.history.pushState(null, '', '/?q=dog')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  expect(screen.getByLabelText('Search prompts')).toHaveValue('dog')
  expect(fetchHistory).toHaveBeenLastCalledWith(0, PAGE_SIZE, { ...NO_FILTERS, search: 'dog' }, expect.any(AbortSignal))
})

it('tidies an address with values that make no sense', async () => {
  window.history.replaceState(null, '', '/history?page=abc&model=nope&ratio=round&favourites=yes')
  fetchHistory.mockResolvedValue(page(2))
  renderHistory()

  await screen.findByText('2 images')
  expect(fetchHistory).toHaveBeenCalledWith(0, PAGE_SIZE, NO_FILTERS, expect.any(AbortSignal))
  expect(window.location.search).toBe('')
})

it('shows the last page for a page past the end', async () => {
  window.history.replaceState(null, '', '/history?page=9')
  fetchHistory.mockImplementation((offset: number) => Promise.resolve(offset >= PAGE_SIZE * 2 ? page(0, PAGE_SIZE + 1) : page(1, PAGE_SIZE + 1, 99)))
  renderHistory()

  expect(await screen.findByRole('button', { name: 'Open: image 99' })).toBeInTheDocument()
  expect(fetchHistory).toHaveBeenLastCalledWith(PAGE_SIZE, PAGE_SIZE, NO_FILTERS, expect.any(AbortSignal))
  expect(window.location.search).toBe('?page=2')
})

it('copies the prompt and the negative prompt from an image\'s details', async () => {
  fetchHistory.mockResolvedValue(pageOf([historyItem({ id: 1, prompt: 'a red fox', negative_prompt: 'blurry' })]))
  const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
  renderHistory()

  await userEvent.click(await screen.findByRole('button', { name: 'Open: a red fox' }))
  await userEvent.click(screen.getByRole('button', { name: 'Copy prompt' }))
  expect(writeText).toHaveBeenLastCalledWith('a red fox')
  await userEvent.click(screen.getByRole('button', { name: 'Copy negative prompt' }))
  expect(writeText).toHaveBeenLastCalledWith('blurry')
  expect(screen.getAllByText('Copied')).not.toHaveLength(0)
})

it('exports what the filters show', async () => {
  fetchHistory.mockResolvedValue(page(2))
  renderHistory()
  expect(await screen.findByRole('link', { name: 'Export' })).toHaveAttribute('href', '/api/history/export')

  await userEvent.click(screen.getByRole('button', { name: '★ Favourites' }))
  expect(await screen.findByRole('link', { name: 'Export these' })).toHaveAttribute('href', '/api/history/export?favourites=true')
})

const viewer = () => screen.getByRole('dialog', { name: 'Image details' })
const shownImage = () => within(viewer()).getByRole('img')

it('moves between images with the side buttons and the arrow keys, disabled at the ends', async () => {
  serveHistory(3)
  renderHistory()
  await userEvent.click(await screen.findByRole('button', { name: 'Open: image 3' }))

  expect(within(viewer()).getByText('1 of 3')).toBeInTheDocument()
  expect(within(viewer()).getByRole('button', { name: 'Previous image' })).toBeDisabled()
  await userEvent.click(within(viewer()).getByRole('button', { name: 'Next image' }))
  expect(shownImage()).toHaveAccessibleName('image 2')
  await userEvent.keyboard('{ArrowRight}')
  expect(shownImage()).toHaveAccessibleName('image 1')
  expect(within(viewer()).getByText('3 of 3')).toBeInTheDocument()
  expect(within(viewer()).getByRole('button', { name: 'Next image' })).toBeDisabled()

  await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
  expect(shownImage()).toHaveAccessibleName('image 3')
})

it('crosses into the next page, showing a placeholder while that image loads, and the page behind follows', async () => {
  serveHistory(PAGE_SIZE + 2)
  const next = deferred<HistoryPage>()
  renderHistory()
  await userEvent.click(await screen.findByRole('button', { name: 'Open: image 3' }))
  expect(within(viewer()).getByText(`${PAGE_SIZE} of ${PAGE_SIZE + 2}`)).toBeInTheDocument()

  const serve = fetchHistory.getMockImplementation()!
  // Only the viewer's own one-image request waits; the page list behind it answers as usual
  fetchHistory.mockImplementation((offset: number, limit: number, filters: HistoryFilters) =>
    limit === 1 && offset === PAGE_SIZE ? next.promise : serve(offset, limit, filters),
  )
  await userEvent.keyboard('{ArrowRight}')

  expect(fetchHistory).toHaveBeenCalledWith(PAGE_SIZE, 1, NO_FILTERS, expect.any(AbortSignal))
  expect(within(viewer()).queryByRole('img')).not.toBeInTheDocument()
  await act(async () => next.resolve(await serve(PAGE_SIZE, 1, NO_FILTERS)))
  expect(shownImage()).toHaveAccessibleName('image 2')
  expect(window.location.search).toBe('?page=2')

  await userEvent.keyboard('{ArrowLeft}')
  expect(shownImage()).toHaveAccessibleName('image 3')
  expect(window.location.search).toBe('')
})

it('stars with F, once', async () => {
  serveHistory(2)
  vi.mocked(api.setFavourite).mockImplementation(async (id: number, favourite: boolean) => historyItem({ id, prompt: `image ${id}`, favourite }))
  renderHistory()
  await userEvent.click(await screen.findByRole('button', { name: 'Open: image 2' }))

  await userEvent.keyboard('f')

  expect(api.setFavourite).toHaveBeenCalledExactlyOnceWith(2, true)
  expect(await within(viewer()).findByRole('button', { name: 'Remove from favourites' })).toBeInTheDocument()
})

it('deletes with the Delete key only on a second press', async () => {
  serveHistory(2)
  renderHistory()
  await userEvent.click(await screen.findByRole('button', { name: 'Open: image 2' }))

  await userEvent.keyboard('{Delete}')
  expect(within(viewer()).getByRole('status')).toHaveTextContent('Press Delete again to delete')
  expect(api.deleteHistoryItem).not.toHaveBeenCalled()

  await userEvent.keyboard('{Delete}')
  expect(api.deleteHistoryItem).toHaveBeenCalledExactlyOnceWith(2)
  expect(await within(viewer()).findByRole('img', { name: 'image 1' })).toBeInTheDocument()
})

it('ignores the keys while typing, and closes on Escape', async () => {
  serveHistory(2)
  renderHistory()
  await userEvent.click(await screen.findByRole('button', { name: 'Open: image 2' }))
  const input = document.body.appendChild(document.createElement('input'))
  input.focus()

  await userEvent.keyboard('{ArrowRight}f')
  expect(shownImage()).toHaveAccessibleName('image 2')
  expect(api.setFavourite).not.toHaveBeenCalled()

  input.remove()
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('zooms to 100% and back, by click or button', async () => {
  serveHistory(1)
  renderHistory()
  await userEvent.click(await screen.findByRole('button', { name: 'Open: image 1' }))

  await userEvent.click(shownImage())
  expect(within(viewer()).getByRole('button', { name: 'Fit to window' })).toBeInTheDocument()
  await userEvent.click(within(viewer()).getByRole('button', { name: 'Fit to window' }))
  expect(within(viewer()).getByRole('button', { name: 'Zoom to 100%' })).toBeInTheDocument()
})

it('goes full screen with the button or Z, and leaves it again', async () => {
  let fullScreenElement: Element | null = null
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullScreenElement })
  const request = vi.fn(async () => {
    fullScreenElement = request.mock.contexts.at(-1) as Element
    document.dispatchEvent(new Event('fullscreenchange'))
  })
  const exit = vi.fn(async () => {
    fullScreenElement = null
    document.dispatchEvent(new Event('fullscreenchange'))
  })
  Element.prototype.requestFullscreen = request
  document.exitFullscreen = exit
  serveHistory(1)
  renderHistory()
  await userEvent.click(await screen.findByRole('button', { name: 'Open: image 1' }))

  await userEvent.click(within(viewer()).getByRole('button', { name: 'Full screen' }))
  expect(request).toHaveBeenCalledOnce()
  expect(within(viewer()).getByRole('button', { name: 'Leave full screen' })).toBeInTheDocument()

  await userEvent.keyboard('z')
  expect(exit).toHaveBeenCalledOnce()
  expect(within(viewer()).getByRole('button', { name: 'Full screen' })).toBeInTheDocument()
})

it('puts each History dialog\'s buttons in its actions footer, and the image view\'s beside the image', async () => {
  serveHistory(2)
  renderHistory()
  const footer = () => within(screen.getByRole('group', { name: 'Dialog actions' }))

  await userEvent.click(await screen.findByRole('button', { name: 'Delete all' }))
  expect(footer().getByRole('button', { name: 'Delete all' })).toBeInTheDocument()
  await userEvent.click(footer().getByRole('button', { name: 'Cancel' }))

  await userEvent.click(screen.getByRole('button', { name: 'Clean up' }))
  expect(footer().getByRole('button', { name: /^Delete|^No images/ })).toBeInTheDocument()
  await userEvent.click(footer().getByRole('button', { name: 'Cancel' }))

  await userEvent.click(screen.getByRole('button', { name: 'Open: image 2' }))
  // The image view has two columns, so its actions sit at the bottom of the details column instead
  expect(screen.queryByRole('group', { name: 'Dialog actions' })).not.toBeInTheDocument()
  const imageActions = within(screen.getByRole('group', { name: 'Image actions' }))
  expect(imageActions.getAllByRole('button').map((button) => button.textContent)).toEqual(['Delete', 'Reuse settings'])
  expect(imageActions.getByRole('link', { name: 'Download' })).toBeInTheDocument()
})

it('keeps the Clean up delete button neutral while the counts load', async () => {
  vi.mocked(api.fetchHistorySummary).mockReturnValue(deferred<typeof summary>().promise)
  fetchHistory.mockResolvedValue(page(2))
  renderHistory()

  await userEvent.click(await screen.findByRole('button', { name: 'Clean up' }))

  const deleteButton = within(screen.getByRole('group', { name: 'Dialog actions' })).getByRole('button', { name: 'Delete' })
  expect(deleteButton).toBeDisabled()
  expect(screen.queryByText(/No images older/)).not.toBeInTheDocument()
})
