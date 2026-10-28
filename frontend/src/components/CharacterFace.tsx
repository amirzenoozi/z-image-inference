import { imageUrl } from '../api'
import { secondaryButtonClass } from '../lib/styles'
import { Slider } from './form/Slider'
import { SensitiveImage } from './SensitiveImage'

export interface FaceLock {
  id: number | null
  strength: number
  /** Whether the face image is blurred here, as it is in History. */
  sensitive: boolean
}

const MIN_STRENGTH = 0.1
const MAX_STRENGTH = 1
const STRENGTH_STEP = 0.05

/** The face image WAI-Illustrious and Anime Desire keep for this character, how strongly, and a way to remove it. */
export function CharacterFace({ face, onChange }: { face: FaceLock; onChange: (face: FaceLock) => void }) {
  if (face.id === null) {
    return (
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        No face image. Open an image of this character in History and choose <span className="font-medium">Use as face</span>; a close crop of the face works best.
        WAI-Illustrious and Anime Desire then keep that face.
      </p>
    )
  }
  return (
    <div className="flex items-start gap-4">
      <span role="img" aria-label={`Face image #${face.id}`} className="shrink-0">
        <SensitiveImage src={imageUrl(face.id, true)} sensitive={face.sensitive} compact className="size-20 rounded-lg" />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex justify-between text-xs font-medium text-zinc-600 dark:text-zinc-300">
          <span>Face strength</span>
          <span className="tabular-nums">{Math.round(face.strength * 100)}%</span>
        </div>
        <Slider label="Face strength" min={MIN_STRENGTH} max={MAX_STRENGTH} step={STRENGTH_STEP} value={face.strength} onChange={(text) => onChange({ ...face, strength: Number(text) })} />
        <div className="flex justify-between text-[11px] text-zinc-400">
          <span>Follows the prompt</span>
          <span>Keeps the face</span>
        </div>
        <button type="button" onClick={() => onChange({ ...face, id: null })} className={secondaryButtonClass}>
          Remove face
        </button>
      </div>
    </div>
  )
}
