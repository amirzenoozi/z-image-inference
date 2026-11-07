import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { streamChat } from '../../../../../api'
import type { ChatReply, ChatTurn } from '../../../../../types'
import { AdultContentContext } from '../../../../../lib/adultContent'
import { ChatPanel } from '.'

vi.mock('../../../../../api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../../../../api')>()), streamChat: vi.fn() }))

/** Answers each question with "Answer N", saved as exchange N of conversation 5. */
function answerInTurn() {
  let exchange = 0
  vi.mocked(streamChat).mockImplementation(async (_turn: ChatTurn, onText) => {
    exchange += 1
    onText(`Answer ${exchange}`)
    return { text: `Answer ${exchange}`, conversationId: 5, exchangeId: exchange }
  })
}

const turns = () => vi.mocked(streamChat).mock.calls.map(([turn]) => ({ conversationId: turn.conversationId, parentId: turn.parentId }))

async function ask(question: string) {
  await userEvent.type(screen.getByRole('textbox', { name: 'Describe the image you want' }), question)
  await userEvent.click(screen.getByRole('button', { name: 'Send' }))
  await screen.findByText(`Answer ${vi.mocked(streamChat).mock.calls.length}`)
}

beforeEach(() => {
  vi.mocked(streamChat).mockReset()
})

it('names the model that writes the prompts, in italics', () => {
  render(<ChatPanel name="gemma-3-4b" busy={false} onPromptReady={vi.fn()} />)
  expect(screen.getByText('Model that writes the prompts:')).toHaveTextContent('Model that writes the prompts: gemma-3-4b')
  expect(screen.getByText('gemma-3-4b').tagName).toBe('EM')
})

it('shows the reply as it streams, then hands the finished prompt and its exchange on once', async () => {
  let finish: (reply: ChatReply) => void = () => {}
  vi.mocked(streamChat).mockImplementation((_turn, onText) => {
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

  finish({ text: 'A lighthouse at dusk', conversationId: 5, exchangeId: 12 })
  await vi.waitFor(() => expect(onPromptReady).toHaveBeenCalledExactlyOnceWith('A lighthouse at dusk', 12))
})

it('continues the saved conversation from the last answer, and clearing starts a new one', async () => {
  answerInTurn()
  render(<ChatPanel name="Grok" busy={false} onPromptReady={vi.fn()} />)

  await ask('a fox')
  await ask('make it night')
  await userEvent.click(screen.getByRole('button', { name: 'Clear chat' }))
  await ask('a cat')

  expect(turns()).toEqual([
    { conversationId: null, parentId: null },
    { conversationId: 5, parentId: 1 },
    { conversationId: null, parentId: null },
  ])
})

it('sends an edited question after the answer before it, so the saved branch it replaces is kept', async () => {
  answerInTurn()
  render(<ChatPanel name="Grok" busy={false} onPromptReady={vi.fn()} />)
  await ask('a fox')
  await ask('make it night')

  const edited = within(screen.getByRole('list', { name: 'Chat' })).getAllByRole('listitem')[2]
  await userEvent.click(within(edited).getByRole('button', { name: 'Edit' }))
  const box = within(edited).getByRole('textbox', { name: 'Edit message' })
  await userEvent.clear(box)
  await userEvent.type(box, 'make it summer')
  await userEvent.click(within(edited).getByRole('button', { name: 'Save & regenerate' }))
  await screen.findByText('Answer 3')

  expect(turns()[2]).toEqual({ conversationId: 5, parentId: 1 })
})

it('tells the server the adult lock is on, so it checks the question, and shows a refusal', async () => {
  vi.mocked(streamChat).mockRejectedValue(new Error('This question was refused by the safety check'))
  render(
    <AdultContentContext.Provider value={{ shown: false, toggle: vi.fn() }}>
      <ChatPanel name="Grok" busy={false} onPromptReady={vi.fn()} />
    </AdultContentContext.Provider>,
  )
  await userEvent.type(screen.getByRole('textbox', { name: 'Describe the image you want' }), 'a portrait')
  await userEvent.click(screen.getByRole('button', { name: 'Send' }))

  expect(await screen.findByText('This question was refused by the safety check')).toBeInTheDocument()
  expect(vi.mocked(streamChat).mock.calls[0][0].safeOnly).toBe(true)
})
