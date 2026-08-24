import type { TenantConfig } from '@agritainment/shared'

const configs: Record<string, TenantConfig> = {
  shibanxi: {
    code: 'shibanxi',
    farmId: 'F001',
    buildTarget: 'farmhouse-shibanxi',
    name: '石板溪农家乐',
    shortName: '石板溪',
    slogan: '山景土菜 · 包厢预订',
    theme: '#17633f',
    phone: '0743-888-xxxx',
    address: '湖南省湘西州永顺县石板溪村',
    hours: '09:00–21:30',
    distanceKm: 8.6
  },
  yunshang: {
    code: 'yunshang',
    farmId: 'F002',
    buildTarget: 'farmhouse-yunshang',
    name: '云上人家山景农庄',
    shortName: '云上人家',
    slogan: '山景民宿 · 露天餐厅 · 云端慢生活',
    theme: '#355d4a',
    phone: '0744-5588660',
    address: '湖南省张家界市永定区云上村',
    hours: '08:30-22:00'
  }
}

interface RuntimeLocation {
  search?: string
  hash?: string
}

const compiledTenantCode = import.meta.env.VITE_TENANT_CODE || 'shibanxi'
const tenantAliases: Record<string, string> = {
  F001: 'shibanxi',
  F002: 'yunshang',
  shibanxi: 'shibanxi',
  yunshang: 'yunshang'
}

function queryValue(query: string | undefined, key: string) {
  if (!query) return ''
  const start = query.indexOf('?')
  if (start < 0) return ''
  return new URLSearchParams(query.slice(start + 1)).get(key) || ''
}

export function resolveRuntimeTenant(
  farm?: unknown,
  location: RuntimeLocation | undefined = typeof window !== 'undefined' ? window.location : undefined
) {
  const candidates = [
    typeof farm === 'string' ? farm : '',
    queryValue(location?.search, 'farm'),
    queryValue(location?.hash, 'farm'),
    compiledTenantCode
  ]
  const tenantCode = candidates.map((item) => tenantAliases[item]).find(Boolean) || 'shibanxi'
  return configs[tenantCode] || configs.shibanxi
}

export const activeTenant = resolveRuntimeTenant()
