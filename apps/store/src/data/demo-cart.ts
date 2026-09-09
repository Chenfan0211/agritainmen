import type { BusinessMediaValue, MockScenario } from '@agritainment/shared'
import { initialCatalogOrderQuantity, normalizeMinimumOrderQuantity } from '@agritainment/shared'

interface StoreDemoProduct {
  id: string
  name: string
  image: BusinessMediaValue
  price: number
  skus: Array<{ id: string; name: string; cost: number; stock: number; minimumOrderQuantity?: number }>
}

interface StoreDemoCartLine {
  productId: string
  skuId: string
  skuName: string
  name: string
  image: BusinessMediaValue
  price: number
  retail: number
  stock: number
  quantity: number
  minimumOrderQuantity: number
  unavailable?: boolean
}

export function seedDemoStoreCart<T extends StoreDemoCartLine>(cart: T[], products: StoreDemoProduct[], scenario: MockScenario = 'normal'): T[] {
  if (scenario !== 'normal' || cart.length) return cart
  const product = products.find((item) => item.id === 'P001') || products[0]
  const sku = product?.skus[0]
  if (!product || !sku) return cart
  const minimumOrderQuantity = normalizeMinimumOrderQuantity(sku.minimumOrderQuantity)
  return [{
    productId: product.id,
    skuId: sku.id,
    skuName: sku.name,
    name: product.name,
    image: product.image,
    price: sku.cost,
    retail: product.price,
    stock: sku.stock,
    quantity: initialCatalogOrderQuantity(minimumOrderQuantity),
    minimumOrderQuantity,
    unavailable: false
  } as T]
}
