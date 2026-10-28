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
  kept_gb: number
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
  examples: string[]
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
  chat_available: boolean
  limits: Limits
}

export type ModelStatus = 'ready' | 'queued' | 'downloading' | 'missing' | 'failed'

export interface ModelState {
  status: ModelStatus
  /** Bytes on disk now; while downloading, how much has arrived. */
  size_bytes: number
}

export interface ModelStatusReport {
  server_running: boolean
  models: Record<string, ModelState>
  free_bytes: number | null
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
  /** How long rendering took; null for images made before render times were recorded. */
  duration_seconds: number | null
  favourite: boolean
}

export interface HistoryFilters {
  model: string | null
  /** Text the prompt must contain, ignoring case; empty for no search. */
  search: string
  favouritesOnly: boolean
}

export interface HistorySummary {
  total: number
  /** Size of the history database file. */
  bytes: number
  /** How many images are older than each age "Clean up" offers. */
  older_than: { days: number; count: number }[]
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

export type JobPhase = 'waiting' | 'loading' | 'encoding' | 'generating' | 'finishing'

export interface JobProgress {
  phase: JobPhase
  step: number
  total: number
}

export type GenerationState =
  | { status: 'idle' }
  | { status: 'pending'; startedAt: number; request: GenerationSettings; jobId: string; cancelling: boolean }
  | { status: 'failed'; error: string; request: GenerationSettings }
  | { status: 'settled'; item: HistoryItem }
