import { imageUrl } from '../api'
import type { HistoryItem } from '../types'
import { imageFacts } from '../lib/imageFacts'
import { ImageFacts } from './ImageFacts'
import { Modal } from './Modal'
import { PromptBlock } from './ui'

interface Props {
  items: [HistoryItem, HistoryItem]
  labelOf: (id: string) => string
  onClose: () => void
}

/** Two images side by side; facts that differ between them are highlighted. */
export function CompareDialog({ items, labelOf, onClose }: Props) {
  const facts = items.map((item) => new Set(imageFacts(item, labelOf(item.model))))
  return (
    <Modal title="Compare images" onClose={onClose} size="xl">
      <div className="grid gap-6 md:grid-cols-2">
        {items.map((item, index) => (
          <div key={item.id} className="space-y-3 text-sm">
            <img src={imageUrl(item.id)} alt={item.prompt} className="max-h-[60vh] w-full rounded-xl bg-zinc-100 object-contain dark:bg-zinc-800" />
            <ImageFacts item={item} label={labelOf(item.model)} others={facts[1 - index]} />
            <PromptBlock title="Prompt" text={item.prompt} />
          </div>
        ))}
      </div>
    </Modal>
  )
}
