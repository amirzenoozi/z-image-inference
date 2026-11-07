import { describe, expect, it, vi } from 'vitest'
import { ApiError, describeDetail, generateImage, streamChat } from './.'
import { catalog } from '../test/fixtures'
import { initialSettings } from '../lib/settings'

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)))
      controller.close()
    },
  })
}

describe('describeDetail', () => {
  it('reads plain and validation-list details', () => {
    expect(describeDetail('Model server down')).toBe('Model server down')
    expect(describeDetail([{ msg: 'Value error, steps must be between 1 and 20' }, { msg: 'too long' }])).toBe(
      'steps must be between 1 and 20; too long',
    )
    expect(describeDetail({ unexpected: true })).toBeNull()
  })
})

describe('generateImage', () => {
  it('sends a null seed when the seed is random, and surfaces server errors', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'The model server is not running' }), { status: 503 }),
    )
    const settings = { ...initialSettings(catalog), prompt: 'a cat', seed: 5, randomSeed: true }

    await expect(generateImage(settings, 'job-1')).rejects.toEqual(new ApiError('The model server is not running', 503))
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as { seed: number | null; job_id: string }
    expect(body.seed).toBeNull()
    expect(body.job_id).toBe('job-1')
  })

  it('explains when the app server cannot be reached', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(generateImage({ ...initialSettings(catalog), prompt: 'a cat' }, 'job-1')).rejects.toThrow(/Could not reach/)
  })
})

describe('streamChat', () => {
  it('reports the text as it streams and resolves with the full answer and where it is saved', async () => {
    const headers = { 'X-Chat-Conversation-Id': '5', 'X-Chat-Exchange-Id': '12' }
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(streamOf(['A detailed ', 'prompt']), { headers }))
    const updates: string[] = []
    const messages = [{ role: 'user' as const, content: 'a cat' }, { role: 'assistant' as const, content: 'A cat', exchangeId: 11 }, { role: 'user' as const, content: 'at night' }]

    const reply = await streamChat({ messages, conversationId: 5, parentId: 11 }, (text) => updates.push(text))

    expect(reply).toEqual({ text: 'A detailed prompt', conversationId: 5, exchangeId: 12 })
    expect(updates).toEqual(['A detailed ', 'A detailed prompt'])
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({
      messages: [{ role: 'user', content: 'a cat' }, { role: 'assistant', content: 'A cat' }, { role: 'user', content: 'at night' }],
      conversation_id: 5,
      parent_id: 11,
    })
  })
})
