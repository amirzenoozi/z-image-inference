import { t } from '../i18n'
import { useCallback, useState } from 'react'
import type { PercentCrop } from 'react-image-crop'
import type { EditRecipe, HistoryItem } from '../types'

/** Matches the server: a smaller crop side is refused. */
export const MIN_CROP_SIDE = 16

export type RatioId = 'free' | 'original' | '1:1' | '4:5' | '3:4' | '2:3' | '9:16' | '16:9'

export const RATIOS: readonly { id: RatioId }[] = [
  { id: 'free' },
  { id: 'original' },
  { id: '1:1' },
  { id: '4:5' },
  { id: '3:4' },
  { id: '2:3' },
  { id: '9:16' },
  { id: '16:9' },
]

/** "Free" and "Original" are words; the others are ratios, shown as they are. */
export function ratioLabel(id: RatioId): string {
  if (id === 'free') return t('history.ratioFree')
  if (id === 'original') return t('history.ratioOriginal')
  return id
}

/** Applied in this order, as on the server: quarter turns clockwise, flips, then the crop. */
export interface EditState {
  turns: number
  flipHorizontal: boolean
  flipVertical: boolean
  /** In percent of the turned and flipped image; null for no crop. */
  crop: PercentCrop | null
  ratio: RatioId
}

export const NO_EDITS: EditState = { turns: 0, flipHorizontal: false, flipVertical: false, crop: null, ratio: 'free' }

/** The image's size once turned: a quarter turn swaps width and height. */
export function turnedSize(item: HistoryItem, turns: number): { width: number; height: number } {
  return turns % 2 === 0 ? { width: item.width, height: item.height } : { width: item.height, height: item.width }
}

/** Width over height for a ratio choice, or undefined for a free crop. */
export function aspectOf(ratio: RatioId, item: HistoryItem, turns: number): number | undefined {
  if (ratio === 'free') return undefined
  if (ratio === 'original') {
    const { width, height } = turnedSize(item, turns)
    return width / height
  }
  const [w, h] = ratio.split(':').map(Number)
  return w / h
}

/** The largest crop of that shape, centred. */
export function centredCrop(aspect: number, item: HistoryItem, turns: number): PercentCrop {
  const { width, height } = turnedSize(item, turns)
  const fitsWidth = width / height <= aspect
  const cropWidth = fitsWidth ? 100 : ((height * aspect) / width) * 100
  const cropHeight = fitsWidth ? ((width / aspect) / height) * 100 : 100
  return { unit: '%', x: (100 - cropWidth) / 2, y: (100 - cropHeight) / 2, width: cropWidth, height: cropHeight }
}

// A crop drawn on the old orientation no longer covers the same part once turned or flipped, so it starts again
export const turn = (state: EditState, direction: 1 | -1): EditState => ({ ...state, turns: (state.turns + direction + 4) % 4, crop: null })
export const flip = (state: EditState, axis: 'horizontal' | 'vertical'): EditState =>
  axis === 'horizontal' ? { ...state, flipHorizontal: !state.flipHorizontal, crop: null } : { ...state, flipVertical: !state.flipVertical, crop: null }

export function withRatio(state: EditState, ratio: RatioId, item: HistoryItem): EditState {
  const aspect = aspectOf(ratio, item, state.turns)
  return { ...state, ratio, crop: aspect === undefined ? state.crop : centredCrop(aspect, item, state.turns) }
}

export function isChanged(state: EditState): boolean {
  return [state.turns !== 0, state.flipHorizontal, state.flipVertical, state.crop !== null].some(Boolean)
}

function cropInPixels(crop: PercentCrop, item: HistoryItem, turns: number) {
  const { width, height } = turnedSize(item, turns)
  const x = Math.min(Math.max(Math.round((crop.x / 100) * width), 0), width)
  const y = Math.min(Math.max(Math.round((crop.y / 100) * height), 0), height)
  return {
    x,
    y,
    width: Math.min(Math.round((crop.width / 100) * width), width - x),
    height: Math.min(Math.round((crop.height / 100) * height), height - y),
  }
}

export type RecipeResult = { status: 'ready'; recipe: EditRecipe } | { status: 'invalid'; reason: string }

/** What the server applies; refused here already when the crop is too small to save. */
export function toRecipe(state: EditState, item: HistoryItem): RecipeResult {
  if (!isChanged(state)) return { status: 'invalid', reason: t('history.noEditsToSave') }
  const crop = state.crop ? cropInPixels(state.crop, item, state.turns) : null
  if (crop && (crop.width < MIN_CROP_SIDE || crop.height < MIN_CROP_SIDE)) {
    return { status: 'invalid', reason: t('history.cropTooSmall', { size: MIN_CROP_SIDE }) }
  }
  return {
    status: 'ready',
    recipe: { quarter_turns: state.turns, flip_horizontal: state.flipHorizontal, flip_vertical: state.flipVertical, crop },
  }
}

const turnNames = () => ['', t('history.rotatedRight'), t('history.rotatedHalf'), t('history.rotatedLeft')]

/** "Rotated 90° right · Flipped horizontally · Cropped to 832 × 1040". */
export function describeEdits(state: EditState, item: HistoryItem): string {
  const crop = state.crop ? cropInPixels(state.crop, item, state.turns) : null
  const parts = [
    turnNames()[state.turns],
    state.flipHorizontal ? t('history.flippedHorizontally') : '',
    state.flipVertical ? t('history.flippedVertically') : '',
    crop ? t('history.croppedTo', { width: crop.width, height: crop.height }) : '',
  ]
  return parts.filter(Boolean).join(' · ') || t('history.noEdits')
}

interface EditHistory {
  past: EditState[]
  present: EditState
  future: EditState[]
  /** The edits from before a drag began, so undoing the drag goes back to them rather than to its middle. */
  beforeDrag: EditState | null
}

/** The current edits with undo and redo; `preview` shows a change while dragging without adding an undo step. */
export function useEditHistory() {
  const [history, setHistory] = useState<EditHistory>({ past: [], present: NO_EDITS, future: [], beforeDrag: null })
  const commit = useCallback(
    (next: EditState) =>
      setHistory((current) => ({ past: [...current.past, current.beforeDrag ?? current.present], present: next, future: [], beforeDrag: null })),
    [],
  )
  const preview = useCallback(
    (next: EditState) => setHistory((current) => ({ ...current, present: next, beforeDrag: current.beforeDrag ?? current.present })),
    [],
  )
  const undo = useCallback(
    () =>
      setHistory((current) =>
        current.past.length
          ? { past: current.past.slice(0, -1), present: current.past[current.past.length - 1], future: [current.present, ...current.future], beforeDrag: null }
          : current,
      ),
    [],
  )
  const redo = useCallback(
    () =>
      setHistory((current) =>
        current.future.length
          ? { past: [...current.past, current.present], present: current.future[0], future: current.future.slice(1), beforeDrag: null }
          : current,
      ),
    [],
  )
  return {
    edits: history.present,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    commit,
    preview,
    undo,
    redo,
    reset: () => commit(NO_EDITS),
  }
}
