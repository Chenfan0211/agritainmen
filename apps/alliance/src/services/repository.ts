import { applyPlatformMedia, cityOptions, cloneSeed, commissionRules, farms, liveRooms, mockDelay, products, promoters, travelRoutes } from '@agritainment/shared'
import type { MockScenario } from '@agritainment/shared'

export const allianceRepository = {
  loadDiscovery: (scenario: MockScenario = 'normal') => {
    const storeFarms = cloneSeed(farms)
    const storeProducts = cloneSeed(products.filter((item) => item.status === 'active'))
    applyPlatformMedia(storeFarms, storeProducts)
    return mockDelay(
      { farms: storeFarms, liveRooms, products: storeProducts, promoter: promoters[0], promoterRanking: promoters, commissionRules, cityOptions, routes: travelRoutes },
      180,
      scenario,
      { farms: [], liveRooms: [], products: [], promoter: null, promoterRanking: [], commissionRules, cityOptions, routes: [] }
    )
  }
}
