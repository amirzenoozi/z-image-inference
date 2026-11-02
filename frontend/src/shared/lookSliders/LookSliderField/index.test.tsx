import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { weightSlider } from '../../../test/fixtures'
import { LookSliderField } from '.'

it('shows the slider’s name and strength, a tick for every step, and its range', () => {
  const { container } = render(<LookSliderField addon={weightSlider} value={-3} onChange={vi.fn()} />)
  expect(screen.getByRole('slider', { name: 'Weight slider' })).toHaveValue('-3')
  const [minimum, ticks, maximum] = container.querySelectorAll('[aria-hidden="true"]')
  expect([minimum.textContent, maximum.textContent]).toEqual(['-10', '10'])
  expect(ticks.children).toHaveLength(21)
})

it('says Off at 0 and reports a moved strength as a number', () => {
  const onChange = vi.fn()
  render(<LookSliderField addon={weightSlider} value={0} onChange={onChange} />)
  expect(screen.getByText('Off')).toBeInTheDocument()
  fireEvent.change(screen.getByRole('slider'), { target: { value: '4' } })
  expect(onChange).toHaveBeenCalledExactlyOnceWith(4)
})
