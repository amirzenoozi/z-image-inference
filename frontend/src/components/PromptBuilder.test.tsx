import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { animeModel, fastModel } from '../test/fixtures'
import type { ModelInfo } from '../types'
import { PromptBuilder } from './PromptBuilder'

function renderBuilder(model: ModelInfo = fastModel, busy = false) {
  const handlers = { onUse: vi.fn(), onGenerate: vi.fn() }
  render(<PromptBuilder model={model} busy={busy} {...handlers} />)
  return handlers
}

it('builds a live preview and hands the prompt over', async () => {
  const { onUse, onGenerate } = renderBuilder()
  expect(screen.getByText(/Describe the subject/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled()

  await userEvent.type(screen.getByLabelText('Subject'), 'adult woman')
  await userEvent.selectOptions(screen.getByLabelText('Photo style'), 'editorial')

  expect(screen.getByLabelText('Built prompt')).toHaveTextContent('Editorial photo of adult woman.')
  await userEvent.click(screen.getByRole('button', { name: 'Use in editor' }))
  expect(onUse).toHaveBeenCalledWith('Editorial photo of adult woman.', expect.stringContaining('extra fingers'))
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  expect(onGenerate).toHaveBeenCalledOnce()
})

it('shows explicit options only after the 18+ switch', async () => {
  renderBuilder()
  expect(screen.queryByLabelText('Explicit action')).not.toBeInTheDocument()
  expect(screen.queryByText('Coverage (18+)')).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('switch'))

  expect(screen.getByLabelText('Explicit action')).toBeInTheDocument()
  expect(screen.getByText('Coverage (18+)')).toBeInTheDocument()
})

it('refuses to build explicit prompts about minors', async () => {
  const { onGenerate } = renderBuilder()
  await userEvent.click(screen.getByRole('switch'))
  await userEvent.type(screen.getByLabelText('Subject'), 'teen')

  expect(screen.getByRole('alert')).toHaveTextContent('must describe adults')
  expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled()
  expect(onGenerate).not.toHaveBeenCalled()
})

it('warns that tag-based models follow sentences less closely', () => {
  renderBuilder(animeModel)
  expect(screen.getByText(/reads short comma-separated tags best/)).toBeInTheDocument()
})

it('remembers its choices', async () => {
  renderBuilder()
  await userEvent.type(screen.getByLabelText('Subject'), 'adult man')
  document.body.innerHTML = ''
  renderBuilder()
  expect(screen.getByLabelText('Subject')).toHaveValue('adult man')
})
