import { createContext, useContext } from 'react'
import type { Character, Loadable } from '../types'

export interface CharactersValue {
  characters: Loadable<Character[]>
  reload: () => void
}

// Outside the app (in tests of a single component) there are simply no characters
export const CharactersContext = createContext<CharactersValue>({ characters: { status: 'settled', value: [] }, reload: () => {} })

export function useCharacters(): CharactersValue {
  return useContext(CharactersContext)
}

/** The character with this id, once the list has loaded; null for none, a deleted one, or while loading. */
export function useCharacter(id: number | null): Character | null {
  const { characters } = useCharacters()
  if (id === null || characters.status !== 'settled') return null
  return characters.value.find((character) => character.id === id) ?? null
}
