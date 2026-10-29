import { language, t, tOr } from '../../../i18n'
import { addonLabel } from '../../../lib/addons'
import type { AddonInfo, Loadable, ModelInfo, ModelStatusReport } from '../../../types'
import { DownloadActions } from './DownloadActions'
import { DownloadBadge, SourceLink } from './modelParts'

interface Props {
  /** The selected base model: only its add-ons are listed. */
  model: ModelInfo
  status: Loadable<ModelStatusReport>
  onChanged: () => void
}

/** The model dialog's Add-ons tab: the selected model's add-ons, with what they do, their downloads and their pages. */
export function AddonCards({ model, status, onChanged }: Props) {
  if (model.addons.length === 0) return <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('create.noAddons', { model: model.label })}</p>
  return (
    <ul aria-label={t('create.addonsHeading')} className="grid gap-3 sm:grid-cols-2">
      {model.addons.map((addon) => (
        <AddonCard key={addon.id} addon={addon} status={status} onChanged={onChanged} />
      ))}
    </ul>
  )
}

function AddonCard({ addon, status, onChanged }: { addon: AddonInfo; status: Loadable<ModelStatusReport>; onChanged: () => void }) {
  const state = status.status === 'settled' ? status.value.models[addon.id] : undefined
  const words = new Intl.ListFormat(language(), { type: 'disjunction' }).format(addon.keywords.map((word) => `“${word}”`))
  const label = addonLabel(addon.id, addon.label)
  return (
    <li aria-label={label} className="flex flex-col gap-2 rounded-xl border border-zinc-300 p-4 text-sm dark:border-zinc-700">
      <span className="font-semibold">{label}</span>
      <span className="text-xs text-zinc-500 dark:text-zinc-400">{tOr(`create.addonDescription_${addon.id}`, addon.description)}</span>
      <span className="text-xs text-zinc-500 dark:text-zinc-400">{t('create.addonUsedWhen', { words })}</span>
      <DownloadBadge model={addon} status={status} />
      <div className="mt-auto flex items-center justify-between gap-2">
        {state ? (
          <DownloadActions item={{ ...addon, kept_gb: addon.download_gb }} state={{ status: state.status, sizeBytes: state.size_bytes }} inUse={false} freeBytes={status.status === 'settled' ? status.value.free_bytes : null} onChanged={onChanged} />
        ) : (
          <span />
        )}
        <SourceLink model={addon} />
      </div>
    </li>
  )
}
