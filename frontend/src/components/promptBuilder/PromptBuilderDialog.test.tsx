import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import * as api from '../../api'
import { animeModel, builderModes, character, fastModel } from '../../test/fixtures'
import type { ModelInfo } from '../../types'
import { PromptBuilderDialog } from './PromptBuilderDialog'
import { chooseOption } from '../../test/select'

vi.mock('../../api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../api')>()), createCharacter: vi.fn() }))

function renderDialog({ model = fastModel, hasExistingPrompt = false, maxPromptLength = 4000 }: { model?: ModelInfo; hasExistingPrompt?: boolean; maxPromptLength?: number } = {}) {
  const handlers = { onClose: vi.fn(), onConfirm: vi.fn() }
  render(<PromptBuilderDialog model={model} modes={builderModes} character={null} onCharacterSaved={vi.fn()} hasExistingPrompt={hasExistingPrompt} maxPromptLength={maxPromptLength} {...handlers} />)
  return handlers
}

const step = (name: string) => userEvent.click(within(screen.getByRole('navigation', { name: 'Builder steps' })).getByRole('button', { name: new RegExp(name) }))

it('walks through steps with a live preview and confirms into the editor', async () => {
  const { onConfirm, onClose } = renderDialog()
  const useIt = screen.getByRole('button', { name: 'Use this prompt' })
  expect(useIt).toBeDisabled()

  await chooseOption(screen.getByLabelText('Who'), 'woman')
  await chooseOption(screen.getByLabelText('Age'), 'mid 20s')
  await step('Face & hair')
  await chooseOption(screen.getByLabelText('Eye colour'), 'green')
  await userEvent.click(screen.getByRole('button', { name: 'freckles' }))

  const prompt = 'A photograph of an adult woman in her mid 20s. She has green eyes. Her skin shows freckles.'
  expect(screen.getByLabelText('Built prompt')).toHaveTextContent(prompt)
  await userEvent.click(useIt)
  expect(onConfirm).toHaveBeenCalledExactlyOnceWith(prompt, expect.stringContaining('extra fingers'), 'replace', false)
  expect(onClose).toHaveBeenCalledOnce()
})

it('closes on cancel without inserting anything', async () => {
  const { onConfirm, onClose } = renderDialog()
  await chooseOption(screen.getByLabelText('Who'), 'man')
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(onClose).toHaveBeenCalledOnce()
  expect(onConfirm).not.toHaveBeenCalled()
})

