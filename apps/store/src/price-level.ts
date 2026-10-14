/**
 * 业务员分销价档位。
 *
 * 门店端支持「门店账号 / 业务员账号」两类角色登录：门店账号按分销价（供货价）下单，
 * 业务员账号在此基础上按所属档位享受差异化折让，用于演示「同一商品按业务员身份展示差异化分销价」。
 * 档位数据由运营后台「门店管理 / 门店账号」维护（StoreAccount.priceLevel）。
 */
import { STORE_PRICE_LEVELS, type StorePriceLevel } from '@agritainment/shared'

export type BusinessPriceLevel = StorePriceLevel

const PRICE_LEVEL_DISCOUNT: Record<BusinessPriceLevel, number> = {
  A: 0.95,
  B: 0.97,
  C: 1
}

export const BUSINESS_PRICE_LEVELS: readonly BusinessPriceLevel[] = STORE_PRICE_LEVELS

export function isBusinessPriceLevel(value: unknown): value is BusinessPriceLevel {
  return (STORE_PRICE_LEVELS as readonly unknown[]).includes(value)
}

/** 分销价折让系数：A 档 95 折、B 档 97 折、C 档为基准分销价。 */
export function businessPriceLevelDiscount(level?: BusinessPriceLevel | null): number {
  return level ? PRICE_LEVEL_DISCOUNT[level] : 1
}

/** 展示用档位文案；门店账号无档位时返回「门店价」。 */
export function businessPriceLevelLabel(level?: BusinessPriceLevel | null): string {
  return level ? `业务员 ${level} 档` : '门店价'
}

/**
 * 从门店账号解析业务员档位：仅业务员（staff）账号带档位，门店账号（owner）固定按门店价。
 * 账号数据来自共享主数据，缺少档位时按 C 档（无折让）兜底，避免演示数据缺失导致价格异常。
 */
export function resolveBusinessPriceLevel(account?: { role?: string; priceLevel?: unknown } | null): BusinessPriceLevel | null {
  if (!account || account.role !== 'staff') return null
  return isBusinessPriceLevel(account.priceLevel) ? account.priceLevel : 'C'
}
