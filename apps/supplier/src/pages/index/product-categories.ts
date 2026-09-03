import { productCategoryImage } from '@agritainment/shared'
import type { MediaReference, PlatformDictionaryState } from '@agritainment/shared'

export interface ProductCategoryOption {
  label: string
  image: MediaReference
  legacy: boolean
}

export function buildProductCategoryOptions(state: PlatformDictionaryState, current = ''): ProductCategoryOption[] {
  const enabledItems = state.items
    .filter((item) => item.type === 'productCategory' && item.enabled && item.label.trim())
    .sort((left, right) => left.sort - right.sort || left.label.localeCompare(right.label))
  const seen = new Set<string>()
  const options = enabledItems.flatMap((item) => {
    const label = item.label.trim()
    if (seen.has(label)) return []
    seen.add(label)
    return [{ label, image: item.image ?? productCategoryImage(label, state), legacy: false }]
  })
  const legacy = current.trim()
  if (legacy && !seen.has(legacy)) options.push({ label: legacy, image: productCategoryImage(legacy, state), legacy: true })
  return options
}
