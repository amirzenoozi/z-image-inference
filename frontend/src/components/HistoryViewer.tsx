import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode, type RefObject } from 'react'
import { deleteHistoryItem, fetchHistory, imageUrl } from '../api'
import { errorMessage } from '../lib/hooks'
import { secondaryButtonClass } from '../lib/styles'
import type { HistoryFilters, HistoryItem, Loadable } from '../types'
import { ColourPalette } from './ColourPalette'
import { FavouriteButton } from './FavouriteButton'
import { ImageFacts } from './ImageFacts'
import { Modal } from './Modal'
import { ErrorNotice, PromptBlock, Spinner } from './ui'

/** The image the viewer opens on, and its position among all images matching the filters. */
export interface ViewerStart {
  index: number
  item: HistoryItem
  total: number
}

interface Props {
  filters: HistoryFilters
  start: ViewerStart
  labelOf: (id: string) => string
  /** Called when the viewer moves, so History can show the page it is on. */
  onIndexChange: (index: number) => void
  /** Called after a star or delete, so History reloads what it shows. */
  onListChanged: () => void
  onReuse: (item: HistoryItem) => void
  onClose: () => void
}

type DeleteState = { status: 'idle' } | { status: 'deleting' } | { status: 'failed'; error: string }

const ARMED_DELETE_MS = 3000
// A pointer that moves further than this between press and release is dragging the zoomed image, not clicking it
const DRAG_THRESHOLD_PX = 4

/** The image at each position, loaded one at a time as the viewer moves, so it can cross History's pages. */
function useImageAt(filters: HistoryFilters, index: number, start: ViewerStart) {
  const [loaded, setLoaded] = useState<Record<number, HistoryItem>>({ [start.index]: start.item })
  const [total, setTotal] = useState(start.total)
  const [failure, setFailure] = useState<{ index: number; message: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const item = loaded[index]

  useEffect(() => {
    if (item) return
    const controller = new AbortController()
    fetchHistory(index, 1, filters, controller.signal).then(
      (page) => {
        setTotal(page.total)
        if (page.items[0]) setLoaded((current) => ({ ...current, [index]: page.items[0] }))
        else setFailure({ index, message: 'This image is no longer in History.' })
      },
      (error: unknown) => !controller.signal.aborted && setFailure({ index, message: errorMessage(error) }),
    )
    return () => controller.abort()
  }, [filters, index, item, attempt])

  const state: Loadable<HistoryItem> = item
    ? { status: 'settled', value: item }
    : failure?.index === index
      ? { status: 'failed', error: failure.message }
      : { status: 'pending' }
  return {
    state,
    total,
    retry: () => {
      setFailure(null)
      setAttempt((n) => n + 1)
    },
    replace: (next: HistoryItem) => setLoaded((current) => ({ ...current, [index]: next })),
    // After a removal every later image moves up one position, so nothing loaded is where it was
    forgetAll: (newTotal: number) => {
      setLoaded({})
      setTotal(newTotal)
    },
  }
}

function useFullScreen(target: RefObject<HTMLElement | null>) {
  const [active, setActive] = useState(false)
  useEffect(() => {
    const follow = () => setActive(document.fullscreenElement !== null && document.fullscreenElement === target.current)
    document.addEventListener('fullscreenchange', follow)
    return () => document.removeEventListener('fullscreenchange', follow)
  }, [target])
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void target.current?.requestFullscreen()
  }
  return { active, toggle }
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

/** Keys act like the viewer's buttons; they do nothing while typing or with a modifier held. */
function useViewerKeys(actions: Record<string, () => void>) {
  const latest = useRef(actions)
  useEffect(() => {
    latest.current = actions
  })
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return
      const action = latest.current[event.key.length === 1 ? event.key.toLowerCase() : event.key]
      if (!action) return
      event.preventDefault()
      action()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** Delete by key needs a second press within a few seconds, so one stray key never removes an image. */
function useArmedDelete(onConfirmed: () => void): [boolean, () => void] {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), ARMED_DELETE_MS)
    return () => clearTimeout(timer)
  }, [armed])
  const press = () => {
    if (armed) {
      setArmed(false)
      onConfirmed()
    } else {
      setArmed(true)
    }
  }
  return [armed, press]
}

