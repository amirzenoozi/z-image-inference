import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as api from './api'
import App from './App'
import { catalog, character, deferred, historyItem } from './test/fixtures'
import { initialSettings } from './lib/settings'
import type { HistoryItem } from './types'
import { chooseOption } from './test/select'
import { STATUS_POLL_MS } from './lib/modelStatus'

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  fetchCatalog: vi.fn(),
  fetchModelStatus: vi.fn(),
  generateImage: vi.fn(),
  fetchJobProgress: vi.fn(),
  cancelJob: vi.fn(),
  fetchHistory: vi.fn(),
  fetchHistorySummary: vi.fn(),
  fetchPalette: vi.fn(),
  fetchCharacters: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(api.fetchCatalog).mockResolvedValue(catalog)
  const ready = { status: 'ready' as const, size_bytes: 1 }
  vi.mocked(api.fetchModelStatus).mockResolvedValue({ server_running: true, models: { 'z-image-turbo': ready, 'wai-illustrious': ready }, free_bytes: 1e11 })
  vi.mocked(api.generateImage).mockReset()
  vi.mocked(api.fetchJobProgress).mockReturnValue(new Promise(() => {}))
  vi.mocked(api.cancelJob).mockReset().mockResolvedValue()
  vi.mocked(api.fetchHistorySummary).mockReturnValue(new Promise(() => {}))
  vi.mocked(api.fetchPalette).mockResolvedValue([])
  vi.mocked(api.fetchHistory).mockResolvedValue({ items: [], total: 0 })
  vi.mocked(api.fetchCharacters).mockResolvedValue([])
})

it('generates exactly once and shows the image only after it arrives', async () => {
  const pending = deferred<HistoryItem>()
  vi.mocked(api.generateImage).mockReturnValue(pending.promise)
  render(<App />)

  await userEvent.type(await screen.findByLabelText('Prompt'), 'a red fox')
  const generate = screen.getByRole('button', { name: 'Generate' })
  await userEvent.dblClick(generate)

  expect(api.generateImage).toHaveBeenCalledOnce()
  expect(vi.mocked(api.generateImage).mock.calls[0][0]).toMatchObject({ prompt: 'a red fox', modelId: 'z-image-turbo' })
  expect(screen.getByRole('button', { name: 'Generating…' })).toHaveAttribute('aria-disabled', 'true')
  expect(screen.queryByRole('img')).not.toBeInTheDocument()

  pending.resolve(historyItem({ id: 3, prompt: 'a red fox' }))

  expect(await screen.findByRole('img', { name: 'a red fox' })).toHaveAttribute('src', '/api/history/3/image')
  expect(api.generateImage).toHaveBeenCalledOnce()
})

it('resets sampling when switching model and offers the remaining defaults', async () => {
  render(<App />)

  await userEvent.click(await screen.findByRole('button', { name: 'Change' }))
  await userEvent.click(screen.getByRole('radio', { name: /WAI-Illustrious/ }))
  expect(screen.getByLabelText('Steps')).toHaveValue(28)
  expect(screen.getByLabelText('Guidance (CFG)')).toHaveValue(7)
  expect(screen.getByText(/Sampling was reset to WAI-Illustrious’s defaults/)).toBeInTheDocument()
  expect(screen.getByLabelText('Negative prompt')).toHaveValue('')

  await userEvent.click(screen.getByRole('button', { name: 'Use defaults' }))
  expect(screen.getByLabelText('Negative prompt')).toHaveValue('nsfw, low quality')
  expect(screen.queryByText(/Sampling was reset/)).not.toBeInTheDocument()
})

