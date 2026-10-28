import { language, t } from '../../../i18n'
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode, type Ref, type RefObject } from 'react'
import { IconButton, IconLink } from '../../../shared/ui/IconButton'
import { deleteHistoryItem, fetchHistory, imageUrl } from '../../../api'
import { errorMessage } from '../../../lib/hooks'
import { secondaryButtonClass } from '../../../lib/styles'
import type { HistoryFilters, HistoryItem, Loadable } from '../../../types'
import { ColourPalette } from './ColourPalette'
import { EditSession } from './EditSession'
import { FavouriteButton } from '../FavouriteButton'
import { ImageCharacter } from './ImageCharacter'
import { SensitiveButton } from './SensitiveButton'
import { ImageFacts } from '../../../shared/images/ImageFacts'
import { Modal } from '../../../shared/ui/Modal'
import { ErrorNotice, PromptBlock, Spinner } from '../../../shared/ui/ui'
import { ChevronLeft, ChevronRight, Download, Maximize, Minimize, Pencil, Trash2, ZoomIn, ZoomOut } from 'lucide-react'

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
  /** Opens Create with this image as the start of new variations. */
  onVary: (item: HistoryItem) => void
  /** Called with the new image after an edit is saved. */
  onEdited: (item: HistoryItem) => void
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
        else setFailure({ index, message: t('history.notInHistory') })
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

