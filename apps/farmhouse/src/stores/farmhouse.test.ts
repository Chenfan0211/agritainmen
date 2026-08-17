import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { cloneSeed, members, products, tenant } from '@agritainment/shared'
import { useFarmhouseStore } from './farmhouse'

if (!globalThis.localStorage) {
  const storage = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value) },
    removeItem: (key: string) => { storage.delete(key) },
    clear: () => storage.clear(),
    key: () => null,
    get length() { return storage.size }
  } as unknown as Storage
}

describe('farmhouse store interactions', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('writes recharge and checkout balance entries', () => {
    const store = useFarmhouseStore()
    store.$patch({ tenant: cloneSeed(tenant), member: { ...cloneSeed(members[0]), balance: 100 }, products: cloneSeed(products.slice(2, 3)), cart: [], balanceEntries: [] })
    store.recharge(100)
    store.addToCart(store.products[0])
    expect(store.checkout()).toBe(true)
    expect(store.balanceEntries.map((item) => item.type)).toEqual(['consume', 'recharge'])
    expect(store.orders[0].status).toBe('待发货')
  })

  it('updates one promotion record on repeated sharing', () => {
    const store = useFarmhouseStore()
    store.tenant = cloneSeed(tenant)
    store.sharePromotion()
    store.sharePromotion()
    expect(store.promotionRecords).toHaveLength(1)
    expect(store.promotionRecords[0].shareCount).toBe(2)
  })

  it('decrements stock, increases sales and blocks insufficient stock', () => {
    const store = useFarmhouseStore()
    const seeded = cloneSeed(products.slice(2, 3))
    seeded[0].stock = 1
    seeded[0].skus[0].stock = 1
    store.$patch({ products: seeded, member: { ...cloneSeed(members[0]), balance: 500 }, cart: [], orders: [], balanceEntries: [] })
    store.addToCart(store.products[0], store.products[0].skus[0].id)
    expect(store.checkout()).toBe(true)
    expect(store.products[0]).toMatchObject({ stock: 0, sales: products[2].sales + 1 })
    expect(store.addToCart(store.products[0], store.products[0].skus[0].id)).toBe('out-of-stock')
    expect(store.checkoutError).toContain('库存不足')
  })

  it('requires multi-SKU selection and blocks increments at stock limit', () => {
    const store = useFarmhouseStore()
    store.products = cloneSeed(products.slice(0, 1))
    store.products[0].skus[0].stock = 1
    expect(store.addToCart(store.products[0])).toBe('sku-required')
    expect(store.addToCart(store.products[0], 'P001-500')).toBe('added')
    expect(store.changeCart('P001', 'P001-500', 1)).toBe(false)
    expect(store.cart[0].quantity).toBe(1)
  })

  it('stores order items and supports repurchase', () => {
    const store = useFarmhouseStore()
    store.$patch({ products: cloneSeed(products.slice(2, 3)), member: { ...cloneSeed(members[0]), balance: 500 }, cart: [], orders: [] })
    store.addToCart(store.products[0], store.products[0].skus[0].id)
    expect(store.checkout()).toBe(true)
    expect(store.orders[0].items[0]).toMatchObject({ productId: 'P003', skuId: 'P003-GIFT', quantity: 1 })
    expect(store.repeatOrder(store.orders[0].id)).toBe(true)
    expect(store.cart[0].skuId).toBe('P003-GIFT')
  })

  it('adds, edits and removes featured rooms', () => {
    const store = useFarmhouseStore()
    const before = store.rooms.length
    expect(store.addRoom({ name: '星空观景台', image: '/static/images/mountain.webp', emoji: '🌌', capacity: '4–6 人 · 露天观景 · 最低消费 ¥388', sessions: '晚市 18:00', status: '可预订', people: 6 })).toBe(true)
    expect(store.rooms).toHaveLength(before + 1)
    const room = store.rooms.find((item) => item.name === '星空观景台')!
    expect(store.updateRoom(room.id, { ...room, status: '仅余晚市' })).toBe(true)
    expect(store.rooms.find((item) => item.id === room.id)!.status).toBe('仅余晚市')
    expect(store.removeRoom(room.id)).toBe(true)
    expect(store.rooms).toHaveLength(before)
  })

  it('adds, edits and removes signature dishes', () => {
    const store = useFarmhouseStore()
    store.foods = []
    expect(store.addFood({ name: '柴火土鸡汤', description: '柴火慢炖 3 小时', price: 88, emoji: '🍲', image: '/static/images/field.webp' })).toBe(true)
    expect(store.foods).toHaveLength(1)
    expect(store.addFood({ name: '', description: '', price: 0, emoji: '', image: '/static/images/field.webp' })).toBe(false)
    const food = store.foods[0]
    expect(store.updateFood(food.id, { name: '柴火土鸡汤（大份）', description: food.description, price: 128, emoji: food.emoji, image: food.image })).toBe(true)
    expect(store.foods[0].name).toBe('柴火土鸡汤（大份）')
    expect(store.removeFood(food.id)).toBe(true)
    expect(store.foods).toHaveLength(0)
  })

  it('verifies reserved bookings and blocks others', () => {
    const store = useFarmhouseStore()
    store.bookings = [
      { id: 'B1', type: 'room', name: '观溪雅间', date: '明天', session: '晚市 17:30', people: 6, status: 'reserved' },
      { id: 'B2', type: 'service', name: '农事采摘', date: '明天', session: '到店体验', people: 2, status: 'cancelled' }
    ]
    expect(store.verifyBooking('B1')).toBe(true)
    expect(store.bookings[0].status).toBe('completed')
    expect(store.verifyBooking('B1')).toBe(false)
    expect(store.verifyBooking('B2')).toBe(false)
    expect(store.verifyBooking('missing')).toBe(false)
  })

  it('exposes store work permissions by role', () => {
    const store = useFarmhouseStore()
    store.role = 'customer'
    expect(store.canOperate).toBe(false)
    store.role = 'staff'
    expect(store.canOperate).toBe(true)
    expect(store.canSelect).toBe(false)
    store.role = 'manager'
    expect(store.canOperate).toBe(true)
    expect(store.canSelect).toBe(true)
  })

  it('rejects a duplicate booking and supports cancellation', () => {
    const store = useFarmhouseStore()
    store.bookings = []
    const booking = { type: 'package' as const, name: '四人欢聚套餐', date: '明天', session: '晚市', people: 4 }
    expect(store.submitBooking(booking)).toBe(true)
    expect(store.submitBooking(booking)).toBe(false)
    expect(store.cancelBooking(store.bookings[0].id)).toBe(true)
  })
})

