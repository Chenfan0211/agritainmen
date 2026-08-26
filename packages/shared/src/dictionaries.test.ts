import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PLATFORM_DICTIONARIES_STORAGE_KEY,
  PlatformEventBus,
  addDictGroup,
  addDictItem,
  dictLabel,
  getDictOptions,
  publishPlatformDictionaries,
  readPlatformDictionaries,
  removeDictGroup,
  removeDictItem,
  subscribePlatformChanges,
  updateDictGroup,
  updateDictItem
} from './index'
import type { DictionaryPublishLock, PlatformDictionaryState } from './index'

if (!globalThis.localStorage) {
  const storage = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value) },
    removeItem: (key: string) => { storage.delete(key) },
    clear: () => storage.clear(),
    key: (index: number) => [...storage.keys()][index] ?? null,
    get length() { return storage.size }
  } as Storage
}

function withBusinessItem(state: PlatformDictionaryState, label = '农旅融合'): PlatformDictionaryState {
  const withGroup = addDictGroup(state, { id: 'DG-INDUSTRY', type: 'industry', name: '行业类型' })
  if (!withGroup) throw new Error('expected business group creation to succeed')
  const withItem = addDictItem(withGroup, {
    id: 'DI-INDUSTRY-1', type: 'industry', code: 'agritourism', label, enabled: true, sort: 1
  })
  if (!withItem) throw new Error('expected business item creation to succeed')
  return withItem
}

function createHeldSerialLock(): DictionaryPublishLock & { release: () => void } {
  let release: () => void = () => undefined
  const gate = new Promise<void>((resolve) => { release = resolve })
  let tail: Promise<void> = Promise.resolve()
  return {
    release,
    runExclusive<T>(execute: () => Promise<T> | T): Promise<T> {
      const result = tail.then(async () => {
        await gate
        return execute()
      })
      tail = result.then(() => undefined, () => undefined)
      return result
    }
  }
}

