import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as api from './api'
import App from './App'
import { catalog, deferred, historyItem } from './test/fixtures'
import type { HistoryItem } from './types'
import { chooseOption } from './test/select'

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  fetchCatalog: vi.fn(),
  fetchModelStatus: vi.fn(),
  generateImage: vi.fn(),
  fetchJobProgress: vi.fn(),
  cancelJob: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(api.fetchCatalog).mockResolvedValue(catalog)
  const ready = { status: 'ready' as const, size_bytes: 1 }
  vi.mocked(api.fetchModelStatus).mockResolvedValue({ server_running: true, models: { 'z-image-turbo': ready, 'wai-illustrious': ready }, free_bytes: 1e11 })
  vi.mocked(api.generateImage).mockReset()
  vi.mocked(api.fetchJobProgress).mockReturnValue(new Promise(() => {}))
  vi.mocked(api.cancelJob).mockReset().mockResolvedValue()
})

it('generates exactly once and shows the image only after it arrives', async () => {
  const pending = deferred<HistoryItem>()
  vi.mocked(api.generateImage).mockReturnValue(pending.promise)
  render(<App />)

  await userEvent.type(await screen.findByLabelText('Prompt'), 'a red fox')
  const generate = screen.getByRole('button', { name: 'Generate' })
  await userEvent.dblClick(generate)

  expect(api.generateImage).toHaveBeenCalledOnce()
  expect(vi.mocked(api.generateImage).mock.calls[0][0]).toMatchObject({ prompt: 'a red fox', modelId: 'z-image-turbo' })
  expect(screen.getByRole('button', { name: 'Generating…' })).toBeDisabled()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()

  pending.resolve(historyItem({ id: 3, prompt: 'a red fox' }))

  expect(await screen.findByRole('img', { name: 'a red fox' })).toHaveAttribute('src', '/api/history/3/image')
  expect(api.generateImage).toHaveBeenCalledOnce()
})

it('resets sampling when switching model and offers the remaining defaults', async () => {
  render(<App />)

  await userEvent.click(await screen.findByRole('button', { name: 'Change' }))
  await userEvent.click(screen.getByRole('radio', { name: /WAI-Illustrious/ }))
  expect(screen.getByLabelText('Steps')).toHaveValue(28)
  expect(screen.getByLabelText('Guidance (CFG)')).toHaveValue(7)
  expect(screen.getByText(/Sampling was reset to WAI-Illustrious’s defaults/)).toBeInTheDocument()
  expect(screen.getByLabelText('Negative prompt')).toHaveValue('')

  await userEvent.click(screen.getByRole('button', { name: 'Use defaults' }))
  expect(screen.getByLabelText('Negative prompt')).toHaveValue('nsfw, low quality')
  expect(screen.queryByText(/Sampling was reset/)).not.toBeInTheDocument()
})

it('fills the prompt from an example card, with each model offering its own examples', async () => {
  render(<App />)

  await userEvent.type(await screen.findByLabelText('Prompt'), 'my own idea')
  await userEvent.click(screen.getByRole('button', { name: 'Example #2' }))
  expect(screen.getByLabelText('Prompt')).toHaveValue('A lighthouse at dawn')

  await userEvent.click(screen.getByRole('button', { name: 'Change' }))
  await userEvent.click(screen.getByRole('radio', { name: /WAI-Illustrious/ }))
  expect(screen.queryByRole('button', { name: 'Example #2' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Example #1' }))
  expect(screen.getByLabelText('Prompt')).toHaveValue('1girl, adult woman, kimono')
})

it('shows no example cards for a model without examples', async () => {
  vi.mocked(api.fetchCatalog).mockResolvedValue({ ...catalog, models: catalog.models.map((model) => ({ ...model, examples: [] })) })
  render(<App />)

  await screen.findByLabelText('Prompt')
  expect(screen.queryByRole('button', { name: /^Example #/ })).not.toBeInTheDocument()
})

it('cancels the running generation once and goes back to the previous result without an error', async () => {
  const first = historyItem({ id: 3, prompt: 'a red fox' })
  vi.mocked(api.generateImage).mockResolvedValueOnce(first)
  render(<App />)
  await userEvent.type(await screen.findByLabelText('Prompt'), 'a red fox')
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  expect(await screen.findByRole('img', { name: 'a red fox' })).toBeInTheDocument()

  const second = deferred<HistoryItem>()
  vi.mocked(api.generateImage).mockReturnValueOnce(second.promise)
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  const jobId = vi.mocked(api.generateImage).mock.calls[1][1]
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await userEvent.click(screen.getByRole('button', { name: 'Cancelling…' }))

  expect(api.cancelJob).toHaveBeenCalledOnce()
  expect(api.cancelJob).toHaveBeenCalledWith(jobId)

  second.reject(new api.ApiError('Cancelled', api.CANCELLED_STATUS))

  expect(await screen.findByRole('img', { name: 'a red fox' })).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled()
})

it('shows a retryable error when the catalog cannot load', async () => {
  vi.mocked(api.fetchCatalog).mockRejectedValueOnce(new Error('Could not reach the app server'))
  render(<App />)

  await userEvent.click(await screen.findByRole('button', { name: 'Retry' }))

  expect(await screen.findByRole('button', { name: 'Generate' })).toBeInTheDocument()
})

it('fills the Write box from the prompt builder dialog, then generates with it', async () => {
  vi.mocked(api.generateImage).mockResolvedValue(historyItem())
  render(<App />)

  await userEvent.click(await screen.findByRole('button', { name: /Prompt builder/ }))
  const dialog = screen.getByRole('dialog', { name: 'Prompt builder' })
  await chooseOption(within(dialog).getByLabelText('Who'), 'man')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Use this prompt' }))

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Prompt')).toHaveValue('Photo of an adult man.')
  expect(api.generateImage).not.toHaveBeenCalled()

  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  expect(vi.mocked(api.generateImage).mock.calls[0][0]).toMatchObject({
    prompt: 'Photo of an adult man.',
    negativePrompt: expect.stringContaining('extra fingers'),
  })
})

afterEach(() => window.history.replaceState(null, '', '/'))

const currentView = () => within(screen.getByRole('navigation', { name: 'Views' })).getByRole('button', { current: 'page' })

it('opens the view named in the address, so a reload keeps it', async () => {
  window.history.replaceState(null, '', '/history')
  render(<App />)
  expect(await screen.findByRole('navigation', { name: 'Views' })).toBeInTheDocument()
  expect(currentView()).toHaveTextContent('History')
})

it('puts the view in the address, and Back returns to the previous view', async () => {
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: 'History' }))
  expect(window.location.pathname).toBe('/history')
  expect(currentView()).toHaveTextContent('History')

  await act(async () => window.history.back())

  await waitFor(() => expect(currentView()).toHaveTextContent('Create'))
  expect(window.location.pathname).toBe('/')
})

it('opens Create for any other address', async () => {
  window.history.replaceState(null, '', '/not-a-view')
  render(<App />)
  expect(await screen.findByRole('navigation', { name: 'Views' })).toBeInTheDocument()
  expect(currentView()).toHaveTextContent('Create')
})
