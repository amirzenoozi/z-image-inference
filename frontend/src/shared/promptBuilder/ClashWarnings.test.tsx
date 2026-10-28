import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { ClashWarnings } from './ClashWarnings'

it('names the clashing choices in plain words', () => {
  render(<ClashWarnings clashes={[{ kind: 'hands', values: ['standing both hands on hips', 'sliding hand down body'] }, { kind: 'hair', values: ['low ponytail', 'buzzed'] }]} />)
  expect(screen.getByRole('status')).toHaveTextContent('These choices contradict each other')
  expect(screen.getByText('“standing both hands on hips” and “sliding hand down body” need more than two hands, so the model may draw extra hands or arms.')).toBeInTheDocument()
  expect(screen.getByText('“low ponytail” can\'t be done with “buzzed” hair.')).toBeInTheDocument()
})

it('shows nothing when nothing clashes', () => {
  const { container } = render(<ClashWarnings clashes={[]} />)
  expect(container).toBeEmptyDOMElement()
})
