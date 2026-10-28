import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import * as api from '../api'
import { ApiError } from '../api'
import { catalog, deferred } from '../test/fixtures'
import type { Loadable, ModelState, ModelStatus, ModelStatusReport } from '../types'
import { ModelPicker } from './ModelPicker'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  downloadModel: vi.fn(),
  removeModel: vi.fn(),
}))

const GB = 1_000_000_000
const state = (status: ModelStatus, size_bytes = 0): ModelState => ({ status, size_bytes })
const report = (models: Record<string, ModelState>, free_bytes = 214 * GB): Loadable<ModelStatusReport> => ({
  status: 'settled',
  value: { server_running: true, models, free_bytes },
})
const bothReady = report({ 'z-image-turbo': state('ready', 5.5 * GB), 'wai-illustrious': state('ready', 6.6 * GB) })

beforeEach(() => {
  vi.mocked(api.downloadModel).mockReset()
  vi.mocked(api.removeModel).mockReset()
})

function renderPicker(status: Loadable<ModelStatusReport> = bothReady, selectedId = 'z-image-turbo') {
  const handlers = { onSelect: vi.fn(), onStatusChanged: vi.fn() }
  render(<ModelPicker models={catalog.models} categories={catalog.model_categories} selectedId={selectedId} status={status} {...handlers} />)
  return handlers
}

const sidebar = () => screen.getByRole('group', { name: 'Selected model' })
const openDialog = () => userEvent.click(screen.getByRole('button', { name: 'Change' }))
const dialog = () => screen.getByRole('dialog', { name: 'Choose a model' })

it('shows only the selected model in the sidebar', () => {
  renderPicker(bothReady, 'wai-illustrious')
  expect(sidebar()).toHaveTextContent('WAI-Illustrious')
  expect(screen.queryByText('Z-Image-Turbo')).not.toBeInTheDocument()
  expect(screen.queryByRole('radio')).not.toBeInTheDocument()
})

