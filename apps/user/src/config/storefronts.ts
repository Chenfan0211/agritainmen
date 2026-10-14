interface StorefrontTarget {
  /** 门店订货端小程序 AppID（正式发布时由运营后台配置真实值） */
  miniProgramAppId: string
  /** 门店订货端小程序页面路径 */
  miniProgramPath: string
}

// 门店订货端已收敛为微信小程序，用户端只保留小程序跳转参数；
// H5 门户地址（原 buildPortalUrl('farmhouse', ...)）随门店端 H5 下线一并移除。
const storefronts: Record<string, StorefrontTarget> = {
  F001: { miniProgramAppId: import.meta.env.VITE_STOREFRONT_APPID || 'touristappid', miniProgramPath: 'pages/index/index?farm=F001' },
  F002: { miniProgramAppId: import.meta.env.VITE_STOREFRONT_APPID || 'touristappid', miniProgramPath: 'pages/index/index?farm=F002' }
}

export function getStorefrontTarget(farmId: string) {
  return storefronts[farmId]
}
