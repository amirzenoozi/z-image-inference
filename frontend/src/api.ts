import type { Catalog, ChatMessage, GenerationSettings, HistoryItem, HistoryPage, JobProgress, ModelState, ModelStatusReport } from './types'

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

interface ValidationIssue {
  msg: string
}

function isValidationIssue(value: unknown): value is ValidationIssue {
  return typeof value === 'object' && value !== null && typeof (value as ValidationIssue).msg === 'string'
}

/** FastAPI sends `detail` as a string, or as a list of validation issues. */
export function describeDetail(detail: unknown): string | null {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const messages = detail.filter(isValidationIssue).map((issue) => issue.msg.replace(/^Value error, /, ''))
    return messages.length ? messages.join('; ') : null
  }
  return null
}

async function errorFrom(resp: Response): Promise<ApiError> {
  let detail: string | null = null
  try {
    detail = describeDetail(((await resp.json()) as { detail?: unknown }).detail)
  } catch {
    // Not JSON: fall back to the status text
  }
  return new ApiError(detail ?? `Request failed (${resp.status} ${resp.statusText})`, resp.status)
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  let resp: Response
  try {
    resp = await fetch(path, init)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError('Could not reach the app server. Is `uv run python main.py` running?', 0)
  }
  if (!resp.ok) throw await errorFrom(resp)
  return resp
}

function postJson(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
}

export async function fetchCatalog(signal?: AbortSignal): Promise<Catalog> {
  return (await request('/api/catalog', { signal })).json() as Promise<Catalog>
}

export async function fetchModelStatus(signal?: AbortSignal): Promise<ModelStatusReport> {
  return (await request('/api/models/status', { signal })).json() as Promise<ModelStatusReport>
}

export async function downloadModel(modelId: string): Promise<ModelState> {
  return (await request(`/api/models/${encodeURIComponent(modelId)}/download`, { method: 'POST' })).json() as Promise<ModelState>
}

export async function removeModel(modelId: string): Promise<void> {
  await request(`/api/models/${encodeURIComponent(modelId)}`, { method: 'DELETE' })
}

/** `jobId` lets the caller follow the generation with fetchJobProgress and stop it with cancelJob. */
export async function generateImage(settings: GenerationSettings, jobId: string, signal?: AbortSignal): Promise<HistoryItem> {
  const resp = await postJson(
    '/api/generate',
    {
      model: settings.modelId,
      prompt: settings.prompt,
      negative_prompt: settings.negativePrompt,
      width: settings.width,
      height: settings.height,
      steps: settings.steps,
      guidance: settings.guidance,
      seed: settings.randomSeed ? null : settings.seed,
      job_id: jobId,
    },
    signal,
  )
  return resp.json() as Promise<HistoryItem>
}

/** A cancelled generation fails with this status. */
export const CANCELLED_STATUS = 409

export async function fetchJobProgress(jobId: string, signal?: AbortSignal): Promise<JobProgress> {
  return (await request(`/api/jobs/${encodeURIComponent(jobId)}/progress`, { signal })).json() as Promise<JobProgress>
}

export async function cancelJob(jobId: string): Promise<void> {
  await request(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' })
}

export async function fetchHistory(offset: number, limit: number, signal?: AbortSignal): Promise<HistoryPage> {
  const resp = await request(`/api/history?offset=${offset}&limit=${limit}`, { signal })
  return resp.json() as Promise<HistoryPage>
}

export async function deleteHistoryItem(id: number): Promise<void> {
  await request(`/api/history/${id}`, { method: 'DELETE' })
}

export async function clearHistory(): Promise<void> {
  await request('/api/history', { method: 'DELETE' })
}

export function imageUrl(id: number, thumb = false): string {
  return `/api/history/${id}/image${thumb ? '?thumb=true' : ''}`
}

/** Streams Grok's rewritten prompt, calling onText with the text so far; resolves with the full prompt. */
export async function streamChat(
  messages: ChatMessage[],
  onText: (textSoFar: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const resp = await postJson('/api/chat', { messages }, signal)
  if (!resp.body) throw new ApiError('The chat reply was empty', resp.status)
  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    text += decoder.decode(value, { stream: true })
    onText(text)
  }
  return text + decoder.decode()
}
