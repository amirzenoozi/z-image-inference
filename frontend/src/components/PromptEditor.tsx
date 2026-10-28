import { useState } from 'react'
import type { GenerationSettings, Limits, ModelInfo } from '../types'
import { isModEnter } from '../lib/keyboard'
import { Textarea } from './form/Textarea'
import { withoutSafeForWorkTerms } from '../lib/promptBuilder/build'
import { PromptBuilderDialog, type InsertMode } from './promptBuilder/PromptBuilderDialog'

type PromptPatch = Partial<Pick<GenerationSettings, 'prompt' | 'negativePrompt'>>

interface Props {
  settings: GenerationSettings
  model: ModelInfo
  limits: Limits
  onChange: (patch: PromptPatch) => void
  onSubmit: () => void
}

function joinText(current: string, addition: string, separator: string): string {
  return current.trim() ? `${current.trim()}${separator}${addition}` : addition
}

export function PromptEditor({ settings, model, limits, onChange, onSubmit }: Props) {
  const [builderOpen, setBuilderOpen] = useState(false)
  const insertBuilt = (prompt: string, negativePrompt: string, mode: InsertMode, explicit: boolean) => {
    // An existing "nsfw" negative would work against the explicit prompt being added
    const existingNegative = explicit ? withoutSafeForWorkTerms(settings.negativePrompt) : settings.negativePrompt
    onChange(
      mode === 'replace'
        ? { prompt, negativePrompt }
        : { prompt: joinText(settings.prompt, prompt, ' '), negativePrompt: joinText(existingNegative, negativePrompt, ', ') },
    )
  }
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setBuilderOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-violet-400 py-2.5 text-sm font-semibold text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-950/40"
      >
        ✨ Prompt builder
      </button>
      {builderOpen && (
        <PromptBuilderDialog
          model={model}
          hasExistingPrompt={settings.prompt.trim() !== ''}
          maxPromptLength={limits.max_prompt_length}
          onClose={() => setBuilderOpen(false)}
          onConfirm={insertBuilt}
        />
      )}
      <div>
        <label htmlFor="prompt" className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
          Prompt
        </label>
        <Textarea
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
          className="mt-1 min-h-36"
        />
        <p className="mt-1 flex justify-between text-[11px] text-zinc-400">
          <span>{model.trigger_word ? `“${model.trigger_word}” is added automatically` : '⌘/Ctrl + Enter to generate'}</span>
          <span className="tabular-nums">
            {settings.prompt.length}/{limits.max_prompt_length}
          </span>
        </p>
        <ExampleCards examples={model.examples} onPick={(prompt) => onChange({ prompt })} />
      </div>
      {model.uses_guidance && <NegativePrompt value={settings.negativePrompt} model={model} onChange={onChange} />}
    </div>
  )
}

function ExampleCards({ examples, onPick }: { examples: string[]; onPick: (prompt: string) => void }) {
  if (examples.length === 0) return null
  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      {examples.map((example, index) => (
        <button
          key={example}
          type="button"
          aria-label={`Example #${index + 1}`}
          title={example}
          onClick={() => onPick(example)}
          className="min-w-0 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-left hover:border-violet-400 hover:bg-violet-50 dark:border-zinc-700 dark:hover:border-violet-600 dark:hover:bg-violet-950/40"
        >
          <span className="block text-xs font-medium text-zinc-800 dark:text-zinc-100">Example #{index + 1}</span>
          <span className="block truncate text-[11px] text-zinc-500 dark:text-zinc-400">{example}</span>
        </button>
      ))}
    </div>
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
      <Textarea
        id="negative-prompt"
        rows={2}
        value={value}
        onChange={(event) => onChange({ negativePrompt: event.target.value })}
        placeholder="What to avoid…"
        className="mt-1"
      />
    </div>
  )
}
