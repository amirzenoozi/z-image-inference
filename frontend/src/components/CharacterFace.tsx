import { useRef, useState } from 'react'
import { imageUrl, uploadedFaceUrl } from '../api'
import { isPhoto, MAX_PHOTO_BYTES, type FaceLock, type FaceSource } from '../lib/characterFace'
import { secondaryButtonClass } from '../lib/styles'
import { Slider } from './form/Slider'
import { SensitiveImage } from './SensitiveImage'

const MIN_STRENGTH = 0.1
const MAX_STRENGTH = 1
const STRENGTH_STEP = 0.05

interface Props {
  face: FaceLock
  /** The character being edited, for its stored photo; null while creating one. */
  characterId: number | null
  name: string
  onChange: (face: FaceLock) => void
}

/** The face the SDXL models keep for this character: a History image or an uploaded photo, and how strongly. */
export function CharacterFace({ face, characterId, name, onChange }: Props) {
  const setSource = (source: FaceSource) => onChange({ ...face, source })
  return (
    <div className="space-y-3">
      {face.source.kind === 'none' ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          No face. Open an image of this character in History and choose <span className="font-medium">Use as face</span> (a close crop of the face works
          best), or upload a photo. RealVisXL (in photo style), WAI-Illustrious and Anime Desire then keep that face.
        </p>
      ) : (
        <div className="flex items-start gap-4">
          <FacePreview source={face.source} characterId={characterId} />
          <StrengthSlider strength={face.strength} onChange={(strength) => onChange({ ...face, strength })} />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <PhotoPicker replacing={isPhoto(face.source)} onPicked={(dataUrl) => setSource({ kind: 'photo', dataUrl })} />
        {face.source.kind !== 'none' && (
          <button type="button" onClick={() => setSource({ kind: 'none' })} className={secondaryButtonClass}>
            {isPhoto(face.source) ? 'Remove photo' : 'Remove face'}
          </button>
        )}
      </div>
      {isPhoto(face.source) && <SafeForWorkNote name={name} />}
    </div>
  )
}

function FacePreview({ source, characterId }: { source: FaceSource; characterId: number | null }) {
  if (source.kind === 'history') {
    return (
      <span role="img" aria-label={`Face image #${source.id}`} className="shrink-0">
        <SensitiveImage src={imageUrl(source.id, true)} sensitive={source.sensitive} compact className="size-20 rounded-lg" />
      </span>
    )
  }
  const src = source.kind === 'photo' ? source.dataUrl : characterId !== null ? uploadedFaceUrl(characterId, true) : ''
  return <img src={src} alt="Uploaded face photo" className="size-20 shrink-0 rounded-lg bg-zinc-100 object-cover dark:bg-zinc-800" />
}

function StrengthSlider({ strength, onChange }: { strength: number; onChange: (strength: number) => void }) {
  return (
    <div className="min-w-0 flex-1 space-y-2">
      <div className="flex justify-between text-xs font-medium text-zinc-600 dark:text-zinc-300">
        <span>Face strength</span>
        <span className="tabular-nums">{Math.round(strength * 100)}%</span>
      </div>
      <Slider label="Face strength" min={MIN_STRENGTH} max={MAX_STRENGTH} step={STRENGTH_STEP} value={strength} onChange={(text) => onChange(Number(text))} />
      <div className="flex justify-between text-[11px] text-zinc-400">
        <span>Follows the prompt</span>
        <span>Keeps the face</span>
      </div>
    </div>
  )
}

/** Reads the chosen photo in the browser; it is sent with the character when it is saved. */
function PhotoPicker({ replacing, onPicked }: { replacing: boolean; onPicked: (dataUrl: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const read = (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return setError('Choose an image file (JPEG, PNG or WebP).')
    if (file.size > MAX_PHOTO_BYTES) return setError('The photo is larger than 10 MB; choose a smaller one.')
    setError(null)
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' && onPicked(reader.result)
    reader.onerror = () => setError('The photo could not be read; try another one.')
    reader.readAsDataURL(file)
  }
  return (
    <>
      <button type="button" onClick={() => input.current?.click()} className={secondaryButtonClass}>
        {replacing ? 'Replace photo…' : 'Upload a photo…'}
      </button>
      <input ref={input} type="file" accept="image/*" aria-label="Face photo" className="hidden" onChange={(event) => read(event.target.files?.[0])} />
      {error && (
        <p role="alert" className="basis-full text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </>
  )
}

function SafeForWorkNote({ name }: { name: string }) {
  const who = name.trim() || 'this character'
  return (
    <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
      An uploaded photo can show a real person, so images of {who} are kept safe for work: nude or sexual prompts are refused, the 18+ purposes are
      hidden in the prompt builder, and any image that comes out with nudity is discarded.
    </p>
  )
}
