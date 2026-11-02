import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { LookSliderGroup } from '.'

it('puts the look sliders together under one Look heading', () => {
  render(<LookSliderGroup><p>Weight row</p></LookSliderGroup>)
  const group = screen.getByRole('region', { name: 'Look' })
  expect(group).toHaveTextContent('Look')
  expect(group).toHaveTextContent('Weight row')
})
