import { imageUrl } from '../api'
import { MAX_CHANGE, MIN_CHANGE } from '../lib/settings'
import type { ModelInfo, StartImage } from '../types'
import { Slider } from './form/Slider'
import { IconButton } from './IconButton'
import { X } from 'lucide-react'
import { t } from '../i18n'

interface Props {
  startImage: StartImage
  model: ModelInfo
  onChange: (startImage: StartImage | null) => void
}

const CHANGE_STEP = 0.05

/** A variation's start image, how much to change it, and a way back to a normal render. */
export function StartImageBlock({ startImage, model, onChange }: Props) {
  const percent = Math.round(startImage.change * 100)
  return (
    <div role="group" aria-label={t('create.startImage')} className="space-y-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-center gap-3">
        <img src={imageUrl(startImage.id, true)} alt="" className="size-14 shrink-0 rounded-lg bg-zinc-100 object-cover dark:bg-zinc-800" />
        <p className="flex-1 text-xs text-zinc-600 dark:text-zinc-300">
          <span className="block font-semibold text-zinc-800 dark:text-zinc-100">{t('create.startImage')}</span>
          {t('create.variationOf', { id: startImage.id })}
        </p>
        <IconButton label={t('create.removeStartImage')} onClick={() => onChange(null)} className="flex size-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200">
          <X />
        </IconButton>
      </div>
      {model.supports_variations ? (
        <div>
          <div className="flex justify-between text-xs font-medium text-zinc-600 dark:text-zinc-300">
            <span>{t('create.changeAmount')}</span>
            <span className="tabular-nums">{percent}%</span>
          </div>
          <Slider
            label={t('create.changeAmount')}
            min={MIN_CHANGE}
            max={MAX_CHANGE}
            step={CHANGE_STEP}
            value={startImage.change}
            onChange={(text) => onChange({ ...startImage, change: Number(text) })}
            className="mt-2"
          />
          <div className="mt-1 flex justify-between text-[11px] text-zinc-400">
            <span>{t('create.subtle')}</span>
            <span>{t('create.strong')}</span>
          </div>
        </div>
      ) : (
        <p role="alert" className="text-xs text-amber-700 dark:text-amber-300">
          {t('create.cantStartFromImageNote', { model: model.label })}
        </p>
      )}
    </div>
  )
}
