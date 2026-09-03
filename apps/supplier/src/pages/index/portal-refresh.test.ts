import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const portals = [
  {
    name: '供应商端',
    path: 'apps/supplier/src/pages/index/index.vue',
    keys: ['PLATFORM_ENTITIES_STORAGE_KEY', 'PLATFORM_SUPPLIER_ACCOUNTS_STORAGE_KEY', 'PLATFORM_DRIVERS_STORAGE_KEY']
  },
  {
    name: '门店端',
    path: 'apps/store/src/pages/index/index.vue',
    keys: ['PLATFORM_STORE_ACCOUNTS_STORAGE_KEY', 'PLATFORM_ENTITIES_STORAGE_KEY', 'PLATFORM_SUPPLIER_ACCOUNTS_STORAGE_KEY']
  },
  {
    name: '农家乐端',
    path: 'apps/farmhouse/src/pages/index/index.vue',
    keys: ['PLATFORM_STORE_ACCOUNTS_STORAGE_KEY', 'PLATFORM_ENTITIES_STORAGE_KEY', 'PLATFORM_BOOKINGS_STORAGE_KEY']
  },
  {
    name: '推客端',
    path: 'apps/promoter/src/pages/index/index.vue',
    keys: ['PLATFORM_PROMOTER_ACCOUNTS_STORAGE_KEY', 'PLATFORM_ENTITIES_STORAGE_KEY', 'PLATFORM_LIVES_STORAGE_KEY']
  }
] as const

describe.each(portals)('$name共享数据刷新接线', ({ path, keys }) => {
  const source = readFileSync(resolve(process.cwd(), path), 'utf8')

  it('订阅业务相关的平台同页变更', () => {
    expect(source).toMatch(/subscribePlatformChanges\(refreshSharedState, platformChangeKeys\)/)
    keys.forEach((key) => expect(source).toContain(key))
  })

  it('保留跨标签 storage 监听并在页面恢复可见时主动刷新', () => {
    expect(source).toContain("window.addEventListener('storage', onStorage)")
    expect(source).toContain("document.addEventListener('visibilitychange', onVisibilityChange)")
    expect(source).toMatch(/document\.visibilityState === 'visible'[\s\S]*refreshSharedState\(\)/)
  })

  it('卸载时解除平台、storage 和 visibilitychange 监听', () => {
    expect(source).toContain('disposePlatformChanges?.()')
    expect(source).toContain("window.removeEventListener('storage', onStorage)")
    expect(source).toContain("document.removeEventListener('visibilitychange', onVisibilityChange)")
    expect(source).toMatch(/disposeKeyboardButtons(?:\?\.)?\(\)/)
  })
})

describe('供应商错误恢复入口', () => {
  const source = readFileSync(resolve(process.cwd(), 'apps/supplier/src/pages/index/index.vue'), 'utf8')

  it('所有重新加载按钮都重试共享数据与线路过期协调', () => {
    const reloadButtons = [...source.matchAll(/<button[^>]*@click="([^"]+)"[^>]*>重新加载<\/button>/g)]
    expect(reloadButtons).toHaveLength(2)
    expect(reloadButtons.map((match) => match[1])).toEqual(['refreshSharedState', 'refreshSharedState'])
  })
})
