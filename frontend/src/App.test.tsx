import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import * as api from './api'
import App from './App'
import { catalog, deferred, historyItem } from './test/fixtures'
import type { HistoryItem } from './types'

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  fetchCatalog: vi.fn(),
  generateImage: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(api.fetchCatalog).mockResolvedValue(catalog)
  vi.mocked(api.generateImage).mockReset()
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

it('keeps settings when switching model and offers that model’s defaults', async () => {
  render(<App />)

  await userEvent.click(await screen.findByRole('radio', { name: /WAI-Illustrious/ }))
  expect(screen.getByText(/Your settings were kept/)).toBeInTheDocument()
  expect(screen.getByLabelText('Steps')).toHaveValue(9)

  await userEvent.click(screen.getByRole('button', { name: 'Use defaults' }))
  expect(screen.getByLabelText('Steps')).toHaveValue(28)
  expect(screen.getByLabelText('Negative prompt')).toHaveValue('nsfw, low quality')
  expect(screen.queryByText(/Your settings were kept/)).not.toBeInTheDocument()
})

it('shows a retryable error when the catalog cannot load', async () => {
  vi.mocked(api.fetchCatalog).mockRejectedValueOnce(new Error('Could not reach the app server'))
  render(<App />)

  await userEvent.click(await screen.findByRole('button', { name: 'Retry' }))

  expect(await screen.findByRole('button', { name: 'Generate' })).toBeInTheDocument()
})

it('generates from the prompt builder with its negative prompt', async () => {
  vi.mocked(api.generateImage).mockResolvedValue(historyItem())
  render(<App />)

  await userEvent.click(await screen.findByRole('tab', { name: 'Builder' }))
  expect(screen.queryByRole('button', { name: 'Generating…' })).not.toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('Subject'), 'adult woman')
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))

  expect(api.generateImage).toHaveBeenCalledOnce()
  expect(vi.mocked(api.generateImage).mock.calls[0][0]).toMatchObject({
    prompt: 'Photo of adult woman.',
    negativePrompt: expect.stringContaining('extra fingers'),
  })
})
