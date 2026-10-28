export type Category = 'square' | 'portrait' | 'landscape' | 'widescreen'
export type Tier = 'S' | 'M' | 'L' | 'XL'

export interface ModelInfo {
  id: string
  repo_id: string
  label: string
  description: string
  speed_hint: string
  category: string
  download_gb: number
  default_steps: number
  max_steps: number
  max_side: number
  default_width: number
  default_height: number
  uses_guidance: boolean
  default_guidance: number
  default_negative_prompt: string
  trigger_word: string
  prompt_style: 'prose' | 'tags'
}

export interface ResolutionInfo {
  width: number
  height: number
  ratio: string
  category: Category
  tier: Tier
}

export interface Limits {
  min_side: number
  side_step: number
  max_seed: number
  max_prompt_length: number
}

export interface ModelCategory {
  id: string
  label: string
}

export interface Catalog {
  models: ModelInfo[]
  model_categories: ModelCategory[]
  resolutions: ResolutionInfo[]
  categories: Category[]
  examples: string[]
  chat_available: boolean
  limits: Limits
}

export type ModelStatus = 'ready' | 'queued' | 'downloading' | 'missing' | 'failed'

export interface ModelStatusReport {
  server_running: boolean
  models: Record<string, ModelStatus>
}

export interface HistoryItem {
  id: number
  prompt: string
  negative_prompt: string
  seed: number
  width: number
  height: number
  steps: number
  guidance: number | null
  model: string
  created_at: string
}

export interface HistoryPage {
  items: HistoryItem[]
  total: number
}

export interface GenerationSettings {
  modelId: string
  prompt: string
  negativePrompt: string
  width: number
  height: number
  steps: number
  guidance: number
  seed: number
  randomSeed: boolean
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/** Every piece of loaded data is pending, failed or settled; settled data may still be empty. */
export type Loadable<T> =
  | { status: 'pending' }
  | { status: 'failed'; error: string }
  | { status: 'settled'; value: T }

export type GenerationState =
  | { status: 'idle' }
  | { status: 'pending'; startedAt: number; request: GenerationSettings }
  | { status: 'failed'; error: string; request: GenerationSettings }
  | { status: 'settled'; item: HistoryItem }
