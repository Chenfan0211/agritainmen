import { describe, expect, it, vi } from 'vitest'
import { farms } from './index'
import { createAMapGeocodeProvider, createGeocodeProviders, createTencentGeocodeProvider, geocodeAddress } from './geocoding'
import type { FarmLocation } from './index'
import type { GeocodeProvider } from './geocoding'

function location(provider: FarmLocation['provider'], longitude: number, latitude: number): FarmLocation {
  return { longitude, latitude, coordinateSystem: 'GCJ-02', provider, geocodedAt: '2026-08-25T00:00:00.000Z', adCode: '430104', province: '湖南省', city: '长沙市', district: '岳麓区', formattedAddress: '湖南省长沙市岳麓区潇湘中路' }
}

describe('geocodeAddress', () => {
  it('为每个演示门店预置地址和 GCJ-02 坐标', () => {
    expect(farms).not.toHaveLength(0)
    for (const farm of farms) {
      expect(farm.address).toEqual(expect.any(String))
      expect(farm.address.trim()).not.toBe('')
      expect(farm.locationStatus).toBe('resolved')
      expect(farm.location?.coordinateSystem).toBe('GCJ-02')
      expect(farm.location?.longitude).toEqual(expect.any(Number))
      expect(farm.location?.latitude).toEqual(expect.any(Number))
      expect(farm.location).toMatchObject({
        provider: 'amap', geocodedAt: expect.any(String), adCode: expect.any(String),
        province: '湖南省', city: expect.any(String), district: expect.any(String), formattedAddress: farm.address
      })
    }
  })

  it('只调用已配置的供应商', async () => {
    const skipped: GeocodeProvider = {
      name: 'amap',
      isConfigured: () => false,
      geocode: vi.fn()
    }
    const tencent: GeocodeProvider = {
      name: 'tencent',
      isConfigured: () => true,
      geocode: vi.fn().mockResolvedValue(location('tencent', 112.9388, 28.2282))
    }

    await expect(geocodeAddress('湖南省长沙市岳麓区', [skipped, tencent])).resolves.toMatchObject({
      status: 'resolved', provider: 'tencent', coordinate: { longitude: 112.9388, latitude: 28.2282 }
    })
    expect(skipped.geocode).not.toHaveBeenCalled()
    expect(tencent.geocode).toHaveBeenCalledWith({ address: '湖南省长沙市岳麓区' })
  })

  it('高德失败后按顺序回退到腾讯', async () => {
    const amap: GeocodeProvider = {
      name: 'amap',
      isConfigured: () => true,
      geocode: vi.fn().mockRejectedValue(new Error('高德不可用'))
    }
    const tencent: GeocodeProvider = {
      name: 'tencent',
      isConfigured: () => true,
      geocode: vi.fn().mockResolvedValue(location('tencent', 109.7397, 28.3189))
    }

    await expect(geocodeAddress('湖南省湘西州永顺县石板溪村', [amap, tencent])).resolves.toMatchObject({
      status: 'resolved', provider: 'tencent', coordinate: { longitude: 109.7397, latitude: 28.3189 }
    })
  })

  it('按配置顺序创建腾讯优先的 provider 链', () => {
    expect(createGeocodeProviders({ amapKey: 'amap-key', tencentKey: 'tencent-key', order: ['tencent', 'amap'] }).map((provider) => provider.name)).toEqual(['tencent', 'amap'])
  })

  it('所有已配置供应商失败时返回 failed', async () => {
    const failed: GeocodeProvider = {
      name: 'amap',
      isConfigured: () => true,
      geocode: vi.fn().mockRejectedValue(new Error('不可用'))
    }

    await expect(geocodeAddress('湖南省长沙市', [failed])).resolves.toEqual({ status: 'failed', reason: 'REQUEST_FAILED' })
  })

  it('解析高德完整行政区元数据', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: '1', geocodes: [{ location: '112.9388,28.2282', adcode: '430104', province: '湖南省', city: '长沙市', district: '岳麓区', formatted_address: '湖南省长沙市岳麓区潇湘中路' }]
    }), { status: 200 }))
    const provider = createAMapGeocodeProvider({
      amapKey: 'test-key',
      fetch: request
    })

    await expect(provider.geocode({ address: '岳麓区潇湘中路', city: '长沙市' })).resolves.toMatchObject({
      longitude: 112.9388, latitude: 28.2282, coordinateSystem: 'GCJ-02', provider: 'amap', adCode: '430104', province: '湖南省', city: '长沙市', district: '岳麓区', formattedAddress: '湖南省长沙市岳麓区潇湘中路'
    })
    expect(request).toHaveBeenCalledWith(expect.stringContaining('city=%E9%95%BF%E6%B2%99%E5%B8%82'))
  })

  it('高德返回非法中国境外坐标时回退腾讯', async () => {
    const amap: GeocodeProvider = {
      name: 'amap',
      isConfigured: () => true,
      geocode: vi.fn().mockResolvedValue(location('amap', 0, 0))
    }
    const tencent: GeocodeProvider = {
      name: 'tencent',
      isConfigured: () => true,
      geocode: vi.fn().mockResolvedValue(location('tencent', 112.9388, 28.2282))
    }

    await expect(geocodeAddress('湖南省长沙市岳麓区', [amap, tencent])).resolves.toMatchObject({
      status: 'resolved', provider: 'tencent'
    })
    expect(tencent.geocode).toHaveBeenCalledTimes(1)
  })

  it('解析腾讯完整行政区元数据', async () => {
    const provider = createTencentGeocodeProvider({
      tencentKey: 'test-key',
      fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({
        status: 0,
        result: {
          location: { lng: 112.9388, lat: 28.2282 }, ad_info: { adcode: '430104' },
          address_components: { province: '湖南省', city: '长沙市', district: '岳麓区' },
          title: '潇湘中路', address: '湖南省长沙市岳麓区潇湘中路'
        }
      }), { status: 200 }))
    })

    await expect(provider.geocode({ address: '湖南省长沙市岳麓区潇湘中路' })).resolves.toMatchObject({
      longitude: 112.9388, latitude: 28.2282, coordinateSystem: 'GCJ-02', provider: 'tencent', adCode: '430104', province: '湖南省', city: '长沙市', district: '岳麓区', formattedAddress: '湖南省长沙市岳麓区潇湘中路'
    })
  })

  it('每个 provider 超时五秒后标记 TIMEOUT', async () => {
    const slow: GeocodeProvider = {
      name: 'amap',
      isConfigured: () => true,
      geocode: vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(location('amap', 112.9388, 28.2282)), 20)))
    }

    await expect(geocodeAddress('湖南省长沙市岳麓区', [slow], { timeoutMs: 5 })).resolves.toEqual({ status: 'failed', reason: 'TIMEOUT' })
  })

  it('未配置 provider 与非法坐标分别返回可诊断原因', async () => {
    await expect(geocodeAddress('湖南省长沙市')).resolves.toEqual({ status: 'failed', reason: 'NOT_CONFIGURED' })
    const invalid: GeocodeProvider = { name: 'amap', isConfigured: () => true, geocode: vi.fn().mockResolvedValue(location('amap', 0, 0)) }
    await expect(geocodeAddress('湖南省长沙市', [invalid])).resolves.toEqual({ status: 'failed', reason: 'INVALID_COORDINATE' })
  })
})
