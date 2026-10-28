import { imageFacts } from '../lib/imageFacts'
import type { HistoryItem } from '../types'

/** `others` marks every fact the other image does not share, for comparing two images. */
export function ImageFacts({ item, label, others }: { item: HistoryItem; label: string; others?: ReadonlySet<string> }) {
  return (
    <ul className="flex flex-wrap gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
      {imageFacts(item, label).map((fact) => (
        <FactChip key={fact} fact={fact} differs={others !== undefined && !others.has(fact)} />
      ))}
    </ul>
  )
}

function FactChip({ fact, differs }: { fact: string; differs: boolean }) {
  const colours = differs
    ? 'bg-amber-100 font-semibold text-amber-900 dark:bg-amber-900/50 dark:text-amber-100'
    : 'bg-zinc-100 dark:bg-zinc-800'
  return (
    <li className={`rounded-full px-2.5 py-1 tabular-nums ${colours}`}>
      {fact}
      {differs && <span className="sr-only"> (differs)</span>}
    </li>
  )
}
