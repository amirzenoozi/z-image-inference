import { useEffect, useRef, useState } from 'react'
import { streamChat } from '../api'
import { errorMessage } from '../lib/hooks'
import type { ChatMessage } from '../types'
import { isModEnter } from '../lib/keyboard'
import { secondaryButtonClass } from '../lib/styles'
import { Textarea } from './form/Textarea'
import { ErrorNotice, Spinner } from './ui'

type ChatStatus = { status: 'idle' } | { status: 'streaming' } | { status: 'failed'; error: string; retry: ChatMessage[] }

interface Props {
  /** True while an image is being generated; sending waits until it finishes. */
  busy: boolean
  onPromptReady: (prompt: string) => void
}

export function ChatPanel({ busy, onPromptReady }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [chat, setChat] = useState<ChatStatus>({ status: 'idle' })
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])

  const send = async (conversation: ChatMessage[]) => {
    const controller = new AbortController()
    abortRef.current = controller
    setChat({ status: 'streaming' })
    setMessages([...conversation, { role: 'assistant', content: '' }])
    try {
      const prompt = await streamChat(
        conversation,
        (text) => setMessages([...conversation, { role: 'assistant', content: text }]),
        controller.signal,
      )
      setChat({ status: 'idle' })
      onPromptReady(prompt)
    } catch (error) {
      if (controller.signal.aborted) return
      setMessages(conversation)
      setChat({ status: 'failed', error: errorMessage(error), retry: conversation })
    }
  }

  const blocked = busy || chat.status === 'streaming'
  const submit = () => {
    if (blocked || !draft.trim()) return
    void send([...messages, { role: 'user', content: draft.trim() }])
    setDraft('')
  }
  const editMessage = (index: number, content: string) => {
    if (!blocked) void send([...messages.slice(0, index), { role: 'user', content }])
  }

  return (
    <div className="space-y-3">
      <MessageList messages={messages} streaming={chat.status === 'streaming'} canEdit={!blocked} onEdit={editMessage} />
      {chat.status === 'failed' && <ErrorNotice message={chat.error} onRetry={() => void send(chat.retry)} />}
      <div className="flex gap-2">
        <Textarea
          aria-label="Describe the image you want"
          rows={2}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (isModEnter(event)) {
              event.preventDefault()
              submit()
            }
          }}
          placeholder="Describe the image you want… Grok writes the detailed prompt."
        />
        <button
          type="button"
          onClick={submit}
          disabled={blocked || !draft.trim()}
          className="rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
        >
          Send
        </button>
      </div>
      {messages.length > 0 && (
        <button type="button" onClick={() => setMessages([])} disabled={blocked} className={secondaryButtonClass}>
          Clear chat
        </button>
      )}
    </div>
  )
}

interface MessageListProps {
  messages: ChatMessage[]
  streaming: boolean
  canEdit: boolean
  onEdit: (index: number, content: string) => void
}

function MessageList({ messages, streaming, canEdit, onEdit }: MessageListProps) {
  if (messages.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-300 p-4 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        Describe an idea in plain words. Grok turns it into a detailed prompt, then the image is generated.
      </p>
    )
  }
  return (
    <ol aria-label="Chat" className="max-h-72 space-y-2 overflow-y-auto pr-1">
      {messages.map((message, index) => (
        <li key={index}>
          {message.role === 'user' ? (
            <UserMessage content={message.content} canEdit={canEdit} onEdit={(content) => onEdit(index, content)} />
          ) : (
            <AssistantMessage content={message.content} streaming={streaming && index === messages.length - 1} />
          )}
        </li>
      ))}
    </ol>
  )
}

function AssistantMessage({ content, streaming }: { content: string; streaming: boolean }) {
  return (
    <div className="rounded-xl bg-zinc-100 p-3 text-xs leading-relaxed text-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-200">
      {content || (streaming && <Spinner className="size-3.5" />)}
    </div>
  )
}

function UserMessage({ content, canEdit, onEdit }: { content: string; canEdit: boolean; onEdit: (content: string) => void }) {
  const [editing, setEditing] = useState<string | null>(null)
  if (editing !== null) {
    return (
      <div className="ml-6 space-y-1.5">
        <Textarea aria-label="Edit message" rows={2} value={editing} onChange={(event) => setEditing(event.target.value)} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setEditing(null)} className={secondaryButtonClass}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!editing.trim() || !canEdit}
            onClick={() => {
              onEdit(editing.trim())
              setEditing(null)
            }}
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Save & regenerate
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="group ml-6 flex items-start justify-end gap-2">
      {canEdit && (
        <button type="button" onClick={() => setEditing(content)} className="text-xs text-zinc-400 opacity-0 group-hover:opacity-100 hover:text-violet-500 focus:opacity-100">
          Edit
        </button>
      )}
      <p className="rounded-xl bg-violet-600 px-3 py-2 text-xs text-white">{content}</p>
    </div>
  )
}
