import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { animeModel, fastModel } from '../../test/fixtures'
import { SizeHint } from './SizeHint'

it('warns when the size is far below the model’s own, and offers the model’s size', async () => {
  const onUseModelSize = vi.fn()
  render(<SizeHint width={512} height={512} model={animeModel} onUseModelSize={onUseModelSize} />)

  expect(screen.getByText(/works best at about 1024×1024; at 512×512 its images come out soft/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Use 1024×1024' }))
  expect(onUseModelSize).toHaveBeenCalledOnce()
})

it.each([
  [768, 768, animeModel],
  [1024, 1024, animeModel],
  [512, 512, fastModel],
])('says nothing at %i×%i for a model made around that size', (width, height, model) => {
  render(<SizeHint width={width} height={height} model={model} onUseModelSize={vi.fn()} />)
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
