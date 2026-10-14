import { CATALOG_SCHEMA_VERSION, applyPlatformEntities, applyPlatformMedia, catalogProductToStoreProduct, cloneSeed, cProducts, farms, migrateLegacyCatalog, mockDelay, products, readCProducts, readCatalogState, readStoreCatalogSelections } from '@agritainment/shared'
import type { MockScenario } from '@agritainment/shared'

/** 门店套餐券投影：门店在订货端上架、带库存的套餐商品，用于用户端到店自提核销 */
export function readStorePackageProjection() {
  const catalog = readCatalogState() || { schemaVersion: CATALOG_SCHEMA_VERSION, revision: 0, products: migrateLegacyCatalog(cloneSeed(products), readCProducts() || cProducts), appliedOperations: {} }
  return readStoreCatalogSelections()
    .filter((selection) => selection.listed)
    .flatMap((selection) => {
      const product = catalog.products.find((item) => item.id === selection.productId && item.status === 'active' && item.productType === 'package' && item.skus.some((sku) => sku.status !== 'retired' && sku.stock > 0))
      if (!product) return []
      const saleableSkuIds = new Set(product.skus.filter((sku) => sku.status !== 'retired' && sku.stock > 0).map((sku) => sku.id))
      const projected = catalogProductToStoreProduct(product, selection)
      return [{ ...projected, stock: projected.skus.filter((sku) => saleableSkuIds.has(sku.id)).reduce((sum, sku) => sum + sku.stock, 0), skus: projected.skus.filter((sku) => saleableSkuIds.has(sku.id)), farmIds: [selection.storeId] }]
    })
}

export const userRepository = {
  loadDashboard: (scenario: MockScenario = 'normal') => {
    const storeFarms = cloneSeed(farms)
    const seedAll = cloneSeed(products)
    applyPlatformEntities(seedAll, storeFarms, null, null, null)
    const packageProducts = readStorePackageProjection()
    applyPlatformMedia(storeFarms, packageProducts)
    return mockDelay(
      { farms: storeFarms, products: packageProducts, catalogStoreProducts: seedAll, cProducts: cloneSeed(readCProducts() || cProducts) },
      180,
      scenario,
      { farms: [], products: [], catalogStoreProducts: [], cProducts: [] }
    )
  }
}