export function HistoryViewer({ filters, start, labelOf, onIndexChange, onListChanged, onReuse, onClose }: Props) {
  const [index, setIndex] = useState(start.index)
  const image = useImageAt(filters, index, start)
  const area = useRef<HTMLDivElement>(null)
  const favouriteButton = useRef<HTMLButtonElement>(null)
  const deleteButton = useRef<HTMLButtonElement>(null)
  const fullScreen = useFullScreen(area)
  const [zoomed, setZoomed] = useState(false)
  const [favouriteError, setFavouriteError] = useState<string | null>(null)
  const [armed, pressDelete] = useArmedDelete(() => deleteButton.current?.click())

  const moveTo = (next: number) => {
    if (next < 0 || next >= image.total) return
    setIndex(next)
    setZoomed(false)
    onIndexChange(next)
  }
  // The next image takes the removed one's place; after the last one, the one before it is shown
  const afterRemoval = () => {
    const total = image.total - 1
    onListChanged()
    if (total === 0) return onClose()
    image.forgetAll(total)
    moveTo(Math.min(index, total - 1))
  }
  const changed = (next: HistoryItem) => {
    setFavouriteError(null)
    onListChanged()
    // With the Favourites filter on, an unstarred image leaves the list, like a deleted one
    if (filters.favouritesOnly && !next.favourite) afterRemoval()
    else image.replace(next)
  }

  useViewerKeys({
    ArrowLeft: () => moveTo(index - 1),
    ArrowRight: () => moveTo(index + 1),
    z: fullScreen.toggle,
    f: () => favouriteButton.current?.click(),
    Delete: pressDelete,
    Backspace: pressDelete,
  })

  const item = image.state.status === 'settled' ? image.state.value : null
  return (
    <Modal title="Image details" onClose={onClose} size="xl">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div
          ref={area}
          className={`relative flex items-center justify-center overflow-hidden ${fullScreen.active ? 'h-screen bg-black' : 'h-[70vh] rounded-xl bg-zinc-100 dark:bg-zinc-800'}`}
        >
          <ImageArea state={image.state} zoomed={zoomed} onZoomedChange={setZoomed} onRetry={image.retry} />
          <p className="absolute top-3 left-3 rounded-full bg-black/55 px-2.5 py-1 text-xs text-white tabular-nums">
            {index + 1} of {image.total}
          </p>
          <div className="absolute top-3 right-3 flex gap-2">
            <OverlayButton label={zoomed ? 'Fit to window' : 'Zoom to 100%'} onClick={() => setZoomed(!zoomed)} disabled={!item}>
              {zoomed ? '⤡' : '⤢'}
            </OverlayButton>
            <OverlayButton label={fullScreen.active ? 'Leave full screen' : 'Full screen'} onClick={fullScreen.toggle}>
              ⛶
            </OverlayButton>
            {item && <FavouriteButton ref={favouriteButton} item={item} onChanged={changed} onFailed={setFavouriteError} />}
          </div>
          <SideButton side="previous" disabled={index === 0} onClick={() => moveTo(index - 1)} />
          <SideButton side="next" disabled={index >= image.total - 1} onClick={() => moveTo(index + 1)} />
        </div>
        {item && (
          <ViewerDetails
            key={item.id}
            item={item}
            label={labelOf(item.model)}
            favouriteError={favouriteError}
            armed={armed}
            deleteButton={deleteButton}
            onReuse={() => onReuse(item)}
            onDeleted={afterRemoval}
          />
        )}
      </div>
    </Modal>
  )
}

interface ImageAreaProps {
  state: Loadable<HistoryItem>
  zoomed: boolean
  onZoomedChange: (zoomed: boolean) => void
  onRetry: () => void
}

function ImageArea({ state, zoomed, onZoomedChange, onRetry }: ImageAreaProps) {
  if (state.status === 'pending') return <Spinner className="size-8 text-violet-500" />
  if (state.status === 'failed') {
    return (
      <div className="w-full max-w-sm p-4">
        <ErrorNotice message={state.error} onRetry={onRetry} />
      </div>
    )
  }
  return <ZoomableImage key={state.value.id} item={state.value} zoomed={zoomed} onZoomedChange={onZoomedChange} />
}

