import { t } from '../i18n'
import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import ReactCrop, { type PercentCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { imageUrl } from '../api'
import { turnedSize, type EditState } from '../lib/imageEdits'
import type { HistoryItem } from '../types'

const PADDING_PX = 32

/** The largest size of that shape that fits the area. */
function useFittedSize(area: RefObject<HTMLDivElement | null>, size: { width: number; height: number }) {
  const [box, setBox] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const element = area.current
    if (!element) return
    const fit = () => {
      const scale = Math.min((element.clientWidth - PADDING_PX) / size.width, (element.clientHeight - PADDING_PX) / size.height)
      setBox(scale > 0 ? { width: Math.floor(size.width * scale), height: Math.floor(size.height * scale) } : { width: 0, height: 0 })
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(element)
    return () => observer.disconnect()
  }, [area, size.width, size.height])
  return box
}

interface Props {
  item: HistoryItem
  edits: EditState
  aspect: number | undefined
  /** While the crop is dragged. */
  onPreview: (crop: PercentCrop) => void
  /** When a drag ends: the finished crop, or null when it was cleared. */
  onCommit: (crop: PercentCrop | null) => void
}

/**
 * The image as it will be saved: turned and flipped with CSS, so nothing is re-encoded while editing, with the crop
 * frame drawn over it. The frame works in the turned image's space, which is also where the server crops.
 */
export function ImageEditor({ item, edits, aspect, onPreview, onCommit }: Props) {
  const area = useRef<HTMLDivElement>(null)
  const box = useFittedSize(area, turnedSize(item, edits.turns))
  const sideways = edits.turns % 2 === 1
  // Transforms apply right to left: turn first, then flip, then centre, as the server applies them
  const imageStyle: CSSProperties = {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: sideways ? box.height : box.width,
    height: sideways ? box.width : box.height,
    transform: `translate(-50%, -50%) scale(${edits.flipHorizontal ? -1 : 1}, ${edits.flipVertical ? -1 : 1}) rotate(${edits.turns * 90}deg)`,
  }
  return (
    <div ref={area} className="flex size-full items-center justify-center">
      <ReactCrop
        crop={edits.crop ?? undefined}
        aspect={aspect}
        ruleOfThirds
        onChange={(_, percent) => onPreview(percent)}
        onComplete={(_, percent) => onCommit(percent.width > 0 && percent.height > 0 ? percent : null)}
        className="image-crop"
      >
        <div role="img" aria-label={t('history.editedImage')} style={{ width: box.width, height: box.height }} className="relative overflow-hidden">
          <img src={imageUrl(item.id)} alt="" draggable={false} style={imageStyle} />
        </div>
      </ReactCrop>
    </div>
  )
}
