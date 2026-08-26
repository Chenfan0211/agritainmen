import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { CatalogProduct, MediaReference } from '@agritainment/shared'
import { CATALOG_SCHEMA_VERSION, MemoryMediaStorageAdapter, readMediaAsset, readPlatformPromoterAccountState, readStoreCatalogSelectionState, saveStoreCatalogSelection, upsertUserBinding, writeCatalogState, writePlatformLive, writePlatformPromoterAccounts } from '@agritainment/shared'
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

function createLiveStorage(): MemoryMediaStorageAdapter {
  return new MemoryMediaStorageAdapter({ objectUrls: { createObjectURL: () => 'blob:mock', revokeObjectURL: () => undefined } })
}

describe('promoter live catalog validation', () => {
  beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()) })

  it('prevents invalid packages from being saved or reopened while preserving the live metadata', async () => {
    expect(writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 0, products: [packageProduct()] })).toBe(true)
    expect(saveStoreCatalogSelection({ storeId: 'F001', productId: 'PKG-LIVE', listed: true, skuRetailPrices: { 'PKG-LIVE-SKU': 118 } }, readStoreCatalogSelectionState().revision)).toBeTruthy()
    const store = usePromoterStore()
    await store.initialize()
    const payload = { title: '套餐直播', image: '', status: 'live' as const, linkedFarms: [{ farmId: 'F001', packageIds: ['PKG-LIVE'] }] }
    expect(await store.createLive(payload, createLiveStorage())).toBe(true)
    const room = store.myLives[0]

    const selection = readStoreCatalogSelectionState()
    expect(saveStoreCatalogSelection({ storeId: 'F001', productId: 'PKG-LIVE', listed: false, skuRetailPrices: { 'PKG-LIVE-SKU': 118 } }, selection.revision)).toBeTruthy()
    expect(store.toggleLiveStatus(room.id)).toBe(true)
    expect(room.status).toBe('preview')
    expect(store.toggleLiveStatus(room.id)).toBe(false)
    expect(await store.updateLive(room.id, { ...payload, status: 'live' }, createLiveStorage())).toBe(false)
    expect(store.liveRooms.find((item) => item.id === room.id)).toBeTruthy()
  })

  it('demotes a persisted live room when all selected packages become invalid', async () => {
    expect(writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 0, products: [packageProduct()] })).toBe(true)
    expect(saveStoreCatalogSelection({ storeId: 'F001', productId: 'PKG-LIVE', listed: true, skuRetailPrices: { 'PKG-LIVE-SKU': 118 } }, readStoreCatalogSelectionState().revision)).toBeTruthy()
    const store = usePromoterStore()
    await store.initialize()
    expect(await store.createLive({ title: '历史直播', image: '', status: 'live', linkedFarms: [{ farmId: 'F001', packageIds: ['PKG-LIVE'] }] }, createLiveStorage())).toBe(true)
    const roomId = store.myLives[0].id
    const product = packageProduct()
    product.skus[0].status = 'retired'
    expect(writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 1, products: [product] })).toBe(true)

    await store.initialize(true)

    expect(store.liveRooms.find((item) => item.id === roomId)).toMatchObject({ id: roomId, status: 'preview' })
  })
})

describe('promoter account isolation', () => {
  beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()) })

  it('loads the authenticated promoter and filters lives and bindings by promoterId', async () => {
    expect(writePlatformLive({ id: 'LIVE-T001', title: 'T001直播', host: '张同学', viewers: 1, productName: '', productPrice: 0, status: 'preview', reminded: false, image: '', promoterId: 'T001', city: '湘西州' })).toBe(true)
    expect(writePlatformLive({ id: 'LIVE-T002', title: 'T002直播', host: '山里阿强', viewers: 1, productName: '', productPrice: 0, status: 'preview', reminded: false, image: '', promoterId: 'T002', city: '湘西州' })).toBe(true)
    expect(upsertUserBinding({ userId: 'U-T001', promoterId: 'T001', status: 'pending' })).toBe(true)
    expect(upsertUserBinding({ userId: 'U-T002', promoterId: 'T002', status: 'bound', boundAt: '2026-08-24 10:00' })).toBe(true)
    const store = usePromoterStore()
    await store.initialize()

    expect(store.login('13800000020', '123456')).toBe(true)
    expect(store.auth).toMatchObject({
      accountId: 'PA002',
      promoterId: 'T002',
      principal: { actorType: 'promoter', actorId: 'T002', tenantId: 'T002', status: 'active' }
    })
    expect(store.promoter?.id).toBe('T002')
    expect(store.myLives.map((item) => item.id)).toContain('LIVE-T002')
    expect(store.myLives.map((item) => item.id)).not.toContain('LIVE-T001')
    expect(store.myBoundUsers.map((item) => item.userId)).toEqual(['U-T002'])
  })

  it('rejects unknown credentials instead of accepting any phone', () => {
    const store = usePromoterStore()
    expect(store.login('13800000099', '123456')).toBe(false)
  })

  it('invalidates the current session when its shared account is disabled', async () => {
    const store = usePromoterStore()
    expect(store.login('13800000000', '123456')).toBe(true)
    const state = readPlatformPromoterAccountState()!
    expect(writePlatformPromoterAccounts(state.accounts.map((item) => item.id === 'PA001' ? { ...item, enabled: false } : item), state.revision)).toBe(true)

    await store.refreshSharedState()

    expect(store.auth.isLoggedIn).toBe(false)
  })
})