it('fills the prompt from an example card, with each model offering its own examples', async () => {
  render(<App />)

  await userEvent.type(await screen.findByLabelText('Prompt'), 'my own idea')
  await userEvent.click(screen.getByRole('button', { name: 'Example #2' }))
  expect(screen.getByLabelText('Prompt')).toHaveValue('A lighthouse at dawn')

  await userEvent.click(screen.getByRole('button', { name: 'Change' }))
  await userEvent.click(screen.getByRole('radio', { name: /WAI-Illustrious/ }))
  expect(screen.queryByRole('button', { name: 'Example #2' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Example #1' }))
  expect(screen.getByLabelText('Prompt')).toHaveValue('1girl, adult woman, kimono')
})

it('shows no example cards for a model without examples', async () => {
  vi.mocked(api.fetchCatalog).mockResolvedValue({ ...catalog, models: catalog.models.map((model) => ({ ...model, examples: [] })) })
  render(<App />)

  await screen.findByLabelText('Prompt')
  expect(screen.queryByRole('button', { name: /^Example #/ })).not.toBeInTheDocument()
})

it('cancels the running generation once and goes back to the previous result without an error', async () => {
  const first = historyItem({ id: 3, prompt: 'a red fox' })
  vi.mocked(api.generateImage).mockResolvedValueOnce(first)
  render(<App />)
  await userEvent.type(await screen.findByLabelText('Prompt'), 'a red fox')
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  expect(await screen.findByRole('img', { name: 'a red fox' })).toBeInTheDocument()

  const second = deferred<HistoryItem>()
  vi.mocked(api.generateImage).mockReturnValueOnce(second.promise)
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  const jobId = vi.mocked(api.generateImage).mock.calls[1][1]
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await userEvent.click(screen.getByRole('button', { name: 'Cancelling…' }))

  expect(api.cancelJob).toHaveBeenCalledOnce()
  expect(api.cancelJob).toHaveBeenCalledWith(jobId)

  second.reject(new api.ApiError('Cancelled', api.CANCELLED_STATUS))

  expect(await screen.findByRole('img', { name: 'a red fox' })).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Generate' })).toHaveAttribute('aria-disabled', 'false')
})

it('shows a retryable error when the catalog cannot load', async () => {
  vi.mocked(api.fetchCatalog).mockRejectedValueOnce(new Error('Could not reach the app server'))
  render(<App />)

  await userEvent.click(await screen.findByRole('button', { name: 'Retry' }))

  expect(await screen.findByRole('button', { name: 'Generate' })).toBeInTheDocument()
})

it('fills the Write box from the prompt builder dialog, then generates with it', async () => {
  vi.mocked(api.generateImage).mockResolvedValue(historyItem())
  render(<App />)

  await userEvent.click(await screen.findByRole('button', { name: /Prompt builder/ }))
  const dialog = screen.getByRole('dialog', { name: 'Prompt builder' })
  await chooseOption(within(dialog).getByLabelText('Who'), 'Man')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Use this prompt' }))

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Prompt')).toHaveValue('A photograph of an adult man.')
  expect(api.generateImage).not.toHaveBeenCalled()

  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  expect(vi.mocked(api.generateImage).mock.calls[0][0]).toMatchObject({
    prompt: 'A photograph of an adult man.',
    negativePrompt: expect.stringContaining('extra fingers'),
  })
})

afterEach(() => window.history.replaceState(null, '', '/'))

const currentView = () => within(screen.getByRole('navigation', { name: 'Views' })).getByRole('button', { current: 'page' })

it('opens the view named in the address, so a reload keeps it', async () => {
  window.history.replaceState(null, '', '/history')
  render(<App />)
  expect(await screen.findByRole('navigation', { name: 'Views' })).toBeInTheDocument()
  expect(currentView()).toHaveTextContent('History')
})

it('puts the view in the address, and Back returns to the previous view', async () => {
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: 'History' }))
  expect(window.location.pathname).toBe('/history')
  expect(currentView()).toHaveTextContent('History')

  await act(async () => window.history.back())

  await waitFor(() => expect(currentView()).toHaveTextContent('Create'))
  expect(window.location.pathname).toBe('/')
})

it('opens Create for any other address', async () => {
  window.history.replaceState(null, '', '/not-a-view')
  render(<App />)
  expect(await screen.findByRole('navigation', { name: 'Views' })).toBeInTheDocument()
  expect(currentView()).toHaveTextContent('Create')
})

it('starts History clean when coming back to it from Create', async () => {
  window.history.replaceState(null, '', '/history?page=2&favourites=1')
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: 'Create' }))
  expect(window.location.pathname + window.location.search).toBe('/')

  await userEvent.click(screen.getByRole('button', { name: 'History' }))

  expect(window.location.pathname + window.location.search).toBe('/history')
})

