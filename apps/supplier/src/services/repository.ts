import { cloneSeed, demoDrivers, readPlatformDrivers, readPlatformOrders, writePlatformDrivers, writePlatformOrder } from '@agritainment/shared'
import type { Order, OrderFlowEvent, SupplierFulfillment } from '@agritainment/shared'
import { SUPPLIER_DEMO_ID } from '@agritainment/shared'

/** 演示供应商：湘西腊味合作社（S002） */
export const supplierInfo = {
  id: SUPPLIER_DEMO_ID,
  name: '湘西腊味合作社',
  emoji: '🥓',
  region: '湘西州',
  category: '腊味/预制菜',
  phone: '13787366688',
  certified: true
}

/** 门店目录：司机任务展示目的地 */
export const storeDirectory: Record<string, { address: string; contact: string; phone: string }> = {
  '石板溪农家乐·门店': { address: '湖南省湘西州永顺县石板溪村', contact: '王店长', phone: '0743-888-xxxx' },
  '云上人家·门店': { address: '湖南省张家界市武陵源区云上村', contact: '李店长', phone: '0744-666-xxxx' }
}

export function storeInfoOf(storeName: string) {
  return storeDirectory[storeName] || { address: '门店地址以到店实际为准', contact: '门店', phone: '' }
}

