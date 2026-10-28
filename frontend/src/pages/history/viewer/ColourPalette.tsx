import { t } from '../../../i18n'
import { useCallback } from 'react'
import { IconButton } from '../../../shared/ui/IconButton'
import { fetchPalette } from '../../../api'
import { useCopyToClipboard, useLoadable } from '../../../lib/hooks'
import type { PaletteColour } from '../../../types'
import { ErrorNotice } from '../../../shared/ui/ui'

const PLACEHOLDERS = 6

export function ColourPalette({ itemId }: { itemId: number }) {
  const load = useCallback((signal: AbortSignal) => fetchPalette(itemId, signal), [itemId])
  const [palette, retry] = useLoadable(load)
  return (
    <section aria-label={t('history.colourPalette')}>
      <h3 className="mb-1.5 text-xs font-semibold tracking-wider text-zinc-500 uppercase">{t('history.colourPalette')}</h3>
      {palette.status === 'pending' && <PaletteSkeleton />}
      {palette.status === 'failed' && <ErrorNotice message={palette.error} onRetry={retry} />}
      {palette.status === 'settled' && (
        <ul className="grid grid-cols-6 gap-1.5">
          {palette.value.map((colour) => (
            <Swatch key={colour.hex} colour={colour} />
          ))}
        </ul>
      )}
    </section>
  )
}

function PaletteSkeleton() {
  return (
    <div aria-busy="true" aria-label={t('history.paletteLoading')} className="grid grid-cols-6 gap-1.5">
      {Array.from({ length: PLACEHOLDERS }, (_, index) => (
        <div key={index} className="h-10 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
      ))}
    </div>
  )
}

function Swatch({ colour }: { colour: PaletteColour }) {
  const [copied, copy] = useCopyToClipboard()
  return (
    <li>
      <IconButton
        onClick={() => void copy(colour.hex)}
        label={t('history.copyColour', { hex: colour.hex })}
        className="block h-10 w-full rounded-md border border-black/10 shadow-xs transition hover:scale-105 focus:ring-2 focus:ring-violet-500 focus:outline-none dark:border-white/10"
        style={{ backgroundColor: colour.hex }}
      >
        {null}
      </IconButton>
      <p className="mt-1 truncate text-center font-mono text-[10px] text-zinc-600 dark:text-zinc-300">{copied ? t('common.copied') : colour.hex}</p>
      <p className="text-center text-[10px] text-zinc-400 tabular-nums">{Math.round(colour.share * 100)}%</p>
    </li>
  )
}