describe('promoter live cover media lifecycle', () => {
  let storage: MemoryMediaStorageAdapter
  beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); storage = createLiveStorage() })

  it('persists an uploaded cover as a bound MediaReference asset', async () => {
    expect(writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 0, products: [packageProduct()] })).toBe(true)
    expect(saveStoreCatalogSelection({ storeId: 'F001', productId: 'PKG-LIVE', listed: true, skuRetailPrices: { 'PKG-LIVE-SKU': 118 } }, readStoreCatalogSelectionState().revision)).toBeTruthy()
    const store = usePromoterStore()
    await store.initialize()
    const asset = await storage.save(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }), 'live-cover', { width: 10, height: 10 })
    expect(asset.source).toBe('asset')

    expect(await store.createLive({ title: '封面直播', image: asset, status: 'live', linkedFarms: [{ farmId: 'F001', packageIds: ['PKG-LIVE'] }] }, storage)).toBe(true)
    const room = store.myLives[0]
    expect(room.image).toEqual(asset)

    const metadata = await readMediaAsset(storage, asset.assetId)
    expect(metadata?.bindings).toContain(`promoter:live:cover:${room.id}`)
    expect(metadata?.status).toBe('bound')
  })

  it('does not bind a cover when the business save fails', async () => {
    const store = usePromoterStore()
    await store.initialize()
    const asset = await storage.save(new Blob([new Uint8Array([4, 5, 6])], { type: 'image/jpeg' }), 'live-cover', { width: 10, height: 10 })

    expect(await store.createLive({ title: '无效直播', image: asset, status: 'live', linkedFarms: [] }, storage)).toBe(false)
    expect(store.myLives.some((item) => item.title === '无效直播')).toBe(false)

    const metadata = await readMediaAsset(storage, asset.assetId)
    expect(metadata?.pendingBindings).toEqual([])
    expect(metadata?.bindings).toEqual([])
  })

  it('replaces an existing cover and releases only the previously bound asset', async () => {
    expect(writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 0, products: [packageProduct()] })).toBe(true)
    expect(saveStoreCatalogSelection({ storeId: 'F001', productId: 'PKG-LIVE', listed: true, skuRetailPrices: { 'PKG-LIVE-SKU': 118 } }, readStoreCatalogSelectionState().revision)).toBeTruthy()
    const store = usePromoterStore()
    await store.initialize()
    const first = await storage.save(new Blob([new Uint8Array([7, 8, 9])], { type: 'image/jpeg' }), 'live-cover', { width: 10, height: 10 })
    const second = await storage.save(new Blob([new Uint8Array([10, 11, 12])], { type: 'image/jpeg' }), 'live-cover', { width: 10, height: 10 })
    expect(await store.createLive({ title: '替换封面', image: first, status: 'live', linkedFarms: [{ farmId: 'F001', packageIds: ['PKG-LIVE'] }] }, storage)).toBe(true)
    const room = store.myLives[0]

    expect(await store.updateLive(room.id, { title: '替换封面', image: second, status: 'live', linkedFarms: [{ farmId: 'F001', packageIds: ['PKG-LIVE'] }] }, storage)).toBe(true)
    expect(room.image).toEqual(second)

    const updated = await readMediaAsset(storage, second.assetId)
    expect(updated?.bindings).toContain(`promoter:live:cover:${room.id}`)
    const released = await readMediaAsset(storage, first.assetId)
    expect(released).toBeNull()
  })
})
