import { applyPlatformMedia, cloneSeed, farms, liveRooms, mergePlatformLives, mockDelay, products, promoters } from '@agritainment/shared'
import type { MockScenario } from '@agritainment/shared'

export const promoterRepository = {
  loadDashboard: (scenario: MockScenario = 'normal') => {
    const storeFarms = cloneSeed(farms)
    const packageProducts = cloneSeed(products.filter((item) => item.category === '套餐券'))
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
