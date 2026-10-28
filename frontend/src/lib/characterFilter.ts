import { useCallback, useEffect, useRef, useState } from 'react'
import type { Character } from '../types'

export type Gender = 'all' | 'women' | 'men'

export const GENDERS: { id: Gender; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'women', label: 'Women' },
  { id: 'men', label: 'Men' },
]

// A couple fits neither, so it shows under All only
const WHO_BY_GENDER: Record<Exclude<Gender, 'all'>, readonly string[]> = { women: ['woman', 'two women'], men: ['man', 'two men'] }

export function matchesGender(character: Character, gender: Gender): boolean {
  return gender === 'all' || WHO_BY_GENDER[gender].includes(character.traits.who)
}

const STORAGE_KEY = 'z-image-studio.character-gender.v1'

/** A known gender other than All, or null. */
function knownGender(value: string | null): Gender | null {
  return GENDERS.find((gender) => gender.id === value && gender.id !== 'all')?.id ?? null
}

function genderIn(search: string): Gender | null {
  return knownGender(new URLSearchParams(search).get('gender'))
}

function remembered(): Gender | null {
  try {
    return knownGender(localStorage.getItem(STORAGE_KEY))
  } catch {
    return null
  }
}

function remember(gender: Gender): void {
  try {
    if (gender === 'all') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, gender)
  } catch {
    // Storage can be blocked; the filter then simply starts at All next time
  }
}

const addressOf = (gender: Gender) => `${window.location.pathname}${gender === 'all' ? '' : `?gender=${gender}`}`

/**
 * The Characters page's gender filter, kept in the address like History's filters, so Back and links keep it, and
 * remembered, so opening Characters again shows the last one. A gender in the address wins over the remembered one.
 */
export function useGenderFilter(): [Gender, (gender: Gender) => void] {
  const [gender, setGender] = useState<Gender>(() => genderIn(window.location.search) ?? remembered() ?? 'all')
  const openedWith = useRef(gender)
  useEffect(() => {
    // Opened without one, the address takes the remembered gender, so it matches what is shown
    if (genderIn(window.location.search) === null) window.history.replaceState(null, '', addressOf(openedWith.current))
  }, [])
  useEffect(() => {
    const followAddress = () => setGender(genderIn(window.location.search) ?? 'all')
    window.addEventListener('popstate', followAddress)
    return () => window.removeEventListener('popstate', followAddress)
  }, [])
  const change = useCallback((next: Gender) => {
    window.history.pushState(null, '', addressOf(next))
    remember(next)
    setGender(next)
  }, [])
  return [gender, change]
}
