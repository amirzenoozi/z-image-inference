import { t } from '../../i18n'
import type { ModelInfo } from '../../types'

// Below half the area of the size a model was made for, images come out soft and badly composed
const SMALLEST_SHARE = 0.5

/** Warns when the size is far below the model's own, as when a small size is kept after switching to an SDXL model. */
export function SizeHint({ width, height, model, onUseModelSize }: { width: number; height: number; model: ModelInfo; onUseModelSize: () => void }) {
  if (width * height >= model.default_width * model.default_height * SMALLEST_SHARE) return null
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
      <span>
        {t('create.sizeHint', { model: model.label, width: model.default_width, height: model.default_height, currentWidth: width, currentHeight: height })}
      </span>
      <button type="button" onClick={onUseModelSize} className="shrink-0 rounded-md bg-amber-600 px-2 py-1 font-semibold text-white hover:bg-amber-500">
        {t('create.useSize', { width: model.default_width, height: model.default_height })}
      </button>
    </div>
  )
}
