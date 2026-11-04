import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../../api'
import App from '../../App'
import { catalogFor } from '../../lib/adultContent'
import { animeModel, catalog, deferred, fastModel, historyItem, tattooAddon } from '../../test/fixtures'
import type { Catalog } from '../../types'

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  fetchCatalog: vi.fn(),
  fetchModelStatus: vi.fn(),
  generateImage: vi.fn(),
  fetchJobProgress: vi.fn(),
  fetchHistory: vi.fn(),
  fetchHistorySummary: vi.fn(),
  fetchCharacters: vi.fn(),
  checkUnlockWord: vi.fn(),
}))

const adultAddon = { ...tattooAddon, id: 'turbo-pussy', label: 'Turbo Pussy Z', adult: true }
const withAdult: Catalog = {
  ...catalog,
  models: [{ ...fastModel, addons: [tattooAddon, adultAddon] }, { ...animeModel, adult: true }],
  adult_content: { available: true, word_lock: true },
}

beforeEach(() => {
  vi.mocked(api.fetchCatalog).mockResolvedValue(withAdult)
  vi.mocked(api.fetchModelStatus).mockResolvedValue({ server_running: true, models: { 'z-image-turbo': { status: 'ready', size_bytes: 1 } }, free_bytes: 1e11 })
  vi.mocked(api.generateImage).mockReset().mockResolvedValue(historyItem())
  vi.mocked(api.fetchJobProgress).mockReturnValue(new Promise(() => {}))
  vi.mocked(api.fetchHistory).mockResolvedValue({ items: [], total: 0 })
  vi.mocked(api.fetchHistorySummary).mockReturnValue(new Promise(() => {}))
  vi.mocked(api.fetchCharacters).mockResolvedValue([])
  vi.mocked(api.checkUnlockWord).mockReset().mockImplementation(async (typed) => typed.endsWith('peach'))
})

afterEach(() => window.history.replaceState(null, '', '/'))

describe('the catalog the app works from', () => {
  it('has everything with adult content shown, and nothing adult without it, every purpose left kept safe', () => {
    expect(catalogFor(withAdult, true)).toBe(withAdult)
    const locked = catalogFor(withAdult, false)
    expect(locked.models.map((model) => model.id)).toEqual(['z-image-turbo'])
    expect(locked.models[0].addons.map((addon) => addon.id)).toEqual(['tattoo'])
    expect(locked.builder_modes.map((mode) => mode.id)).not.toEqual(expect.arrayContaining(['glamour']))
    expect(locked.builder_modes.every((mode) => mode.content === 'safe' && !mode.steps.includes('intimacy'))).toBe(true)
  })
})

const purposes = async () => {
  await userEvent.click(screen.getByRole('button', { name: /Prompt builder/ }))
  const dialog = await screen.findByRole('dialog', { name: 'Prompt builder' })
  const names = within(dialog).getAllByRole('radio').map((radio) => radio.textContent)
  await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
  return names
}

async function generateFox() {
  await userEvent.type(screen.getByLabelText('Prompt'), 'a red fox')
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  return vi.mocked(api.generateImage).mock.calls.at(-1)![0]
}

describe('the browser lock', () => {
  it('starts locked: no 18+ purposes, safe renders, and History without sensitive images', async () => {
    render(<App />)
    await screen.findByLabelText('Prompt')

    expect(await purposes()).not.toContain('Explicit (18+)')
    expect(await generateFox()).toMatchObject({ safeOnly: true, modelId: 'z-image-turbo' })
    await userEvent.click(screen.getByRole('button', { name: /^History/ }))
    await waitFor(() => expect(api.fetchHistory).toHaveBeenLastCalledWith(0, 30, expect.anything(), true, expect.any(AbortSignal)))
  })

  it('unlocks once the word is typed outside any field, only after the server says it matches, and exactly once', async () => {
    const answer = deferred<boolean>()
    vi.mocked(api.checkUnlockWord).mockReturnValue(answer.promise)
    render(<App />)
    await screen.findByLabelText('Prompt')

    await userEvent.keyboard('xpeach')
    await waitFor(() => expect(api.checkUnlockWord).toHaveBeenCalledExactlyOnceWith('xpeach'))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(await purposes()).not.toContain('Explicit (18+)')

    await act(async () => answer.resolve(true))
    expect(screen.getByRole('status')).toHaveTextContent('Adult content shown')
    expect(await purposes()).toContain('Explicit (18+)')
    expect(await generateFox()).toMatchObject({ safeOnly: false })
    expect(api.checkUnlockWord).toHaveBeenCalledOnce()
  })

  it('does not listen to what is typed in a field, and locks again when the word is typed again', async () => {
    render(<App />)
    await userEvent.type(await screen.findByLabelText('Prompt'), 'peach')
    await new Promise((resolve) => setTimeout(resolve, 700))
    expect(api.checkUnlockWord).not.toHaveBeenCalled()

    screen.getByLabelText('Prompt').blur()
    await userEvent.keyboard('peach')
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Adult content shown'))
    await userEvent.keyboard('peach')
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Adult content hidden'))
  })

  it('opens a field for the word after five taps on the title, for phones', async () => {
    render(<App />)
    const title = await screen.findByRole('heading', { name: 'Z-Image Studio' })
    for (let tap = 0; tap < 5; tap++) fireEvent.click(title)
    const dialog = screen.getByRole('dialog', { name: 'Enter the word' })

    await userEvent.type(within(dialog).getByLabelText('Word'), 'plum{Enter}')
    expect(await within(dialog).findByRole('alert')).toHaveTextContent("That isn't the word.")
    await userEvent.clear(within(dialog).getByLabelText('Word'))
    await userEvent.type(within(dialog).getByLabelText('Word'), 'peach{Enter}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('status')).toHaveTextContent('Adult content shown')
  })

  it('has no lock to open while .env keeps adult content off', async () => {
    vi.mocked(api.fetchCatalog).mockResolvedValue({ ...catalog, adult_content: { available: false, word_lock: true } })
    render(<App />)
    const title = await screen.findByRole('heading', { name: 'Z-Image Studio' })
    for (let tap = 0; tap < 5; tap++) fireEvent.click(title)
    await userEvent.keyboard('peach')
    await new Promise((resolve) => setTimeout(resolve, 700))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.checkUnlockWord).not.toHaveBeenCalled()
  })
})
