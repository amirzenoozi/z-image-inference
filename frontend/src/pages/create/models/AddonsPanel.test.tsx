import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import * as api from '../../../api'
import { animeModel, fastModel } from '../../../test/fixtures'
import type { Loadable, ModelStatus, ModelStatusReport } from '../../../types'
import { AddonsPanel } from './AddonsPanel'

vi.mock('../../../api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../../api')>()), downloadModel: vi.fn(), removeModel: vi.fn() }))

beforeEach(() => {
  vi.mocked(api.downloadModel).mockReset()
})

const tattooIs = (status: ModelStatus): Loadable<ModelStatusReport> => ({
  status: 'settled',
  value: { server_running: true, free_bytes: 50e9, models: { tattoo: { status, size_bytes: status === 'ready' ? 170e6 : 0 } } },
})

function renderPanel(status: Loadable<ModelStatusReport>, enabled: string[] = [], prompt = '') {
  const onChange = vi.fn()
  render(<AddonsPanel model={fastModel} enabled={enabled} prompt={prompt} status={status} onChange={onChange} onStatusChanged={vi.fn()} />)
  return onChange
}

const checkbox = () => screen.getByRole('checkbox', { name: /Tattoo/ })

it('shows nothing for a model without add-ons', () => {
  const { container } = render(<AddonsPanel model={animeModel} enabled={[]} prompt="" status={tattooIs('ready')} onChange={vi.fn()} onStatusChanged={vi.fn()} />)
  expect(container).toBeEmptyDOMElement()
})

it('waits for the download status before an add-on can be switched on', () => {
  renderPanel({ status: 'pending' }, ['tattoo'], 'a tattoo')
  expect(checkbox()).toBeDisabled()
  expect(checkbox()).not.toBeChecked()
  expect(screen.getByText('Checking download…')).toBeInTheDocument()
  expect(screen.queryByText(/^Used|^Not used/)).not.toBeInTheDocument()
})

it('offers to download an add-on that is missing, and only then lets it be switched on', async () => {
  vi.mocked(api.downloadModel).mockResolvedValue({ status: 'queued', size_bytes: 0 })
  renderPanel(tattooIs('missing'))
  expect(checkbox()).toBeDisabled()

  await userEvent.click(screen.getByRole('button', { name: 'Download Tattoo' }))
  await userEvent.click(screen.getByRole('button', { name: 'Download' }))

  expect(api.downloadModel).toHaveBeenCalledExactlyOnceWith('tattoo')
})

it('switches a downloaded add-on on, and says whether the prompt will use it', async () => {
  const onChange = renderPanel(tattooIs('ready'))
  await userEvent.click(checkbox())
  expect(onChange).toHaveBeenCalledExactlyOnceWith(['tattoo'])
})

it.each([
  ['a man with tattooed arms', /^Used: the prompt asks for it\.$/],
  ['a man on a beach', /^Not used: the prompt doesn’t mention “tattoo”, “tattoos”, or “tattooed”\.$/],
])('with the prompt "%s"', (prompt, note) => {
  renderPanel(tattooIs('ready'), ['tattoo'], prompt)
  expect(checkbox()).toBeChecked()
  expect(screen.getByText(note)).toBeInTheDocument()
})
