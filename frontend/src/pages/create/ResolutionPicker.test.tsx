import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { animeModel, catalog, fastModel } from '../../test/fixtures'
import type { ModelInfo } from '../../types'
import { ResolutionPicker } from './ResolutionPicker'

function renderPicker(width: number, height: number, model: ModelInfo = fastModel) {
  const onChange = vi.fn()
  render(
    <ResolutionPicker
      width={width}
      height={height}
      model={model}
      resolutions={catalog.resolutions}
      categories={catalog.categories}
      limits={catalog.limits}
      onChange={onChange}
    />,
  )
  return onChange
}

it('opens on the category of the current size', () => {
  renderPicker(368, 640)
  expect(screen.getByRole('tab', { name: /Portrait/ })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('button', { name: /368×640/ })).toHaveAttribute('aria-pressed', 'true')
})

it('picks a preset from another category', async () => {
  const onChange = renderPicker(368, 640)
  await userEvent.click(screen.getByRole('tab', { name: /Square/ }))
  await userEvent.click(screen.getByRole('button', { name: /1024×1024/ }))
  expect(onChange).toHaveBeenCalledWith(1024, 1024)
})

it('disables sizes the model cannot produce and says why', async () => {
  renderPicker(1024, 1024, animeModel)
  const tooLarge = screen.getByRole('button', { name: /1280×1280/ })
  expect(tooLarge).toBeDisabled()
  expect(tooLarge).toHaveAttribute('title', expect.stringContaining('1216px'))
})

it('snaps a custom size to the allowed steps when leaving the field', async () => {
  const onChange = renderPicker(1000, 600)
  expect(screen.getByRole('tab', { name: /Custom/ })).toHaveAttribute('aria-selected', 'true')

  const width = screen.getByLabelText('Width')
  await userEvent.clear(width)
  await userEvent.type(width, '1000')
  expect(onChange).not.toHaveBeenCalled()
  fireEvent.blur(width)

  expect(onChange).toHaveBeenCalledExactlyOnceWith(1008, 608)
})

it('swaps width and height', async () => {
  const onChange = renderPicker(368, 640)
  await userEvent.click(screen.getByRole('tab', { name: /Custom/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Swap width and height' }))
  expect(onChange).toHaveBeenCalledWith(640, 368)
})
