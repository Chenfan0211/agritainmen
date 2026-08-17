import { applyPlatformMedia, cloneSeed, farmhouseFoods, farms, members, mockDelay, products, selectableProducts } from '@agritainment/shared'
import type { MockScenario } from '@agritainment/shared'
import { activeTenant } from '../config/tenant'

export const farmhouseRepository = {
  loadStorefront: (scenario: MockScenario = 'normal') => {
    const farm = cloneSeed(farms.find((item) => item.id === activeTenant.farmId)!)
    const storeProducts = cloneSeed(products.filter((item) => item.farmIds.includes(activeTenant.farmId) && (item.source === 'farmhouse' || item.status === 'active')))
    applyPlatformMedia([farm], storeProducts)
    return mockDelay(
      { tenant: activeTenant, farm, member: members[0], products: storeProducts, foods: farmhouseFoods },
      180,
      scenario,
      { tenant: activeTenant, farm: cloneSeed(farms.find((item) => item.id === activeTenant.farmId)!), member: members[0], products: [], foods: [] }
    )
  },
  loadSelectableProducts: (scenario: MockScenario = 'normal') => {
    const list = cloneSeed(selectableProducts)
    applyPlatformMedia(null, list)
    return mockDelay(list, 180, scenario, [])
  }
}
