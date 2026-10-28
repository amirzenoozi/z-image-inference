import { useMemo, type ReactNode } from 'react'
import { fetchCharacters } from '../api'
import { CharactersContext } from '../lib/characters'
import { useLoadable } from '../lib/hooks'

/** Loads the characters once for the whole app; Create, History, the builder and the Characters page share them. */
export function CharactersProvider({ children }: { children: ReactNode }) {
  const [characters, reload] = useLoadable(fetchCharacters)
  const value = useMemo(() => ({ characters, reload }), [characters, reload])
  return <CharactersContext.Provider value={value}>{children}</CharactersContext.Provider>
}
