import { pageItems } from '../lib/pagination'
import { controlHeight } from '../lib/styles'

interface Props {
  page: number
  pageCount: number
  onChange: (page: number) => void
}

const pageButtonClass =
  `inline-flex min-w-10 items-center justify-center rounded-lg border px-3 text-sm font-medium tabular-nums ${controlHeight} ` +
  'disabled:cursor-not-allowed disabled:opacity-40'
const idleClass = 'border-zinc-300 text-zinc-700 enabled:hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:enabled:hover:bg-zinc-800'
const currentClass = 'border-violet-600 bg-violet-600 text-white'

export function Pagination({ page, pageCount, onChange }: Props) {
  if (pageCount <= 1) return null
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-center gap-1.5">
      <button type="button" onClick={() => onChange(page - 1)} disabled={page === 1} className={`${pageButtonClass} ${idleClass}`}>
        ‹ Previous
      </button>
      {pageItems(page, pageCount).map((item, index) =>
        item === 'gap' ? (
          <span key={`gap-${index}`} aria-hidden="true" className="px-1 text-zinc-400">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            aria-label={`Page ${item}`}
            aria-current={item === page ? 'page' : undefined}
            onClick={() => onChange(item)}
            className={`${pageButtonClass} ${item === page ? currentClass : idleClass}`}
          >
            {item}
          </button>
        ),
      )}
      <button type="button" onClick={() => onChange(page + 1)} disabled={page === pageCount} className={`${pageButtonClass} ${idleClass}`}>
        Next ›
      </button>
    </nav>
  )
}
