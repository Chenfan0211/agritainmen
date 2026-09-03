import type { CDistributorProfile, COrder, UserBinding } from '@agritainment/shared'

const effectiveStatuses = new Set<COrder['subOrders'][number]['status']>(['paid', 'shipped', 'received'])

export interface DistributorOperationsInput {
  promoterId: string
  orders: readonly COrder[]
  bindings: Record<string, UserBinding>
  profiles: Record<string, CDistributorProfile>
}

export interface DistributorOrderProjection extends COrder {
  effectiveAmount: number
}

export function projectDistributorOperations(input: DistributorOperationsInput) {
  const descendants = new Set<string>()
  let changed = true
  while (changed) {
    changed = false
    Object.values(input.profiles).forEach((profile) => {
      if (profile.status !== 'active' || descendants.has(profile.promoterId)) return
      if (profile.parentPromoterId === input.promoterId || (profile.parentPromoterId && descendants.has(profile.parentPromoterId))) {
        descendants.add(profile.promoterId)
        changed = true
      }
    })
  }

  const projected = input.orders.map((order): DistributorOrderProjection => ({
    ...order,
    effectiveAmount: Math.round(order.subOrders
      .filter((subOrder) => effectiveStatuses.has(subOrder.status))
      .reduce((sum, subOrder) => sum + subOrder.amount, 0) * 100) / 100
  })).filter((order) => order.effectiveAmount > 0)

  const byNewest = (left: COrder, right: COrder) => right.createdAt.localeCompare(left.createdAt)
  const personalOrders = projected
    .filter((order) => order.distributorChain?.at(-1) === input.promoterId)
    .sort(byNewest)
  const teamOrders = projected
    .filter((order) => order.distributorChain?.includes(input.promoterId) && order.distributorChain.at(-1) !== input.promoterId)
    .sort(byNewest)
  const sum = (orders: readonly DistributorOrderProjection[]) => Math.round(orders.reduce((total, order) => total + order.effectiveAmount, 0) * 100) / 100

  return {
    directFans: Object.values(input.bindings)
      .filter((binding) => binding.status === 'bound' && binding.promoterId === input.promoterId)
      .sort((left, right) => (right.boundAt || '').localeCompare(left.boundAt || '')),
    teamPromoterIds: [...descendants].sort(),
    personalOrders,
    teamOrders,
    personalPerformance: sum(personalOrders),
    teamPerformance: sum(teamOrders)
  }
}
