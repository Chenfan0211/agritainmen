import { describe, expect, it } from 'vitest'
import { BUSINESS_PRICE_LEVELS, businessPriceLevelDiscount, businessPriceLevelLabel, isBusinessPriceLevel, resolveBusinessPriceLevel } from './price-level'

describe('business price level', () => {
  it('discounts the distribution price per sales-rep level', () => {
    expect(businessPriceLevelDiscount('A')).toBe(0.95)
    expect(businessPriceLevelDiscount('B')).toBe(0.97)
    expect(businessPriceLevelDiscount('C')).toBe(1)
  })

  it('falls back to the store price when no level is given', () => {
    expect(businessPriceLevelDiscount()).toBe(1)
    expect(businessPriceLevelDiscount(null)).toBe(1)
    expect(businessPriceLevelLabel(null)).toBe('门店价')
    expect(businessPriceLevelLabel('A')).toBe('业务员 A 档')
  })

  it('exposes the three supported levels', () => {
    expect([...BUSINESS_PRICE_LEVELS]).toEqual(['A', 'B', 'C'])
    expect(isBusinessPriceLevel('A')).toBe(true)
    expect(isBusinessPriceLevel('D')).toBe(false)
    expect(isBusinessPriceLevel(undefined)).toBe(false)
  })

  it('only derives a level for staff accounts', () => {
    expect(resolveBusinessPriceLevel({ role: 'owner', priceLevel: 'A' })).toBeNull()
    expect(resolveBusinessPriceLevel({ role: 'staff', priceLevel: 'B' })).toBe('B')
    expect(resolveBusinessPriceLevel({ role: 'staff' })).toBe('C')
    expect(resolveBusinessPriceLevel({ role: 'staff', priceLevel: 'D' })).toBe('C')
    expect(resolveBusinessPriceLevel(null)).toBeNull()
  })
})