export function HistoryViewer({ filters, start, labelOf, onIndexChange, onListChanged, onReuse, onVary, onEdited, onClose }: Props) {
  const [index, setIndex] = useState(start.index)
  const image = useImageAt(filters, index, start)
  const area = useRef<HTMLDivElement>(null)
  const favouriteButton = useRef<HTMLButtonElement>(null)
  const deleteButton = useRef<HTMLButtonElement>(null)
  const fullScreen = useFullScreen(area)
  const [zoomed, setZoomed] = useState(false)
  const [markError, setMarkError] = useState<string | null>(null)
  const [deleteState, setDeleteState] = useState<DeleteState>({ status: 'idle' })
  const [armed, pressDelete] = useArmedDelete(() => deleteButton.current?.click())
  const [editing, setEditing] = useState(false)
  const [hasEdits, setHasEdits] = useState(false)
  const [closeRequested, setCloseRequested] = useState(false)
  // Closing over unsaved edits asks first, in the edit tools
  const requestClose = () => (editing && hasEdits ? setCloseRequested(true) : onClose())
  const stopEditing = () => {
    setEditing(false)
    setHasEdits(false)
    setCloseRequested(false)
  }

  const moveTo = (next: number) => {
    if (next < 0 || next >= image.total) return
    setIndex(next)
    setZoomed(false)
    setDeleteState({ status: 'idle' })
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
    setMarkError(null)
    onListChanged()
    // With the Favourites filter on, an unstarred image leaves the list, like a deleted one
    if (filters.favouritesOnly && !next.favourite) afterRemoval()
    else image.replace(next)
  }

  // Paused while editing, so browsing, starring or deleting can never happen by accident there
  useViewerKeys(
    editing
      ? {}
      : {
          ArrowLeft: () => moveTo(index - 1),
          ArrowRight: () => moveTo(index + 1),
          z: fullScreen.toggle,
          f: () => favouriteButton.current?.click(),
          Delete: pressDelete,
          Backspace: pressDelete,
        },
  )

  const item = image.state.status === 'settled' ? image.state.value : null
  const remove = async (target: HistoryItem) => {
    setDeleteState({ status: 'deleting' })
    try {
      await deleteHistoryItem(target.id)
      setDeleteState({ status: 'idle' })
      afterRemoval()
    } catch (error) {
      setDeleteState({ status: 'failed', error: errorMessage(error) })
    }
  }
  return (
    <Modal title={editing ? t('history.editImage') : t('history.imageDetails')} onClose={requestClose} size="full">
      <div className="grid gap-5 lg:h-full lg:grid-cols-[minmax(0,1fr)_380px]">
        {editing && item ? (
          <EditSession
            item={item}
            closeRequested={closeRequested}
            onCloseAnswered={(close) => (close ? onClose() : setCloseRequested(false))}
            onChangedChange={setHasEdits}
            onCancel={stopEditing}
            onSaved={onEdited}
          />
        ) : (
          <>
            <div
              ref={area}
              className={`relative flex items-center justify-center overflow-hidden ${fullScreen.active ? 'h-screen bg-black' : 'h-[60vh] rounded-xl bg-zinc-100 lg:h-full dark:bg-zinc-800'}`}
            >
              <ImageArea state={image.state} zoomed={zoomed} onZoomedChange={setZoomed} onRetry={image.retry} />
              <p className="absolute top-3 left-3 rounded-full bg-black/55 px-2.5 py-1 text-xs text-white tabular-nums">
                {t('history.position', { index: index + 1, total: image.total })}
              </p>
              <div className="absolute top-3 right-3 flex gap-2">
                {item && (
                  <ImageTools
                    item={item}
                    deleting={deleteState.status === 'deleting'}
                    deleteButton={deleteButton}
                    onDelete={() => void remove(item)}
                    onEdit={() => setEditing(true)}
                  />
                )}
                <OverlayButton label={zoomed ? t('history.fitToWindow') : t('history.zoomFull')} onClick={() => setZoomed(!zoomed)} disabled={!item}>
                  {zoomed ? <ZoomOut /> : <ZoomIn />}
                </OverlayButton>
                <OverlayButton label={fullScreen.active ? t('history.leaveFullScreen') : t('history.fullScreen')} shortcut="Z" onClick={fullScreen.toggle}>
                  {fullScreen.active ? <Minimize /> : <Maximize />}
                </OverlayButton>
                {item && <SensitiveButton item={item} onChanged={changed} onFailed={setMarkError} className={overlayClass} />}
                {item && <FavouriteButton ref={favouriteButton} item={item} shortcut="F" onChanged={changed} onFailed={setMarkError} />}
              </div>
              <SideButton side="previous" disabled={index === 0} onClick={() => moveTo(index - 1)} />
              <SideButton side="next" disabled={index >= image.total - 1} onClick={() => moveTo(index + 1)} />
            </div>
            {item && (
              <ViewerDetails
                item={item}
                label={labelOf(item.model)}
                markError={markError}
                deleteError={deleteState.status === 'failed' ? deleteState.error : null}
                armed={armed}
                actions={
                  <ViewerActions onVary={() => onVary(item)} onReuse={() => onReuse(item)} />
                }
              />
            )}
          </>
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
      className={`size-full ${zoomed ? 'cursor-grab overflow-auto active:cursor-grabbing' : 'flex cursor-zoom-in items-center justify-center'}`}
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

const overlayClass =
  'flex size-8 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm hover:bg-black/60 disabled:opacity-40 [&_svg]:size-[18px]'

interface OverlayButtonProps {
  label: string
  shortcut?: string
  onClick: () => void
  disabled?: boolean
  className?: string
  ref?: Ref<HTMLButtonElement>
  children: ReactNode
}

function OverlayButton({ label, shortcut, onClick, disabled = false, className = '', ref, children }: OverlayButtonProps) {
  return (
    <IconButton ref={ref} label={label} shortcut={shortcut} onClick={onClick} disabled={disabled} className={`${overlayClass} ${className}`}>
      {children}
    </IconButton>
  )
}

interface ImageToolsProps {
  item: HistoryItem
  deleting: boolean
  deleteButton: RefObject<HTMLButtonElement | null>
  onDelete: () => void
  onEdit: () => void
}

/** Download, Edit and Delete, as icons on the image beside zoom, full screen and the star. */
function ImageTools({ item, deleting, deleteButton, onDelete, onEdit }: ImageToolsProps) {
  return (
    <>
      <IconLink label={t('history.download')} href={imageUrl(item.id)} download={`z-image-${item.id}-${item.seed}.png`} className={overlayClass}>
        <Download />
      </IconLink>
      <OverlayButton label={t('common.edit')} onClick={onEdit}>
        <Pencil />
      </OverlayButton>
      <OverlayButton ref={deleteButton} label={deleting ? t('common.deleting') : t('common.delete')} shortcut="Delete ×2" onClick={onDelete} disabled={deleting} className="hover:bg-red-600/80">
        <Trash2 />
      </OverlayButton>
    </>
  )
}

function SideButton({ side, disabled, onClick }: { side: 'previous' | 'next'; disabled: boolean; onClick: () => void }) {
  return (
    <IconButton
      label={side === 'previous' ? t('history.previousImage') : t('history.nextImage')}
      shortcut={side === 'previous' ? '←' : '→'}
      onClick={onClick}
      disabled={disabled}
      className={`absolute top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-2xl text-white backdrop-blur-sm hover:bg-black/60 disabled:invisible ${
        side === 'previous' ? 'left-3' : 'right-3'
      }`}
    >
      {side === 'previous' ? <ChevronLeft className="size-6" /> : <ChevronRight className="size-6" />}
    </IconButton>
  )
}

interface DetailsProps {
  item: HistoryItem
  label: string
  markError: string | null
  deleteError: string | null
  armed: boolean
  actions: ReactNode
}

/** The metadata column beside the image; its actions sit at the bottom of the column, under a divider. */
function ViewerDetails({ item, label, markError, deleteError, armed, actions }: DetailsProps) {
  return (
    <div className="flex min-h-0 flex-col gap-4 text-sm lg:h-full">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <ImageFacts item={item} label={label} />
        <ImageCharacter item={item} />
        <ColourPalette itemId={item.id} />
        <PromptBlock title={t('common.prompt')} text={item.prompt} />
        {item.negative_prompt && <PromptBlock title={t('common.negativePrompt')} text={item.negative_prompt} />}
        <p className="text-xs text-zinc-400">
          {t('history.created', { date: new Date(`${item.created_at}Z`).toLocaleString(language()) })}
          {item.edited_from !== null && t('history.editedFrom', { id: item.edited_from })}
          {item.varied_from !== null && item.change !== null && t('history.variationOf', { id: item.varied_from, percent: Math.round(item.change * 100) })}
          {item.face_from !== null && t('history.faceFrom', { id: item.face_from })}
        </p>
        {markError && <ErrorNotice message={markError} />}
        {deleteError && <ErrorNotice message={deleteError} />}
        {armed && (
          <p role="status" className="text-xs font-medium text-red-600 dark:text-red-400">
            {t('history.pressDeleteAgain')}
          </p>
        )}
        <p className="text-[11px] text-zinc-400">{t('history.viewerKeys')}</p>
      </div>
      <div role="group" aria-label={t('history.imageActions')} className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        {actions}
      </div>
    </div>
  )
}

function ViewerActions({ onVary, onReuse }: { onVary: () => void; onReuse: () => void }) {
  return (
    <>
      <button type="button" onClick={onVary} className={secondaryButtonClass}>
        {t('history.makeVariations')}
      </button>
      <button type="button" onClick={onReuse} className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-500">
        {t('history.reuseSettings')}
      </button>
    </>
  )
}