it('drops "nsfw" from the negative prompt when an explicit prompt is appended', async () => {
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: 'Change' }))
  await userEvent.click(screen.getByRole('radio', { name: /WAI-Illustrious/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Use defaults' }))
  expect(screen.getByLabelText('Negative prompt')).toHaveValue('nsfw, low quality')
  await userEvent.type(screen.getByLabelText('Prompt'), 'soft light')

  await userEvent.click(screen.getByRole('button', { name: /Prompt builder/ }))
  const dialog = screen.getByRole('dialog', { name: 'Prompt builder' })
  await chooseOption(within(dialog).getByLabelText('Who'), 'Woman')
  await chooseOption(within(dialog).getByLabelText('Age'), 'Early 30s')
  await userEvent.click(within(dialog).getByRole('radio', { name: 'Explicit (18+)' }))
  await userEvent.click(within(dialog).getByRole('button', { name: 'Append to prompt' }))

  expect(screen.getByLabelText('Negative prompt')).toHaveDisplayValue(/^low quality, /)
  expect(screen.getByLabelText('Prompt')).toHaveDisplayValue(/^soft light masterpiece, best quality/)
})

async function makeVariationsOf(item: HistoryItem) {
  vi.mocked(api.fetchHistory).mockResolvedValue({ items: [item], total: 1 })
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: 'History' }))
  await userEvent.click(await screen.findByRole('button', { name: `Open: ${item.prompt}` }))
  await userEvent.click(screen.getByRole('button', { name: 'Make variations' }))
}

it('makes variations of a History image: Create opens with its prompt, the image to start from and a new seed each time', async () => {
  vi.mocked(api.generateImage).mockResolvedValue(historyItem({ id: 8, varied_from: 5, change: 0.7 }))
  await makeVariationsOf(historyItem({ id: 5, prompt: 'a lighthouse', seed: 42 }))

  const block = await screen.findByRole('group', { name: 'Start image' })
  expect(within(block).getByText('Variation of image #5')).toBeInTheDocument()
  expect(within(block).getByText('50%')).toBeInTheDocument()
  expect(screen.getByLabelText('Prompt')).toHaveValue('a lighthouse')
  expect(screen.getByLabelText('Random each time')).toBeChecked()

  // The test browser does not move range inputs with keys, so the value is set as the browser would
  fireEvent.change(within(block).getByRole('slider', { name: 'Change' }), { target: { value: '0.7' } })
  expect(within(block).getByText('70%')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))

  expect(api.generateImage).toHaveBeenCalledOnce()
  expect(vi.mocked(api.generateImage).mock.calls[0][0]).toMatchObject({ prompt: 'a lighthouse', randomSeed: true, startImage: { id: 5, change: 0.7 } })
})

