import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { lazy } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { LazyPart } from '.'

const original = window.location
afterEach(() => Object.defineProperty(window, 'location', { configurable: true, value: original }))

it('says the part couldn’t load, instead of a blank page, and reloads the page to retry', async () => {
  const reload = vi.fn()
  Object.defineProperty(window, 'location', { configurable: true, value: { ...original, reload } })
  // React reports the caught error to the console; it is expected here
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const Gone = lazy(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module')))
  render(
    <LazyPart fallback={<p>Loading…</p>}>
      <Gone />
    </LazyPart>,
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't load/)
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(reload).toHaveBeenCalledOnce()
})

it('shows its placeholder while the part loads, then the part', async () => {
  const Ready = lazy(async () => ({ default: () => <p>History</p> }))
  render(
    <LazyPart fallback={<p>Loading…</p>}>
      <Ready />
    </LazyPart>,
  )
  expect(screen.getByText('Loading…')).toBeInTheDocument()
  expect(await screen.findByText('History')).toBeInTheDocument()
})
