import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as api from '../../api'
import { CharactersContext } from '../../lib/characters'
import { character } from '../../test/fixtures'
import type { Character, Loadable } from '../../types'
import { CharactersPage } from './CharactersPage'

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
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
      <CharactersPage maxSeed={4294967295} onUse={handlers.onUse} onShowImages={handlers.onShowImages} />
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

it('changes the face strength or removes the face image', async () => {
  renderPanel({ status: 'settled', value: [character({ face_id: 12, face_strength: 0.6 })] })
  expect(screen.getByText('0 images · face locked')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
  const dialog = screen.getByRole('dialog', { name: 'Edit Ava' })
  expect(within(dialog).getByRole('img', { name: 'Face image #12' })).toBeInTheDocument()

  fireEvent.change(within(dialog).getByLabelText('Face strength'), { target: { value: '0.8' } })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Remove face' }))
  expect(within(dialog).getByText(/^No face\./)).toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

  expect(api.updateCharacter).toHaveBeenCalledWith(3, expect.objectContaining({ face_id: null, face_strength: 0.8 }))
})

afterEach(() => window.history.replaceState(null, '', '/'))

const women = character({ id: 1, name: 'Mei' })
const man = character({ id: 2, name: 'Ravi', traits: { ...character().traits, who: 'man', bust: '' } })
const couple = character({ id: 4, name: 'Duo', traits: { ...character().traits, who: 'couple' } })

it('filters the characters by gender, keeping the choice in the address', async () => {
  window.history.replaceState(null, '', '/characters')
  renderPanel({ status: 'settled', value: [women, man, couple] })
  expect(screen.getByText('3 characters')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('radio', { name: 'Men' }))
  expect(screen.getAllByRole('listitem').map((card) => card.getAttribute('aria-label'))).toEqual(['Ravi'])
  expect(screen.getByText('1 of 3 characters')).toBeInTheDocument()
  expect(window.location.search).toBe('?gender=men')

  await userEvent.click(screen.getByRole('radio', { name: 'Women' }))
  expect(screen.getAllByRole('listitem').map((card) => card.getAttribute('aria-label'))).toEqual(['Mei'])
  await userEvent.click(screen.getByRole('radio', { name: 'All' }))
  expect(screen.getAllByRole('listitem')).toHaveLength(3)
  expect(window.location.search).toBe('')
})

it('opens with the gender named in the address, and offers to show all when none match', async () => {
  window.history.replaceState(null, '', '/characters?gender=men')
  renderPanel({ status: 'settled', value: [women] })
  expect(screen.getByRole('radio', { name: 'Men' })).toHaveAttribute('aria-checked', 'true')
  expect(screen.getByText('No characters match.')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Show all' }))
  expect(screen.getByRole('listitem', { name: 'Mei' })).toBeInTheDocument()
})

it('fills the look with Surprise me, keeping the name and "Who"', async () => {
  renderPanel({ status: 'settled', value: [man] })
  await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
  const dialog = screen.getByRole('dialog', { name: 'Edit Ravi' })

  await userEvent.click(within(dialog).getByRole('button', { name: 'Surprise me' }))
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

  const [, saved] = vi.mocked(api.updateCharacter).mock.calls[0]
  expect(saved).toMatchObject({ name: 'Ravi', traits: expect.objectContaining({ who: 'man', bust: '' }) })
  expect(saved.traits?.hairColor).not.toBe('')
})

it('blurs a sensitive cover on its card', () => {
  renderPanel({ status: 'settled', value: [character({ cover_id: 8, cover_sensitive: true })] })
  const card = screen.getByRole('listitem', { name: 'Ava' })
  expect(within(card).getByText('Sensitive')).toBeInTheDocument()
  expect(card.querySelector('img')).toHaveClass('blur-xl')
})

it('lets a gender in the address win over the remembered one', () => {
  localStorage.setItem('z-image-studio.character-gender.v1', 'men')
  window.history.replaceState(null, '', '/characters?gender=women')
  renderPanel({ status: 'settled', value: [women, man] })
  expect(screen.getByRole('radio', { name: 'Women' })).toHaveAttribute('aria-checked', 'true')
})

it('opens with the remembered gender when the address has none, and forgets it on All', async () => {
  localStorage.setItem('z-image-studio.character-gender.v1', 'women')
  window.history.replaceState(null, '', '/characters')
  renderPanel({ status: 'settled', value: [women, man] })
  expect(screen.getByRole('radio', { name: 'Women' })).toHaveAttribute('aria-checked', 'true')
  expect(window.location.search).toBe('?gender=women')

  await userEvent.click(screen.getByRole('radio', { name: 'All' }))
  expect(localStorage.getItem('z-image-studio.character-gender.v1')).toBeNull()
})

it('uploads a face photo with the character, and explains that it is kept safe for work', async () => {
  renderPanel({ status: 'settled', value: [character({ face_id: 12 })] })
  await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
  const dialog = screen.getByRole('dialog', { name: 'Edit Ava' })

  await userEvent.upload(within(dialog).getByLabelText('Face photo'), new File(['photo-bytes'], 'me.jpg', { type: 'image/jpeg' }))
  expect(await within(dialog).findByRole('img', { name: 'Uploaded face photo' })).toBeInTheDocument()
  expect(within(dialog).getByText(/images of Ava are kept safe for work/)).toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

  const [, saved] = vi.mocked(api.updateCharacter).mock.calls[0]
  expect(saved).toMatchObject({ face_id: null, face_upload: btoa('photo-bytes') })
})

it('refuses a file that is not an image before sending anything', async () => {
  renderPanel({ status: 'settled', value: [character()] })
  await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
  const dialog = screen.getByRole('dialog', { name: 'Edit Ava' })

  await userEvent.upload(within(dialog).getByLabelText('Face photo'), new File(['%PDF'], 'notes.pdf', { type: 'application/pdf' }), { applyAccept: false })
  expect(within(dialog).getByRole('alert')).toHaveTextContent('Choose an image file')
  expect(within(dialog).queryByRole('img', { name: 'Uploaded face photo' })).not.toBeInTheDocument()
})

it('keeps a stored photo when saving other changes, and removes it on request', async () => {
  renderPanel({ status: 'settled', value: [character({ face_uploaded: true })] })
  await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
  const dialog = screen.getByRole('dialog', { name: 'Edit Ava' })
  expect(within(dialog).getByRole('img', { name: 'Uploaded face photo' })).toHaveAttribute('src', '/api/characters/3/face-upload?thumb=true')

  await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
  expect(vi.mocked(api.updateCharacter).mock.calls[0][1]).not.toHaveProperty('face_upload')

  await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Edit Ava' })).getByRole('button', { name: 'Remove photo' }))
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Edit Ava' })).getByRole('button', { name: 'Save' }))
  expect(vi.mocked(api.updateCharacter).mock.calls[1][1]).toMatchObject({ face_id: null, face_upload: null })
})

it('warns that a face strength above 80% copies the face image', async () => {
  renderPanel({ status: 'settled', value: [character({ face_id: 12, face_strength: 0.6 })] })
  await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
  const dialog = screen.getByRole('dialog', { name: 'Edit Ava' })
  expect(within(dialog).queryByText(/the face image is copied/)).not.toBeInTheDocument()

  fireEvent.change(within(dialog).getByLabelText('Face strength'), { target: { value: '0.85' } })
  expect(within(dialog).getByText(/Above 80% the face image is copied/)).toBeInTheDocument()
})
