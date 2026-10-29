import { language, t, tOr } from '../../../i18n'
import { addonApplies, addonLabel, withAddon } from '../../../lib/addons'
import type { AddonInfo, Loadable, ModelInfo, ModelStatusReport } from '../../../types'
import { Checkbox } from '../../../shared/form/Checkbox'
import { DownloadActions } from './DownloadActions'
import { DownloadBadge, SourceLink } from './modelParts'

interface Props {
  model: ModelInfo
  /** The add-ons switched on, for any model. */
  enabled: string[]
  prompt: string
  status: Loadable<ModelStatusReport>
  onChange: (enabled: string[]) => void
  onStatusChanged: () => void
}

/** The selected model's add-ons: each can be switched on once downloaded, and is used only when the prompt mentions it. */
export function AddonsPanel({ model, enabled, prompt, status, onChange, onStatusChanged }: Props) {
  if (model.addons.length === 0) return null
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium text-zinc-600 dark:text-zinc-300">{t('create.addonsHeading')}</legend>
      {model.addons.map((addon) => (
        <AddonRow
          key={addon.id}
          addon={addon}
          on={enabled.includes(addon.id)}
          prompt={prompt}
          status={status}
          onToggle={(on) => onChange(withAddon(enabled, addon.id, on))}
          onStatusChanged={onStatusChanged}
        />
      ))}
    </fieldset>
  )
}

interface RowProps {
  addon: AddonInfo
  on: boolean
  prompt: string
  status: Loadable<ModelStatusReport>
  onToggle: (on: boolean) => void
  onStatusChanged: () => void
}

function AddonRow({ addon, on, prompt, status, onToggle, onStatusChanged }: RowProps) {
  const state = status.status === 'settled' ? status.value.models[addon.id] : undefined
  const ready = state?.status === 'ready'
  return (
    <div className="rounded-lg border border-zinc-200 p-3 text-xs dark:border-zinc-800">
      <div className="flex items-start justify-between gap-2">
        <label className="flex items-start gap-2 font-medium text-zinc-800 dark:text-zinc-100">
          <Checkbox checked={on && ready} disabled={!ready} onChange={(event) => onToggle(event.target.checked)} />
          <span>
            {addonLabel(addon.id, addon.label)}
            <span className="block font-normal text-zinc-500 dark:text-zinc-400">{tOr(`create.addonDescription_${addon.id}`, addon.description)}</span>
          </span>
        </label>
        <SourceLink model={addon} />
      </div>
      <DownloadBadge model={addon} status={status} />
      {on && ready && <UsageNote addon={addon} prompt={prompt} />}
      {state && (
        <div className="mt-2">
          <DownloadActions item={{ ...addon, kept_gb: addon.download_gb }} state={{ status: state.status, sizeBytes: state.size_bytes }} inUse={false} freeBytes={status.status === 'settled' ? status.value.free_bytes : null} onChanged={onStatusChanged} />
        </div>
      )}
    </div>
  )
}

/** Says beforehand whether the next render will use the add-on, by the same rule the server applies. */
function UsageNote({ addon, prompt }: { addon: AddonInfo; prompt: string }) {
  if (addonApplies(addon, prompt)) {
    return <p className="mt-2 text-violet-700 dark:text-violet-300">{t('create.addonUsed')}</p>
  }
  const words = new Intl.ListFormat(language(), { type: 'disjunction' }).format(addon.keywords.map((word) => `“${word}”`))
  return <p className="mt-2 text-zinc-500 dark:text-zinc-400">{t('create.addonNotUsed', { words })}</p>
}
