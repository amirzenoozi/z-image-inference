export type Category = 'square' | 'portrait' | 'landscape' | 'widescreen'
export type Tier = 'S' | 'M' | 'L' | 'XL'

/** A LoRA switched on over its model; used only when the prompt mentions one of its keywords (lib/addons.ts). */
export interface AddonInfo {
  id: string
  label: string
  description: string
  keywords: string[]
  trigger_word: string
  download_gb: number
  page_url: string
  source_name: string
}

export interface ModelInfo {
  id: string
  repo_id: string
  /** The model's page, on the site it comes from (source_name: Hugging Face or Civitai). */
  page_url: string
  source_name: string
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
  /** Whether it can keep a character's face from its face image (IP-Adapter, the SDXL models). */
  supports_face_lock: boolean
  examples: string[]
  addons: AddonInfo[]
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

/** The image-to-video model History's images are animated with. */
export interface VideoModelInfo {
  id: string
  label: string
  download_gb: number
  /** The lengths it can make, in seconds. */
  lengths: number[]
}

/** A short clip made from a History image, kept beside it. */
export interface VideoItem {
  id: number
  image_id: number
  prompt: string
  seconds: number
  width: number
  height: number
  seed: number
  /** How long rendering took. */
  duration_seconds: number
  /** Blurred until played, like a sensitive image. */
  sensitive: boolean
  created_at: string
}

export interface Catalog {
  models: ModelInfo[]
  video: VideoModelInfo
  model_categories: ModelCategory[]
  resolutions: ResolutionInfo[]
  categories: Category[]
  chat_available: boolean
  limits: Limits
  builder_modes: BuilderModeData[]
  /** The UI's language code, from APP_LANGUAGE in .env. */
  language: string
}

/** A prompt builder mode as prompt_modes.json writes it; the builder checks it against its own steps and options. */
export interface BuilderModeData {
  id: string
  label: string
  description: string
  content: string
  focus?: { opening: string; cues: string; tags: string[] }
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
  /** The character the image was made for; null for none, or once that character is deleted. */
  character_id: number | null
  /** The image whose face this one was locked to; null when no face lock was used. */
  face_from: number | null
  /** Blurred in lists: worked out from the prompt when saved, or set by hand in the image viewer. */
  sensitive: boolean
  /** The add-ons the render used (ids from its model's add-ons); empty for none. */
  addons: string[]
}

/** The prompt builder's identity choices a character keeps, named as in the builder's state. */
export interface CharacterTraits {
  who: string
  age: string
  ethnicity: string
  subject: string
  eyeColor: string
  makeup: string
  skinTone: string
  skinDetails: string[]
  appearanceExtra: string
  hairColor: string
  hairstyle: string
  hairLength: string
  facialHair: string
  /** Further picks after `makeup` and `facialHair`, which take several. */
  makeupMore: string[]
  facialHairMore: string[]
  bodyType: string
  height: string
  bust: string
  hips: string
  muscles: string
  abs: string
  chest: string
  tattoos: string[]
  piercings: string[]
  bodyExtra: string
}

export interface Character {
  id: number
  name: string
  traits: CharacterTraits
  /** The chosen cover, or else the character's newest image; null while it has none. */
  cover_id: number | null
  /** A seed every render of the character uses; null for a new seed each time. */
  seed: number | null
  image_count: number
  /** The History image whose face the SDXL models keep; null for none, or once that image is deleted. */
  face_id: number | null
  /** How strongly the face is kept, from 0.1 to 1; higher follows the prompt less. */
  face_strength: number
  /** Whether the cover and the face image are blurred in lists, as their History images are. */
  cover_sensitive: boolean
  face_sensitive: boolean
  /** The face is an uploaded photo, so the server keeps this character's images safe for work. */
  face_uploaded: boolean
}

export interface CharacterChanges {
  name?: string
  traits?: CharacterTraits
  cover_id?: number | null
  seed?: number | null
  face_id?: number | null
  face_strength?: number
  /** A face photo as base64 (it replaces a History face), or null to remove the uploaded one. */
  face_upload?: string | null
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
  character: number | null
}

export interface HistorySummary {
  total: number
  /** Size of the history database file. */
  bytes: number
  /** How many images are older than each age "Clean up" offers. */
  older_than: { days: number; count: number }[]
}

export interface HistoryPageData {
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
  /** The character the images are made for; the prompt builder writes its look, and History can filter by it. */
  characterId: number | null
  /** The character whose look the prompt already has (written by the prompt builder, or reused from an image); null for none. */
  lookIncluded: number | null
  /** Add-ons switched on, for any model; only the chosen model's are sent, and each applies only when the prompt mentions it. */
  addons: string[]
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
