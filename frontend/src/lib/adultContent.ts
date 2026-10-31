// The browser's own lock on adult content, on top of ADULT_CONTENT in .env (backend/adult_content.py): while it is
// locked, the app works from a catalog without the 18+ purposes, adult models and add-ons, History leaves out sensitive
// images, and renders are kept safe for work. It is a privacy screen for this browser; the .env lock is the real one.
import { createContext, useContext } from 'react'
import type { BuilderModeData, Catalog, ModelInfo } from '../types'

export interface AdultContentValue {
  /** Adult content is shown: available in .env, and unlocked in this browser (or no hidden word is set). */
  shown: boolean
  /** Switches this browser's lock, once the hidden word was typed. */
  toggle: () => void
}

// Outside the app (in tests of a single component) adult content is simply shown
export const AdultContentContext = createContext<AdultContentValue>({ shown: true, toggle: () => {} })

export function useAdultContent(): AdultContentValue {
  return useContext(AdultContentContext)
}

const STORAGE_KEY = 'z-image-studio.adult-content-unlocked'

/** Every browser starts locked; storage that can't be read counts as locked. */
export function loadUnlocked(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function saveUnlocked(unlocked: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(unlocked))
  } catch {
    // Private windows can refuse storage; the lock then lasts as long as the page
  }
}

/** As isAdultMode in promptBuilder/modes.ts: an 18+ content level, or the Intimacy step. */
const isAdultModeData = (mode: BuilderModeData) => mode.content === 'suggestive' || mode.content === 'explicit' || mode.steps.includes('intimacy')

/** Without adult content every remaining purpose is safe for work: no lingerie, and the safe negatives. */
const keptSafe = (modes: readonly BuilderModeData[]) => modes.filter((mode) => !isAdultModeData(mode)).map((mode) => ({ ...mode, content: 'safe' }))

const withoutAdultAddons = (model: ModelInfo): ModelInfo => ({ ...model, addons: model.addons.filter((addon) => !addon.adult) })

/** The catalog the app works from: the whole of it with adult content shown, else without anything adult. */
export function catalogFor(catalog: Catalog, shown: boolean): Catalog {
  if (shown) return catalog
  return {
    ...catalog,
    models: catalog.models.filter((model) => !model.adult).map(withoutAdultAddons),
    builder_modes: keptSafe(catalog.builder_modes),
  }
}
