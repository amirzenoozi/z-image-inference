import { useRef, useState } from 'react'
import { imageUrl, uploadedFaceUrl } from '../api'
import { t } from '../i18n'
import { isPhoto, MAX_PHOTO_BYTES, type FaceLock, type FaceSource } from '../lib/characterFace'
import { secondaryButtonClass } from '../lib/styles'
import { Slider } from './form/Slider'
import { SensitiveImage } from './SensitiveImage'

const MIN_STRENGTH = 0.1
const MAX_STRENGTH = 1
const STRENGTH_STEP = 0.05
// Above this, IP-Adapter copies the face image (pose and clothes too) and follows little of the prompt
const COPYING_STRENGTH = 0.8

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
        <NoFace />
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
            {isPhoto(face.source) ? t('characters.removePhoto') : t('characters.removeFace')}
          </button>
        )}
      </div>
      {isPhoto(face.source) && <SafeForWorkNote name={name} />}
    </div>
  )
}

/** The explanation, with the name of the viewer's "Use as face" action set in bold wherever the language puts it. */
function NoFace() {
  const [before, after] = t('characters.noFace').split('{action}')
  return (
    <p className="text-xs text-zinc-500 dark:text-zinc-400">
      {before}
      <span className="font-medium">{t('characters.useAsFace')}</span>
      {after}
    </p>
  )
}

function FacePreview({ source, characterId }: { source: FaceSource; characterId: number | null }) {
  if (source.kind === 'history') {
    return (
      <span role="img" aria-label={t('characters.faceImage', { id: source.id })} className="shrink-0">
        <SensitiveImage src={imageUrl(source.id, true)} sensitive={source.sensitive} compact className="size-20 rounded-lg" />
      </span>
    )
  }
  const src = source.kind === 'photo' ? source.dataUrl : characterId !== null ? uploadedFaceUrl(characterId, true) : ''
  return <img src={src} alt={t('characters.uploadedPhoto')} className="size-20 shrink-0 rounded-lg bg-zinc-100 object-cover dark:bg-zinc-800" />
}

function StrengthSlider({ strength, onChange }: { strength: number; onChange: (strength: number) => void }) {
  return (
    <div className="min-w-0 flex-1 space-y-2">
      <div className="flex justify-between text-xs font-medium text-zinc-600 dark:text-zinc-300">
        <span>{t('characters.faceStrength')}</span>
        <span className="tabular-nums">{Math.round(strength * 100)}%</span>
      </div>
      <Slider label={t('characters.faceStrength')} min={MIN_STRENGTH} max={MAX_STRENGTH} step={STRENGTH_STEP} value={strength} onChange={(text) => onChange(Number(text))} />
      <div className="flex justify-between text-[11px] text-zinc-400">
        <span>{t('characters.followsPrompt')}</span>
        <span>{t('characters.keepsFace')}</span>
      </div>
      {strength > COPYING_STRENGTH && (
        <p role="status" className="text-xs text-amber-700 dark:text-amber-300">
          {t('characters.copyingWarning')}
        </p>
      )}
    </div>
  )
}

/** Reads the chosen photo in the browser; it is sent with the character when it is saved. */
function PhotoPicker({ replacing, onPicked }: { replacing: boolean; onPicked: (dataUrl: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const read = (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return setError(t('characters.photoNotImage'))
    if (file.size > MAX_PHOTO_BYTES) return setError(t('characters.photoTooLarge'))
    setError(null)
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' && onPicked(reader.result)
    reader.onerror = () => setError(t('characters.photoUnreadable'))
    reader.readAsDataURL(file)
  }
  return (
    <>
      <button type="button" onClick={() => input.current?.click()} className={secondaryButtonClass}>
        {replacing ? t('characters.replacePhoto') : t('characters.uploadPhoto')}
      </button>
      <input ref={input} type="file" accept="image/*" aria-label={t('characters.facePhoto')} className="hidden" onChange={(event) => read(event.target.files?.[0])} />
      {error && (
        <p role="alert" className="basis-full text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </>
  )
}

function SafeForWorkNote({ name }: { name: string }) {
  const who = name.trim() || t('characters.thisCharacter')
  return (
    <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
      {t('characters.safeForWorkNote', { name: who })}
    </p>
  )
}
