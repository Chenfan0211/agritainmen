import { afterEach, describe, expect, it, vi } from 'vitest'
import { PLATFORM_DICTIONARIES_STORAGE_KEY, createPlatformDictionaryCache, readPlatformDictionaries } from './index'
import type { PlatformChange, PlatformDictionaryState } from './index'

describe('platform dictionary cache', () => {
  afterEach(() => vi.useRealTimers())

  it('初始化读取一次，并只订阅独立字典共享键', () => {
    const initial = readPlatformDictionaries()
    const read = vi.fn(() => initial)
    const subscribe = vi.fn(() => () => undefined)

    const cache = createPlatformDictionaryCache({ read, subscribe })

    expect(read).toHaveBeenCalledTimes(1)
    expect(subscribe).toHaveBeenCalledWith(expect.any(Function), [PLATFORM_DICTIONARIES_STORAGE_KEY])
    expect(cache.getOptions('productCategory')).toEqual(expect.arrayContaining(initial.items.filter((item) => item.type === 'productCategory' && item.enabled)))
    cache.dispose()
  })

  it('300ms 内的连续变更只刷新一次并通知订阅者', () => {
    vi.useFakeTimers()
    const initial = readPlatformDictionaries()
    const changed: PlatformDictionaryState = {
      ...initial,
      revision: initial.revision + 1,
      items: initial.items.map((item) => item.type === 'productCategory' && item.code === 'C001'
        ? { ...item, label: '防抖后的分类' }
        : item)
    }
    let current = initial
    let platformListener: (change: PlatformChange) => void = () => undefined
    const read = vi.fn(() => current)
    const cache = createPlatformDictionaryCache({
      read,
      subscribe: (listener) => {
        platformListener = listener
        return () => { platformListener = () => undefined }
      }
    })
    const listener = vi.fn()
    cache.subscribe(listener)
    current = changed

    platformListener?.({ key: PLATFORM_DICTIONARIES_STORAGE_KEY, source: 'write', publishedAt: 1 })
    platformListener?.({ key: PLATFORM_DICTIONARIES_STORAGE_KEY, source: 'write', publishedAt: 2 })
    platformListener?.({ key: PLATFORM_DICTIONARIES_STORAGE_KEY, source: 'visibility', publishedAt: 3 })
    vi.advanceTimersByTime(299)
    expect(read).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)

    expect(read).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(cache.label('productCategory', 'C001')).toBe('防抖后的分类')
    cache.dispose()
  })

  it('新建 options 排除停用项，历史 label 仍可回退停用项和原始 code', () => {
    const initial = readPlatformDictionaries()
    const historical = initial.items.find((item) => item.type === 'productCategory')!
    const state: PlatformDictionaryState = {
      ...initial,
      items: initial.items.map((item) => item.id === historical.id ? { ...item, enabled: false, label: '历史分类' } : item)
    }
    const cache = createPlatformDictionaryCache({ read: () => state, subscribe: () => () => undefined })

    expect(cache.getOptions('productCategory').some((item) => item.code === historical.code)).toBe(false)
    expect(cache.label('productCategory', historical.code)).toBe('历史分类')
    expect(cache.label('productCategory', 'REMOVED-CODE')).toBe('REMOVED-CODE')
    cache.dispose()
  })
})
