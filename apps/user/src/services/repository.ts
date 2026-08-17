import { applyPlatformMedia, cloneSeed, farms, liveRooms, mergePlatformLives, mockDelay, products } from '@agritainment/shared'
import type { MockScenario } from '@agritainment/shared'

export const userRepository = {
  loadDashboard: (scenario: MockScenario = 'normal') => {
    const storeFarms = cloneSeed(farms)
    const packageProducts = cloneSeed(products.filter((item) => item.category === '套餐券'))
    applyPlatformMedia(storeFarms, packageProducts)
    const mergedLives = mergePlatformLives(cloneSeed(liveRooms))
    return mockDelay(
      { farms: storeFarms, products: packageProducts, liveRooms: mergedLives },
      180,
      scenario,
      { farms: [], products: [], liveRooms: [] }
    )
  }
}
