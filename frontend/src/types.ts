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
  /** Whether the model can start from an image, for variations. */
  supports_variations: boolean
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
  builder_modes: BuilderModeData[]
}

/** A prompt builder mode as prompt_modes.json writes it; the builder checks it against its own steps and options. */
export interface BuilderModeData {
  id: string
  label: string
  description: string
  adult_only: boolean
  steps: string[]
  defaults: Record<string, string>
  options: Record<string, string[]>
  emphasis: string[]
  weights: Record<string, number>
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
  /** The image this one was turned, flipped or cropped from; null for a generated image. */
  edited_from: number | null
  /** For a variation: its start image, and how much it was changed (0 to 1). */
  varied_from: number | null
  change: number | null
}

export interface PaletteColour {
  hex: string
  /** Fraction of the image this colour covers, from 0 to 1. */
  share: number
}

/** Applied in this order on the server: quarter turns clockwise, flips, then the crop in the turned image's pixels. */
export interface EditRecipe {
  quarter_turns: number
  flip_horizontal: boolean
  flip_vertical: boolean
  crop: { x: number; y: number; width: number; height: number } | null
}

export interface HistoryFilters {
  model: string | null
  /** Text the prompt must contain, ignoring case; empty for no search. */
  search: string
  favouritesOnly: boolean
  /** The image's shape, grouped as the resolution picker groups sizes. */
  ratio: Category | null
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
  /** Set for a variation: the History image to start from, and how much to change it (0.1 to 0.9). */
  startImage: StartImage | null
}

export interface StartImage {
  id: number
  change: number
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