describe('platform dictionaries', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('publishes the first revision and increments later revisions', async () => {
    const initial = readPlatformDictionaries()
    expect(initial.revision).toBe(0)

    const first = await publishPlatformDictionaries(withBusinessItem(initial), 0)
    expect(first).toMatchObject({ schemaVersion: 1, revision: 1 })
    expect(readPlatformDictionaries().items).toContainEqual(expect.objectContaining({ code: 'agritourism', label: '农旅融合' }))

    const changed = updateDictItem(first!, 'DI-INDUSTRY-1', { label: '乡村文旅' })
    expect(changed).not.toBeNull()
    const second = await publishPlatformDictionaries(changed!, 1)
    expect(second).toMatchObject({ revision: 2 })
    expect(dictLabel('industry', 'agritourism')).toBe('乡村文旅')
  })

  it('returns null on a revision conflict without overwriting the winner', async () => {
    const initial = readPlatformDictionaries()
    const winner = await publishPlatformDictionaries(withBusinessItem(initial, '先发布'), 0)
    expect(winner?.revision).toBe(1)

    const stale = await publishPlatformDictionaries(withBusinessItem(initial, '后发布'), 0)
    expect(stale).toBeNull()
    expect(readPlatformDictionaries().revision).toBe(1)
    expect(dictLabel('industry', 'agritourism')).toBe('先发布')
  })

  it('serializes concurrent publishers inside the injected lock and keeps one winner', async () => {
    const initial = readPlatformDictionaries()
    const lock = createHeldSerialLock()
    const first = publishPlatformDictionaries(withBusinessItem(initial, '发布者 A'), 0, lock)
    const second = publishPlatformDictionaries(withBusinessItem(initial, '发布者 B'), 0, lock)

    expect(localStorage.getItem(PLATFORM_DICTIONARIES_STORAGE_KEY)).toBeNull()
    lock.release()

    const results = await Promise.all([first, second])
    const winners = results.filter((result): result is PlatformDictionaryState => result !== null)
    expect(winners).toHaveLength(1)
    expect(results.filter((result) => result === null)).toHaveLength(1)
    expect(readPlatformDictionaries()).toMatchObject({ revision: 1 })
    expect(dictLabel('industry', 'agritourism')).toBe(winners[0].items.find((item) => item.code === 'agritourism')?.label)
  })

  it('shares the default serial publish lock within one context', async () => {
    const initial = readPlatformDictionaries()
    const results = await Promise.all([
      publishPlatformDictionaries(withBusinessItem(initial, '默认发布者 A'), 0),
      publishPlatformDictionaries(withBusinessItem(initial, '默认发布者 B'), 0)
    ])
    const winner = results.find((result): result is PlatformDictionaryState => result !== null)

    expect(results.filter((result) => result !== null)).toHaveLength(1)
    expect(results.filter((result) => result === null)).toHaveLength(1)
    expect(readPlatformDictionaries()).toMatchObject({ revision: 1 })
    expect(dictLabel('industry', 'agritourism')).toBe(winner?.items.find((item) => item.code === 'agritourism')?.label)
  })

  it('migrates legacy groups and excludes city from ordinary dictionaries', () => {
    localStorage.setItem(PLATFORM_DICTIONARIES_STORAGE_KEY, JSON.stringify({
      revision: 4,
      updatedAt: '2026-08-20T00:00:00.000Z',
      groups: [
        { id: 'legacy-status', type: 'orderStatus', name: '订单状态' },
        { id: 'legacy-option', type: 'industry', name: '行业类型' },
        { id: 'legacy-city', type: 'city', name: '城市信息' }
      ],
      items: [
        { id: 'legacy-pending', type: 'orderStatus', code: 'pending', label: '待发货', enabled: true, sort: 1 },
        { id: 'legacy-industry', type: 'industry', code: 'farm', label: '农旅', enabled: true, sort: 1 },
        { id: 'legacy-city-item', type: 'city', code: '长沙市', label: '长沙市', enabled: true, sort: 1 }
      ]
    }))

    const migrated = readPlatformDictionaries()
    expect(migrated).toMatchObject({ schemaVersion: 1, revision: 4 })
    expect(migrated.groups.find((group) => group.type === 'orderStatus')).toMatchObject({ scope: 'system', locked: true, enabled: true })
    expect(migrated.groups.find((group) => group.type === 'industry')).toMatchObject({ scope: 'business', locked: false, enabled: true })
    expect(migrated.groups.some((group) => group.type === 'city')).toBe(false)
    expect(migrated.items.some((item) => item.type === 'city')).toBe(false)
  })

  it.each([undefined, 1] as const)('normalizes legacy category names to stable Category codes for schema %s', (schemaVersion) => {
    localStorage.setItem(PLATFORM_DICTIONARIES_STORAGE_KEY, JSON.stringify({
      ...(schemaVersion === undefined ? {} : { schemaVersion }),
      revision: 3,
      updatedAt: '2026-08-20T00:00:00.000Z',
      groups: [{ id: 'legacy-product-category', type: 'productCategory', name: '商品品类' }],
      items: [{ id: 'legacy-agriculture', type: 'productCategory', code: schemaVersion === 1 ? 'legacy-agriculture' : '农产品', label: '农产品', enabled: true, sort: 1 }]
    }))

    const agriculture = readPlatformDictionaries().items.filter((item) => item.type === 'productCategory' && (item.code === 'C001' || item.label === '农产品'))
    expect(agriculture).toHaveLength(1)
    expect(agriculture[0]).toMatchObject({ code: 'C001', label: '农产品' })
  })

  it('keeps all specified initial business and locked system groups', () => {
    const state = readPlatformDictionaries()
    const business = state.groups.filter((group) => group.scope === 'business').map((group) => group.type)
    const system = state.groups.filter((group) => group.scope === 'system' && group.locked).map((group) => group.type)

    expect(business).toEqual(expect.arrayContaining([
      'productCategory', 'supplierCategory', 'generalCategory', 'productTag', 'farmTag', 'routeTag',
      'serviceCategory', 'afterSaleReason', 'qualificationType', 'promoterType', 'promoterLevel',
      'liveHostRole', 'bookingSession', 'roomNotice', 'unit', 'logistics', 'withdrawMethod'
    ]))
    expect(system).toEqual(expect.arrayContaining([
      'supplierStatus', 'productStatus', 'farmStatus', 'orderStatus', 'fulfillmentStatus', 'afterSaleStatus',
      'promoterStatus', 'liveStatus', 'bookingStatus', 'voucherStatus', 'settlementStatus', 'commissionStatus',
      'productSource', 'productType', 'catalogChannel', 'deliveryMode', 'afterSaleType', 'refundMethod',
      'refundMode', 'pricePolicyType', 'accountRole', 'memberLevel', 'commissionTargetType'
    ]))
  })

  it('locks system group and item identity while allowing display changes', () => {
    const initial = readPlatformDictionaries()
    const group = initial.groups.find((candidate) => candidate.type === 'orderStatus')!
    const item = initial.items.find((candidate) => candidate.type === 'orderStatus' && candidate.code === 'pending')!

    expect(removeDictGroup(initial, group.id)).toBeNull()
    expect(removeDictItem(initial, item.id)).toBeNull()
    expect(updateDictGroup(initial, group.id, { type: 'customStatus' })).toBeNull()
    expect(updateDictItem(initial, item.id, { code: 'waiting' })).toBeNull()
    expect(addDictItem(initial, { id: 'forged', type: 'orderStatus', code: 'waiting', label: '等待', enabled: true, sort: 99 })).toBeNull()

    const changed = updateDictItem(initial, item.id, { label: '等待发货', sort: 9, tone: 'warning', enabled: false })
    expect(changed?.items.find((candidate) => candidate.id === item.id)).toMatchObject({
      type: 'orderStatus', code: 'pending', label: '等待发货', sort: 9, tone: 'warning', enabled: false
    })
  })

  it('locks known system types in pure CRUD even when legacy group flags are missing', () => {
    const legacy: PlatformDictionaryState = {
      schemaVersion: 1,
      revision: 2,
      updatedAt: '2026-08-20T00:00:00.000Z',
      groups: [{ id: 'legacy-order-status', type: 'orderStatus', name: '订单状态' }],
      items: [{ id: 'legacy-order-pending', type: 'orderStatus', code: 'pending', label: '待发货', enabled: true, sort: 1 }]
    }

    expect(addDictItem(legacy, { id: 'invented', type: 'orderStatus', code: 'invented', label: '伪造', enabled: true, sort: 2 })).toBeNull()
    expect(removeDictGroup(legacy, 'legacy-order-status')).toBeNull()
    expect(removeDictItem(legacy, 'legacy-order-pending')).toBeNull()
    expect(updateDictGroup(legacy, 'legacy-order-status', { type: 'customStatus' })).toBeNull()
    expect(updateDictItem(legacy, 'legacy-order-pending', { code: 'waiting' })).toBeNull()
    expect(updateDictItem(legacy, 'legacy-order-pending', { label: '等待发货', sort: 8, tone: 'warning', enabled: false })?.items[0]).toMatchObject({
      type: 'orderStatus', code: 'pending', label: '等待发货', sort: 8, tone: 'warning', enabled: false
    })
  })

  it('rejects publishing a forged system item even when its group flags are disguised', async () => {
    const initial = readPlatformDictionaries()
    const forged: PlatformDictionaryState = {
      ...initial,
      groups: initial.groups.map((group) => group.type === 'orderStatus'
        ? { ...group, scope: 'business', locked: false }
        : group),
      items: [...initial.items, {
        id: 'forged-system-item', type: 'orderStatus', code: 'invented', label: '伪造状态', enabled: true, sort: 99
      }]
    }

    expect(await publishPlatformDictionaries(forged, 0)).toBeNull()
    expect(readPlatformDictionaries().items.some((item) => item.id === 'forged-system-item')).toBe(false)
  })

  it('supports immutable business CRUD and enforces code uniqueness within a type', () => {
    const initial = readPlatformDictionaries()
    const created = withBusinessItem(initial)
    expect(initial.groups.some((group) => group.type === 'industry')).toBe(false)

    expect(addDictGroup(created, { id: 'duplicate-type', type: 'industry', name: '重复' })).toBeNull()
    expect(addDictItem(created, { id: 'duplicate-code', type: 'industry', code: 'agritourism', label: '重复', enabled: true, sort: 2 })).toBeNull()

    const renamed = updateDictGroup(created, 'DG-INDUSTRY', { type: 'industryType', name: '产业类型', enabled: false })
    expect(renamed?.items.find((item) => item.id === 'DI-INDUSTRY-1')?.type).toBe('industryType')
    const recoded = updateDictItem(renamed!, 'DI-INDUSTRY-1', { code: 'rural-tourism', label: '乡村旅游' })
    expect(recoded?.items.find((item) => item.id === 'DI-INDUSTRY-1')).toMatchObject({ code: 'rural-tourism', label: '乡村旅游' })
    expect(removeDictGroup(recoded!, 'DG-INDUSTRY')).toBeNull()

    const withoutItem = removeDictItem(recoded!, 'DI-INDUSTRY-1')
    expect(withoutItem).not.toBeNull()
    expect(removeDictGroup(withoutItem!, 'DG-INDUSTRY')?.groups.some((candidate) => candidate.id === 'DG-INDUSTRY')).toBe(false)
  })

  it('filters disabled groups and items by default but can read historical values', () => {
    const initial = readPlatformDictionaries()
    const withItem = withBusinessItem(initial)
    const disabledItem = updateDictItem(withItem, 'DI-INDUSTRY-1', { enabled: false })!

    expect(getDictOptions('industry', { state: disabledItem })).toEqual([])
    expect(getDictOptions('industry', { state: disabledItem, includeDisabled: true })).toContainEqual(expect.objectContaining({ code: 'agritourism' }))

    const disabledGroup = updateDictGroup(withItem, 'DG-INDUSTRY', { enabled: false })!
    expect(getDictOptions('industry', { state: disabledGroup })).toEqual([])
    expect(getDictOptions('industry', { state: disabledGroup, includeDisabled: true })).toHaveLength(1)
  })

  it('sorts options stably by sort and label', () => {
    let state = addDictGroup(readPlatformDictionaries(), { id: 'DG-SORT', type: 'sortDemo', name: '排序示例' })!
    state = addDictItem(state, { id: 'I3', type: 'sortDemo', code: 'c', label: 'Beta', enabled: true, sort: 2 })!
    state = addDictItem(state, { id: 'I1', type: 'sortDemo', code: 'a', label: 'Same', enabled: true, sort: 1 })!
    state = addDictItem(state, { id: 'I2', type: 'sortDemo', code: 'b', label: 'Same', enabled: true, sort: 1 })!
    state = addDictItem(state, { id: 'I0', type: 'sortDemo', code: 'z', label: 'Alpha', enabled: true, sort: 1 })!

    expect(getDictOptions('sortDemo', { state }).map((item) => item.code)).toEqual(['z', 'a', 'b', 'c'])
  })

  it('prefers shared labels, falls back to built-in system text, then the raw code', async () => {
    const initial = readPlatformDictionaries()
    const pending = initial.items.find((item) => item.type === 'orderStatus' && item.code === 'pending')!
    const customized = updateDictItem(initial, pending.id, { label: '商家待出库' })!
    expect(await publishPlatformDictionaries(customized, 0)).not.toBeNull()
    expect(dictLabel('orderStatus', 'pending')).toBe('商家待出库')

    const emptySharedState: PlatformDictionaryState = { ...initial, groups: [], items: [] }
    expect(dictLabel('orderStatus', 'delivered', emptySharedState)).toBe('已完成')
    expect(dictLabel('unknownType', 'mystery', emptySharedState)).toBe('mystery')
  })

  it('publishes the dictionary key through platform change subscriptions', async () => {
    const listener = vi.fn()
    const unsubscribe = subscribePlatformChanges(listener, [PLATFORM_DICTIONARIES_STORAGE_KEY])

    expect(await publishPlatformDictionaries(withBusinessItem(readPlatformDictionaries()), 0)).not.toBeNull()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ key: PLATFORM_DICTIONARIES_STORAGE_KEY, source: 'write' }))

    unsubscribe()
  })

  it('publishes dictionary changes across platform event bus instances', async () => {
    const bus = new PlatformEventBus('agritainment-platform-changes')
    let receivedKey = ''
    const unsubscribe = bus.subscribe<{ key?: string }>('storage.changed', (event) => {
      receivedKey = event.payload?.key ?? ''
    })

    expect(await publishPlatformDictionaries(withBusinessItem(readPlatformDictionaries()), 0)).not.toBeNull()
    await vi.waitFor(() => expect(receivedKey).toBe(PLATFORM_DICTIONARIES_STORAGE_KEY))

    unsubscribe()
    bus.dispose()

  })

it('seeds business dictionary items so editor options are readable out of the box', () => {
  const state = readPlatformDictionaries()
  const editable = [
    'promoterType',
    'promoterLevel',
    'liveHostRole',
    'bookingSession',
    'roomNotice',
    'withdrawMethod',
    'qualificationType',
    'serviceCategory'
  ] as const
  for (const type of editable) {
    const options = getDictOptions(type, { state })
    expect(options.length, 'expected ' + type + ' to seed at least one option').toBeGreaterThan(0)
    expect(options.every((item) => item.enabled)).toBe(true)
  }
})
})
