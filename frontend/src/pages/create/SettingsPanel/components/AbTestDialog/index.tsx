import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { t } from '../../../../../i18n'
import {
  MAX_SETTINGS, MAX_VERSIONS, MIN_VERSIONS, currentValue, groupedSettings, promptChoices, settingKey, settingName, testableChoices, valuesProblem,
  type AbTest, type TestSetting, type TestValue,
} from '../../../../../lib/abTest'
import { choiceGroupsOf } from '../../../../../lib/promptBuilder/choiceGroups'
import { NOT_SET } from '../../../../../lib/promptBuilder/constants'
import type { BuilderMode } from '../../../../../lib/promptBuilder/modes'
import type { BuilderState } from '../../../../../lib/promptBuilder/build'
import { secondaryButtonClass } from '../../../../../lib/styles'
import type { AddonInfo, GenerationSettings, ModelInfo } from '../../../../../types'
import { Select } from '../../../../../shared/form/Select'
import { LookSliderField } from '../../../../../shared/lookSliders/LookSliderField'
import { ChoiceSelect } from '../../../../../shared/promptBuilder/steps'
import { IconButton } from '../../../../../shared/ui/IconButton'
import { Modal } from '../../../../../shared/ui/Modal'

type Built = { state: BuilderState; mode: BuilderMode }

interface Props {
  settings: GenerationSettings
  model: ModelInfo
  modes: readonly BuilderMode[]
  /** The model's downloaded look sliders, the ones a test can compare. */
  sliders: readonly AddonInfo[]
  /** The test being edited, or null to set up a new one. */
  test: AbTest | null
  onSave: (test: AbTest) => void
  onClose: () => void
}

const LETTERS = 'ABCDEF'
const EMPTY: AbTest = { settings: [], versions: [[], []] }

/** Every setting the prompt lets a test compare: the downloaded sliders, then the builder prompt's choices. */
function offeredSettings(sliders: readonly AddonInfo[], built: Built | null): TestSetting[] {
  const fromSliders: TestSetting[] = sliders.map((addon) => ({ kind: 'slider', addonId: addon.id }))
  const fromChoices: TestSetting[] = built ? testableChoices(built.mode).map((field) => ({ kind: 'choice', field })) : []
  return [...fromSliders, ...fromChoices]
}

/** The test with a setting added: every version starts at what the prompt has for it now. */
function withSetting(test: AbTest, setting: TestSetting, value: TestValue): AbTest {
  return { settings: [...test.settings, setting], versions: test.versions.map((row) => [...row, value]) }
}

const withoutSetting = (test: AbTest, at: number): AbTest => ({
  settings: test.settings.filter((_, index) => index !== at),
  versions: test.versions.map((row) => row.filter((_, index) => index !== at)),
})

const withCell = (test: AbTest, version: number, at: number, value: TestValue): AbTest => ({
  ...test,
  versions: test.versions.map((row, index) => (index === version ? row.map((each, column) => (column === at ? value : each)) : row)),
})

