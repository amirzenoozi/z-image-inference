import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { weightSlider } from '../../../test/fixtures'
import { LookSliderField } from '.'

function renderField(value: number, defaultValue: number) {
  const handlers = { onChange: vi.fn(), onReset: vi.fn() }
  const { container } = render(<LookSliderField addon={weightSlider} value={value} defaultValue={defaultValue} {...handlers} />)
  return { ...handlers, container }
}

it('shows on one line the name, the range around the bar, and the strength', () => {
  renderField(-3, -3)
  expect(screen.getByRole('slider', { name: 'Weight slider' })).toHaveValue('-3')
  expect(screen.getByText('Weight')).toBeInTheDocument()
  expect(screen.getByText('-10')).toBeInTheDocument()
  expect(screen.getByText('10')).toBeInTheDocument()
})

it('marks 0 on the bar', () => {
  expect(renderField(4, -2).container.querySelector('[data-mark="zero"]')).toBeInTheDocument()
})

it('reports a moved strength as a number', () => {
  const { onChange } = renderField(0, 0)
  fireEvent.change(screen.getByRole('slider'), { target: { value: '4' } })
  expect(onChange).toHaveBeenCalledExactlyOnceWith(4)
})

it('offers a reset only once the slider is moved from its default', async () => {
  const { onReset } = renderField(4, -2)
  await userEvent.click(screen.getByRole('button', { name: 'Reset Weight' }))
  expect(onReset).toHaveBeenCalledTimes(1)
})

it('has no reset at its default', () => {
  renderField(-2, -2)
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