it('chooses a downloaded model in the dialog, which then closes', async () => {
  const { onSelect } = renderPicker()
  await openDialog()
  expect(within(dialog()).getByRole('radio', { name: /Z-Image-Turbo/ })).toHaveAttribute('aria-checked', 'true')
  await userEvent.click(within(dialog()).getByRole('radio', { name: /WAI-Illustrious/ }))

  expect(onSelect).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'wai-illustrious' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('closes the dialog without changing anything', async () => {
  const { onSelect } = renderPicker()
  await openDialog()
  await userEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(onSelect).not.toHaveBeenCalled()
})

it('shows storage use and free space', async () => {
  renderPicker()
  await openDialog()
  expect(within(dialog()).getByText(/Models use/)).toHaveTextContent('Models use 12.1 GB · 214.0 GB free')
})

it('downloads a model after confirming, then refreshes the status', async () => {
  vi.mocked(api.downloadModel).mockResolvedValue(state('queued'))
  const { onSelect, onStatusChanged } = renderPicker(report({ 'z-image-turbo': state('ready'), 'wai-illustrious': state('missing') }))
  await openDialog()

  expect(within(dialog()).getByRole('radio', { name: /WAI-Illustrious/ })).toBeDisabled()
  await userEvent.click(within(dialog()).getByRole('button', { name: 'Download WAI-Illustrious' }))
  expect(api.downloadModel).not.toHaveBeenCalled()
  expect(dialog()).toHaveTextContent('Downloads ~13 GB, keeps 6.6 GB · 214.0 GB free')
  await userEvent.click(within(dialog()).getByRole('button', { name: 'Download' }))

  expect(api.downloadModel).toHaveBeenCalledExactlyOnceWith('wai-illustrious')
  expect(onStatusChanged).toHaveBeenCalledOnce()
  expect(onSelect).not.toHaveBeenCalled()
})

it('shows why a download was refused', async () => {
  vi.mocked(api.downloadModel).mockRejectedValue(new ApiError('Not enough disk space: free about 2.0 GB more, then try again.', 507))
  const { onStatusChanged } = renderPicker(report({ 'z-image-turbo': state('ready'), 'wai-illustrious': state('failed') }))
  await openDialog()

  await userEvent.click(within(dialog()).getByRole('button', { name: 'Download WAI-Illustrious' }))
  await userEvent.click(within(dialog()).getByRole('button', { name: 'Download' }))

  expect(await within(dialog()).findByRole('alert')).toHaveTextContent('free about 2.0 GB more')
  expect(onStatusChanged).not.toHaveBeenCalled()
})

it('shows a working state while the request is pending', async () => {
  const pending = deferred<ModelState>()
  vi.mocked(api.downloadModel).mockReturnValue(pending.promise)
  const { onStatusChanged } = renderPicker(report({ 'z-image-turbo': state('ready'), 'wai-illustrious': state('missing') }))
  await openDialog()
  await userEvent.click(within(dialog()).getByRole('button', { name: 'Download WAI-Illustrious' }))
  await userEvent.click(within(dialog()).getByRole('button', { name: 'Download' }))

  expect(within(dialog()).getByText('Working…')).toBeInTheDocument()
  expect(onStatusChanged).not.toHaveBeenCalled()
  pending.resolve(state('queued'))
  await vi.waitFor(() => expect(onStatusChanged).toHaveBeenCalledOnce())
})

it('removes another downloaded model after confirming, but not the one in use', async () => {
  vi.mocked(api.removeModel).mockResolvedValue()
  const { onStatusChanged } = renderPicker()
  await openDialog()

  expect(within(dialog()).queryByRole('button', { name: 'Remove Z-Image-Turbo' })).not.toBeInTheDocument()
  expect(dialog()).toHaveTextContent('In use')
  await userEvent.click(within(dialog()).getByRole('button', { name: 'Remove WAI-Illustrious' }))
  expect(dialog()).toHaveTextContent('Frees 6.6 GB; downloading again takes ~13 GB')
  await userEvent.click(within(dialog()).getByRole('button', { name: 'Remove' }))

  expect(api.removeModel).toHaveBeenCalledExactlyOnceWith('wai-illustrious')
  expect(onStatusChanged).toHaveBeenCalledOnce()
})

it('shows download progress', async () => {
  renderPicker(report({ 'z-image-turbo': state('downloading', 4.1 * GB), 'wai-illustrious': state('queued') }))
  expect(sidebar()).toHaveTextContent('Downloading · 4.1 GB of 31 GB')
  expect(within(sidebar()).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '13')
  await openDialog()
  expect(within(dialog()).getByRole('radio', { name: /WAI-Illustrious/ })).toHaveTextContent('Queued for download · ~13 GB')
})

it('shows a checking placeholder, not a download state, while status is loading', () => {
  renderPicker({ status: 'pending' })
  expect(within(sidebar()).getByText('Checking download…')).toBeInTheDocument()
  expect(screen.queryByText(/Not downloaded/)).not.toBeInTheDocument()
})

it.each<[string, Loadable<ModelStatusReport>]>([
  ['the server is down', { status: 'settled', value: { server_running: false, models: {}, free_bytes: null } }],
  ['the status request failed', { status: 'failed', error: 'Could not reach the app server' }],
])('explains how to start the model server when %s, without locking any model', async (_, status) => {
  renderPicker(status)
  expect(screen.getByRole('status')).toHaveTextContent('uv run python backend/model_server.py')
  await openDialog()
  expect(within(dialog()).getByRole('radio', { name: /WAI-Illustrious/ })).toBeEnabled()
})

it('groups models by category and filters with the category tabs', async () => {
  renderPicker()
  await openDialog()
  expect(within(dialog()).getByRole('tab', { name: 'All 2' })).toHaveAttribute('aria-selected', 'true')
  expect(within(within(dialog()).getByRole('region', { name: 'Photorealistic' })).getByRole('radio')).toHaveAccessibleName(/Z-Image-Turbo/)

  await userEvent.click(within(dialog()).getByRole('tab', { name: 'Anime & illustration 1' }))
  expect(within(dialog()).getAllByRole('radio').map((radio) => radio.textContent)).toEqual([expect.stringContaining('WAI-Illustrious')])
})

it('links models to their Hugging Face pages without selecting them', async () => {
  const { onSelect } = renderPicker()
  expect(within(sidebar()).getByRole('link', { name: 'Open Z-Image-Turbo on Hugging Face' })).toHaveAttribute('href', 'https://huggingface.co/Tongyi-MAI/Z-Image-Turbo')
  await openDialog()
  const link = screen.getByRole('link', { name: 'Open WAI-Illustrious on Hugging Face' })
  expect(link).toHaveAttribute('target', '_blank')
  await userEvent.click(link)
  expect(onSelect).not.toHaveBeenCalled()
})
