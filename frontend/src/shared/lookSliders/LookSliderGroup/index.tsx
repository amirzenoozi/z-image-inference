import type { ReactNode } from 'react'
import { t } from '../../../i18n'

/** The look sliders of a builder step or the character dialog, together under one heading below the step's choices. */
export function LookSliderGroup({ children }: { children: ReactNode }) {
  return (
    <section aria-label={t('create.sectionLook')} className="mt-5 space-y-1 border-t border-zinc-200 pt-4 dark:border-zinc-800">
      <h3 className="text-xs font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400">{t('create.sectionLook')}</h3>
      {children}
    </section>
  )
}
