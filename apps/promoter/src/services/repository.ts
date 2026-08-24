import { applyPlatformMedia, catalogProductToStoreProduct, cProducts, cloneSeed, ensureCatalogState, farms, liveRooms, mergePlatformLives, mockDelay, products, promoters, readStoreCatalogSelections } from '@agritainment/shared'
import type { MockScenario } from '@agritainment/shared'

export const promoterRepository = {
  loadDashboard: (scenario: MockScenario = 'normal') => {
    const storeFarms = cloneSeed(farms)
    const catalog = ensureCatalogState(products, cProducts)
    const packageProducts = readStoreCatalogSelections()
      .filter((selection) => selection.listed)
      .flatMap((selection) => {
        const product = catalog.products.find((item) => item.id === selection.productId && item.status === 'active' && item.productType === 'package' && item.skus.some((sku) => sku.status !== 'retired'))
        if (!product) return []
        return [{ ...catalogProductToStoreProduct(product, selection), farmIds: [selection.storeId] }]
      })
    applyPlatformMedia(storeFarms, packageProducts)
    const mergedLives = mergePlatformLives(cloneSeed(liveRooms))
    return mockDelay(
      { farms: storeFarms, products: packageProducts, liveRooms: mergedLives, promoter: promoters[0] },
      180,
      scenario,
      { farms: [], products: [], liveRooms: [], promoter: null }
    )
  }
}
