import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { catalog } from '../test/fixtures'
import type { Loadable, ModelStatusReport } from '../types'
import { ModelPicker } from './ModelPicker'

function renderPicker(status: Loadable<ModelStatusReport>) {
  render(<ModelPicker models={catalog.models} selectedId="z-image-turbo" status={status} onSelect={vi.fn()} />)
}

const report = (models: ModelStatusReport['models']): Loadable<ModelStatusReport> => ({ status: 'settled', value: { server_running: true, models } })

it('shows a checking placeholder, not a download badge, while status is loading', () => {
  renderPicker({ status: 'pending' })
  expect(screen.getAllByText('Checking download…')).toHaveLength(2)
  expect(screen.queryByText(/Not downloaded yet/)).not.toBeInTheDocument()
})

it('shows each model’s download state', () => {
  renderPicker(report({ 'z-image-turbo': 'ready', 'wai-illustrious': 'downloading' }))
  expect(screen.getByRole('radio', { name: /WAI-Illustrious/ })).toHaveTextContent('Downloading · ~13 GB')
  expect(screen.getByRole('radio', { name: /Z-Image-Turbo/ })).not.toHaveTextContent(/Download/)
})

it.each([
  ['missing', 'Not downloaded yet · ~13 GB'],
  ['queued', 'Queued for download · ~13 GB'],
  ['failed', 'Download failed · retries when you generate'],
] as const)('labels a %s model', (state, text) => {
  renderPicker(report({ 'z-image-turbo': 'ready', 'wai-illustrious': state }))
  expect(screen.getByRole('radio', { name: /WAI-Illustrious/ })).toHaveTextContent(text)
})

it.each<[string, Loadable<ModelStatusReport>]>([
  ['the server is down', { status: 'settled', value: { server_running: false, models: {} } }],
  ['the status request failed', { status: 'failed', error: 'Could not reach the app server' }],
])('explains how to start the model server when %s', (_, status) => {
  renderPicker(status)
  expect(screen.getByRole('status')).toHaveTextContent('uv run python model_server.py')
  expect(screen.queryByText(/Not downloaded yet/)).not.toBeInTheDocument()
})

it('links each model to its Hugging Face page without selecting it', async () => {
  const onSelect = vi.fn()
  render(<ModelPicker models={catalog.models} selectedId="z-image-turbo" status={report({})} onSelect={onSelect} />)

  const link = screen.getByRole('link', { name: 'Open WAI-Illustrious on Hugging Face' })
  expect(link).toHaveAttribute('href', 'https://huggingface.co/votepurchase/waiNSFWIllustrious_v120')
  expect(link).toHaveAttribute('target', '_blank')
  expect(link).toHaveAttribute('rel', 'noopener noreferrer')

  await userEvent.click(link)
  expect(onSelect).not.toHaveBeenCalled()
})
