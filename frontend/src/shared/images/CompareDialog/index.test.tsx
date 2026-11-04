import { render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { historyItem } from '../../../test/fixtures'
import { CompareDialog } from '.'

const labelOf = (id: string) => (id === 'z-image-turbo' ? 'Z-Image-Turbo' : id)

it('labels an A/B test’s images and marks only what not every image shares', () => {
  const items = [
    historyItem({ id: 1, seed: 7, steps: 8, set_label: 'Weight -4' }),
    historyItem({ id: 2, seed: 7, steps: 8, set_label: 'Weight 2' }),
    historyItem({ id: 3, seed: 7, steps: 12, set_label: 'Weight 6' }),
  ]
  render(<CompareDialog items={items} labelOf={labelOf} title="A/B test results" onClose={vi.fn()} />)
  for (const label of ['Weight -4', 'Weight 2', 'Weight 6']) expect(screen.getByRole('heading', { name: label })).toBeInTheDocument()
  const third = screen.getAllByRole('img')[2].parentElement as HTMLElement
  expect(within(third).getByText(/12 steps/).textContent).toContain('(differs)')
  // 8 steps isn't shared by the third image either, so it is marked on the first two
  expect(screen.queryAllByText(/\(differs\)/).length).toBe(3)
})
