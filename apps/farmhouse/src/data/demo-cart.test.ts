import { describe, expect, it } from 'vitest'
import { seedDemoFarmhouseCart } from './demo-cart'

const product = {
  id: 'P002', name: '炎陵黄桃 5 斤礼盒', image: '/static/images/peach.webp',
  skus: [{ id: 'P002-5J', name: '5斤礼盒', price: 68, stock: 12, minimumOrderQuantity: 1 }]
}

describe('farmhouse demo cart seed', () => {
  it('prefill one line when cart is empty and stays idempotent', () => {
    const first = seedDemoFarmhouseCart([], [product as never], 'normal')
    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({ productId: 'P002', skuId: 'P002-5J' })
    expect(seedDemoFarmhouseCart(first, [product as never], 'normal')).toEqual(first)
    expect(seedDemoFarmhouseCart([], [product as never], 'empty')).toEqual([])
  })
})
