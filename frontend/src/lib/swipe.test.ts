import { renderHook } from '@testing-library/react'
import type { PointerEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useSwipe } from './swipe'

const at = (x: number, y: number, pointerType = 'touch') => ({ clientX: x, clientY: y, pointerType }) as PointerEvent

function swiped(from: [number, number], to: [number, number], options: { pointerType?: string; enabled?: boolean } = {}) {
  const onPrevious = vi.fn()
  const onNext = vi.fn()
  const { result } = renderHook(() => useSwipe(onPrevious, onNext, options.enabled ?? true))
  result.current.onPointerDown(at(...from, options.pointerType))
  result.current.onPointerUp(at(...to, options.pointerType))
  return { onPrevious, onNext }
}

describe('useSwipe', () => {
  it('goes to the next image on a swipe to the left, and the previous one on a swipe to the right, once each', () => {
    const left = swiped([300, 200], [150, 210])
    expect(left.onNext).toHaveBeenCalledOnce()
    expect(left.onPrevious).not.toHaveBeenCalled()
    const right = swiped([100, 200], [260, 190])
    expect(right.onPrevious).toHaveBeenCalledOnce()
    expect(right.onNext).not.toHaveBeenCalled()
  })

  it.each([
    ['a short drag', [200, 200], [170, 200], {}],
    ['a mostly vertical scroll', [200, 100], [140, 300], {}],
    ['a mouse drag', [300, 200], [100, 200], { pointerType: 'mouse' }],
    ['a swipe while switched off (zoomed in)', [300, 200], [100, 200], { enabled: false }],
  ] as const)('ignores %s', (_, from, to, options) => {
    const { onPrevious, onNext } = swiped([...from] as [number, number], [...to] as [number, number], options)
    expect(onPrevious).not.toHaveBeenCalled()
    expect(onNext).not.toHaveBeenCalled()
  })
})