function dateTime(offsetDays: number, time: string): string {
  const date = new Date()
  date.setDate(date.getDate() - offsetDays)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d} ${time}`
}

interface SeedItem {
  productId: string
  skuId: string
  name: string
  skuName: string
  image: string
  quantity: number
  price: number
}

const bacon = (quantity: number): SeedItem => ({ productId: 'P001', skuId: 'P001-500', name: '湘西烟熏柴火腊肉', skuName: '500g', image: '/static/images/bacon.webp', quantity, price: 38 })
const chili = (quantity: number): SeedItem => ({ productId: 'SP14', skuId: 'SP14-3', name: '手工辣椒酱', skuName: '3 瓶装', image: '/static/images/chili.webp', quantity, price: 18 })
const egg = (quantity: number): SeedItem => ({ productId: 'SP09', skuId: 'SP09-30', name: '高山土鸡蛋', skuName: '30 枚装', image: '/static/images/field.webp', quantity, price: 32 })
const tea = (quantity: number): SeedItem => ({ productId: 'SP19', skuId: 'SP19-1', name: '安化黑茶砖', skuName: '1kg 砖', image: '/static/images/tea.webp', quantity, price: 96 })
const oil = (quantity: number): SeedItem => ({ productId: 'SP20', skuId: 'SP20-1', name: '土榨菜籽油', skuName: '5L 装', image: '/static/images/field.webp', quantity, price: 70 })
const fruit = (quantity: number): SeedItem => ({ productId: 'SP10', skuId: 'SP10-5J', name: '时令鲜果礼盒', skuName: '5 斤礼盒', image: '/static/images/peach.webp', quantity, price: 45 })

function orderAmount(items: SeedItem[]): number {
  return Math.round(items.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100) / 100
}

function fulfillmentOf(partial: Partial<SupplierFulfillment> & { status: SupplierFulfillment['status'] }): SupplierFulfillment {
  return { shortages: [], handovers: [], updatedAt: '', ...partial }
}

interface SeedSpec {
  id: string
  customer: string
  items: SeedItem[]
  createdAt: string
  status: Order['status']
  fulfillment: SupplierFulfillment
  trackingNo?: string
  flow: OrderFlowEvent[]
}

const submittedFlow = (createdAt: string): OrderFlowEvent[] => [{ time: createdAt, action: '订单已提交 · 门店向供应商直采', operator: '门店' }]
const acceptedFlow = (createdAt: string, acceptedAt: string): OrderFlowEvent[] => [
  ...submittedFlow(createdAt),
  { time: acceptedAt, action: '中台已接单 · 供应商已接单，备货中', operator: supplierInfo.name }
]

function toOrder(spec: SeedSpec): Order {
  return {
    id: spec.id,
    productName: spec.items[0].name,
    quantity: spec.items.reduce((sum, item) => sum + item.quantity, 0),
    amount: orderAmount(spec.items),
    customer: spec.customer,
    channel: 'purchase',
    status: spec.status,
    createdAt: spec.createdAt,
    trackingNo: spec.trackingNo,
    flow: spec.flow,
    items: spec.items,
    supplierId: SUPPLIER_DEMO_ID,
    supplierFulfillment: { ...spec.fulfillment, updatedAt: spec.fulfillment.updatedAt || spec.createdAt }
  }
}

function seedOrders(): Order[] {
  const today9 = dateTime(0, '09:12')
  const today10 = dateTime(0, '10:05')
  const d1_1430 = dateTime(1, '14:30')
  const d1_1520 = dateTime(1, '15:20')
  const d1_1100 = dateTime(1, '11:00')
  const d1_1610 = dateTime(1, '16:10')
  const d2_0940 = dateTime(2, '09:40')

  const specs: SeedSpec[] = [
    {
      id: 'SO-S001', customer: '石板溪农家乐·门店', items: [bacon(5), chili(10)], createdAt: today9,
      status: 'pending', fulfillment: fulfillmentOf({ status: 'submitted' }), flow: submittedFlow(today9)
    },
    {
      id: 'SO-S002', customer: '云上人家·门店', items: [egg(20)], createdAt: today10,
      status: 'pending', fulfillment: fulfillmentOf({ status: 'accepted' }), flow: acceptedFlow(today10, dateTime(0, '10:30'))
    },
    {
      id: 'SO-S003', customer: '石板溪农家乐·门店', items: [bacon(10)], createdAt: d1_1430,
      status: 'shipping',
      fulfillment: fulfillmentOf({ status: 'shipped', shipType: 'driver', driverId: 'D001', driverName: '张伟' }),
      flow: [...acceptedFlow(d1_1430, dateTime(1, '15:00')), { time: dateTime(1, '15:10'), action: '已发货 · 已指派司机 张伟 配送', operator: supplierInfo.name }]
    },
    {
      id: 'SO-S004', customer: '云上人家·门店', items: [tea(5)], createdAt: d1_1520,
      status: 'shipping',
      fulfillment: fulfillmentOf({
        status: 'delivering', shipType: 'driver', driverId: 'D002', driverName: '李强',
        handovers: [{ id: 'H-S004-OUT', type: 'out', orderId: 'SO-S004', time: dateTime(1, '16:00'), operatorId: SUPPLIER_DEMO_ID, operatorName: supplierInfo.name, operatorRole: 'supplier', shortageCount: 0 }]
      }),
      flow: [...acceptedFlow(d1_1520, dateTime(1, '15:40')), { time: dateTime(1, '16:00'), action: '出库交接完成 · 司机 李强 领货', operator: supplierInfo.name }]
    },
    {
      id: 'SO-S005', customer: '石板溪农家乐·门店', items: [fruit(8)], createdAt: d2_0940,
      status: 'delivered',
      fulfillment: fulfillmentOf({
        status: 'received', shipType: 'driver', driverId: 'D001', driverName: '张伟',
        handovers: [
          { id: 'H-S005-OUT', type: 'out', orderId: 'SO-S005', time: dateTime(2, '10:00'), operatorId: SUPPLIER_DEMO_ID, operatorName: supplierInfo.name, operatorRole: 'supplier', shortageCount: 0 },
          { id: 'H-S005-IN', type: 'in', orderId: 'SO-S005', time: dateTime(2, '13:20'), operatorId: 'D001', operatorName: '张伟', operatorRole: 'driver' }
        ]
      }),
      flow: [
        ...acceptedFlow(d2_0940, dateTime(2, '10:00')),
        { time: dateTime(2, '10:10'), action: '已发货 · 已指派司机 张伟 配送', operator: supplierInfo.name },
        { time: dateTime(2, '10:30'), action: '出库交接完成 · 司机 张伟 领货', operator: supplierInfo.name },
        { time: dateTime(2, '13:20'), action: '到店交接完成 · 司机 张伟 已与门店交接', operator: '张伟' }
      ]
    },
    {
      id: 'SO-S006', customer: '云上人家·门店', items: [oil(4)], createdAt: d1_1100, trackingNo: 'SF888800001',
      status: 'shipping',
      fulfillment: fulfillmentOf({ status: 'shipped', shipType: 'courier', trackingNo: 'SF888800001' }),
      flow: [...acceptedFlow(d1_1100, dateTime(1, '11:20')), { time: dateTime(1, '11:30'), action: '已发货 · 快递直发，运单 SF888800001', operator: supplierInfo.name }]
    },
    {
      id: 'SO-S007', customer: '石板溪农家乐·门店', items: [bacon(10), chili(5)], createdAt: d1_1610,
      status: 'shipping',
      fulfillment: fulfillmentOf({
        status: 'delivering', shipType: 'driver', driverId: 'D003', driverName: '王芳',
        shortages: [{ skuId: 'P001-500', name: '湘西烟熏柴火腊肉', ordered: 10, actual: 8, shortage: 2 }],
        handovers: [{ id: 'H-S007-OUT', type: 'out', orderId: 'SO-S007', time: dateTime(1, '16:40'), operatorId: SUPPLIER_DEMO_ID, operatorName: supplierInfo.name, operatorRole: 'supplier', shortageCount: 1 }]
      }),
      flow: [
        ...acceptedFlow(d1_1610, dateTime(1, '16:20')),
        { time: dateTime(1, '16:30'), action: '已发货 · 已指派司机 王芳 配送', operator: supplierInfo.name },
        { time: dateTime(1, '16:40'), action: '出库交接完成 · 司机 王芳 领货', operator: supplierInfo.name },
        { time: dateTime(1, '16:40'), action: '缺货 1 项：湘西烟熏柴火腊肉 -2', operator: supplierInfo.name }
      ]
    }
  ]
  return specs.map(toOrder)
}

/** 幂等种子：共享订单无任何 S002 进货单时写入演示订单；司机存储为空时写入演示司机 */
export function seedSupplierDataOnce(): void {
  const published = readPlatformOrders()
  const hasSupplierOrders = published ? Object.values(published).some((order) => order.channel === 'purchase' && order.supplierId === SUPPLIER_DEMO_ID) : false
  if (!hasSupplierOrders) {
    seedOrders().forEach((order) => writePlatformOrder(order))
  }
  if (!readPlatformDrivers()) {
    writePlatformDrivers(cloneSeed(demoDrivers))
  }
}
