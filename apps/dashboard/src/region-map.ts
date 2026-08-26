import { dashboardRegion } from '@agritainment/shared'

export interface DashboardGeoJson {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    properties?: { name?: unknown; adcode?: unknown }
    geometry: unknown
  }>
}

const cityMapLoaders: Record<string, () => Promise<unknown>> = {
  '430100': () => import('./data/regions/430100.geo.json'),
  '430200': () => import('./data/regions/430200.geo.json'),
  '430300': () => import('./data/regions/430300.geo.json'),
  '430400': () => import('./data/regions/430400.geo.json'),
  '430500': () => import('./data/regions/430500.geo.json'),
  '430600': () => import('./data/regions/430600.geo.json'),
  '430700': () => import('./data/regions/430700.geo.json'),
  '430800': () => import('./data/regions/430800.geo.json'),
  '430900': () => import('./data/regions/430900.geo.json'),
  '431000': () => import('./data/regions/431000.geo.json'),
  '431100': () => import('./data/regions/431100.geo.json'),
  '431200': () => import('./data/regions/431200.geo.json'),
  '431300': () => import('./data/regions/431300.geo.json'),
  '433100': () => import('./data/regions/433100.geo.json')
}

export function dashboardMapRegionCode(regionCode: string): string {
  if (!dashboardRegion(regionCode)) throw new Error('不支持的驾驶舱区域')
  return regionCode
}

export function dashboardMapSourceCode(regionCode: string): string {
  const region = dashboardRegion(regionCode)
  if (!region) throw new Error('不支持的驾驶舱区域')
  if (region.level === 'province') return region.geoCode
  if (region.level === 'city') return region.geoCode
  const parent = region.parentCode ? dashboardRegion(region.parentCode) : undefined
  if (!parent) throw new Error('不支持的驾驶舱区域')
  return parent.geoCode
}

export async function loadDashboardRegionGeoJson(regionCode: string): Promise<DashboardGeoJson> {
  const sourceCode = dashboardMapSourceCode(regionCode)
  if (sourceCode === '430000') {
    const module = await import('./data/hunan.geo.json')
    return module.default as DashboardGeoJson
  }
  const loader = cityMapLoaders[sourceCode]
  if (!loader) throw new Error('当前区域地图资源缺失')
  return (await loader() as { default: DashboardGeoJson }).default
}

export function geoFeatureRegionCode(geoJson: DashboardGeoJson, featureName: string): string {
  const feature = geoJson.features.find((item) => item.properties?.name === featureName)
  const code = String(feature?.properties?.adcode ?? '')
  return dashboardRegion(code) ? code : ''
}
