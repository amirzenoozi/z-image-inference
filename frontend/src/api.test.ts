import { describe, expect, it, vi } from 'vitest'
import { ApiError, describeDetail, generateImage, streamChat } from './api'
import { catalog } from './test/fixtures'
import { initialSettings } from './lib/settings'

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

    await expect(generateImage(settings)).rejects.toEqual(new ApiError('The model server is not running', 503))
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as { seed: number | null }
    expect(body.seed).toBeNull()
  })

  it('explains when the app server cannot be reached', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(generateImage({ ...initialSettings(catalog), prompt: 'a cat' })).rejects.toThrow(/Could not reach/)
  })
})

describe('streamChat', () => {
  it('reports the text as it streams and resolves with the full prompt', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(streamOf(['A detailed ', 'prompt'])))
    const updates: string[] = []

    const prompt = await streamChat([{ role: 'user', content: 'a cat' }], (text) => updates.push(text))

    expect(prompt).toBe('A detailed prompt')
    expect(updates).toEqual(['A detailed ', 'A detailed prompt'])
  })
})
