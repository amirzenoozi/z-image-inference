import { t } from '../../../i18n'
import { addonLabel, withAddon } from '../../../lib/addons'
import type { Loadable, ModelInfo, ModelStatusReport } from '../../../types'
import { Checkbox } from '../../../shared/form/Checkbox'

interface Props {
  model: ModelInfo
  /** The add-ons switched on, for any model. */
  enabled: string[]
  status: Loadable<ModelStatusReport>
  onChange: (enabled: string[]) => void
}

/**
 * A checkbox for each downloaded add-on of the selected model; each is used only when the prompt mentions it.
 * The details and downloads are in the model dialog's Add-ons tab.
 */
export function AddonsPanel({ model, enabled, status, onChange }: Props) {
  if (status.status !== 'settled') return null
  const downloaded = model.addons.filter((addon) => status.value.models[addon.id]?.status === 'ready')
  if (downloaded.length === 0) return null
  return (
    <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
      <legend className="mb-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">{t('create.addonsHeading')}</legend>
      {downloaded.map((addon) => (
        <label key={addon.id} className="flex cursor-pointer items-center gap-2 text-sm text-zinc-800 pointer-coarse:min-h-11 dark:text-zinc-100">
          <Checkbox checked={enabled.includes(addon.id)} onChange={(event) => onChange(withAddon(enabled, addon.id, event.target.checked))} />
          {addonLabel(addon.id, addon.label)}
        </label>
      ))}
    </fieldset>
  )
}