/** Sets up an A/B test, or changes a running one: one to three settings, and two to six versions, one per image. */
export function AbTestDialog({ settings, model, modes, sliders, test, onSave, onClose }: Props) {
  const built = promptChoices(settings, modes)
  const [draft, setDraft] = useState<AbTest>(test ?? EMPTY)
  const offered = offeredSettings(sliders, built)
  const hasSettings = draft.settings.length > 0
  const problem = hasSettings ? valuesProblem(draft) : null
  const save = () => {
    if (!hasSettings || problem) return
    onSave(draft)
    onClose()
  }
  return (
    <Modal
      title={t('create.abTitle')}
      onClose={onClose}
      size="lg"
      actionsNote={problem}
      actions={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>{t('common.cancel')}</button>
          <button type="button" onClick={save} disabled={!hasSettings || problem !== null} className="rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50">
            {t(test ? 'create.abSave' : 'create.abStart')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{t('create.abIntro')}</p>
        <SettingsList
          draft={draft}
          offered={offered}
          model={model}
          onAdd={(setting) => setDraft(withSetting(draft, setting, currentValue(setting, settings, modes)))}
          onRemove={(at) => setDraft(withoutSetting(draft, at))}
        />
        {hasSettings && <Versions draft={draft} model={model} sliders={sliders} built={built} onChange={setDraft} />}
      </div>
    </Modal>
  )
}

interface SettingsListProps {
  draft: AbTest
  offered: readonly TestSetting[]
  model: ModelInfo
  onAdd: (setting: TestSetting) => void
  onRemove: (at: number) => void
}

/** The settings the test compares, each removable, and a menu adding another (up to three); or why there is nothing to add. */
function SettingsList({ draft, offered, model, onAdd, onRemove }: SettingsListProps) {
  const added = new Set(draft.settings.map(settingKey))
  const left = offered.filter((setting) => !added.has(settingKey(setting)))
  if (offered.length === 0 && draft.settings.length === 0) {
    return <p className="rounded-xl bg-zinc-50 p-3 text-xs text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300">{t('create.abNothingToCompare')}</p>
  }
  const add = (key: string) => {
    const setting = left.find((each) => settingKey(each) === key)
    if (setting) onAdd(setting)
  }
  return (
    <section aria-label={t('create.abSettings')} className="space-y-2">
      <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">{t('create.abSettings')}</h3>
      <ul className="flex flex-wrap gap-2">
        {draft.settings.map((setting, at) => (
          <li key={settingKey(setting)} className="flex items-center gap-1 rounded-lg bg-violet-50 py-0.5 pr-1 pl-2.5 text-xs font-medium text-violet-900 dark:bg-violet-950/50 dark:text-violet-100">
            {settingName(setting, model)}
            <IconButton label={t('create.abRemoveSetting', { name: settingName(setting, model) })} onClick={() => onRemove(at)} className="text-violet-500 hover:text-red-600">
              <X />
            </IconButton>
          </li>
        ))}
      </ul>
      {draft.settings.length < MAX_SETTINGS && left.length > 0 && (
        <Select
          label={t('create.abAddSetting')}
          hideLabel
          value={NOT_SET}
          groups={[
            { options: [{ value: NOT_SET, label: t('create.abAddSetting') }] },
            ...groupedSettings(left).map((group) => ({ label: group.label, options: group.settings.map((setting) => ({ value: settingKey(setting), label: settingName(setting, model) })) })),
          ]}
          onChange={add}
        />
      )}
    </section>
  )
}

interface VersionsProps {
  draft: AbTest
  model: ModelInfo
  sliders: readonly AddonInfo[]
  built: Built | null
  onChange: (draft: AbTest) => void
}

/** One card per version (one image), with a control for each setting; versions can be added (up to six) or removed (down to two). */
function Versions({ draft, model, sliders, built, onChange }: VersionsProps) {
  const addVersion = () => onChange({ ...draft, versions: [...draft.versions, [...draft.versions[draft.versions.length - 1]]] })
  const removeVersion = (version: number) => onChange({ ...draft, versions: draft.versions.filter((_, index) => index !== version) })
  return (
    <div className="space-y-3">
      {draft.versions.map((row, version) => (
        <section key={version} aria-label={t('create.abVersion', { letter: LETTERS[version] })} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">{t('create.abVersion', { letter: LETTERS[version] })}</h3>
            {draft.versions.length > MIN_VERSIONS && (
              <IconButton label={t('create.abRemoveVersion', { letter: LETTERS[version] })} onClick={() => removeVersion(version)} className="text-zinc-400 hover:text-red-600">
                <X />
              </IconButton>
            )}
          </div>
          {draft.settings.map((setting, at) => (
            <SettingValue
              key={settingKey(setting)}
              setting={setting}
              label={`${settingName(setting, model)} (${LETTERS[version]})`}
              value={row[at]}
              sliders={sliders}
              built={built}
              onChange={(value) => onChange(withCell(draft, version, at, value))}
            />
          ))}
        </section>
      ))}
      {draft.versions.length < MAX_VERSIONS && (
        <button type="button" onClick={addVersion} className="flex items-center gap-1 text-xs font-medium text-violet-600 hover:text-violet-500 pointer-coarse:min-h-11 dark:text-violet-400">
          <Plus /> {t('create.abAddVersion')}
        </button>
      )}
    </div>
  )
}

interface SettingValueProps {
  setting: TestSetting
  label: string
  value: TestValue
  sliders: readonly AddonInfo[]
  built: Built | null
  onChange: (value: TestValue) => void
}

/**
 * One setting's value in one version, with the same control the builder and the Look section use for it. A setting the prompt
 * no longer offers (its slider removed, or the prompt no longer from the builder) shows its value; Generate says why it can't run.
 */
function SettingValue({ setting, label, value, sliders, built, onChange }: SettingValueProps) {
  const addon = setting.kind === 'slider' ? sliders.find((each) => each.id === setting.addonId) : undefined
  if (addon) return <LookSliderField addon={addon} name={label} value={Number(value)} defaultValue={Number(value)} onChange={onChange} onReset={() => {}} />
  if (setting.kind === 'choice' && built) {
    return <ChoiceSelect label={label} value={String(value)} groups={choiceGroupsOf(setting.field, built.state, built.mode)} allowRandom={false} onChange={onChange} />
  }
  return <p className="py-2 text-xs text-zinc-500 dark:text-zinc-400">{label}: {String(value)}</p>
}
