import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { streamChat } from '../../../../../api'
import { ChatPanel } from '.'

vi.mock('../../../../../api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../../../../api')>()), streamChat: vi.fn() }))

it('names the model that writes the prompts, in italics', () => {
  render(<ChatPanel name="gemma-3-4b" busy={false} onPromptReady={vi.fn()} />)
  expect(screen.getByText('Model that writes the prompts:')).toHaveTextContent('Model that writes the prompts: gemma-3-4b')
  expect(screen.getByText('gemma-3-4b').tagName).toBe('EM')
})

it('shows the reply as it streams, then hands the finished prompt on once', async () => {
  let finish: (prompt: string) => void = () => {}
  vi.mocked(streamChat).mockImplementation((_messages, onText) => {
    onText('A lighthouse')
    return new Promise((resolve) => {
      finish = resolve
    })
  })
  const onPromptReady = vi.fn()
  render(<ChatPanel name="Grok" busy={false} onPromptReady={onPromptReady} />)

  await userEvent.type(screen.getByRole('textbox'), 'a lighthouse')
  await userEvent.click(screen.getByRole('button', { name: 'Send' }))
  expect(await screen.findByText('A lighthouse')).toBeInTheDocument()
  expect(onPromptReady).not.toHaveBeenCalled()

  finish('A lighthouse at dusk')
  await vi.waitFor(() => expect(onPromptReady).toHaveBeenCalledExactlyOnceWith('A lighthouse at dusk'))
})
