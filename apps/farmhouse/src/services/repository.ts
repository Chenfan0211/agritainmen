import { applyPlatformEntities, applyPlatformMedia, cProducts, cloneSeed, ensureCatalogState, farmhouseFoods, farms, members, mockDelay, products, readCatalogState } from '@agritainment/shared'
import type { MockScenario, TenantConfig } from '@agritainment/shared'
import { resolveRuntimeTenant } from '../config/tenant'

export const farmhouseRepository = {
  loadStorefront: (scenario: MockScenario = 'normal', tenant: TenantConfig = resolveRuntimeTenant()) => {
    const farm = cloneSeed(farms.find((item) => item.id === tenant.farmId)!)
    const seedAll = cloneSeed(products)
    applyPlatformEntities(seedAll, [farm], null, null, null)
    const storeProducts = seedAll.filter((item) => item.farmIds.includes(tenant.farmId) && (item.source === 'farmhouse' || item.status === 'active'))
    applyPlatformMedia([farm], storeProducts)
    return mockDelay(
      { tenant, farm, member: members[0], products: storeProducts, foods: farmhouseFoods },
      180,
      scenario,
      { tenant, farm: cloneSeed(farms.find((item) => item.id === tenant.farmId)!), member: members[0], products: [], foods: [] }
    )
  },
  loadCatalogState: (scenario: MockScenario = 'normal') => {
    const state = readCatalogState() || ensureCatalogState(products, cProducts)
    return mockDelay(cloneSeed(state), 180, scenario, { ...cloneSeed(state), products: [] })
  }
}
