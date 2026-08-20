import { applyPlatformEntities, applyPlatformMedia, cityOptions, cloneSeed, commissionRules, farms, liveRooms, mergePlatformLives, mockDelay, products, promoters, travelRoutes } from '@agritainment/shared'
import type { MockScenario } from '@agritainment/shared'

export const allianceRepository = {
  loadDiscovery: (scenario: MockScenario = 'normal') => {
    const storeFarms = cloneSeed(farms)
    const storeProducts = cloneSeed(products.filter((item) => item.status === 'active'))
    applyPlatformEntities(storeProducts, storeFarms, null, null, null)
    applyPlatformMedia(storeFarms, storeProducts)
    const mergedLives = mergePlatformLives(cloneSeed(liveRooms))
    return mockDelay(
      { farms: storeFarms, liveRooms: mergedLives, products: storeProducts, promoter: promoters[0], promoterRanking: promoters, commissionRules, cityOptions, routes: travelRoutes },
      180,
      scenario,
      { farms: [], liveRooms: [], products: [], promoter: null, promoterRanking: [], commissionRules, cityOptions, routes: [] }
    )
  }
}
