import { FlaskConical } from 'lucide-react'
import { t } from '../../../../../i18n'
import { settingName, type AbTest } from '../../../../../lib/abTest'
import type { ModelInfo } from '../../../../../types'

interface Props {
  test: AbTest | null
  /** The test just left, which Undo brings back. */
  left: AbTest | null
  model: ModelInfo
  /** Off while the test's images are being made. */
  busy: boolean
  onEdit: () => void
  onLeave: () => void
  onUndoLeave: () => void
}

const linkClass = 'font-semibold text-violet-700 hover:text-violet-500 disabled:opacity-50 pointer-coarse:min-h-11 dark:text-violet-300'

/** Says an A/B test is on and what it locks, with its values and the way out; after leaving, Undo for a moment. */
export function AbTestBar({ test, left, model, busy, onEdit, onLeave, onUndoLeave }: Props) {
  if (!test) return left ? <LeftNotice onUndo={onUndoLeave} /> : null
  return (
    <div role="status" className="space-y-2 rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs text-violet-900 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-100">
      <p className="flex gap-2">
        <FlaskConical className="mt-0.5 shrink-0" aria-hidden="true" />
        {t('create.abBar', { subject: test.settings.map((setting) => settingName(setting, model)).join(', '), count: test.versions.length })}
      </p>
      <p className="flex justify-end gap-4">
        <button type="button" onClick={onEdit} disabled={busy} className={linkClass}>{t('create.abEdit')}</button>
        <button type="button" onClick={onLeave} disabled={busy} className={linkClass}>{t('create.abLeave')}</button>
      </p>
    </div>
  )
}

function LeftNotice({ onUndo }: { onUndo: () => void }) {
  return (
    <p role="status" className="flex items-center justify-between gap-3 rounded-xl bg-zinc-100 p-3 text-xs text-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-200">
      {t('create.abLeft')}
      <button type="button" onClick={onUndo} className={linkClass}>{t('create.abUndo')}</button>
    </p>
  )
}
