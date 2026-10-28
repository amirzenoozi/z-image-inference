import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TOOLTIP_DELAY_MS } from '../lib/useTooltip'
import { IconButton } from './IconButton'

const tooltip = () => document.querySelector<HTMLElement>('[data-tooltip]')

function renderButton(onClick = vi.fn()) {
  render(
    <IconButton label="Next image" shortcut="→" onClick={onClick}>
      ›
    </IconButton>,
  )
  return onClick
}

function placeButtonAt(top: number) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, top, 32, 32))
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 24 })
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 90 })
}

beforeEach(() => placeButtonAt(300))
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

it('names the button by its label, and shows the tooltip only after a short pause on hover', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  renderButton()

  await user.hover(screen.getByRole('button', { name: 'Next image' }))
  expect(tooltip()).toBeNull()

  await act(() => vi.advanceTimersByTimeAsync(TOOLTIP_DELAY_MS))
  expect(tooltip()).toHaveTextContent('Next image→')
  expect(tooltip()!.querySelector('kbd')).toHaveTextContent('→')
  expect(tooltip()).toHaveAttribute('aria-hidden', 'true')

  await user.unhover(screen.getByRole('button'))
  expect(tooltip()).toBeNull()
})

it('never shows when the pointer leaves before the pause ends', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  renderButton()

  await user.hover(screen.getByRole('button'))
  await user.unhover(screen.getByRole('button'))
  await act(() => vi.advanceTimersByTimeAsync(TOOLTIP_DELAY_MS * 2))

  expect(tooltip()).toBeNull()
})

it('shows at once on keyboard focus, and hides on Escape and on blur', async () => {
  renderButton()

  await userEvent.tab()
  expect(tooltip()).toHaveTextContent('Next image')
  await userEvent.keyboard('{Escape}')
  expect(tooltip()).toBeNull()

  await userEvent.tab({ shift: true })
  await userEvent.tab()
  expect(tooltip()).not.toBeNull()
  await userEvent.tab()
  expect(tooltip()).toBeNull()
})

it('hides when clicked, and still clicks', async () => {
  const onClick = renderButton()
  await userEvent.tab()
  await userEvent.click(screen.getByRole('button'))
  expect(tooltip()).toBeNull()
  expect(onClick).toHaveBeenCalledOnce()
})

it('sits above the button, or below it when there is no room above', async () => {
  renderButton()
  await userEvent.tab()
  expect(tooltip()!.style.top).toBe(`${300 - 24 - 6}px`)
  await userEvent.tab({ shift: true })

  placeButtonAt(4)
  await userEvent.tab()
  expect(tooltip()!.style.top).toBe(`${4 + 32 + 6}px`)
  expect(tooltip()!.style.left).toBe(`${100 + 16 - 45}px`)
})
