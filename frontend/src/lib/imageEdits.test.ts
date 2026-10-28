import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { historyItem } from '../test/fixtures'
import { NO_EDITS, centredCrop, describeEdits, flip, toRecipe, turn, turnedSize, useEditHistory, withRatio } from './imageEdits'

const wide = historyItem({ width: 1024, height: 768 })

it('swaps width and height on a quarter turn', () => {
  expect(turnedSize(wide, 1)).toEqual({ width: 768, height: 1024 })
  expect(turnedSize(wide, 2)).toEqual({ width: 1024, height: 768 })
})

it('makes the largest centred crop of a shape', () => {
  expect(centredCrop(1, wide, 0)).toEqual({ unit: '%', x: 12.5, y: 0, width: 75, height: 100 })
  expect(centredCrop(1, wide, 1)).toEqual({ unit: '%', x: 0, y: 12.5, width: 100, height: 75 })
})

describe('the recipe sent to the server', () => {
  it('turns the crop into pixels of the turned image', () => {
    const edits = withRatio(turn(NO_EDITS, 1), '1:1', wide)
    expect(toRecipe(edits, wide)).toEqual({
      status: 'ready',
      recipe: { quarter_turns: 1, flip_horizontal: false, flip_vertical: false, crop: { x: 0, y: 128, width: 768, height: 768 } },
    })
  })

  it('refuses no edits and a crop too small to save', () => {
    expect(toRecipe(NO_EDITS, wide).status).toBe('invalid')
    const tiny = { ...NO_EDITS, crop: { unit: '%' as const, x: 0, y: 0, width: 1, height: 50 } }
    expect(toRecipe(tiny, wide)).toEqual({ status: 'invalid', reason: 'The crop must be at least 16 px on each side.' })
  })
})

it('starts the crop again after a turn or flip, which moves what it covered', () => {
  const cropped = withRatio(NO_EDITS, '1:1', wide)
  expect(turn(cropped, -1)).toMatchObject({ turns: 3, crop: null })
  expect(flip(cropped, 'vertical')).toMatchObject({ flipVertical: true, crop: null })
})

it('describes the edits in words', () => {
  const edits = withRatio(flip(turn(NO_EDITS, 1), 'horizontal'), '16:9', wide)
  expect(describeEdits(edits, wide)).toBe('Rotated 90° right · Flipped horizontally · Cropped to 768 × 432')
  expect(describeEdits(NO_EDITS, wide)).toBe('No edits yet')
})

it('undoes a dragged crop back to before the drag, not to its middle', () => {
  const { result } = renderHook(() => useEditHistory())
  const crop = (width: number) => ({ ...NO_EDITS, crop: { unit: '%' as const, x: 0, y: 0, width, height: 50 } })

  act(() => result.current.preview(crop(10)))
  act(() => result.current.preview(crop(30)))
  act(() => result.current.commit(crop(40)))
  expect(result.current.edits.crop?.width).toBe(40)

  act(() => result.current.undo())
  expect(result.current.edits).toEqual(NO_EDITS)
  expect(result.current.canUndo).toBe(false)
  act(() => result.current.redo())
  expect(result.current.edits.crop?.width).toBe(40)
})