/** Fits the image, or shows it at 100% centred on where it was clicked; drag or scroll to look around. */
function ZoomableImage({ item, zoomed, onZoomedChange }: { item: HistoryItem; zoomed: boolean; onZoomedChange: (zoomed: boolean) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const focus = useRef({ x: 0.5, y: 0.5 })
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null)

  useLayoutEffect(() => {
    const element = box.current
    if (!element || !zoomed) return
    element.scrollLeft = focus.current.x * element.scrollWidth - element.clientWidth / 2
    element.scrollTop = focus.current.y * element.scrollHeight - element.clientHeight / 2
  }, [zoomed])

  const press = (event: PointerEvent<HTMLDivElement>) => {
    const element = box.current
    if (element) drag.current = { x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop, moved: false }
  }
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current
    if (!start || !zoomed || !box.current) return
    const [dx, dy] = [event.clientX - start.x, event.clientY - start.y]
    start.moved ||= Math.hypot(dx, dy) > DRAG_THRESHOLD_PX
    box.current.scrollLeft = start.left - dx
    box.current.scrollTop = start.top - dy
  }
  const release = (event: PointerEvent<HTMLImageElement>) => {
    const moved = drag.current?.moved ?? false
    drag.current = null
    if (moved) return
    const rect = event.currentTarget.getBoundingClientRect()
    focus.current = { x: (event.clientX - rect.left) / rect.width || 0.5, y: (event.clientY - rect.top) / rect.height || 0.5 }
    onZoomedChange(!zoomed)
  }

  return (
    <div
      ref={box}
      onPointerDown={press}
      onPointerMove={move}
      className={`size-full ${zoomed ? 'cursor-grab overflow-auto' : 'flex cursor-zoom-in items-center justify-center'}`}
    >
      <img
        src={imageUrl(item.id)}
        alt={item.prompt}
        width={item.width}
        height={item.height}
        draggable={false}
        onPointerUp={release}
        className={zoomed ? 'max-w-none' : 'max-h-full max-w-full object-contain'}
      />
    </div>
  )
}

function OverlayButton({ label, onClick, disabled = false, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-8 items-center justify-center rounded-full bg-black/45 text-base leading-none text-white backdrop-blur-sm hover:bg-black/60 disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function SideButton({ side, disabled, onClick }: { side: 'previous' | 'next'; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={side === 'previous' ? 'Previous image' : 'Next image'}
      onClick={onClick}
      disabled={disabled}
      className={`absolute top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-2xl text-white backdrop-blur-sm hover:bg-black/60 disabled:invisible ${
        side === 'previous' ? 'left-3' : 'right-3'
      }`}
    >
      {side === 'previous' ? '‹' : '›'}
    </button>
  )
}

interface DetailsProps {
  item: HistoryItem
  label: string
  favouriteError: string | null
  armed: boolean
  deleteButton: RefObject<HTMLButtonElement | null>
  onReuse: () => void
  onDeleted: () => void
}

function ViewerDetails({ item, label, favouriteError, armed, deleteButton, onReuse, onDeleted }: DetailsProps) {
  const [deleteState, setDeleteState] = useState<DeleteState>({ status: 'idle' })
  const remove = async () => {
    setDeleteState({ status: 'deleting' })
    try {
      await deleteHistoryItem(item.id)
      onDeleted()
    } catch (error) {
      setDeleteState({ status: 'failed', error: errorMessage(error) })
    }
  }
  return (
    <div className="space-y-4 text-sm">
      <ImageFacts item={item} label={label} />
      <ColourPalette itemId={item.id} />
      <PromptBlock title="Prompt" text={item.prompt} />
      {item.negative_prompt && <PromptBlock title="Negative prompt" text={item.negative_prompt} />}
      <p className="text-xs text-zinc-400">Created {new Date(`${item.created_at}Z`).toLocaleString()}</p>
      {favouriteError && <ErrorNotice message={favouriteError} />}
      {deleteState.status === 'failed' && <ErrorNotice message={deleteState.error} />}
      {armed && (
        <p role="status" className="text-xs font-medium text-red-600 dark:text-red-400">
          Press Delete again to delete
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onReuse} className="rounded-lg bg-violet-600 px-3 py-1.5 font-semibold text-white hover:bg-violet-500">
          Reuse settings
        </button>
        <a href={imageUrl(item.id)} download={`z-image-${item.id}-${item.seed}.png`} className={secondaryButtonClass}>
          Download
        </a>
        <button
          ref={deleteButton}
          type="button"
          onClick={() => void remove()}
          disabled={deleteState.status === 'deleting'}
          className={`${secondaryButtonClass} text-red-600 dark:text-red-400`}
        >
          {deleteState.status === 'deleting' ? 'Deleting…' : 'Delete'}
        </button>
      </div>
      <p className="text-[11px] text-zinc-400">← → browse · Z full screen · F star · Delete twice to delete · Esc close</p>
    </div>
  )
}
