import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { animeModel, fastModel } from '../../../test/fixtures'
import type { Loadable, ModelStatus, ModelStatusReport } from '../../../types'
import { AddonsPanel } from './AddonsPanel'

const tattooIs = (status: ModelStatus): Loadable<ModelStatusReport> => ({
  status: 'settled',
  value: { server_running: true, free_bytes: 50e9, models: { tattoo: { status, size_bytes: 0 } } },
})

function renderPanel(status: Loadable<ModelStatusReport>, enabled: string[] = [], model = fastModel) {
  const onChange = vi.fn()
  const { container } = render(<AddonsPanel model={model} enabled={enabled} status={status} onChange={onChange} />)
  return { onChange, container }
}

it('shows only a checkbox for each downloaded add-on of the selected model', async () => {
  const { onChange } = renderPanel(tattooIs('ready'))
  const box = screen.getByRole('checkbox', { name: 'Tattoo' })
  expect(box).not.toBeChecked()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  expect(screen.queryByRole('link')).not.toBeInTheDocument()

  await userEvent.click(box)
  expect(onChange).toHaveBeenCalledExactlyOnceWith(['tattoo'])
})

it('keeps a switched-on add-on ticked', () => {
  renderPanel(tattooIs('ready'), ['tattoo'])
  expect(screen.getByRole('checkbox', { name: 'Tattoo' })).toBeChecked()
})

it.each([
  ['the download status is still loading', { status: 'pending' } as const, fastModel],
  ['the add-on is not downloaded', tattooIs('missing'), fastModel],
  ['the model has no add-ons', tattooIs('ready'), animeModel],
])('shows nothing while %s', (_, status, model) => {
  const { container } = renderPanel(status, ['tattoo'], model)
  expect(container).toBeEmptyDOMElement()
})
