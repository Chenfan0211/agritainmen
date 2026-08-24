import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { CatalogProduct } from '@agritainment/shared'
import { CATALOG_SCHEMA_VERSION, readStoreCatalogSelectionState, saveStoreCatalogSelection, writeCatalogState } from '@agritainment/shared'
import { usePromoterStore } from './promoter'

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

const packageProduct = (): CatalogProduct => ({
  id: 'PKG-LIVE', name: '直播套餐', category: '套餐', supplierId: 'S1', supplierName: '供应商', source: 'platform', status: 'active', image: '', images: [], tags: [],
  productType: 'package', expressDelivery: false, channel: 'store', farmIds: [], promoterCommissionRate: 5, storeCommissionRate: 3,
  skus: [{ id: 'PKG-LIVE-SKU', name: '套餐券', image: '', retailPrice: 100, cost: 60, stock: 5, level1Amount: 10, level2Amount: 15, status: 'active' }]
})

describe('promoter live catalog validation', () => {
  beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()) })

  it('prevents invalid packages from being saved or reopened while preserving the live metadata', async () => {
    expect(writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 0, products: [packageProduct()] })).toBe(true)
    expect(saveStoreCatalogSelection({ storeId: 'F001', productId: 'PKG-LIVE', listed: true, skuRetailPrices: { 'PKG-LIVE-SKU': 118 } }, readStoreCatalogSelectionState().revision)).toBeTruthy()
    const store = usePromoterStore()
    await store.initialize()
    const payload = { title: '套餐直播', image: '', status: 'live' as const, linkedFarms: [{ farmId: 'F001', packageIds: ['PKG-LIVE'] }] }
    expect(store.createLive(payload)).toBe(true)
    const room = store.myLives[0]

    const selection = readStoreCatalogSelectionState()
    expect(saveStoreCatalogSelection({ storeId: 'F001', productId: 'PKG-LIVE', listed: false, skuRetailPrices: { 'PKG-LIVE-SKU': 118 } }, selection.revision)).toBeTruthy()
    expect(store.toggleLiveStatus(room.id)).toBe(true)
    expect(room.status).toBe('preview')
    expect(store.toggleLiveStatus(room.id)).toBe(false)
    expect(store.updateLive(room.id, { ...payload, status: 'live' })).toBe(false)
    expect(store.liveRooms.find((item) => item.id === room.id)).toBeTruthy()
  })

  it('demotes a persisted live room when all selected packages become invalid', async () => {
    expect(writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 0, products: [packageProduct()] })).toBe(true)
    expect(saveStoreCatalogSelection({ storeId: 'F001', productId: 'PKG-LIVE', listed: true, skuRetailPrices: { 'PKG-LIVE-SKU': 118 } }, readStoreCatalogSelectionState().revision)).toBeTruthy()
    const store = usePromoterStore()
    await store.initialize()
    expect(store.createLive({ title: '历史直播', image: '', status: 'live', linkedFarms: [{ farmId: 'F001', packageIds: ['PKG-LIVE'] }] })).toBe(true)
    const roomId = store.myLives[0].id
    const product = packageProduct()
    product.skus[0].status = 'retired'
    expect(writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 1, products: [product] })).toBe(true)

    await store.initialize(true)

    expect(store.liveRooms.find((item) => item.id === roomId)).toMatchObject({ id: roomId, status: 'preview' })
  })
})
