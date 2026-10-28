import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import * as api from '../api'
import { CharactersContext } from '../lib/characters'
import { animeModel, character, deferred, fastModel, historyItem } from '../test/fixtures'
import type { Character } from '../types'
import { CharacterPicker } from './CharacterPicker'
import { ImageCharacter } from './ImageCharacter'

vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api')>()), updateCharacter: vi.fn() }))

beforeEach(() => vi.mocked(api.updateCharacter).mockReset())

function withCharacters(characters: Character[], children: ReactNode) {
  const reload = vi.fn()
  render(<CharactersContext.Provider value={{ characters: { status: 'settled', value: characters }, reload }}>{children}</CharactersContext.Provider>)
  return reload
}

it('makes an image the character’s face, waiting for the save before reloading', async () => {
  const saved = deferred<Character>()
  vi.mocked(api.updateCharacter).mockReturnValue(saved.promise)
  const reload = withCharacters([character({ cover_id: 5 })], <ImageCharacter item={historyItem({ id: 5, character_id: 3 })} />)

  expect(screen.getByText('· its cover')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Use as face' }))
  expect(api.updateCharacter).toHaveBeenCalledExactlyOnceWith(3, { face_id: 5 })
  expect(screen.getByRole('button', { name: 'Use as face' })).toBeDisabled()
  expect(reload).not.toHaveBeenCalled()

  saved.resolve(character({ face_id: 5 }))
  await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce())
})

it('shows nothing for an image without a character', () => {
  withCharacters([character()], <ImageCharacter item={historyItem()} />)
  expect(screen.queryByText('Ava')).not.toBeInTheDocument()
})

it('says whether the chosen model keeps the character’s face', () => {
  const ava = character({ face_id: 12, face_strength: 0.7 })
  withCharacters([ava], <CharacterPicker characterId={3} model={animeModel} onChange={vi.fn()} />)
  expect(screen.getByText('Face locked to image #12 at 70%.')).toBeInTheDocument()
})

it('explains that other models use the description only', () => {
  withCharacters([character({ face_id: 12 })], <CharacterPicker characterId={3} model={fastModel} onChange={vi.fn()} />)
  expect(screen.getByText(/Z-Image-Turbo can't lock a face, so Ava's look comes from the description only/)).toBeInTheDocument()
})
