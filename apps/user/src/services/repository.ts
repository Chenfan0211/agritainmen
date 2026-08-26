import { applyPlatformEntities, applyPlatformMedia, catalogProductToStoreProduct, cloneSeed, cProducts, ensureCatalogState, farms, liveRooms, mergePlatformLives, mockDelay, products, readCProducts, readStoreCatalogSelections, seedCCommerceData } from '@agritainment/shared'
import type { MockScenario } from '@agritainment/shared'

export function readLivePackageProjection() {
  const catalog = ensureCatalogState(cloneSeed(products), readCProducts() || cProducts)
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

export function readLiveRoomProjection(packageProducts = readLivePackageProjection()) {
  const validPackagesByFarm = new Map<string, Set<string>>()
  packageProducts.forEach((product) => product.farmIds.forEach((farmId) => {
    const ids = validPackagesByFarm.get(farmId) || new Set<string>()
    ids.add(product.id)
    validPackagesByFarm.set(farmId, ids)
  }))
  return mergePlatformLives(cloneSeed(liveRooms)).map((room) => {
    if (room.status !== 'live' || !room.linkedFarms?.length) return room
    const hasValidPackage = room.linkedFarms.some((linked) => linked.packageIds.some((id) => validPackagesByFarm.get(linked.farmId)?.has(id)))
    return hasValidPackage ? room : { ...room, status: 'preview' as const }
  })
}

export const userRepository = {
  loadDashboard: (scenario: MockScenario = 'normal') => {
    seedCCommerceData()
    const storeFarms = cloneSeed(farms)
    const seedAll = cloneSeed(products)
    applyPlatformEntities(seedAll, storeFarms, null, null, null)
    ensureCatalogState(seedAll, readCProducts() || cProducts)
    const packageProducts = readLivePackageProjection()
    applyPlatformMedia(storeFarms, packageProducts)
    const mergedLives = readLiveRoomProjection(packageProducts)
    return mockDelay(
      { farms: storeFarms, products: packageProducts, catalogStoreProducts: seedAll, liveRooms: mergedLives, cProducts: cloneSeed(readCProducts() || cProducts) },
      180,
      scenario,
      { farms: [], products: [], catalogStoreProducts: [], liveRooms: [], cProducts: [] }
    )
  }
}
