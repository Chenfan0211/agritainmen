import type { StoreOrderStatus } from './stores/store'

export const storeOrderStatusLabels: Record<StoreOrderStatus, string> = {
  'pending-payment': '待付款',
  submitted: '待接单',
  accepted: '待发货',
  shipped: '配送中',
  delivering: '待收货',
  received: '已收货',
  completed: '已完成',
  'paid-cancelled': '已支付取消',
  'unpaid-cancelled': '未支付取消'
}

export const storeOrderFilterKeys: Array<'all' | StoreOrderStatus> = [
  'all',
  'pending-payment',
  'submitted',
  'accepted',
  'shipped',
  'delivering',
  'received',
  'completed',
  'paid-cancelled',
  'unpaid-cancelled'
]

export const storeOrderStatusLabel = (status: StoreOrderStatus) => storeOrderStatusLabels[status]

export const canCancelStoreOrder = (status: StoreOrderStatus) => ['pending-payment', 'submitted', 'accepted'].includes(status)
export const isStoreOrderCancelled = (status: StoreOrderStatus) => status === 'paid-cancelled' || status === 'unpaid-cancelled'