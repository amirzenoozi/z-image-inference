import type { GenerationSettings, Limits, ModelInfo } from '../types'
import { isModEnter } from '../lib/keyboard'
import { fieldClass } from '../lib/styles'

type PromptPatch = Partial<Pick<GenerationSettings, 'prompt' | 'negativePrompt'>>

interface Props {
  settings: GenerationSettings
  model: ModelInfo
  examples: string[]
  limits: Limits
  onChange: (patch: PromptPatch) => void
  onSubmit: () => void
}

export function PromptEditor({ settings, model, examples, limits, onChange, onSubmit }: Props) {
  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="prompt" className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
            Prompt
          </label>
          <ExamplePicker examples={examples} onPick={(prompt) => onChange({ prompt })} />
        </div>
        <textarea
          id="prompt"
          rows={6}
          maxLength={limits.max_prompt_length}
          value={settings.prompt}
          onChange={(event) => onChange({ prompt: event.target.value })}
          onKeyDown={(event) => {
            if (isModEnter(event)) {
              event.preventDefault()
              onSubmit()
            }
          }}
          placeholder="Describe the image in detail…"
          className={`${fieldClass} mt-1 resize-y`}
        />
        <p className="mt-1 flex justify-between text-[11px] text-zinc-400">
          <span>{model.trigger_word ? `“${model.trigger_word}” is added automatically` : '⌘/Ctrl + Enter to generate'}</span>
          <span className="tabular-nums">
            {settings.prompt.length}/{limits.max_prompt_length}
          </span>
        </p>
      </div>
      {model.uses_guidance && <NegativePrompt value={settings.negativePrompt} model={model} onChange={onChange} />}
    </div>
  )
}

function ExamplePicker({ examples, onPick }: { examples: string[]; onPick: (prompt: string) => void }) {
  return (
    <select
      aria-label="Insert an example prompt"
      value=""
      onChange={(event) => event.target.value && onPick(event.target.value)}
      className="max-w-48 truncate rounded-md border-0 bg-transparent py-0.5 text-xs text-violet-600 hover:text-violet-500 focus:ring-0 dark:text-violet-400"
    >
      <option value="">Examples…</option>
      {examples.map((example) => (
        <option key={example} value={example}>
          {example.length > 70 ? `${example.slice(0, 70)}…` : example}
        </option>
      ))}
    </select>
  )
}

interface NegativePromptProps {
  value: string
  model: ModelInfo
  onChange: (patch: PromptPatch) => void
}

function NegativePrompt({ value, model, onChange }: NegativePromptProps) {
  const isDefault = value === model.default_negative_prompt
  return (
    <div>
      <div className="flex items-center justify-between">
        <label htmlFor="negative-prompt" className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
          Negative prompt
        </label>
        {!isDefault && (
          <button
            type="button"
            onClick={() => onChange({ negativePrompt: model.default_negative_prompt })}
            className="text-xs text-violet-600 hover:text-violet-500 dark:text-violet-400"
          >
            Restore default
          </button>
        )}
      </div>
      <textarea
        id="negative-prompt"
        rows={2}
        value={value}
        onChange={(event) => onChange({ negativePrompt: event.target.value })}
        placeholder="What to avoid…"
        className={`${fieldClass} mt-1 resize-y`}
      />
    </div>
  )
}
