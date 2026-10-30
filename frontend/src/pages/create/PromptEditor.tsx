import { useMemo, useState } from 'react'
import { useCharacter } from '../../lib/characters'
import type { BuilderModeData, GenerationSettings, Limits, ModelInfo } from '../../types'
import { isModEnter } from '../../lib/keyboard'
import { writtenPrompt } from '../../lib/characterPrompt'
import { secondaryButtonClass } from '../../lib/styles'
import { Textarea } from '../../shared/form/Textarea'
import { withoutSafeForWorkTerms, type BuilderState } from '../../lib/promptBuilder/build'
import { parseModes } from '../../lib/promptBuilder/modes'
import { parseSpec, specText, stateFromSpec, type PromptSpec } from '../../lib/promptBuilder/spec'
import { PromptBuilderDialog, type InsertMode } from '../../shared/promptBuilder/PromptBuilderDialog'
import { WandSparkles } from 'lucide-react'
import { t } from '../../i18n'

type PromptPatch = Partial<Pick<GenerationSettings, 'prompt' | 'promptFormat' | 'negativePrompt' | 'characterId' | 'lookIncluded'>>

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
  return prompt.trim() ? { prompt } : { prompt, lookIncluded: null, promptFormat: 'text' }
}

function joinText(current: string, addition: string, separator: string): string {
  return current.trim() ? `${current.trim()}${separator}${addition}` : addition
}

/** The builder opened on its last choices, or on a JSON prompt's. */
type BuilderOpen = { initialState?: BuilderState } | null

export function PromptEditor({ settings, model, limits, builderModes, locked, onChange, onSubmit }: Props) {
  const [builder, setBuilder] = useState<BuilderOpen>(null)
  const character = useCharacter(settings.characterId)
  const modes = useMemo(() => parseModes(builderModes).modes, [builderModes])
  const written = writtenPrompt(settings, character, model, modes)
  const isJson = settings.promptFormat === 'json'
  const insertBuilt = (prompt: string, negativePrompt: string, insert: InsertMode, explicit: boolean, spec: PromptSpec) => {
    // An existing "nsfw" negative would work against the explicit prompt being added
    const existingNegative = explicit ? withoutSafeForWorkTerms(settings.negativePrompt) : settings.negativePrompt
    // The builder writes the chosen character's look into the prompt, so Generate doesn't add it again
    const lookIncluded = character?.id ?? null
    // Added to a prompt, the result is text; on its own it stays JSON, so it can be changed and written for any model
    const current = written.status === 'ready' ? written.prompt : ''
    onChange(
      insert === 'replace'
        ? { prompt: specText(spec), promptFormat: 'json', negativePrompt, lookIncluded }
        : { prompt: joinText(current, prompt, ' '), promptFormat: 'text', negativePrompt: joinText(existingNegative, negativePrompt, ', '), lookIncluded },
    )
  }
  const openInBuilder = () => {
    const parsed = parseSpec(settings.prompt)
    if (parsed.ok) setBuilder({ initialState: stateFromSpec(parsed.spec) })
  }
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setBuilder({})}
        disabled={locked}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-violet-400 py-2.5 text-sm font-semibold text-violet-700 not-disabled:hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-700 dark:text-violet-300 dark:not-disabled:hover:bg-violet-950/40"
      >
        <WandSparkles /> {t('create.promptBuilder')}
      </button>
      {builder && (
        <PromptBuilderDialog
          model={model}
          modes={builderModes}
          character={character}
          onCharacterSaved={(saved) => onChange({ characterId: saved.id })}
          hasExistingPrompt={settings.prompt.trim() !== '' && written.status === 'ready'}
          maxPromptLength={limits.max_prompt_length}
          initialState={builder.initialState}
          onClose={() => setBuilder(null)}
          onConfirm={insertBuilt}
        />
      )}
      <div>
        <label htmlFor="prompt" className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
          {t(isJson ? 'create.promptJsonLabel' : 'create.promptLabel')}
        </label>
        <Textarea
          id="prompt"
          rows={isJson ? 14 : 6}
          // A JSON prompt is longer than the text written from it, which is what the limit is for
          maxLength={isJson ? undefined : limits.max_prompt_length}
          spellCheck={!isJson}
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
          placeholder={t('create.promptPlaceholder')}
          className={`mt-1 min-h-36 ${isJson ? 'font-mono text-xs' : ''}`}
        />
        <p className="mt-1 flex justify-between text-[11px] text-zinc-400">
          <span>{promptHint(model, isJson)}</span>
          <span className="tabular-nums">
            {written.status === 'ready' ? written.prompt.length : settings.prompt.length}/{limits.max_prompt_length}
          </span>
        </p>
        {isJson && (
          <JsonPromptTools
            problem={written.status === 'problem' ? written.reason : null}
            locked={locked}
            onEdit={openInBuilder}
            onConvert={() => written.status === 'ready' && onChange({ prompt: written.prompt, promptFormat: 'text' })}
          />
        )}
        <ExampleCards examples={model.examples} disabled={locked} onPick={(prompt) => onChange({ prompt, promptFormat: 'text', lookIncluded: null })} />
      </div>
      {model.uses_guidance && <NegativePrompt value={settings.negativePrompt} model={model} locked={locked} onChange={onChange} />}
    </div>
  )
}

function promptHint(model: ModelInfo, isJson: boolean): string {
  if (isJson) return t('create.jsonHint')
  return model.trigger_word ? t('create.triggerWordAdded', { word: model.trigger_word }) : t('create.modEnterHint')
}

interface JsonPromptToolsProps {
  /** Why the JSON prompt can't be written as text, or null. */
  problem: string | null
  locked: boolean
  onEdit: () => void
  onConvert: () => void
}

/** Opens a JSON prompt in the builder, or turns it into text for the selected model, for good. */
function JsonPromptTools({ problem, locked, onEdit, onConvert }: JsonPromptToolsProps) {
  const disabled = locked || problem !== null
  return (
    <div className="mt-2 space-y-2">
      {problem && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {problem}
        </p>
      )}
      <div className="flex gap-2 max-sm:flex-col">
        <button type="button" onClick={onEdit} disabled={disabled} className={`${secondaryButtonClass} disabled:opacity-50`}>
          {t('create.editInBuilder')}
        </button>
        <button type="button" onClick={onConvert} disabled={disabled} className={`${secondaryButtonClass} disabled:opacity-50`}>
          {t('create.convertToText')}
        </button>
      </div>
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
          aria-label={t('create.exampleNumber', { number: index + 1 })}
          title={example}
          onClick={() => onPick(example)}
          disabled={disabled}
          className="min-w-0 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-left not-disabled:hover:border-violet-400 not-disabled:hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:not-disabled:hover:border-violet-600 dark:not-disabled:hover:bg-violet-950/40"
        >
          <span className="block text-xs font-medium text-zinc-800 dark:text-zinc-100">{t('create.exampleNumber', { number: index + 1 })}</span>
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
          {t('create.negativePrompt')}
        </label>
        {!isDefault && !locked && (
          <button
            type="button"
            onClick={() => onChange({ negativePrompt: model.default_negative_prompt })}
            className="text-xs text-violet-600 hover:text-violet-500 dark:text-violet-400"
          >
            {t('create.restoreDefault')}
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
        placeholder={t('create.negativePlaceholder')}
        className="mt-1"
      />
    </div>
  )
}