it('goes back to a normal render when the start image is removed', async () => {
  vi.mocked(api.generateImage).mockResolvedValue(historyItem())
  await makeVariationsOf(historyItem({ id: 5, prompt: 'a lighthouse' }))

  await userEvent.click(await screen.findByRole('button', { name: 'Remove the start image' }))
  expect(screen.queryByRole('group', { name: 'Start image' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))

  expect(vi.mocked(api.generateImage).mock.calls[0][0].startImage).toBeNull()
})

it('blocks Generate, saying why, when the model can\'t start from an image', async () => {
  vi.mocked(api.fetchCatalog).mockResolvedValue({ ...catalog, models: catalog.models.map((model) => ({ ...model, supports_variations: false })) })
  await makeVariationsOf(historyItem({ id: 5, prompt: 'a lighthouse' }))

  const block = await screen.findByRole('group', { name: 'Start image' })
  expect(within(block).getByRole('alert')).toHaveTextContent("Z-Image-Turbo can’t start from an image")
  expect(within(block).queryByRole('slider')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Generate' })).toHaveAttribute('aria-disabled', 'true')
})

it('gives every button a name, including those that show only an icon', async () => {
  const unnamed = () => screen.queryAllByRole('button').filter((button) => !button.getAttribute('aria-label') && !button.textContent?.trim())
  vi.mocked(api.fetchHistory).mockResolvedValue({ items: [historyItem({ id: 5, prompt: 'a lighthouse' })], total: 1 })
  render(<App />)

  await screen.findByRole('button', { name: 'Generate' })
  expect(unnamed()).toEqual([])

  await userEvent.click(screen.getByRole('button', { name: 'History' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Open: a lighthouse' }))
  expect(unnamed()).toEqual([])

  await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
  expect(unnamed()).toEqual([])
})

it('blocks Generate while the model server is down, saying why, and unblocks once it starts', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  const ready = { status: 'ready' as const, size_bytes: 1 }
  vi.mocked(api.fetchModelStatus)
    .mockResolvedValueOnce({ server_running: false, models: {}, free_bytes: null })
    .mockResolvedValue({ server_running: true, models: { 'z-image-turbo': ready, 'wai-illustrious': ready }, free_bytes: 1e11 })
  vi.mocked(api.generateImage).mockResolvedValue(historyItem())
  render(<App />)

  await user.type(await screen.findByLabelText('Prompt'), 'a red fox')
  const generate = screen.getByRole('button', { name: 'Generate' })
  await waitFor(() => expect(generate).toHaveAttribute('aria-disabled', 'true'))
  expect(generate).toHaveAccessibleDescription("The model server isn't running yet. Start it with: uv run python backend/model_server.py")

  generate.focus()
  await user.tab({ shift: true })
  await user.tab()
  expect(document.querySelector('[data-tooltip]')).toHaveTextContent("The model server isn't running yet")
  await user.click(generate)
  await user.keyboard('{Meta>}{Enter}{/Meta}')
  expect(api.generateImage).not.toHaveBeenCalled()

  await act(() => vi.advanceTimersByTimeAsync(STATUS_POLL_MS))
  await waitFor(() => expect(generate).toHaveAttribute('aria-disabled', 'false'))
  await user.click(generate)
  expect(api.generateImage).toHaveBeenCalledOnce()
  vi.useRealTimers()
})

it('explains a blocked Generate when there is no prompt yet', async () => {
  render(<App />)
  const generate = await screen.findByRole('button', { name: 'Generate' })
  await waitFor(() => expect(generate).toHaveAccessibleDescription('Write a prompt first'))
  expect(generate).toHaveAttribute('aria-disabled', 'true')
})

it('makes images for the chosen character, with its own seed, and lets a deleted one go', async () => {
  vi.mocked(api.fetchCharacters).mockResolvedValue([character({ seed: 42 })])
  vi.mocked(api.generateImage).mockResolvedValue(historyItem({ character_id: 3 }))
  render(<App />)

  await chooseOption(await screen.findByLabelText('Character'), 'Ava')
  await userEvent.type(screen.getByLabelText('Prompt'), 'a red fox')
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  expect(api.generateImage).toHaveBeenCalledWith(expect.objectContaining({ characterId: 3, seed: 42, randomSeed: false }), expect.any(String))
})

it('forgets a remembered character that no longer exists', async () => {
  localStorage.setItem('z-image-studio.settings.v1', JSON.stringify({ ...initialSettings(catalog), prompt: 'a cat', characterId: 9 }))
  vi.mocked(api.generateImage).mockResolvedValue(historyItem())
  render(<App />)
  // The character list loads first, and only then is the missing character forgotten
  await waitFor(() => expect(JSON.parse(localStorage.getItem('z-image-studio.settings.v1') ?? '{}')).toMatchObject({ characterId: null }))

  await userEvent.click(await screen.findByRole('button', { name: 'Generate' }))
  expect(api.generateImage).toHaveBeenCalledWith(expect.objectContaining({ characterId: null }), expect.any(String))
})

it('opens History filtered to a character from the Characters page', async () => {
  vi.mocked(api.fetchCharacters).mockResolvedValue([character({ image_count: 2 })])
  render(<App />)

  await userEvent.click(await screen.findByRole('button', { name: 'Characters' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Show images' }))

  expect(window.location.pathname + window.location.search).toBe('/history?character=3')
  await waitFor(() => expect(api.fetchHistory).toHaveBeenCalledWith(0, 30, expect.objectContaining({ character: 3 }), expect.any(AbortSignal)))
})

it('adds the chosen character’s look to a typed prompt, and says so', async () => {
  vi.mocked(api.fetchCharacters).mockResolvedValue([character()])
  vi.mocked(api.generateImage).mockResolvedValue(historyItem({ character_id: 3 }))
  render(<App />)

  await chooseOption(await screen.findByLabelText('Character'), 'Ava')
  expect(screen.getByText("Ava's look is added to the start of your prompt.")).toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('Prompt'), 'walking in the rain')
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))

  const sent = vi.mocked(api.generateImage).mock.calls[0][0]
  expect(sent.prompt).toBe('A photograph of an adult woman in her late 20s. She has green eyes. She has long auburn hair. walking in the rain')
  expect(screen.getByLabelText('Prompt')).toHaveValue('walking in the rain')
})

it('does not add the look again to a prompt the builder wrote for the character', async () => {
  vi.mocked(api.fetchCharacters).mockResolvedValue([character()])
  vi.mocked(api.generateImage).mockResolvedValue(historyItem({ character_id: 3 }))
  render(<App />)

  await chooseOption(await screen.findByLabelText('Character'), 'Ava')
  await userEvent.click(screen.getByRole('button', { name: /Prompt builder/ }))
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Prompt builder' })).getByRole('button', { name: 'Use this prompt' }))
  expect(screen.getByText("Your prompt already has Ava's look.")).toBeInTheDocument()

  const built = (screen.getByLabelText('Prompt') as HTMLTextAreaElement).value
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  expect(vi.mocked(api.generateImage).mock.calls[0][0].prompt).toBe(built)

  await userEvent.clear(screen.getByLabelText('Prompt'))
  expect(screen.getByText("Ava's look is added to the start of your prompt.")).toBeInTheDocument()
})

const createTab = () => within(screen.getByRole('navigation', { name: 'Views' })).getByRole('button', { name: /^Create/ })

async function startGenerating() {
  const pending = deferred<HistoryItem>()
  vi.mocked(api.generateImage).mockReturnValue(pending.promise)
  render(<App />)
  await userEvent.type(await screen.findByLabelText('Prompt'), 'a red fox')
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  return pending
}

it('marks Create with a dot when an image arrives on another view, until Create is opened', async () => {
  const pending = await startGenerating()
  await userEvent.click(screen.getByRole('button', { name: 'History' }))
  expect(createTab()).toHaveAccessibleName('Create')

  await act(async () => pending.resolve(historyItem({ prompt: 'a red fox' })))
  expect(createTab()).toHaveAccessibleName(/^Create ?\(new result\)$/)

  await userEvent.click(createTab())
  expect(createTab()).toHaveAccessibleName('Create')
  await userEvent.click(screen.getByRole('button', { name: 'History' }))
  expect(createTab()).toHaveAccessibleName('Create')
})

it('marks Create when the render fails on another view, but not after a cancel', async () => {
  const failing = await startGenerating()
  await userEvent.click(screen.getByRole('button', { name: 'Characters' }))
  await act(async () => failing.reject(new api.ApiError('The model server failed', 502)))
  expect(createTab()).toHaveAccessibleName(/^Create ?\(new result\)$/)

  await userEvent.click(createTab())
  const cancelled = deferred<HistoryItem>()
  vi.mocked(api.generateImage).mockReturnValue(cancelled.promise)
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await userEvent.click(screen.getByRole('button', { name: 'History' }))
  await act(async () => cancelled.reject(new api.ApiError('Cancelled', api.CANCELLED_STATUS)))
  expect(createTab()).toHaveAccessibleName('Create')
})

it('does not mark Create for a result seen there', async () => {
  const pending = await startGenerating()
  await act(async () => pending.resolve(historyItem({ prompt: 'a red fox' })))
  await userEvent.click(screen.getByRole('button', { name: 'History' }))
  expect(createTab()).toHaveAccessibleName('Create')
})

it.each([
  ['the image arrives', (pending: ReturnType<typeof deferred<HistoryItem>>) => pending.resolve(historyItem({ prompt: 'a red fox' }))],
  ['the server fails', (pending: ReturnType<typeof deferred<HistoryItem>>) => pending.reject(new api.ApiError('The model server failed', 502))],
  ['it is cancelled', (pending: ReturnType<typeof deferred<HistoryItem>>) => pending.reject(new api.ApiError('Cancelled', api.CANCELLED_STATUS))],
])('locks the prompt while generating, and unlocks it once %s', async (_, end) => {
  const pending = await startGenerating()
  const prompt = screen.getByLabelText('Prompt')
  expect(prompt).toHaveAttribute('readonly')
  expect(screen.getByRole('button', { name: /Prompt builder/ })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Example #1' })).toBeDisabled()
  await userEvent.type(prompt, ' at night')
  expect(prompt).toHaveValue('a red fox')
  await userEvent.click(screen.getByRole('button', { name: 'Generating…' }))
  expect(api.generateImage).toHaveBeenCalledOnce()

  await act(async () => end(pending))
  expect(prompt).not.toHaveAttribute('readonly')
  expect(screen.getByRole('button', { name: /Prompt builder/ })).toBeEnabled()
  await userEvent.type(prompt, ' at night')
  expect(prompt).toHaveValue('a red fox at night')
})

it('shows the same gender filter on returning to Characters', async () => {
  vi.mocked(api.fetchCharacters).mockResolvedValue([character(), character({ id: 4, name: 'Ravi', traits: { ...character().traits, who: 'man', bust: '' } })])
  render(<App />)

  await userEvent.click(await screen.findByRole('button', { name: 'Characters' }))
  await userEvent.click(await screen.findByRole('radio', { name: 'Men' }))
  await userEvent.click(screen.getByRole('button', { name: 'History' }))
  await userEvent.click(screen.getByRole('button', { name: 'Characters' }))

  expect(await screen.findByRole('radio', { name: 'Men' })).toHaveAttribute('aria-checked', 'true')
  expect(screen.getAllByRole('listitem').map((card) => card.getAttribute('aria-label'))).toEqual(['Ravi'])
  expect(window.location.pathname + window.location.search).toBe('/characters?gender=men')
})

it('below desktop width, opens Result on Generate, and marks it when an image arrives while Settings is open', async () => {
  const pending = deferred<HistoryItem>()
  vi.mocked(api.generateImage).mockReturnValue(pending.promise)
  render(<App />)
  const tab = (name: string) => screen.getByRole('tab', { name: new RegExp(`^${name}`) })
  await userEvent.type(await screen.findByLabelText('Prompt'), 'a fox')
  expect(tab('Settings')).toHaveAttribute('aria-selected', 'true')

  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  expect(tab('Result')).toHaveAttribute('aria-selected', 'true')
  await userEvent.click(tab('Settings'))
  expect(tab('Result')).toHaveAccessibleName('Result')

  pending.resolve(historyItem({ id: 7, prompt: 'a fox' }))
  await waitFor(() => expect(tab('Result')).toHaveAccessibleName(/^Result ?\(new result\)$/))
  expect(tab('Settings')).toHaveAttribute('aria-selected', 'true')
  await userEvent.click(tab('Result'))
  expect(tab('Result')).toHaveAccessibleName('Result')
})

it('shows the views in one menu, which phones show as a bar at the bottom', async () => {
  render(<App />)
  const views = await screen.findByRole('navigation', { name: 'Views' })
  expect(within(views).getAllByRole('button').map((button) => button.textContent)).toEqual(['Create', 'History', 'Characters'])
  expect(views).toHaveClass('fixed', 'bottom-0', 'sm:static')
})

it('writes out why Generate is blocked under the button, for touch screens that have no tooltip', async () => {
  render(<App />)
  const generate = await screen.findByRole('button', { name: 'Generate' })
  expect(generate).toHaveAttribute('aria-disabled', 'true')
  const reason = generate.parentElement?.querySelector('p')
  expect(reason).toHaveTextContent(/prompt/i)
  expect(reason).toHaveClass('hidden', 'pointer-coarse:block')

  await userEvent.type(screen.getByLabelText('Prompt'), 'a fox')
  expect(generate.parentElement?.querySelector('p')).toBeNull()
})
