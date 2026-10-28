import { t } from '../../i18n'
import { modeDescription, modeLabel, type BuilderMode } from '../../lib/promptBuilder/modes'
import { chipClass } from '../../lib/styles'

interface Props {
  modes: readonly BuilderMode[]
  current: string
  problems: readonly string[]
  onSelect: (mode: BuilderMode) => void
}

export function ModePicker({ modes, current, problems, onSelect }: Props) {
  return (
    <div className="mb-4 space-y-2">
      <div role="radiogroup" aria-label={t('builder.purpose')} className="flex gap-2 overflow-x-auto pb-1">
        {modes.map((mode) => (
          <button
            key={mode.id}
            type="button"
            role="radio"
            aria-checked={mode.id === current}
            title={modeDescription(mode)}
            onClick={() => onSelect(mode)}
            className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium ${chipClass(mode.id === current)}`}
          >
            {modeLabel(mode)}
          </button>
        ))}
      </div>
      <CurrentDescription mode={modes.find((mode) => mode.id === current)} />
      {problems.map((problem) => (
        <p key={problem} role="alert" className="rounded-lg bg-amber-50 p-2 text-[11px] text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          {problem}
        </p>
      ))}
    </div>
  )
}

function CurrentDescription({ mode }: { mode: BuilderMode | undefined }) {
  return <p className="text-xs text-zinc-500 dark:text-zinc-400">{mode ? modeDescription(mode) : null}</p>
}
