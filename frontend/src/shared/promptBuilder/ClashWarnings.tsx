import { language, optionLabel, t, type MessageKey } from '../../i18n'
import type { Clash, ClashKind } from '../../lib/promptBuilder/conflicts'
import { TriangleAlert } from 'lucide-react'

const MESSAGES: Record<ClashKind, MessageKey> = {
  hands: 'builder.clashHands', position: 'builder.clashPosition', mouth: 'builder.clashMouth', facing: 'builder.clashFacing',
  framing: 'builder.clashFraming', hair: 'builder.clashHair', light: 'builder.clashLight', weather: 'builder.clashWeather',
  accessories: 'builder.clashAccessories', build: 'builder.clashBuild',
}

function clashMessage(clash: Clash): string {
  const labels = clash.values.map((value) => t('builder.clashQuoted', { label: optionLabel(value) }))
  const items = new Intl.ListFormat(language(), { type: 'conjunction' }).format(labels)
  return t(MESSAGES[clash.kind], { items, a: labels[0] ?? '', b: labels[1] ?? '' })
}

/** Choices of the user's own that contradict each other, which the model would try to draw both of. */
export function ClashWarnings({ clashes }: { clashes: readonly Clash[] }) {
  if (clashes.length === 0) return null
  return (
    <div role="status" className="space-y-1 rounded-lg bg-amber-50 p-2.5 text-[11px] text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
      <p className="flex items-center gap-1.5 font-semibold">
        <TriangleAlert className="size-3.5" /> {t('builder.clashHeading')}
      </p>
      <ul className="list-disc space-y-0.5 pl-4">
        {clashes.map((clash) => (
          <li key={`${clash.kind}:${clash.values.join('|')}`}>{clashMessage(clash)}</li>
        ))}
      </ul>
    </div>
  )
}
