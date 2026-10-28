import { useState } from 'react'
import { useCharacter } from '../lib/characters'
import type { BuilderModeData, GenerationSettings, Limits, ModelInfo } from '../types'
import { isModEnter } from '../lib/keyboard'
import { Textarea } from './form/Textarea'
import { withoutSafeForWorkTerms } from '../lib/promptBuilder/build'
import { PromptBuilderDialog, type InsertMode } from './promptBuilder/PromptBuilderDialog'
import { WandSparkles } from 'lucide-react'

type PromptPatch = Partial<Pick<GenerationSettings, 'prompt' | 'negativePrompt' | 'characterId' | 'lookIncluded'>>

interface Props {
  settings: GenerationSettings
  model: ModelInfo
  limits: Limits
  builderModes: readonly BuilderModeData[]
  /** True while an image is being generated: the prompts can be read and copied, but not changed. */
  locked: boolean
  onChange: (patch: PromptPatch) => void
  onSubmit: () => void
}

/** Clearing the prompt starts a new one, which doesn't have the character's look any more. */
function typedPrompt(prompt: string): PromptPatch {
  return prompt.trim() ? { prompt } : { prompt, lookIncluded: null }
}

function joinText(current: string, addition: string, separator: string): string {
  return current.trim() ? `${current.trim()}${separator}${addition}` : addition
}

export function PromptEditor({ settings, model, limits, builderModes, locked, onChange, onSubmit }: Props) {
  const [builderOpen, setBuilderOpen] = useState(false)
  const character = useCharacter(settings.characterId)
  const insertBuilt = (prompt: string, negativePrompt: string, mode: InsertMode, explicit: boolean) => {
    // An existing "nsfw" negative would work against the explicit prompt being added
    const existingNegative = explicit ? withoutSafeForWorkTerms(settings.negativePrompt) : settings.negativePrompt
    // The builder writes the chosen character's look into the prompt, so Generate doesn't add it again
    const lookIncluded = character?.id ?? null
    onChange(
      mode === 'replace'
        ? { prompt, negativePrompt, lookIncluded }
        : { prompt: joinText(settings.prompt, prompt, ' '), negativePrompt: joinText(existingNegative, negativePrompt, ', '), lookIncluded },
    )
  }
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setBuilderOpen(true)}
        disabled={locked}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-violet-400 py-2.5 text-sm font-semibold text-violet-700 not-disabled:hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-700 dark:text-violet-300 dark:not-disabled:hover:bg-violet-950/40"
      >
        <WandSparkles /> Prompt builder
      </button>
      {builderOpen && (
        <PromptBuilderDialog
          model={model}
          modes={builderModes}
          character={character}
          onCharacterSaved={(saved) => onChange({ characterId: saved.id })}
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
          readOnly={locked}
          aria-readonly={locked}
          onChange={(event) => onChange(typedPrompt(event.target.value))}
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
        <ExampleCards examples={model.examples} disabled={locked} onPick={(prompt) => onChange({ prompt, lookIncluded: null })} />
      </div>
      {model.uses_guidance && <NegativePrompt value={settings.negativePrompt} model={model} locked={locked} onChange={onChange} />}
    </div>
  )
}

function ExampleCards({ examples, disabled, onPick }: { examples: string[]; disabled: boolean; onPick: (prompt: string) => void }) {
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
          disabled={disabled}
          className="min-w-0 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-left not-disabled:hover:border-violet-400 not-disabled:hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:not-disabled:hover:border-violet-600 dark:not-disabled:hover:bg-violet-950/40"
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
  locked: boolean
  onChange: (patch: PromptPatch) => void
}

function NegativePrompt({ value, model, locked, onChange }: NegativePromptProps) {
  const isDefault = value === model.default_negative_prompt
  return (
    <div>
      <div className="flex items-center justify-between">
        <label htmlFor="negative-prompt" className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
          Negative prompt
        </label>
        {!isDefault && !locked && (
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
        readOnly={locked}
        aria-readonly={locked}
        onChange={(event) => onChange({ negativePrompt: event.target.value })}
        placeholder="What to avoid…"
        className="mt-1"
      />
    </div>
  )
}
