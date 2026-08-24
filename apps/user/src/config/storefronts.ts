import { buildPortalUrl } from '@agritainment/shared'

const portalOrigin = import.meta.env.VITE_PORTAL_ORIGIN || ''

interface StorefrontTarget {
  h5Url: string
  miniProgramAppId?: string
  miniProgramPath?: string
}

const storefronts: Record<string, StorefrontTarget> = {
  F001: { h5Url: import.meta.env.VITE_STOREFRONT_SHIBANXI_URL || buildPortalUrl('farmhouse', 'pages/index/index', { farm: 'F001' }, portalOrigin) },
  F002: { h5Url: import.meta.env.VITE_STOREFRONT_YUNSHANG_URL || buildPortalUrl('farmhouse', 'pages/index/index', { farm: 'F002' }, portalOrigin) }
}

export function getStorefrontTarget(farmId: string) {
  return storefronts[farmId]
}
