import { beforeEach, describe, expect, it } from 'vitest'
import { buildPromoterAccountSeeds, mergePlatformPromoterAccounts, type Promoter } from './index'

const promoter = (id: string, name = id): Promoter => ({ id, name, level: '普通推客', type: '推客', fans: 0, orders: 0, gmv: 0, commission: 0, cumulativeCommission: 0, settled: false, status: 'active' })

describe('promoter account allocation', () => {
  it('adding a promoter does not change existing account credentials', () => {
    const initial = buildPromoterAccountSeeds([promoter('T001'), promoter('T002')])
    const expanded = buildPromoterAccountSeeds([promoter('T999'), promoter('T001'), promoter('T002')])
    expect(expanded.find((a) => a.promoterId === 'T001')?.account).toBe(initial.find((a) => a.promoterId === 'T001')?.account)
    expect(new Set(expanded.map((a) => a.account)).size).toBe(expanded.length)
  })

  it('merges saved accounts by promoterId and keeps newly allocated account unique', () => {
    const defaults = buildPromoterAccountSeeds([promoter('T001'), promoter('T002')])
    const saved = [{ ...defaults[0], account: '13900000001' }]
    const merged = mergePlatformPromoterAccounts(defaults, saved)
    expect(merged.find((a) => a.promoterId === 'T001')?.account).toBe('13900000001')
    expect(new Set(merged.map((a) => a.account)).size).toBe(merged.length)
  })
})
