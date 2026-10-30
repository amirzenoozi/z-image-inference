import { useMemo, useState } from 'react'
import { useCharacter } from '../../lib/characters'
import type { BuilderModeData, GenerationSettings, Limits, ModelInfo } from '../../types'
import { isModEnter } from '../../lib/keyboard'
import { writtenPrompt, type SentPrompt } from '../../lib/characterPrompt'
import { secondaryButtonClass, tabClass } from '../../lib/styles'
import { Textarea } from '../../shared/form/Textarea'
import { withoutSafeForWorkTerms, type BuilderState } from '../../lib/promptBuilder/build'
import { modesForCharacter, parseModes } from '../../lib/promptBuilder/modes'
import { parseSpec, specFromText, specText, stateFromSpec, type PromptSpec } from '../../lib/promptBuilder/spec'
import { PromptBuilderDialog, type InsertMode } from '../../shared/promptBuilder/PromptBuilderDialog'
import { WandSparkles } from 'lucide-react'
import { t, type MessageKey } from '../../i18n'

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
  const [view, setView] = useState<PromptView>('json')
  const character = useCharacter(settings.characterId)
  const modes = useMemo(() => parseModes(builderModes).modes, [builderModes])
  const written = writtenPrompt(settings, character, model, modes)
  const insertBuilt = (prompt: string, negativePrompt: string, insert: InsertMode, explicit: boolean, spec: PromptSpec) => {
    // An existing "nsfw" negative would work against the explicit prompt being added
    const existingNegative = explicit ? withoutSafeForWorkTerms(settings.negativePrompt) : settings.negativePrompt
    // The builder writes the chosen character's look into the prompt, so Generate doesn't add it again
    const lookIncluded = character?.id ?? null
    // Added to a prompt, the result is text; on its own it stays JSON, so it can be changed and written for any model
    const current = written.status === 'ready' ? written.prompt : ''
    setView('json')
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
  const showView = (next: PromptView) => {
    setView(next)
    // A typed prompt becomes JSON whole, as the subject, in the first purpose open to the subject
    const typedToJson = next === 'json' && settings.promptFormat === 'text'
    if (typedToJson) onChange({ prompt: specText(specFromText(settings.prompt, modesForCharacter(modes, character)[0].id)), promptFormat: 'json' })
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
      <PromptBox
        settings={settings}
        model={model}
        limits={limits}
        written={written}
        shown={settings.promptFormat === 'json' ? view : 'text'}
        locked={locked}
        onView={showView}
        onChange={onChange}
        onSubmit={onSubmit}
        onEdit={openInBuilder}
      />
      <ExampleCards examples={model.examples} disabled={locked} onPick={(prompt) => onChange({ prompt, promptFormat: 'text', lookIncluded: null })} />
      {model.uses_guidance && <NegativePrompt value={settings.negativePrompt} model={model} locked={locked} onChange={onChange} />}
    </div>
  )
}

type PromptView = 'json' | 'text'

interface PromptBoxProps {
  settings: GenerationSettings
  model: ModelInfo
  limits: Limits
  written: SentPrompt
  /** What the box shows: the JSON prompt, or the text, typed or written from the JSON (then read-only). */
  shown: PromptView
  locked: boolean
  onView: (view: PromptView) => void
  onChange: (patch: PromptPatch) => void
  onSubmit: () => void
  onEdit: () => void
}

function PromptBox({ settings, model, limits, written, shown, locked, onView, onChange, onSubmit, onEdit }: PromptBoxProps) {
  const isJson = settings.promptFormat === 'json'
  const showsJson = shown === 'json'
  // The text written from a JSON prompt follows the JSON, so it is only read
  const writtenOnly = isJson && !showsJson
  const readyText = written.status === 'ready' ? written.prompt : ''
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="prompt" className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
          {t(promptLabelKey(isJson, showsJson))}
        </label>
        <PromptViewSwitch shown={shown} canShowJson={settings.prompt.trim() !== '' && (isJson || !locked)} onView={onView} />
      </div>
      <Textarea
        id="prompt"
        rows={showsJson ? 14 : 6}
        // A JSON prompt is longer than the text written from it, which is what the limit is for
        maxLength={showsJson ? undefined : limits.max_prompt_length}
        spellCheck={!showsJson}
        value={writtenOnly ? readyText : settings.prompt}
        readOnly={locked || writtenOnly}
        aria-readonly={locked || writtenOnly}
        onChange={(event) => onChange(typedPrompt(event.target.value))}
        onKeyDown={(event) => {
          if (isModEnter(event)) {
            event.preventDefault()
            onSubmit()
          }
        }}
        placeholder={t('create.promptPlaceholder')}
        className={`mt-1 min-h-36 ${showsJson ? 'font-mono text-xs' : ''}`}
      />
      <p className="mt-1 flex justify-between text-[11px] text-zinc-400">
        <span>{promptHint(model, isJson, showsJson)}</span>
        <span className="tabular-nums">
          {readyText.length}/{limits.max_prompt_length}
        </span>
      </p>
      {isJson && <JsonPromptTools problem={written.status === 'problem' ? written.reason : null} locked={locked} onEdit={onEdit} />}
    </div>
  )
}

function promptLabelKey(isJson: boolean, showsJson: boolean): MessageKey {
  if (showsJson) return 'create.promptJsonLabel'
  return isJson ? 'create.promptTextLabel' : 'create.promptLabel'
}

function promptHint(model: ModelInfo, isJson: boolean, showsJson: boolean): string {
  if (showsJson) return t('create.jsonHint')
  if (isJson) return t('create.jsonTextHint', { model: model.label })
  return model.trigger_word ? t('create.triggerWordAdded', { word: model.trigger_word }) : t('create.modEnterHint')
}

interface PromptViewSwitchProps {
  shown: PromptView
  /** An empty prompt has nothing to show as JSON, and a typed one isn't turned into JSON while it renders. */
  canShowJson: boolean
  onView: (view: PromptView) => void
}

/** Shows the prompt as JSON or as text; a typed prompt becomes JSON the first time, and the JSON is kept from then on. */
function PromptViewSwitch({ shown, canShowJson, onView }: PromptViewSwitchProps) {
  const views: { id: PromptView; label: string; enabled: boolean }[] = [
    { id: 'json', label: t('create.viewJson'), enabled: canShowJson },
    { id: 'text', label: t('create.viewText'), enabled: true },
  ]
  return (
    <div role="radiogroup" aria-label={t('create.promptView')} className="flex gap-1 rounded-lg bg-zinc-100 p-0.5 text-xs dark:bg-zinc-800/70">
      {views.map(({ id, label, enabled }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={shown === id}
          disabled={!enabled}
          onClick={() => onView(id)}
          className={`rounded-md px-2.5 py-0.5 font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${tabClass(shown === id)}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

interface JsonPromptToolsProps {
  /** Why the JSON prompt can't be written as text, or null. */
  problem: string | null
  locked: boolean
  onEdit: () => void
}

/** Says what is wrong with a JSON prompt, and opens it in the builder. */
function JsonPromptTools({ problem, locked, onEdit }: JsonPromptToolsProps) {
  return (
    <div className="mt-2 space-y-2">
      {problem && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {problem}
        </p>
      )}
      <button type="button" onClick={onEdit} disabled={locked || problem !== null} className={`${secondaryButtonClass} disabled:opacity-50 max-sm:w-full`}>
        {t('create.editInBuilder')}
      </button>
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
