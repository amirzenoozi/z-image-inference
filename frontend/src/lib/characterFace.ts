import type { Character, CharacterChanges } from '../types'

/** Where the character's face comes from: nowhere, a History image, the photo already uploaded, or a photo just picked. */
export type FaceSource =
  | { kind: 'none' }
  | { kind: 'history'; id: number; sensitive: boolean }
  | { kind: 'uploaded' }
  | { kind: 'photo'; dataUrl: string }

export interface FaceLock {
  source: FaceSource
  strength: number
}

const DEFAULT_FACE_STRENGTH = 0.6
// The server accepts about 10 MB of image
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024

function sourceOf(character: Character | null): FaceSource {
  if (character?.face_uploaded) return { kind: 'uploaded' }
  if (character?.face_id != null) return { kind: 'history', id: character.face_id, sensitive: character.face_sensitive }
  return { kind: 'none' }
}

export function initialFace(character: Character | null): FaceLock {
  return { source: sourceOf(character), strength: character?.face_strength ?? DEFAULT_FACE_STRENGTH }
}

/** The face fields to save: the server keeps one face at a time, so a History face replaces a photo and the other way round. */
export function faceChanges(face: FaceLock): Pick<CharacterChanges, 'face_id' | 'face_upload' | 'face_strength'> {
  const { source, strength } = face
  if (source.kind === 'history') return { face_id: source.id, face_strength: strength }
  if (source.kind === 'uploaded') return { face_strength: strength }
  if (source.kind === 'photo') return { face_id: null, face_upload: source.dataUrl.slice(source.dataUrl.indexOf(',') + 1), face_strength: strength }
  return { face_id: null, face_upload: null, face_strength: strength }
}

export function isPhoto(source: FaceSource): boolean {
  return source.kind === 'uploaded' || source.kind === 'photo'
}
