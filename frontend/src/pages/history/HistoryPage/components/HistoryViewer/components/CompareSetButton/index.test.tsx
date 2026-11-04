import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import * as api from '../../../../../../../api'
import { deferred, historyItem } from '../../../../../../../test/fixtures'
import type { HistoryItem } from '../../../../../../../types'
import { CompareSetButton } from '.'

vi.mock('../../../../../../../api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../../../../../../api')>()), fetchHistorySet: vi.fn() }))

const SET_ID = '0b6f6a52-1c4e-4b7e-9d2a-5f3c8e1a7b90'

beforeEach(() => vi.mocked(api.fetchHistorySet).mockReset())

it('loads the set, then opens its images in Compare', async () => {
  const set = deferred<HistoryItem[]>()
  vi.mocked(api.fetchHistorySet).mockReturnValue(set.promise)
  render(<CompareSetButton setId={SET_ID} labelOf={(id) => id} />)
  await userEvent.click(screen.getByRole('button', { name: 'Compare A/B set' }))
  expect(screen.getByRole('button', { name: 'Compare A/B set' })).toBeDisabled()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  set.resolve([historyItem({ id: 1, set_label: 'Weight -4' }), historyItem({ id: 2, set_label: 'Weight 6' })])
  expect(await screen.findByRole('heading', { name: 'Weight 6' })).toBeInTheDocument()
  expect(api.fetchHistorySet).toHaveBeenCalledExactlyOnceWith(SET_ID, expect.any(Boolean))
})

it('says so when only one image of the set is left', async () => {
  vi.mocked(api.fetchHistorySet).mockResolvedValue([historyItem({ id: 1 })])
  render(<CompareSetButton setId={SET_ID} labelOf={(id) => id} />)
  await userEvent.click(screen.getByRole('button', { name: 'Compare A/B set' }))
  expect(await screen.findByText(/Only one image of this A\/B set is left/)).toBeInTheDocument()
})

it('offers a retry when the set can’t load', async () => {
  vi.mocked(api.fetchHistorySet).mockRejectedValueOnce(new Error('Could not reach the app server')).mockResolvedValueOnce([historyItem({ id: 1 }), historyItem({ id: 2 })])
  render(<CompareSetButton setId={SET_ID} labelOf={(id) => id} />)
  await userEvent.click(screen.getByRole('button', { name: 'Compare A/B set' }))
  await userEvent.click(await screen.findByRole('button', { name: /Try again|Retry/ }))
  expect(api.fetchHistorySet).toHaveBeenCalledTimes(2)
})