describe('farmhouse auth', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('logs in via simulated wechat openid and logs out', async () => {
    const store = useFarmhouseStore()
    expect(store.auth.isLoggedIn).toBe(false)
    expect(await store.wechatLogin()).toBe(true)
    expect(store.auth.isLoggedIn).toBe(true)
    expect(store.auth.openid).toMatch(/^mock_openid_/)
    store.logout()
    expect(store.auth).toEqual({ isLoggedIn: false, openid: '' })
  })
})

describe('user binding and consumer share', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('locks pending binding and writes promoter share on order', () => {
    const store = useFarmhouseStore()
    localStorage.setItem('agritainment-platform-bindings', JSON.stringify({ U1: { userId: 'U1', promoterId: 'T001', status: 'pending' } }))
    localStorage.setItem('agritainment-platform-config', JSON.stringify({ promoterRate: 5, staffRate: 3 }))
    store.setCurrentUser('U1')
    store.resolveOrderShare('SO1', 200)
    const bindings = JSON.parse(localStorage.getItem('agritainment-platform-bindings') || '{}')
    expect(bindings['U1']).toMatchObject({ promoterId: 'T001', status: 'bound' })
    const shares = JSON.parse(localStorage.getItem('agritainment-platform-shares') || '[]')
    expect(shares[0]).toMatchObject({ userId: 'U1', orderId: 'SO1', role: 'promoter', rate: 5, amount: 10 })
  })

  it('records staff share for bound staff binding and keeps it unchanged', () => {
    const store = useFarmhouseStore()
    localStorage.setItem('agritainment-platform-bindings', JSON.stringify({ U1: { userId: 'U1', staffAccountId: 'SA002', status: 'bound', boundAt: 'x' } }))
    store.setCurrentUser('U1')
    store.resolveOrderShare('SO2', 100)
    const shares = JSON.parse(localStorage.getItem('agritainment-platform-shares') || '[]')
    expect(shares[0]).toMatchObject({ role: 'staff', rate: 3, amount: 3 })
    const bindings = JSON.parse(localStorage.getItem('agritainment-platform-bindings') || '{}')
    expect(bindings['U1'].staffAccountId).toBe('SA002')
  })

  it('overwrites pending binding but never a bound one', () => {
    const store = useFarmhouseStore()
    store.setCurrentUser('U1')
    localStorage.setItem('agritainment-platform-bindings', JSON.stringify({ U1: { userId: 'U1', promoterId: 'T001', status: 'pending' } }))
    store.setReferrer({ type: 'staff', staffAccountId: 'SA003', name: '李店员' })
    expect(JSON.parse(localStorage.getItem('agritainment-platform-bindings') || '{}')['U1']).toMatchObject({ staffAccountId: 'SA003', status: 'pending' })
    localStorage.setItem('agritainment-platform-bindings', JSON.stringify({ U1: { userId: 'U1', promoterId: 'T001', status: 'bound', boundAt: 'x' } }))
    store.setReferrer({ type: 'staff', staffAccountId: 'SA003', name: '李店员' })
    expect(JSON.parse(localStorage.getItem('agritainment-platform-bindings') || '{}')['U1'].promoterId).toBe('T001')
  })
})
