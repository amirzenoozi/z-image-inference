import { t } from '../../i18n'
import { tabClass } from '../../lib/styles'

export type Pane = 'settings' | 'result'

interface Props {
  pane: Pane
  onChange: (pane: Pane) => void
  /** An image (or an error) arrived while Settings was open. */
  resultUnseen: boolean
}

/** Settings or Result, below desktop width, where the two don't fit side by side. */
export function PaneSwitch({ pane, onChange, resultUnseen }: Props) {
  const panes: { id: Pane; label: string }[] = [
    { id: 'settings', label: t('create.paneSettings') },
    { id: 'result', label: t('create.paneResult') },
  ]
  return (
    <div role="tablist" aria-label={t('create.panesLabel')} className="grid grid-cols-2 gap-1 border-b border-zinc-200 bg-white p-2 lg:hidden dark:border-zinc-800 dark:bg-zinc-950">
      {panes.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={pane === id}
          onClick={() => onChange(id)}
          className={`relative min-h-10 rounded-lg bg-zinc-100 text-sm font-medium dark:bg-zinc-800/70 ${tabClass(pane === id)}`}
        >
          {label}
          {id === 'result' && resultUnseen && (
            <>
              <span aria-hidden="true" className="absolute top-2 right-3 size-2 rounded-full bg-red-500" />
              <span className="sr-only">{t('create.newResult')}</span>
            </>
          )}
        </button>
      ))}
    </div>
  )
}
