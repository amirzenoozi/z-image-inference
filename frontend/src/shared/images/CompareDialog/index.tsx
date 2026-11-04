import { t } from '../../../i18n'
import { imageUrl } from '../../../api'
import type { HistoryItem } from '../../../types'
import { imageFacts } from '../../../lib/imageFacts'
import { ImageFacts } from '../ImageFacts'
import { Modal } from '../../ui/Modal'
import { PromptBlock } from '../../ui/ui'

interface Props {
  /** Two to six images; an A/B test's are labelled with what each one tried. */
  items: readonly HistoryItem[]
  labelOf: (id: string) => string
  title?: string
  onClose: () => void
}

function sharedFacts(facts: ReadonlySet<string>[]): ReadonlySet<string> {
  return new Set([...facts[0]].filter((fact) => facts.every((each) => each.has(fact))))
}

const COLUMNS: Record<number, string> = { 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-2 xl:grid-cols-4' }

/** Images side by side; a fact not every image shares is highlighted. */
export function CompareDialog({ items, labelOf, title = t('history.compareTitle'), onClose }: Props) {
  const shared = sharedFacts(items.map((item) => new Set(imageFacts(item, labelOf(item.model)))))
  return (
    <Modal title={title} onClose={onClose} size="xl">
      <div className={`grid gap-6 ${COLUMNS[items.length] ?? 'md:grid-cols-3'}`}>
        {items.map((item) => (
          <div key={item.id} className="space-y-3 text-sm">
            {item.set_label && <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">{item.set_label}</h3>}
            <img src={imageUrl(item.id)} alt={item.prompt} className="max-h-[60vh] w-full rounded-xl bg-zinc-100 object-contain dark:bg-zinc-800" />
            <ImageFacts item={item} label={labelOf(item.model)} others={shared} />
            <PromptBlock title={t('common.prompt')} text={item.prompt} />
          </div>
        ))}
      </div>
    </Modal>
  )
}
