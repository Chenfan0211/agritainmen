import type { BusinessMediaValue, MockScenario } from '@agritainment/shared'
import { initialCatalogOrderQuantity, normalizeMinimumOrderQuantity } from '@agritainment/shared'

interface FarmhouseDemoProduct {
  id: string
  name: string
  image: BusinessMediaValue
  skus: Array<{ id: string; name: string; price: number; stock: number; minimumOrderQuantity?: number }>
}

interface FarmhouseDemoCartLine {
  productId: string
  skuId: string
  skuName: string
  name: string
  image: BusinessMediaValue
  price: number
  stock: number
  quantity: number
  minimumOrderQuantity: number
  unavailable?: boolean
}

export function seedDemoFarmhouseCart<T extends FarmhouseDemoCartLine>(cart: T[], products: FarmhouseDemoProduct[], scenario: MockScenario = 'normal'): T[] {
  if (scenario !== 'normal' || cart.length) return cart
  const product = products.find((item) => item.id === 'P002') || products[0]
  const sku = product?.skus[0]
  if (!product || !sku) return cart
  const minimumOrderQuantity = normalizeMinimumOrderQuantity(sku.minimumOrderQuantity)
  return [{
    productId: product.id,
    skuId: sku.id,
    skuName: sku.name,
    name: product.name,
    image: product.image,
    price: sku.price,
    stock: sku.stock,
    quantity: initialCatalogOrderQuantity(minimumOrderQuantity),
    minimumOrderQuantity,
    unavailable: false
  } as T]
}
