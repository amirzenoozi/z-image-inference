import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import * as api from '../api'
import { CharactersContext } from '../lib/characters'
import { character } from '../test/fixtures'
import type { Character, Loadable } from '../types'
import { CharactersPanel } from './CharactersPanel'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  createCharacter: vi.fn(),
  updateCharacter: vi.fn(),
  deleteCharacter: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(api.createCharacter).mockReset().mockResolvedValue(character())
  vi.mocked(api.updateCharacter).mockReset().mockResolvedValue(character())
  vi.mocked(api.deleteCharacter).mockReset().mockResolvedValue()
})

function renderPanel(characters: Loadable<Character[]>) {
  const handlers = { reload: vi.fn(), onUse: vi.fn(), onShowImages: vi.fn() }
  render(
    <CharactersContext.Provider value={{ characters, reload: handlers.reload }}>
      <CharactersPanel maxSeed={4294967295} onUse={handlers.onUse} onShowImages={handlers.onShowImages} />
    </CharactersContext.Provider>,
  )
  return handlers
}

it('shows a placeholder, not the empty state, while characters load', () => {
  renderPanel({ status: 'pending' })
  expect(screen.getByLabelText('Loading characters')).toBeInTheDocument()
  expect(screen.queryByText(/No characters yet/)).not.toBeInTheDocument()
})

it('shows an error with a retry when characters fail to load', async () => {
  const { reload } = renderPanel({ status: 'failed', error: 'Server down' })
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(reload).toHaveBeenCalledOnce()
  expect(screen.queryByText(/No characters yet/)).not.toBeInTheDocument()
})

it('lists each character with its cover, look and image count, and links to Create and History', async () => {
  const ava = character({ cover_id: 8, image_count: 2, seed: 42 })
  const { onUse, onShowImages } = renderPanel({ status: 'settled', value: [ava] })

  const card = screen.getByRole('listitem', { name: 'Ava' })
  expect(within(card).getByText('woman, late 20s, green eyes, long auburn hair')).toBeInTheDocument()
  expect(within(card).getByText('2 images · seed 42')).toBeInTheDocument()
  expect(card.querySelector('img')).toHaveAttribute('src', '/api/history/8/image?thumb=true')

  await userEvent.click(within(card).getByRole('button', { name: 'Use' }))
  await userEvent.click(within(card).getByRole('button', { name: 'Show images' }))
  expect(onUse).toHaveBeenCalledWith(ava)
  expect(onShowImages).toHaveBeenCalledWith(ava)
})

it('deletes a character only after confirming', async () => {
  const { reload } = renderPanel({ status: 'settled', value: [character()] })
  await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
  expect(api.deleteCharacter).not.toHaveBeenCalled()

  const dialog = screen.getByRole('dialog', { name: 'Delete Ava?' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
  expect(api.deleteCharacter).toHaveBeenCalledExactlyOnceWith(3)
  expect(reload).toHaveBeenCalledOnce()
})

it('edits a character, refusing details that suggest a minor', async () => {
  const { reload } = renderPanel({ status: 'settled', value: [character()] })
  await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
  const dialog = screen.getByRole('dialog', { name: 'Edit Ava' })

  await userEvent.type(within(dialog).getByLabelText('Extra subject details'), 'a schoolgirl')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
  expect(within(dialog).getByRole('alert')).toHaveTextContent('Characters must be adults. Remove “schoolgirl”.')
  expect(api.updateCharacter).not.toHaveBeenCalled()

  await userEvent.clear(within(dialog).getByLabelText('Extra subject details'))
  await userEvent.type(within(dialog).getByLabelText('Seed'), '42')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
  expect(api.updateCharacter).toHaveBeenCalledExactlyOnceWith(3, expect.objectContaining({ name: 'Ava', seed: 42, traits: expect.objectContaining({ hairColor: 'auburn' }) }))
  expect(reload).toHaveBeenCalledOnce()
})
