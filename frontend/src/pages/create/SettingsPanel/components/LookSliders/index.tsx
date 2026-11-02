import { useState } from 'react'
import { t } from '../../../../../i18n'
import { updateCharacter } from '../../../../../api'
import { lookWithMoved } from '../../../../../lib/characterPrompt'
import { useCharacters } from '../../../../../lib/characters'
import { lookStrength, sliderAddons, type Strengths } from '../../../../../lib/lookSliders'
import type { Character, Loadable, ModelInfo, ModelStatusReport, PromptFormat } from '../../../../../types'
import { LookSliderField } from '../../../../../shared/lookSliders/LookSliderField'
import { ErrorNotice, Section } from '../../../../../shared/ui/ui'

interface Props {
  model: ModelInfo
  characterId: number | null
  /** A JSON prompt comes from the prompt builder, which has its own look sliders, so this section is hidden for it. */
  promptFormat: PromptFormat
  /** The sliders the user moved; the others show the character's defaults. */
  moved: Strengths
  status: Loadable<ModelStatusReport>
  onChange: (moved: Strengths) => void
}

type SaveState = 'idle' | 'saving' | 'failed'

/**
 * The model's downloaded look sliders (lib/lookSliders). Each starts at the chosen character's default; moving one changes this
 * render, and the character's defaults change only when saved.
 */
export function LookSliders({ model, characterId, promptFormat, moved, status, onChange }: Props) {
  const { characters, reload } = useCharacters()
  const [saveState, setSaveState] = useState<SaveState>('idle')
  if (status.status !== 'settled' || promptFormat === 'json') return null
  const sliders = sliderAddons(model).filter((addon) => status.value.models[addon.id]?.status === 'ready')
  if (sliders.length === 0) return null
  const anyMoved = Object.keys(moved).length > 0
  const reset = (
    <button type="button" onClick={() => onChange({})} disabled={!anyMoved} className="text-xs text-violet-600 hover:text-violet-500 disabled:text-zinc-400 dark:text-violet-400">
      {t('create.lookReset')}
    </button>
  )
  // The defaults come from the character, so they can't be shown until the list has loaded
  if (characterId !== null && characters.status !== 'settled') {
    return (
      <Section title={t('create.sectionLook')}>
        <div aria-busy="true" className="h-24 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800/70" />
      </Section>
    )
  }
  const character = characters.status === 'settled' ? (characters.value.find((each) => each.id === characterId) ?? null) : null
  // The look the sliders show: the character's with the moved ones over it, which also changes the options they match
  const strengthOf = (addonId: string) => (character ? lookStrength(addonId, lookWithMoved(character, model, moved).traits) : (moved[addonId] ?? 0))
  const save = async (target: Character) => {
    setSaveState('saving')
    try {
      await updateCharacter(target.id, { traits: lookWithMoved(target, model, moved).traits })
      reload()
      onChange({})
      setSaveState('idle')
    } catch {
      setSaveState('failed')
    }
  }
  return (
    <Section title={t('create.sectionLook')} aside={reset}>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{t(character ? 'create.lookHintCharacter' : 'create.lookHint', { name: character?.name ?? '' })}</p>
      {sliders.map((addon) => (
        <LookSliderField key={addon.id} addon={addon} value={strengthOf(addon.id)} onChange={(value) => onChange({ ...moved, [addon.id]: value })} />
      ))}
      {character && <SaveDefaults character={character} disabled={!anyMoved || saveState === 'saving'} onSave={() => void save(character)} />}
      {saveState === 'failed' && character && <ErrorNotice message={t('create.lookSaveFailed')} onRetry={() => void save(character)} />}
    </Section>
  )
}

function SaveDefaults({ character, disabled, onSave }: { character: Character; disabled: boolean; onSave: () => void }) {
  return (
    <button
      type="button"
      onClick={onSave}
      disabled={disabled}
      className="text-xs font-medium text-violet-600 hover:text-violet-500 disabled:text-zinc-400 pointer-coarse:min-h-11 dark:text-violet-400"
    >
      {t('create.lookSaveDefaults', { name: character.name })}
    </button>
  )
}
