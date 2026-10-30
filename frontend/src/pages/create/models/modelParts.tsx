import type { ModelInfo } from '../../../types'
import { ExternalLink } from 'lucide-react'
import { t } from '../../../i18n'

/** The model's page on the site it comes from. */
export function SourceLink({ model }: { model: Pick<ModelInfo, 'label' | 'page_url' | 'source_name'> }) {
  return (
    <a
      href={model.page_url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t('create.openOnSite', { model: model.label, site: model.source_name })}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-zinc-500 hover:bg-zinc-200/70 hover:text-violet-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-violet-300"
    >
      {model.source_name} <ExternalLink className="size-3" />
    </a>
  )
}
