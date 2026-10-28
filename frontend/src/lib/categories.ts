import { t, tOr } from '../i18n'
import type { Category, ModelCategory, ModelInfo } from '../types'

/** How the resolution picker and History's ratio filter name each shape, read in the UI's language when used. */
export const CATEGORY_LABELS: Record<Category, string> = {
  get square() {
    return t('create.categorySquare')
  },
  get portrait() {
    return t('create.categoryPortrait')
  },
  get landscape() {
    return t('create.categoryLandscape')
  },
  get widescreen() {
    return t('create.categoryWidescreen')
  },
}

export function isCategory(value: string): value is Category {
  return Object.hasOwn(CATEGORY_LABELS, value)
}

/** The server's model descriptions and category names are English; the UI shows them in its language. */
export function modelDescription(model: ModelInfo): string {
  return tOr(`create.modelDescription_${model.id}`, model.description)
}

export function modelCategoryLabel(category: ModelCategory): string {
  return tOr(`create.modelCategory_${category.id}`, category.label)
}
