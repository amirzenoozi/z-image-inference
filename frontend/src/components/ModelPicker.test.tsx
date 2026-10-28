import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { catalog } from '../test/fixtures'
import type { Loadable, ModelStatusReport } from '../types'
import { ModelPicker } from './ModelPicker'

const report = (models: ModelStatusReport['models']): Loadable<ModelStatusReport> => ({ status: 'settled', value: { server_running: true, models } })

function renderPicker(status: Loadable<ModelStatusReport> = report({}), selectedId = 'z-image-turbo') {
  const onSelect = vi.fn()
  render(<ModelPicker models={catalog.models} selectedId={selectedId} status={status} onSelect={onSelect} />)
  return onSelect
}

const sidebar = () => screen.getByRole('group', { name: 'Selected model' })
const openDialog = () => userEvent.click(screen.getByRole('button', { name: 'Change' }))

it('shows only the selected model in the sidebar', () => {
  renderPicker(report({}), 'wai-illustrious')
  expect(sidebar()).toHaveTextContent('WAI-Illustrious')
  expect(screen.queryByText('Z-Image-Turbo')).not.toBeInTheDocument()
  expect(screen.queryByRole('radio')).not.toBeInTheDocument()
})

it('chooses a model in a dialog, which then closes', async () => {
  const onSelect = renderPicker()
  await openDialog()

  const dialog = screen.getByRole('dialog', { name: 'Choose a model' })
  expect(within(dialog).getAllByRole('radio')).toHaveLength(2)
  expect(within(dialog).getByRole('radio', { name: /Z-Image-Turbo/ })).toHaveAttribute('aria-checked', 'true')
  await userEvent.click(within(dialog).getByRole('radio', { name: /WAI-Illustrious/ }))

  expect(onSelect).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'wai-illustrious' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('closes the dialog without changing anything', async () => {
  const onSelect = renderPicker()
  await openDialog()
  await userEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(onSelect).not.toHaveBeenCalled()
})

it('shows a checking placeholder, not a download badge, while status is loading', () => {
  renderPicker({ status: 'pending' })
  expect(within(sidebar()).getByText('Checking download…')).toBeInTheDocument()
  expect(screen.queryByText(/Not downloaded yet/)).not.toBeInTheDocument()
})

it('shows download states in the sidebar and in the dialog', async () => {
  renderPicker(report({ 'z-image-turbo': 'downloading', 'wai-illustrious': 'queued' }))
  expect(sidebar()).toHaveTextContent('Downloading · ~31 GB')
  await openDialog()
  expect(screen.getByRole('radio', { name: /WAI-Illustrious/ })).toHaveTextContent('Queued for download · ~13 GB')
})

it.each([
  ['missing', 'Not downloaded yet · ~31 GB'],
  ['failed', 'Download failed · retries when you generate'],
] as const)('labels a %s model', (state, text) => {
  renderPicker(report({ 'z-image-turbo': state }))
  expect(sidebar()).toHaveTextContent(text)
})

it.each<[string, Loadable<ModelStatusReport>]>([
  ['the server is down', { status: 'settled', value: { server_running: false, models: {} } }],
  ['the status request failed', { status: 'failed', error: 'Could not reach the app server' }],
])('explains how to start the model server when %s', (_, status) => {
  renderPicker(status)
  expect(screen.getByRole('status')).toHaveTextContent('uv run python model_server.py')
  expect(screen.queryByText(/Not downloaded yet/)).not.toBeInTheDocument()
})

it('links models to their Hugging Face pages without selecting them', async () => {
  const onSelect = renderPicker()
  expect(within(sidebar()).getByRole('link', { name: 'Open Z-Image-Turbo on Hugging Face' })).toHaveAttribute('href', 'https://huggingface.co/Tongyi-MAI/Z-Image-Turbo')

  await openDialog()
  const link = screen.getByRole('link', { name: 'Open WAI-Illustrious on Hugging Face' })
  expect(link).toHaveAttribute('href', 'https://huggingface.co/votepurchase/waiNSFWIllustrious_v120')
  expect(link).toHaveAttribute('target', '_blank')
  expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  await userEvent.click(link)
  expect(onSelect).not.toHaveBeenCalled()
})
