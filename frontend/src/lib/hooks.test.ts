import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useCopyToClipboard } from './hooks'

afterEach(() => vi.restoreAllMocks())

it('copies on a page that is not secure, where navigator.clipboard does not exist', async () => {
  const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
  const copied: string[] = []
  document.execCommand = vi.fn(() => {
    copied.push(document.querySelector('textarea')?.value ?? '')
    return true
  })
  const { result } = renderHook(() => useCopyToClipboard())

  await act(() => result.current[1]('seed 42'))

  expect(copied).toEqual(['seed 42'])
  expect(result.current[0]).toBe(true)
  expect(document.querySelector('textarea')).toBeNull()
  if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard)
  else delete (navigator as { clipboard?: unknown }).clipboard
})
