import { describe, expect, it } from 'vitest'
import { matchesPolicyScope, pricePolicies, tieredUnitPrice } from './index'

const honey = { category: '生鲜农产', name: '武陵山野生土蜂蜜', basePrice: 56 }
const special = { category: '土特产', name: '农家土特产礼盒', basePrice: 30 }
const consumable = { category: '包装耗材', name: '食品级保鲜袋', basePrice: 1.5 }
const plain = { category: '伴手礼', name: '文创冰箱贴', basePrice: 10 }

describe('tieredUnitPrice 阶梯价计算', () => {
  it('按 scope 关键词匹配策略并取对应档位', () => {
    expect(matchesPolicyScope('蜂蜜/土特产类目', '生鲜农产', '武陵山野生土蜂蜜')).toBe(true)
    expect(matchesPolicyScope('腊味类商品', '土特产', '湘西烟熏柴火腊肉')).toBe(false)
  })

  it('数量落在中档时返回中档单价', () => {
    const result = tieredUnitPrice({ ...honey, quantity: 80 }, pricePolicies)
    expect(result.unitPrice).toBe(82)
    expect(result.matchedPolicy?.name).toBe('蜂蜜/土特产阶梯价')
    expect(result.tier?.minQty).toBe(50)
  })

  it('数量等于档位下限/上限时取该档', () => {
    expect(tieredUnitPrice({ ...honey, quantity: 50 }, pricePolicies).unitPrice).toBe(82)
    expect(tieredUnitPrice({ ...honey, quantity: 199 }, pricePolicies).unitPrice).toBe(82)
    expect(tieredUnitPrice({ ...honey, quantity: 200 }, pricePolicies).unitPrice).toBe(78)
  })

  it('无上限档用于大数量', () => {
    expect(tieredUnitPrice({ ...honey, quantity: 5000 }, pricePolicies).unitPrice).toBe(78)
  })

  it('未匹配策略回退基础价', () => {
    const result = tieredUnitPrice({ ...plain, quantity: 5 }, pricePolicies)
    expect(result.unitPrice).toBe(plain.basePrice)
    expect(result.matchedPolicy).toBeNull()
  })

  it('禁用策略不参与匹配', () => {
    const disabled = pricePolicies.map((policy) => ({ ...policy, enabled: false }))
    const result = tieredUnitPrice({ ...honey, quantity: 80 }, disabled)
    expect(result.unitPrice).toBe(honey.basePrice)
    expect(result.matchedPolicy).toBeNull()
  })

  it('非正数量或无匹配时回退', () => {
    expect(tieredUnitPrice({ ...honey, quantity: 0 }, pricePolicies).unitPrice).toBe(honey.basePrice)
    expect(tieredUnitPrice({ ...honey, quantity: -1 }, pricePolicies).unitPrice).toBe(honey.basePrice)
  })
})