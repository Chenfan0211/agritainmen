interface StorefrontTarget {
  h5Url: string
  miniProgramAppId?: string
  miniProgramPath?: string
}

const storefronts: Record<string, StorefrontTarget> = {
  F001: { h5Url: import.meta.env.VITE_STOREFRONT_SHIBANXI_URL || 'http://127.0.0.1:8792/' },
  F002: { h5Url: import.meta.env.VITE_STOREFRONT_YUNSHANG_URL || 'http://127.0.0.1:8794/' }
}

export function getStorefrontTarget(farmId: string) {
  return storefronts[farmId]
}
