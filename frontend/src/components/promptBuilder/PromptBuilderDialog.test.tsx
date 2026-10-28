import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { animeModel, fastModel } from '../../test/fixtures'
import type { ModelInfo } from '../../types'
import { PromptBuilderDialog } from './PromptBuilderDialog'
import { chooseOption } from '../../test/select'

function renderDialog({ model = fastModel, hasExistingPrompt = false, maxPromptLength = 4000 }: { model?: ModelInfo; hasExistingPrompt?: boolean; maxPromptLength?: number } = {}) {
  const handlers = { onClose: vi.fn(), onConfirm: vi.fn() }
  render(<PromptBuilderDialog model={model} hasExistingPrompt={hasExistingPrompt} maxPromptLength={maxPromptLength} {...handlers} />)
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

  expect(screen.getByLabelText('Built prompt')).toHaveTextContent('Photo of an adult woman in her mid 20s. Green eyes, freckles.')
  await userEvent.click(useIt)
  expect(onConfirm).toHaveBeenCalledExactlyOnceWith(
    'Photo of an adult woman in her mid 20s. Green eyes, freckles.',
    expect.stringContaining('extra fingers'),
    'replace',
  )
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
  expect(onConfirm).toHaveBeenCalledWith('Photo of an adult man.', expect.any(String), 'append')
})

it('surprise me fills the choices with something ready to use', async () => {
  renderDialog()
  await userEvent.click(screen.getByRole('button', { name: /Surprise me/ }))
  expect(screen.getByLabelText('Built prompt')).toHaveTextContent(/^.+ photo of two adult|^.+ photo of an adult/i)
  expect(screen.getByRole('button', { name: 'Use this prompt' })).toBeEnabled()
})

it('shows the 18+ step only after the explicit switch, and needs an adult age', async () => {
  renderDialog()
  expect(screen.queryByRole('button', { name: /Intimacy/ })).not.toBeInTheDocument()

  await chooseOption(screen.getByLabelText('Who'), 'woman')
  await userEvent.click(screen.getByRole('switch'))

  expect(screen.getByText(/need “Who” and an adult age range/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Use this prompt' })).toBeDisabled()
  await chooseOption(screen.getByLabelText('Age'), 'early 30s')
  await step('Intimacy')
  await userEvent.click(screen.getByRole('button', { name: 'Topless' }))
  expect(screen.getByLabelText('Built prompt')).toHaveTextContent('Clothing adjusted to expose breasts, no bra')
})

it('refuses explicit prompts that suggest a minor', async () => {
  renderDialog()
  await chooseOption(screen.getByLabelText('Who'), 'woman')
  await chooseOption(screen.getByLabelText('Age'), 'early 20s')
  await userEvent.click(screen.getByRole('switch'))
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

it('warns that tag-based models follow sentences less closely', () => {
  renderDialog({ model: animeModel })
  expect(screen.getByText(/reads short tags best/)).toBeInTheDocument()
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
