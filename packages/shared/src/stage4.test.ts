import { describe, expect, it } from 'vitest'
import type { OrderItem } from './index'
import { buildSupplierPlatformOrders, mediaValueToImage, products as productSeeds, suppliers } from './index'

function item(productId: string): OrderItem {
  const product = productSeeds.find((item) => item.id === productId)!
  return { productId, skuId: product.skus[0].id, name: product.name, skuName: product.skus[0].name, image: mediaValueToImage(product.image), quantity: 2, price: 10 }
}

describe('supplier split platform orders', () => {
  it('creates one platform order per supplier with stable source sub order ids', () => {
    const items = [item('P001'), item('P005'), item('P008')]
    const orders = buildSupplierPlatformOrders({
      sourceOrderId: 'SO-1', source: 'store', customer: '石板溪农家乐', channel: 'purchase', customerUserId: 'F001门店',
      items, products: productSeeds, createdAt: '2026-08-24 12:00', status: 'pending'
    })
    expect(orders).toHaveLength(3)
    expect(orders.map((order) => order.id)).toEqual(['SO-1-S1', 'SO-1-S2', 'SO-1-S3'])
    const first = orders[0]
    const expectedSupplier = suppliers.find((supplier) => supplier.name === productSeeds.find((p) => p.id === 'P001')!.supplier)!
    expect(first.supplierId).toBe(expectedSupplier.id)
    expect(first.items).toHaveLength(1)
    expect(first.supplierOrderLink).toMatchObject({ source: 'store', sourceOrderId: 'SO-1', sourceSubOrderId: 'SO-1-S1', customerUserId: 'F001门店' })
  })

  it('keeps the source order id for a single supplier order', () => {
    const orders = buildSupplierPlatformOrders({
      sourceOrderId: 'SO-2', source: 'store', customer: 'F002门店', channel: 'purchase',
      items: [item('P001')], products: productSeeds, createdAt: '2026-08-24 12:00', status: 'pending'
    })
    expect(orders).toHaveLength(1)
    expect(orders[0].id).toBe('SO-2')
  })

  it('sums amount and quantity per supplier order', () => {
    const orders = buildSupplierPlatformOrders({
      sourceOrderId: 'FH-1', source: 'farmhouse-courier', customer: '游客', channel: 'shop',
      items: [item('P005'), item('P005')], products: productSeeds, createdAt: '2026-08-24 12:00', status: 'pending'
    })
    expect(orders[0].amount).toBe(40)
    expect(orders[0].quantity).toBe(4)
  })
})
