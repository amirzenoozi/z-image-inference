import { useState } from 'react'
import { fetchHistorySet } from '../../../../../../../api'
import { t } from '../../../../../../../i18n'
import { useAdultContent } from '../../../../../../../lib/adultContent'
import { errorMessage } from '../../../../../../../lib/hooks'
import { secondaryButtonClass } from '../../../../../../../lib/styles'
import type { HistoryItem, Loadable } from '../../../../../../../types'
import { CompareDialog } from '../../../../../../../shared/images/CompareDialog'
import { ErrorNotice, Spinner } from '../../../../../../../shared/ui/ui'

interface Props {
  /** An image from an A/B test (it has a set id). */
  setId: string
  labelOf: (id: string) => string
}

/** Opens the A/B test an image came from in Compare; a set with only one image left says so instead. */
export function CompareSetButton({ setId, labelOf }: Props) {
  const { shown: adultShown } = useAdultContent()
  const [set, setSet] = useState<Loadable<HistoryItem[]> | null>(null)
  const open = () => {
    setSet({ status: 'pending' })
    fetchHistorySet(setId, !adultShown)
      .then((value) => setSet({ status: 'settled', value }))
      .catch((error: unknown) => setSet({ status: 'failed', error: errorMessage(error) }))
  }
  return (
    <>
      <button type="button" onClick={open} disabled={set?.status === 'pending'} className={`${secondaryButtonClass} flex items-center gap-1.5`}>
        {set?.status === 'pending' && <Spinner className="size-3.5" />}
        {t('history.compareSet')}
      </button>
      <SetOutcome set={set} labelOf={labelOf} onRetry={open} onClose={() => setSet(null)} />
    </>
  )
}

interface OutcomeProps {
  set: Loadable<HistoryItem[]> | null
  labelOf: (id: string) => string
  onRetry: () => void
  onClose: () => void
}

function SetOutcome({ set, labelOf, onRetry, onClose }: OutcomeProps) {
  if (set?.status === 'failed') return <ErrorNotice message={set.error} onRetry={onRetry} />
  if (set?.status !== 'settled') return null
  if (set.value.length < 2) return <p role="status" className="text-xs text-zinc-500 dark:text-zinc-400">{t('history.setOnlyOne')}</p>
  return <CompareDialog items={set.value} labelOf={labelOf} title={t('create.abResultsTitle')} onClose={onClose} />
}