it('offers appending when the editor already has a prompt', async () => {
  const { onConfirm } = renderDialog({ hasExistingPrompt: true })
  await chooseOption(screen.getByLabelText('Who'), 'man')
  expect(screen.getByText(/replaces the text in the Write box/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Append to prompt' }))
  expect(onConfirm).toHaveBeenCalledWith('A photograph of an adult man.', expect.any(String), 'append', false)
})

it('surprise me fills the choices with something ready to use', async () => {
  renderDialog()
  await userEvent.click(screen.getByRole('button', { name: /Surprise me/ }))
  expect(screen.getByLabelText('Built prompt')).toHaveTextContent(/^an? .*photograph of (two adult|an adult)/i)
  expect(screen.getByRole('button', { name: 'Use this prompt' })).toBeEnabled()
})

it('shows the 18+ step only in an 18+ mode, and needs an adult age', async () => {
  renderDialog()
  expect(screen.queryByRole('button', { name: /Intimacy/ })).not.toBeInTheDocument()

  await chooseOption(screen.getByLabelText('Who'), 'woman')
  await userEvent.click(screen.getByRole('radio', { name: 'Explicit (18+)' }))

  expect(screen.getByText(/need “Who” and an adult age range/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Use this prompt' })).toBeDisabled()
  await chooseOption(screen.getByLabelText('Age'), 'early 30s')
  await step('Intimacy')
  await userEvent.click(screen.getByRole('button', { name: 'Topless' }))
  expect(screen.getByLabelText('Built prompt')).toHaveTextContent('She is topless with nothing worn above the waist, bare breasts and nipples fully visible')
})

it('refuses explicit prompts that suggest a minor', async () => {
  renderDialog()
  await chooseOption(screen.getByLabelText('Who'), 'woman')
  await chooseOption(screen.getByLabelText('Age'), 'early 20s')
  await userEvent.click(screen.getByRole('radio', { name: 'Explicit (18+)' }))
  await userEvent.type(screen.getByLabelText('Extra subject details'), 'schoolgirl')

  expect(screen.getByRole('alert')).toHaveTextContent('must describe adults')
  expect(screen.getByRole('button', { name: 'Use this prompt' })).toBeDisabled()
})

it('blocks prompts over the length limit', async () => {
  renderDialog({ maxPromptLength: 20 })
  await chooseOption(screen.getByLabelText('Who'), 'woman')
  expect(screen.getByText(/too long/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Use this prompt' })).toBeDisabled()
})

it('writes weighted tags for tag-based models, and a description for the others', async () => {
  renderDialog({ model: animeModel })
  expect(screen.getByText(/Written as tags for WAI-Illustrious/)).toBeInTheDocument()
  await chooseOption(screen.getByLabelText('Who'), 'woman')
  await chooseOption(screen.getByLabelText('Age'), 'early 30s')
  await userEvent.click(screen.getByRole('radio', { name: 'Explicit (18+)' }))
  await step('Intimacy')
  await userEvent.click(screen.getByRole('button', { name: 'Fully nude' }))

  expect(screen.getByLabelText('Built prompt')).toHaveTextContent(
    'masterpiece, best quality, amazing quality, 1girl, solo, adult woman, early 30s, nsfw, explicit, uncensored, (completely nude:1.3), (nipples:1.3), (pussy:1.3)',
  )
})

it('offers partner actions only for a couple', async () => {
  renderDialog()
  await chooseOption(screen.getByLabelText('Who'), 'woman')
  await chooseOption(screen.getByLabelText('Age'), 'early 30s')
  await userEvent.click(screen.getByRole('radio', { name: 'Explicit (18+)' }))
  await step('Pose')
  await userEvent.click(screen.getByLabelText('Explicit action'))
  expect(screen.queryByRole('group', { name: 'With a partner' })).not.toBeInTheDocument()
  await userEvent.keyboard('{Escape}')

  await step('Subject')
  await chooseOption(screen.getByLabelText('Who'), 'couple')
  await step('Pose')
  await userEvent.click(screen.getByLabelText('Explicit action'))
  expect(await screen.findByRole('group', { name: 'With a partner' })).toBeInTheDocument()
})

it('shows only the steps of the chosen mode, starting from its defaults', async () => {
  renderDialog()
  await userEvent.click(screen.getByRole('radio', { name: 'Scene' }))

  const nav = screen.getByRole('navigation', { name: 'Builder steps' })
  expect(within(nav).getAllByRole('button').map((button) => button.textContent)).toEqual(['1Scene & light', '2Camera', '3Mood & finish'])
  expect(screen.getByText('Choose a scene or describe the place, to start.')).toBeInTheDocument()
  await chooseOption(screen.getByLabelText('Scene'), 'beach')
  expect(screen.getByLabelText('Built prompt')).toHaveTextContent(/^A photograph of a beach/)
  expect(screen.getByLabelText('Built prompt')).toHaveTextContent('golden hour')
})

it('reports a broken mode and keeps the others', () => {
  render(<PromptBuilderDialog model={fastModel} character={null} onCharacterSaved={vi.fn()} modes={[...builderModes, { ...builderModes[0], id: 'odd', steps: ['dance'] }]} hasExistingPrompt={false} maxPromptLength={4000} onClose={vi.fn()} onConfirm={vi.fn()} />)
  expect(screen.getByRole('alert')).toHaveTextContent('Mode "odd" was left out: unknown step "dance".')
  expect(screen.getAllByRole('radio')).toHaveLength(builderModes.length)
})

it('closes only an open list on Escape, then the dialog on a second Escape', async () => {
  const { onClose } = renderDialog()

  await userEvent.click(screen.getByLabelText('Who'))
  expect(await screen.findByRole('listbox')).toBeInTheDocument()
  await userEvent.keyboard('{Escape}')

  await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
  expect(onClose).not.toHaveBeenCalled()

  await userEvent.keyboard('{Escape}')
  expect(onClose).toHaveBeenCalledOnce()
})

it('puts its buttons, and the note about them, in the actions footer', async () => {
  renderDialog({ hasExistingPrompt: true })
  const footer = within(screen.getByRole('group', { name: 'Dialog actions' }))
  expect(footer.getAllByRole('button').map((button) => button.textContent)).toEqual(['Cancel', 'Append to prompt', 'Use this prompt'])
  expect(footer.getByText('Use this prompt replaces the text in the Write box.')).toBeInTheDocument()
})

it('writes the chosen character’s look, showing one Character step in place of its choices', async () => {
  render(<PromptBuilderDialog model={fastModel} modes={builderModes} character={character()} onCharacterSaved={vi.fn()} hasExistingPrompt={false} maxPromptLength={4000} onClose={vi.fn()} onConfirm={vi.fn()} />)

  const nav = screen.getByRole('navigation', { name: 'Builder steps' })
  expect(within(nav).queryByRole('button', { name: /Face & hair|Body/ })).not.toBeInTheDocument()
  expect(screen.getByText('woman, late 20s, green eyes, long auburn hair')).toBeInTheDocument()
  expect(screen.getByLabelText('Built prompt')).toHaveTextContent(/^A photograph of an adult woman in her late 20s\. She has green eyes\. She has long auburn hair\.$/)
})

it('saves the subject and look as a character, once it is an adult with a name', async () => {
  vi.mocked(api.createCharacter).mockResolvedValue(character())
  const onCharacterSaved = vi.fn()
  render(<PromptBuilderDialog model={fastModel} modes={builderModes} character={null} onCharacterSaved={onCharacterSaved} hasExistingPrompt={false} maxPromptLength={4000} onClose={vi.fn()} onConfirm={vi.fn()} />)

  await chooseOption(screen.getByLabelText('Who'), 'woman')
  await userEvent.click(screen.getByRole('button', { name: 'Save as character…' }))
  await userEvent.type(screen.getByLabelText('Character name'), 'Ava')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(screen.getByRole('alert')).toHaveTextContent('A character needs “Who” and an adult age range.')
  expect(api.createCharacter).not.toHaveBeenCalled()

  await chooseOption(screen.getByLabelText('Age'), 'late 20s')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(api.createCharacter).toHaveBeenCalledExactlyOnceWith({ name: 'Ava', traits: expect.objectContaining({ who: 'woman', age: 'late 20s' }) })
  expect(onCharacterSaved).toHaveBeenCalledWith(character())
})
