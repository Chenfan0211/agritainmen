import { describe, expect, it } from 'vitest'
import { farms, type FarmStore } from './index'
import { buildFarmAdministrativeAddress, dashboardRegionChildren, dashboardRegionPath, isDashboardRegionCode, isResolvedFarmLocation, migrateFarmAdministrativeAddress } from './regions'

describe('Hunan dashboard regions', () => {
  it('exposes all cities and the complete Changsha district list', () => {
    expect(dashboardRegionChildren('43')).toHaveLength(14)
    expect(dashboardRegionChildren('4301').map((item) => [item.code, item.name])).toEqual([
      ['430102', '芙蓉区'],
      ['430103', '天心区'],
      ['430104', '岳麓区'],
      ['430105', '开福区'],
      ['430111', '雨花区'],
      ['430112', '望城区'],
      ['430121', '长沙县'],
      ['430181', '浏阳市'],
      ['430182', '宁乡市']
    ])
  })

  it('builds a canonical address and region breadcrumb from selected codes', () => {
    expect(buildFarmAdministrativeAddress('430104', '潇湘中路 123 号')).toEqual({
      provinceCode: '43',
      province: '湖南省',
      cityCode: '4301',
      city: '长沙市',
      districtCode: '430104',
      district: '岳麓区',
      detail: '潇湘中路 123 号'
    })
    expect(dashboardRegionPath('430104').map((item) => item.name)).toEqual(['湖南省', '长沙市', '岳麓区'])
  })

  it('rejects unknown and malformed region codes', () => {
    expect(isDashboardRegionCode('43')).toBe(true)
    expect(isDashboardRegionCode('4301')).toBe(true)
    expect(isDashboardRegionCode('430104')).toBe(true)
    expect(isDashboardRegionCode('430199')).toBe(false)
    expect(isDashboardRegionCode('43010')).toBe(false)
    expect(() => buildFarmAdministrativeAddress('430199', '测试地址')).toThrow('请选择有效县区')
  })

  it('migrates legacy farms only when their district can be determined', () => {
    const migrated = migrateFarmAdministrativeAddress({ ...farms[3], regionCode: undefined, structuredAddress: undefined })
    expect(migrated).toMatchObject({
      regionCode: '430104', city: '长沙市', region: '长沙市岳麓区',
      structuredAddress: { cityCode: '4301', districtCode: '430104', detail: '橘子洲街道潇湘中路' }
    })

    const unresolved = migrateFarmAdministrativeAddress({ ...farms[3], address: '长沙某处', regionCode: undefined, structuredAddress: undefined, location: undefined, locationStatus: 'failed' })
    expect(unresolved.regionCode).toBeUndefined()
    expect(unresolved.structuredAddress).toBeUndefined()
  })

  it('rejects a resolved coordinate outside the structured district when regionCode is absent', () => {
    const farm: FarmStore = {
      ...farms[3],
      regionCode: undefined,
      structuredAddress: buildFarmAdministrativeAddress('430104', '联调路 1 号'),
      locationStatus: 'resolved',
      location: { ...farms[3].location!, adCode: '430202' }
    }

    expect(isResolvedFarmLocation(farm)).toBe(false)
  })
})
