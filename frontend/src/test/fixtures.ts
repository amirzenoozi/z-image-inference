import type { Catalog, HistoryItem, ModelInfo } from '../types'

export const fastModel: ModelInfo = {
  id: 'z-image-turbo',
  repo_id: 'Tongyi-MAI/Z-Image-Turbo',
  label: 'Z-Image-Turbo',
  description: 'Fast photos',
  speed_hint: '~10 s',
  category: 'photo',
  download_gb: 31,
  default_steps: 9,
  max_steps: 20,
  max_side: 1536,
  default_width: 368,
  default_height: 640,
  uses_guidance: false,
  default_guidance: 0,
  default_negative_prompt: '',
  trigger_word: '',
  prompt_style: 'prose',
}

export const animeModel: ModelInfo = {
  id: 'wai-illustrious',
  repo_id: 'votepurchase/waiNSFWIllustrious_v120',
  label: 'WAI-Illustrious',
  description: 'Anime',
  speed_hint: '~40 s',
  category: 'anime',
  download_gb: 13,
  default_steps: 28,
  max_steps: 50,
  max_side: 1216,
  default_width: 1024,
  default_height: 1024,
  uses_guidance: true,
  default_guidance: 7,
  default_negative_prompt: 'nsfw, low quality',
  trigger_word: '',
  prompt_style: 'tags',
}

export const catalog: Catalog = {
  models: [fastModel, animeModel],
  model_categories: [
    { id: 'photo', label: 'Photorealistic' },
    { id: 'anime', label: 'Anime & illustration' },
  ],
  resolutions: [
    { width: 512, height: 512, ratio: '1:1', category: 'square', tier: 'S' },
    { width: 1024, height: 1024, ratio: '1:1', category: 'square', tier: 'L' },
    { width: 1280, height: 1280, ratio: '1:1', category: 'square', tier: 'XL' },
    { width: 368, height: 640, ratio: '9:16', category: 'portrait', tier: 'S' },
    { width: 768, height: 1024, ratio: '3:4', category: 'portrait', tier: 'L' },
    { width: 1024, height: 768, ratio: '4:3', category: 'landscape', tier: 'L' },
    { width: 1280, height: 720, ratio: '16:9', category: 'widescreen', tier: 'L' },
  ],
  categories: ['square', 'portrait', 'landscape', 'widescreen'],
  examples: ['A red fox in the snow'],
  chat_available: false,
  limits: { min_side: 256, side_step: 16, max_seed: 4294967295, max_prompt_length: 4000 },
}

export function historyItem(overrides: Partial<HistoryItem> = {}): HistoryItem {
  return {
    id: 1,
    prompt: 'a cat',
    negative_prompt: '',
    seed: 42,
    width: 512,
    height: 512,
    steps: 9,
    guidance: null,
    model: 'z-image-turbo',
    created_at: '2026-10-28 10:00:00',
    ...overrides,
  }
}

/** A promise you resolve or reject from the test, to hold a request in its pending state. */
export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
