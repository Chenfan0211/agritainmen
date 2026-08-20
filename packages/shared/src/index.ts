export type Role = 'customer' | 'staff' | 'manager'
export type ProductSource = 'platform' | 'farmhouse'
export type ProductStatus = 'active' | 'pending' | 'offline' | 'rejected'
export type OrderStatus = 'pending' | 'shipping' | 'delivered' | 'after-sale' | 'paid-cancelled' | 'unpaid-cancelled'
export type AfterSaleStatus = 'processing' | 'rejected' | 'refund-pending' | 'return-pending' | 'refunded' | 'refund-failed'
export type PurchaseStatus = 'submitted' | 'accepted' | 'shipped' | 'delivering' | 'received' | 'completed' | 'cancelled'
export type MockScenario = 'normal' | 'empty' | 'failure'
export type FarmAvailability = 'bookable' | 'full' | 'closed'
export type CommissionStatus = 'pending' | 'available' | 'completed'
export const PERSISTENCE_VERSION = 7

export interface Sku {
  id: string
  name: string
  price: number
  cost: number
  stock: number
}

export interface Member {
  id: string
  name: string
  level: 'normal' | 'silver' | 'gold'
  balance: number
  points: number
  phone: string
  memberNo?: string
  cumulativeCommission?: number
  fans?: number
  monthlyOrders?: number
}

export interface CommissionRule {
  id: string
  name: string
  targetType: 'farm' | 'product' | 'live'
  rate: number
  enabled: boolean
  updatedAt: string
}

export interface LogisticsEvent {
  time: string
  title: string
  detail: string
}

export interface BalanceEntry {
  id: string
  type: 'recharge' | 'consume'
  amount: number
  balance: number
  description: string
  createdAt: string
}

export interface PromotionRecord {
  id: string
  targetType: 'farm' | 'product' | 'live'
  targetId: string
  targetName: string
  link: string
  shareCount: number
  lockedFans: number
  estimatedCommission: number
  createdAt: string
}

export interface CommissionEntry {
  id: string
  type: 'income' | 'withdrawal'
  amount: number
  description: string
  createdAt: string
  status: CommissionStatus
  targetType?: PromotionRecord['targetType']
  targetId?: string
  requestKey?: string
}

export interface AllianceBooking {
  id: string
  farmId: string
  farmName: string
  date: string
  session: string
  people: number
  status: 'submitted' | 'confirmed'
  createdAt: string
}

export interface TenantConfig {
  code: string
  farmId: string
  buildTarget: string
  name: string
  shortName: string
  slogan: string
  theme: string
  phone: string
  address: string
  hours: string
  distanceKm?: number
  appId?: string
}

export interface Product {
  id: string
  name: string
  category: string
  price: number
  cost: number
  stock: number
  sales: number
  source: ProductSource
  status: ProductStatus
  image: string
  supplier: string
  tags: string[]
  skus: Sku[]
  farmIds: string[]
  promoName?: string
  emoji?: string
  commissionRate?: number
  commissionSold?: number
  commissionEarn?: number
  spec?: string
  images?: string[]
}

export interface SupplierQualification {
  businessLicense: string
  permit: string
  validUntil: string
  reviewNote: string
}

export interface Supplier {
  id: string
  name: string
  region: string
  category: string
  certified: boolean
  status: 'pending' | 'cooperating' | 'paused'
  productCount: number
  coop?: boolean
  emoji?: string
  contactPhone?: string
  qualification: SupplierQualification
}

export interface Category {
  id: string
  name: string
  type: 'product' | 'supplier' | 'general'
}

export type DictType = string

export interface DictGroup {
  id: string
  type: DictType
  name: string
}

export interface DictItem {
  id: string
  type: DictType
  code: string
  label: string
  enabled: boolean
  sort: number
}

export type StoreRole = 'owner' | 'staff'

export interface StoreAccount {
  id: string
  farmId: string
  name: string
  account: string
  password: string
  role: StoreRole
  enabled: boolean
  promoEnabled?: boolean
  createdAt?: string
}

export interface FarmStore {
  id: string
  name: string
  region: string
  distance: number
  rating: number
  monthlySales: number
  averageSpend: number
  status: 'active' | 'pending' | 'paused'
  selectedCount: number
  gmv: number
  image: string
  tags: string[]
  storeTags?: string[]
  emoji?: string
  adminDesc?: string
  core?: boolean
  city: string
  availability: FarmAvailability
  livePopularity: number
}

export interface OrderFlowEvent {
  time: string
  action: string
  operator: string
  note?: string
}

export interface ShortageItem {
  skuId: string
  name: string
  ordered: number
  actual: number
  shortage: number
}

export interface HandoverLog {
  id: string
  type: 'out' | 'in'
  orderId: string
  time: string
  operatorId: string
  operatorName: string
  operatorRole: 'supplier' | 'driver'
  note?: string
  shortageCount?: number
}

export interface DriverAccount {
  id: string
  supplierId: string
  name: string
  account: string
  password: string
  phone?: string
  status: 'active' | 'disabled'
  createdAt: string
}

export interface SupplierFulfillment {
  status: PurchaseStatus
  shipType?: 'driver' | 'courier'
  driverId?: string
  driverName?: string
  trackingNo?: string
  shortages: ShortageItem[]
  handovers: HandoverLog[]
  updatedAt: string
}

export interface Order {
  id: string
  productName: string
  quantity: number
  amount: number
  customer: string
  channel: 'shop' | 'live' | 'purchase'
  status: OrderStatus
  createdAt: string
  trackingNo?: string
  logistics?: LogisticsEvent[]
  flow?: OrderFlowEvent[]
  supplierId?: string
  settlementId?: string
  items?: OrderItem[]
  supplierFulfillment?: SupplierFulfillment
}

export interface Booking {
  id: string
  type: 'room' | 'package' | 'service'
  name: string
  date: string
  session: string
  people: number
  status: 'reserved' | 'completed' | 'cancelled'
  emoji?: string
  image?: string
  amount?: number
}

export interface PricePolicy {
  id: string
  name: string
  type: 'group' | 'ladder' | 'region' | 'member'
  scope: string
  discount: number
  enabled: boolean
  tiers?: PriceTier[]
}

export interface PriceTier {
  minQty: number
  maxQty: number | null
  price: number
  discountOff: number
}

export interface AfterSale {
  id: string
  orderId: string
  productName: string
  applicant: string
  type: 'reship' | 'refund' | 'claim'
  amount: number
  status: AfterSaleStatus
  issue?: string
  quantity?: number
  image?: string
  refundAmount?: number
  refundMethod?: 'return' | 'only'
  refundMode?: 'full' | 'ratio' | 'custom'
  history?: Array<{ time: string; action: string; operator: string }>
}

export interface Promoter {
  id: string
  name: string
  level: string
  type?: string
  fans: number
  orders: number
  gmv: number
  commission: number
  cumulativeCommission?: number
  settled?: boolean
  status: 'active' | 'paused'
}

export interface LiveRoom {
  id: string
  title: string
  host: string
  hostRole?: string
  viewers: number
  productName: string
  productPrice: number
  status: 'live' | 'preview'
  reminded: boolean
  emoji?: string
  image: string
  farmId?: string
  promoterId?: string
  linkedFarms?: Array<{ farmId: string; packageIds: string[] }>
  city: string
}

export interface OrderItem {
  productId: string
  skuId: string
  name: string
  skuName: string
  image: string
  quantity: number
  price: number
}

export interface StorefrontOrder {
  id: string
  amount: number
  itemCount: number
  items: OrderItem[]
  status: '待发货' | '待收货' | '已发货' | '已完成'
  createdAt: string
}

export interface SupplierSettlementRecord {
  id: string
  period: string
  supplierIds: string[]
  orderIds: string[]
  amount: number
  createdAt: string
  items: Array<{ supplierId: string; supplierName: string; orderIds: string[]; amount: number }>
}

export interface CommissionSettlementRecord {
  id: string
  promoterIds: string[]
  amount: number
  createdAt: string
  items: Array<{ promoterId: string; promoterName: string; amount: number }>
}

export interface TravelRoute {
  id: string
  name: string
  description: string
  meta?: string
  price: number
  city: string
  image: string
}

export interface PurchaseOrder {
  id: string
  amount: number
  items: OrderItem[]
  status: PurchaseStatus
  createdAt: string
}

export const tenant: TenantConfig = {
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
}

export const products: Product[] = [
  { id: 'P001', emoji: '🥓', name: '湘西烟熏柴火腊肉 500g', category: '土特产', spec: '500g/袋', price: 59.9, cost: 38, stock: 2400, sales: 2860, source: 'platform', status: 'active', image: '/static/images/bacon.webp', supplier: '湘西腊味合作社', tags: ['中台甄选', '柴火慢熏'], farmIds: ['F001', 'F002'], promoName: '湘西烟熏柴火腊肉 500g', commissionRate: 18, commissionSold: 158, commissionEarn: 10.8, images: ['/static/images/bacon.webp', '/static/images/chili.webp'], skus: [{ id: 'P001-500', name: '500g', price: 59.9, cost: 38, stock: 2000 }, { id: 'P001-1000', name: '1kg家庭装', price: 109, cost: 78, stock: 400 }] },
  { id: 'P002', emoji: '🍑', name: '炎陵黄桃 5斤礼盒', category: '生鲜农产', spec: '5斤/盒', price: 68, cost: 42, stock: 1860, sales: 2090, source: 'platform', status: 'active', image: '/static/images/peach.webp', supplier: '炎陵果业有限公司', tags: ['产地直发', '当季鲜果'], farmIds: ['F001', 'F002', 'F003'], promoName: '炎陵黄桃 5斤礼盒', commissionRate: 15, commissionSold: 230, commissionEarn: 10.2, images: ['/static/images/peach.webp', '/static/images/farmhouse.webp'], skus: [{ id: 'P002-5J', name: '5斤礼盒', price: 68, cost: 42, stock: 1500 }, { id: 'P002-10J', name: '10斤家庭装', price: 128, cost: 92, stock: 360 }] },
  { id: 'P003', emoji: '🍵', name: '安化黑茶礼盒装', category: '伴手礼', spec: '礼盒装', price: 128, cost: 86, stock: 640, sales: 770, source: 'platform', status: 'active', image: '/static/images/tea.webp', supplier: '安化茶业集团', tags: ['中台甄选', '礼盒装'], farmIds: ['F002', 'F005'], images: ['/static/images/tea.webp', '/static/images/mountain.webp'], skus: [{ id: 'P003-GIFT', name: '雅藏礼盒', price: 128, cost: 86, stock: 640 }] },
  { id: 'P004', emoji: '🫙', name: '农家自制剁辣椒 2瓶', category: '食材调料', spec: '2瓶/组', price: 39.9, cost: 20, stock: 120, sales: 386, source: 'farmhouse', status: 'pending', image: '/static/images/chili.webp', supplier: '石板溪农家乐', tags: ['农家手作', '下饭'], farmIds: ['F001'], skus: [{ id: 'P004-2', name: '2瓶装', price: 39.9, cost: 20, stock: 120 }] },
  { id: 'P005', emoji: '🍯', name: '武陵山野生土蜂蜜 500g', category: '生鲜农产', spec: '500g/瓶', price: 88, cost: 56, stock: 980, sales: 868, source: 'platform', status: 'active', image: '/static/images/honey.webp', supplier: '武陵蜂业合作社', tags: ['自然成熟', '产地直发'], farmIds: ['F002', 'F004'], images: ['/static/images/honey.webp', '/static/images/field.webp'], skus: [{ id: 'P005-500', name: '500g', price: 88, cost: 56, stock: 980 }] },
  { id: 'P006', emoji: '🌾', name: '石板溪生态富硒米 5kg', category: '农产品', spec: '5kg/袋', price: 49.9, cost: 32, stock: 300, sales: 672, source: 'farmhouse', status: 'pending', image: '/static/images/rice.webp', supplier: '石板溪农家乐', tags: ['生态种植', '本店自有'], farmIds: ['F001', 'F003'], skus: [{ id: 'P006-5K', name: '5kg', price: 49.9, cost: 32, stock: 300 }] },
  { id: 'P007', emoji: '🎟', name: '农家四人欢聚套餐券', category: '套餐券', spec: '4人/份', price: 288, cost: 120, stock: 500, sales: 86, source: 'farmhouse', status: 'active', image: '/static/images/farmhouse.webp', supplier: '石板溪农家乐', tags: ['到店核销', '含锁定食材'], farmIds: ['F001'], promoName: '石板溪农家乐 · 四人套餐券', commissionRate: 12, commissionSold: 86, commissionEarn: 34.5, skus: [{ id: 'P007-4P', name: '四人套餐券', price: 288, cost: 120, stock: 500 }] },
  { id: 'P008', emoji: '🐟', name: '东江鱼仔香辣味 200g', category: '土特产', spec: '200g/袋', price: 32.8, cost: 21, stock: 1652, sales: 1652, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '东江湖食品', tags: ['中台甄选', '香辣下饭'], farmIds: ['F001', 'F003'], images: ['/static/images/field.webp', '/static/images/rice.webp'], skus: [{ id: 'P008-200', name: '200g', price: 32.8, cost: 21, stock: 1652 }] },
  { id: 'P009', emoji: '🦆', name: '招牌酱板鸭 整只装', category: '土特产', spec: '整只装', price: 49, cost: 30, stock: 800, sales: 320, source: 'platform', status: 'active', image: '/static/images/bacon.webp', supplier: '湘西腊味合作社', tags: ['中台甄选', '酱香'], farmIds: ['F002', 'F005'], skus: [{ id: 'P009-1', name: '整只装', price: 49, cost: 30, stock: 800 }] },
  { id: 'P010', emoji: '🍵', name: '安化黑茶 · 农家自藏', category: '伴手礼', spec: '礼盒装', price: 128, cost: 60, stock: 80, sales: 260, source: 'farmhouse', status: 'active', image: '/static/images/tea.webp', supplier: '石板溪农家乐', tags: ['自有商品', '农家自藏'], farmIds: ['F001'], promoName: '安化黑茶 · 礼盒装', commissionRate: 20, commissionSold: 64, commissionEarn: 25.6, skus: [{ id: 'P010-1', name: '礼盒装', price: 128, cost: 60, stock: 80 }] },
  { id: 'P011', emoji: '🐔', name: '山泉土鸡汤礼盒', category: '农产品', spec: '2只/盒', price: 108, cost: 55, stock: 60, sales: 40, source: 'farmhouse', status: 'pending', image: '/static/images/farmhouse.webp', supplier: '云上人家山景农庄', tags: ['门店自有', '滋补'], farmIds: ['F002'], skus: [{ id: 'P011-1', name: '2只装', price: 108, cost: 55, stock: 60 }] },
  { id: 'P012', emoji: '🥓', name: '湘西柴火腊肉真空装', category: '预制菜', spec: '500g/袋', price: 68, cost: 35, stock: 200, sales: 90, source: 'farmhouse', status: 'pending', image: '/static/images/bacon.webp', supplier: '稻香村生态农庄', tags: ['门店自有', '真空锁鲜'], farmIds: ['F003'], skus: [{ id: 'P012-1', name: '500g', price: 68, cost: 35, stock: 200 }] },
  { id: 'P013', emoji: '🍶', name: '农家米酒 5斤装', category: '酒水饮料', spec: '5斤/坛', price: 56, cost: 24, stock: 150, sales: 60, source: 'farmhouse', status: 'pending', image: '/static/images/field.webp', supplier: '橘子洲畔农家院', tags: ['门店自有', '土法酿造'], farmIds: ['F004'], skus: [{ id: 'P013-1', name: '5斤装', price: 56, cost: 24, stock: 150 }] },
  { id: 'P014', emoji: '🛏', name: '民宿一次性洗漱套装', category: '民宿用品', spec: '100套/箱', price: 3.5, cost: 1.8, stock: 12000, sales: 600, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '中台供应链', tags: ['中台甄选', '易耗品'], farmIds: ['F002', 'F003'], skus: [{ id: 'P014-100', name: '100套/箱', price: 3.5, cost: 1.8, stock: 12000 }] },
  { id: 'P015', emoji: '🍄', name: '瑶山鲜菌菇礼盒 1kg', category: '土特产', spec: '1kg/盒', price: 45.8, cost: 28, stock: 560, sales: 148, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '道县瑶山菌业合作社', tags: ['产地直发', '山珍'], farmIds: ['F002', 'F007'], promoName: '瑶山鲜菌菇礼盒 1kg', commissionRate: 15, commissionSold: 22, commissionEarn: 6.9, images: ['/static/images/field.webp', '/static/images/mountain.webp'], skus: [{ id: 'P015-1K', name: '1kg礼盒', price: 45.8, cost: 28, stock: 420 }, { id: 'P015-2K', name: '2kg家庭装', price: 86, cost: 52, stock: 140 }] },
  { id: 'P016', emoji: '🐟', name: '洞庭湖风干刁子鱼 400g', category: '土特产', spec: '400g/袋', price: 42.8, cost: 26, stock: 1240, sales: 532, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '洞庭湖水产品合作社', tags: ['中台甄选', '湖鲜'], farmIds: ['F008', 'F009'], promoName: '洞庭湖风干刁子鱼 400g', commissionRate: 16, commissionSold: 86, commissionEarn: 6.8, skus: [{ id: 'P016-400', name: '400g', price: 42.8, cost: 26, stock: 1240 }] },
  { id: 'P017', emoji: '🥩', name: '宁乡花猪腊肠 400g', category: '预制菜', spec: '400g/袋', price: 38.8, cost: 24, stock: 860, sales: 268, source: 'platform', status: 'active', image: '/static/images/bacon.webp', supplier: '宁乡花猪生态养殖场', tags: ['中台甄选', '农家土法'], farmIds: ['F003', 'F004'], promoName: '宁乡花猪腊肠 400g', commissionRate: 14, commissionSold: 35, commissionEarn: 5.4, skus: [{ id: 'P017-400', name: '400g', price: 38.8, cost: 24, stock: 860 }] },
  { id: 'P018', emoji: '🌶', name: '湘西剁椒鱼头酱 500g', category: '食材调料', spec: '500g/罐', price: 29.9, cost: 15, stock: 720, sales: 420, source: 'platform', status: 'active', image: '/static/images/chili.webp', supplier: '湘西腊味合作社', tags: ['农家手作', '下饭神器'], farmIds: ['F001', 'F006'], skus: [{ id: 'P018-500', name: '500g', price: 29.9, cost: 15, stock: 720 }] },
  { id: 'P019', emoji: '🍒', name: '靖州杨梅干 250g', category: '土特产', spec: '250g/袋', price: 26.8, cost: 14, stock: 480, sales: 96, source: 'platform', status: 'pending', image: '/static/images/peach.webp', supplier: '靖州杨梅专业合作社', tags: ['当季限定', '果干'], farmIds: ['F001'], skus: [{ id: 'P019-250', name: '250g', price: 26.8, cost: 14, stock: 480 }] },
  { id: 'P020', emoji: '🥚', name: '武陵山土鸡蛋 30枚', category: '农产品', spec: '30枚/盒', price: 39.9, cost: 24, stock: 320, sales: 184, source: 'farmhouse', status: 'pending', image: '/static/images/farmhouse.webp', supplier: '云上人家山景农庄', tags: ['门店自有', '散养'], farmIds: ['F002'], skus: [{ id: 'P020-30', name: '30枚', price: 39.9, cost: 24, stock: 320 }] },
  { id: 'P021', emoji: '🍶', name: '宝庆糯米甜酒 2L坛装', category: '酒水饮料', spec: '2L/坛', price: 46, cost: 22, stock: 260, sales: 58, source: 'platform', status: 'pending', image: '/static/images/field.webp', supplier: '邵阳宝庆预制菜食品厂', tags: ['土法酿造', '甜香'], farmIds: ['F009'], skus: [{ id: 'P021-2L', name: '2L坛装', price: 46, cost: 22, stock: 260 }] },
  { id: 'P022', emoji: '🧺', name: '湘西农家伴手礼大礼包', category: '文旅伴手礼', spec: '8件/箱', price: 158, cost: 92, stock: 200, sales: 132, source: 'platform', status: 'active', image: '/static/images/farmhouse.webp', supplier: '县供销社惠农服务中心', tags: ['中台甄选', '走亲访友'], farmIds: ['F001', 'F002', 'F005'], promoName: '湘西农家伴手礼大礼包', commissionRate: 12, commissionSold: 28, commissionEarn: 19, skus: [{ id: 'P022-8', name: '8件装', price: 158, cost: 92, stock: 200 }] },
  { id: 'P023', emoji: '🫙', name: '安化擂茶粉 500g', category: '食材调料', spec: '500g/罐', price: 39.9, cost: 22, stock: 380, sales: 92, source: 'platform', status: 'active', image: '/static/images/tea.webp', supplier: '安化茶业集团', tags: ['非遗技艺', '冲饮'], farmIds: ['F010', 'F007'], skus: [{ id: 'P023-500', name: '500g', price: 39.9, cost: 22, stock: 380 }] },
  { id: 'P024', emoji: '🛏', name: '民宿四件套床上用品', category: '民宿用品', spec: '1套/袋', price: 89, cost: 52, stock: 420, sales: 76, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '县供销社惠农服务中心', tags: ['中台甄选', '亲肤纯棉'], farmIds: ['F002', 'F004'], skus: [{ id: 'P024-1', name: '四件套', price: 89, cost: 52, stock: 420 }] },
  { id: 'P025', emoji: '🍊', name: '麻阳冰糖橙 5kg礼盒', category: '时令水果', spec: '5kg/盒', price: 59.9, cost: 38, stock: 1520, sales: 640, source: 'platform', status: 'active', image: '/static/images/peach.webp', supplier: '麻阳冰糖橙合作社', tags: ['产地直发', '爆汁甜橙'], farmIds: ['F024', 'F025'], promoName: '麻阳冰糖橙 5kg礼盒', commissionRate: 15, commissionSold: 96, commissionEarn: 9, skus: [{ id: 'P025-5K', name: '5kg礼盒', price: 59.9, cost: 38, stock: 1520 }] },
  { id: 'P026', emoji: '🥒', name: '白关丝瓜 3斤装', category: '有机蔬菜', spec: '3斤/袋', price: 19.9, cost: 10, stock: 680, sales: 128, source: 'platform', status: 'pending', image: '/static/images/field.webp', supplier: '白关丝瓜种植合作社', tags: ['地理标志', '当日现摘'], farmIds: ['F017'], skus: [{ id: 'P026-3J', name: '3斤装', price: 19.9, cost: 10, stock: 680 }] },
  { id: 'P027', emoji: '🍠', name: '江永香芋 5斤装', category: '农产品', spec: '5斤/袋', price: 32.8, cost: 18, stock: 920, sales: 286, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '江永香芋种植基地', tags: ['粉糯香甜', '产地直发'], farmIds: ['F021'], skus: [{ id: 'P027-5J', name: '5斤装', price: 32.8, cost: 18, stock: 920 }] },
  { id: 'P028', emoji: '🍊', name: '石门柑橘 5kg', category: '时令水果', spec: '5kg/箱', price: 45.8, cost: 28, stock: 1860, sales: 520, source: 'platform', status: 'active', image: '/static/images/peach.webp', supplier: '石门柑橘专业合作社', tags: ['高山蜜橘', '甜酸适口'], farmIds: ['F013', 'F025'], promoName: '石门柑橘 5kg', commissionRate: 13, commissionSold: 62, commissionEarn: 6, skus: [{ id: 'P028-5K', name: '5kg', price: 45.8, cost: 28, stock: 1860 }] },
  { id: 'P029', emoji: '🌼', name: '祁东黄花菜 500g', category: '土特产', spec: '500g/袋', price: 28.8, cost: 16, stock: 760, sales: 238, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '祁东黄花菜产业园', tags: ['三蒸三晒', '煲汤必备'], farmIds: ['F019'], skus: [{ id: 'P029-500', name: '500g', price: 28.8, cost: 16, stock: 760 }] },
  { id: 'P030', emoji: '🦐', name: '南县稻虾米 5kg', category: '农产品', spec: '5kg/袋', price: 59.9, cost: 36, stock: 1100, sales: 342, source: 'platform', status: 'active', image: '/static/images/rice.webp', supplier: '南县稻虾合作社', tags: ['稻虾共生', '米香浓郁'], farmIds: ['F027'], skus: [{ id: 'P030-5K', name: '5kg', price: 59.9, cost: 36, stock: 1100 }] },
  { id: 'P031', emoji: '🐟', name: '浏阳蒸火焙鱼 300g', category: '预制菜', spec: '300g/袋', price: 38.8, cost: 22, stock: 540, sales: 168, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '浏阳蒸菜食品厂', tags: ['蒸菜非遗', '开袋即蒸'], farmIds: ['F016', 'F018'], skus: [{ id: 'P031-300', name: '300g', price: 38.8, cost: 22, stock: 540 }] },
  { id: 'P032', emoji: '🦆', name: '临武酱板鸭 整只装', category: '预制菜', spec: '整只/袋', price: 58, cost: 34, stock: 860, sales: 420, source: 'platform', status: 'active', image: '/static/images/bacon.webp', supplier: '临武鸭业股份有限公司', tags: ['武陵风味', '酱香浓郁'], farmIds: ['F020'], promoName: '临武酱板鸭 整只装', commissionRate: 14, commissionSold: 58, commissionEarn: 8.1, skus: [{ id: 'P032-1', name: '整只装', price: 58, cost: 34, stock: 860 }] },
  { id: 'P033', emoji: '🥜', name: '平江香干 300g', category: '预制菜', spec: '300g/袋', price: 15.8, cost: 8, stock: 1480, sales: 720, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '平江豆干食品厂', tags: ['卤香入味', '追剧零食'], farmIds: ['F018', 'F023'], skus: [{ id: 'P033-300', name: '300g', price: 15.8, cost: 8, stock: 1480 }] },
  { id: 'P034', emoji: '🫘', name: '武冈卤香干 400g', category: '预制菜', spec: '400g/袋', price: 22.8, cost: 12, stock: 620, sales: 186, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '武冈卤味食品有限公司', tags: ['武冈卤菜', '百年老卤'], farmIds: ['F023'], skus: [{ id: 'P034-400', name: '400g', price: 22.8, cost: 12, stock: 620 }] },
  { id: 'P035', emoji: '🥘', name: '长沙小炒黄牛肉预制品 500g', category: '预制菜', spec: '500g/袋', price: 46.8, cost: 28, stock: 380, sales: 96, source: 'platform', status: 'pending', image: '/static/images/farmhouse.webp', supplier: '长沙马王堆预制菜工厂', tags: ['湘味经典', '锁鲜装'], farmIds: ['F016', 'F030'], skus: [{ id: 'P035-500', name: '500g', price: 46.8, cost: 28, stock: 380 }] },
  { id: 'P036', emoji: '🌶', name: '双峰辣酱 500g', category: '食材调料', spec: '500g/瓶', price: 29.9, cost: 15, stock: 720, sales: 264, source: 'platform', status: 'active', image: '/static/images/chili.webp', supplier: '双峰辣酱世家', tags: ['非遗辣酱', '拌饭神器'], farmIds: ['F022'], skus: [{ id: 'P036-500', name: '500g', price: 29.9, cost: 15, stock: 720 }] },
  { id: 'P037', emoji: '🍜', name: '耒阳红薯粉 1kg', category: '食材调料', spec: '1kg/袋', price: 19.9, cost: 10, stock: 890, sales: 310, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '耒阳红薯粉加工厂', tags: ['纯手工', '久煮不烂'], farmIds: ['F019'], skus: [{ id: 'P037-1K', name: '1kg', price: 19.9, cost: 10, stock: 890 }] },
  { id: 'P038', emoji: '🍜', name: '永州米粉干 2kg', category: '食材调料', spec: '2kg/袋', price: 26.8, cost: 14, stock: 560, sales: 148, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '祁阳米粉食品厂', tags: ['Q弹爽滑', '早餐首选'], farmIds: ['F021'], skus: [{ id: 'P038-2K', name: '2kg', price: 26.8, cost: 14, stock: 560 }] },
  { id: 'P039', emoji: '🎋', name: '沅江芦笋 500g', category: '农产品', spec: '500g/袋', price: 24.9, cost: 13, stock: 320, sales: 64, source: 'platform', status: 'pending', image: '/static/images/field.webp', supplier: '沅江芦笋合作社', tags: ['洞庭湖鲜', '脆嫩爽口'], farmIds: ['F027'], skus: [{ id: 'P039-500', name: '500g', price: 24.9, cost: 13, stock: 320 }] },
  { id: 'P040', emoji: '🍃', name: '张家界莓茶礼盒', category: '文旅伴手礼', spec: '200g/盒', price: 168, cost: 98, stock: 420, sales: 186, source: 'platform', status: 'active', image: '/static/images/tea.webp', supplier: '张家界莓茶产业合作社', tags: ['土家神茶', '回甘绵长'], farmIds: ['F026'], promoName: '张家界莓茶礼盒', commissionRate: 16, commissionSold: 32, commissionEarn: 26.9, skus: [{ id: 'P040-200', name: '200g礼盒', price: 168, cost: 98, stock: 420 }] },
  { id: 'P041', emoji: '🍵', name: '君山银针礼盒', category: '伴手礼', spec: '250g/盒', price: 198, cost: 120, stock: 260, sales: 128, source: 'platform', status: 'active', image: '/static/images/tea.webp', supplier: '君山银针茶业', tags: ['黄茶之冠', '金镶玉'], farmIds: ['F018', 'F025'], skus: [{ id: 'P041-250', name: '250g礼盒', price: 198, cost: 120, stock: 260 }] },
  { id: 'P042', emoji: '🍵', name: '古丈毛尖礼盒', category: '伴手礼', spec: '250g/盒', price: 138, cost: 82, stock: 380, sales: 176, source: 'platform', status: 'active', image: '/static/images/tea.webp', supplier: '古丈毛尖茶厂', tags: ['高山绿茶', '板栗香'], farmIds: ['F028'], skus: [{ id: 'P042-250', name: '250g礼盒', price: 138, cost: 82, stock: 380 }] },
  { id: 'P043', emoji: '🥿', name: '民宿一次性凉拖 100双', category: '民宿用品', spec: '100双/箱', price: 180, cost: 98, stock: 800, sales: 320, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '县供销社惠农服务中心', tags: ['加厚防滑', '易耗品'], farmIds: ['F002', 'F016'], skus: [{ id: 'P043-100', name: '100双/箱', price: 180, cost: 98, stock: 800 }] },
  { id: 'P044', emoji: '🧺', name: '竹纤维浴巾 20条', category: '民宿用品', spec: '20条/箱', price: 250, cost: 140, stock: 300, sales: 96, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '县供销社惠农服务中心', tags: ['亲肤速干', '整箱装'], farmIds: ['F002', 'F026'], skus: [{ id: 'P044-20', name: '20条/箱', price: 250, cost: 140, stock: 300 }] },
  { id: 'P045', emoji: '📦', name: '牛皮纸打包袋 ×500', category: '包装耗材', spec: '500只/箱', price: 175, cost: 92, stock: 1500, sales: 520, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '县供销社惠农服务中心', tags: ['可降解', '外卖打包'], farmIds: ['F001', 'F003'], skus: [{ id: 'P045-500', name: '500只/箱', price: 175, cost: 92, stock: 1500 }] },
  { id: 'P046', emoji: '🧻', name: '商用保鲜膜 300米', category: '包装耗材', spec: '300米/卷', price: 28, cost: 15, stock: 900, sales: 380, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '县供销社惠农服务中心', tags: ['厨房必备', '加厚款'], farmIds: ['F001', 'F006'], skus: [{ id: 'P046-300', name: '300米/卷', price: 28, cost: 15, stock: 900 }] },
  { id: 'P047', emoji: '🍯', name: '桑植土蜂蜜 1kg', category: '蜂蜜/土特产', spec: '1kg/罐', price: 128, cost: 78, stock: 340, sales: 158, source: 'platform', status: 'active', image: '/static/images/honey.webp', supplier: '桑植蜂蜜养殖合作社', tags: ['自然成熟', '高山百花蜜'], farmIds: ['F026', 'F028'], skus: [{ id: 'P047-1K', name: '1kg', price: 128, cost: 78, stock: 340 }] },
  { id: 'P048', emoji: '🍘', name: '古丈蒿子粑粑 6个装', category: '土特产', spec: '6个/盒', price: 22.8, cost: 12, stock: 460, sales: 138, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '古丈毛尖茶厂', tags: ['清明美食', '香糯可口'], farmIds: ['F028'], skus: [{ id: 'P048-6', name: '6个装', price: 22.8, cost: 12, stock: 460 }] },
  { id: 'P049', emoji: '🍎', name: '望城蔬果脆片 200g', category: '土特产', spec: '200g/袋', price: 19.8, cost: 10, stock: 680, sales: 246, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '望城蔬果种植基地', tags: ['低温脱水', '果蔬脆'], farmIds: ['F016'], skus: [{ id: 'P049-200', name: '200g', price: 19.8, cost: 10, stock: 680 }] },
  { id: 'P050', emoji: '🪷', name: '湘莲莲子羹 400g', category: '伴手礼', spec: '400g/罐', price: 46, cost: 26, stock: 420, sales: 118, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '湘潭湘莲食品有限公司', tags: ['贡品湘莲', '即食冲饮'], farmIds: ['F029'], skus: [{ id: 'P050-400', name: '400g', price: 46, cost: 26, stock: 420 }] },
  { id: 'P051', emoji: '🎁', name: '湖南特产八件套', category: '文旅伴手礼', spec: '8件/箱', price: 168, cost: 96, stock: 280, sales: 142, source: 'platform', status: 'active', image: '/static/images/farmhouse.webp', supplier: '浏阳蒸菜食品厂', tags: ['礼遇湖南', '走亲访友'], farmIds: ['F016', 'F023'], promoName: '湖南特产八件套', commissionRate: 12, commissionSold: 18, commissionEarn: 20.2, skus: [{ id: 'P051-8', name: '8件装', price: 168, cost: 96, stock: 280 }] },
  { id: 'P052', emoji: '🪭', name: '湘绣团扇伴手礼', category: '文旅伴手礼', spec: '单把/盒', price: 88, cost: 48, stock: 320, sales: 86, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '湘潭湘莲食品有限公司', tags: ['非遗湘绣', '国风雅礼'], farmIds: ['F029'], skus: [{ id: 'P052-1', name: '单把装', price: 88, cost: 48, stock: 320 }] },
  { id: 'P053', emoji: '🍚', name: '双人农家土菜套餐券', category: '套餐券', spec: '2人/份', price: 128, cost: 55, stock: 400, sales: 96, source: 'farmhouse', status: 'active', image: '/static/images/farmhouse.webp', supplier: '石板溪农家乐', tags: ['到店核销', '土菜四菜一汤'], farmIds: ['F001'], skus: [{ id: 'P053-2P', name: '双人套餐券', price: 128, cost: 55, stock: 400 }] },
  { id: 'P054', emoji: '🎓', name: '亲子研学半日券', category: '套餐券', spec: '1大1小/份', price: 98, cost: 40, stock: 260, sales: 68, source: 'farmhouse', status: 'active', image: '/static/images/field.webp', supplier: '稻香村生态农庄', tags: ['插秧体验', '自然课堂'], farmIds: ['F003'], skus: [{ id: 'P054-2', name: '1大1小', price: 98, cost: 40, stock: 260 }] },
  { id: 'P055', emoji: '🏨', name: '山景民宿一晚券', category: '套餐券', spec: '1晚/份', price: 268, cost: 120, stock: 180, sales: 46, source: 'farmhouse', status: 'active', image: '/static/images/mountain.webp', supplier: '云上人家山景农庄', tags: ['含双早', '山景房'], farmIds: ['F002'], skus: [{ id: 'P055-1', name: '1晚', price: 268, cost: 120, stock: 180 }] },
  { id: 'P056', emoji: '🥝', name: '麻阳猕猴桃汁 6瓶', category: '酒水饮料', spec: '6瓶/箱', price: 39.9, cost: 22, stock: 480, sales: 132, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '麻阳冰糖橙合作社', tags: ['鲜榨还原', '0添加'], farmIds: ['F024'], skus: [{ id: 'P056-6', name: '6瓶装', price: 39.9, cost: 22, stock: 480 }] },
  { id: 'P057', emoji: '🧋', name: '常德擂茶 2L', category: '酒水饮料', spec: '2L/桶', price: 25.8, cost: 13, stock: 560, sales: 186, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '石门柑橘专业合作社', tags: ['老牌擂茶', '解腻神器'], farmIds: ['F025'], skus: [{ id: 'P057-2L', name: '2L', price: 25.8, cost: 13, stock: 560 }] },
  { id: 'P058', emoji: '🥤', name: '莓茶气泡水 12瓶', category: '酒水饮料', spec: '12瓶/箱', price: 49.9, cost: 26, stock: 380, sales: 92, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '张家界莓茶产业合作社', tags: ['国货新饮', '0糖0脂'], farmIds: ['F026'], skus: [{ id: 'P058-12', name: '12瓶装', price: 49.9, cost: 26, stock: 380 }] },
  { id: 'P059', emoji: '🥚', name: '临武鸭蛋 20枚', category: '农产品', spec: '20枚/盒', price: 32, cost: 18, stock: 520, sales: 176, source: 'platform', status: 'pending', image: '/static/images/farmhouse.webp', supplier: '临武鸭业股份有限公司', tags: ['散养鸭蛋', '蛋黄流油'], farmIds: ['F020'], skus: [{ id: 'P059-20', name: '20枚', price: 32, cost: 18, stock: 520 }] },
  { id: 'P060', emoji: '🌾', name: '望城富硒米 10kg', category: '农产品', spec: '10kg/袋', price: 89, cost: 52, stock: 460, sales: 154, source: 'platform', status: 'active', image: '/static/images/rice.webp', supplier: '望城蔬果种植基地', tags: ['富硒种植', '当季新米'], farmIds: ['F016', 'F030'], skus: [{ id: 'P060-10K', name: '10kg', price: 89, cost: 52, stock: 460 }] },
  { id: 'P061', emoji: '🍲', name: '云上人家·山景双人土菜券', category: '套餐券', spec: '2人/份', price: 168, cost: 78, stock: 300, sales: 64, source: 'farmhouse', status: 'active', image: '/static/images/farmhouse.webp', supplier: '云上人家山景农庄', tags: ['含双人土菜', '山景餐厅'], farmIds: ['F002'], skus: [{ id: 'P061-2P', name: '双人券', price: 168, cost: 78, stock: 300 }] },
  { id: 'P062', emoji: '🧑‍🌾', name: '稻香村·田园亲子餐券', category: '套餐券', spec: '1大1小/份', price: 128, cost: 55, stock: 260, sales: 52, source: 'farmhouse', status: 'active', image: '/static/images/field.webp', supplier: '稻香村生态农庄', tags: ['亲子餐', '研学配套'], farmIds: ['F003'], skus: [{ id: 'P062-2', name: '1大1小', price: 128, cost: 55, stock: 260 }] },
  { id: 'P063', emoji: '🌙', name: '橘子洲·江畔双人套餐券', category: '套餐券', spec: '2人/份', price: 158, cost: 70, stock: 240, sales: 48, source: 'farmhouse', status: 'active', image: '/static/images/field.webp', supplier: '橘子洲畔农家院', tags: ['江景位', '双人餐'], farmIds: ['F004'], skus: [{ id: 'P063-2P', name: '双人券', price: 158, cost: 70, stock: 240 }] },
  { id: 'P064', emoji: '🏮', name: '韶山·红色家宴套餐券', category: '套餐券', spec: '4人/份', price: 288, cost: 120, stock: 200, sales: 36, source: 'farmhouse', status: 'active', image: '/static/images/farmhouse.webp', supplier: '韶山红色记忆农庄', tags: ['家宴', '红色主题'], farmIds: ['F005'], skus: [{ id: 'P064-4P', name: '四人券', price: 288, cost: 120, stock: 200 }] },
  { id: 'P065', emoji: '🥗', name: '南岳·山野素斋套餐券', category: '套餐券', spec: '2人/份', price: 98, cost: 40, stock: 220, sales: 42, source: 'farmhouse', status: 'active', image: '/static/images/field.webp', supplier: '衡山南岳农家乐', tags: ['素斋', '山野时蔬'], farmIds: ['F006'], skus: [{ id: 'P065-2P', name: '双人券', price: 98, cost: 40, stock: 220 }] },
  { id: 'P066', emoji: '🍵', name: '云溪·茶香套餐券', category: '套餐券', spec: '2人/份', price: 138, cost: 60, stock: 180, sales: 30, source: 'farmhouse', status: 'active', image: '/static/images/tea.webp', supplier: '炎陵云溪农庄', tags: ['茶山景', '双人餐'], farmIds: ['F007'], skus: [{ id: 'P066-2P', name: '双人券', price: 138, cost: 60, stock: 180 }] },
  { id: 'P067', emoji: '🏞', name: '崀山·丹霞家宴券', category: '套餐券', spec: '4人/份', price: 268, cost: 112, stock: 160, sales: 26, source: 'farmhouse', status: 'active', image: '/static/images/mountain.webp', supplier: '邵阳崀山人家', tags: ['丹霞观景', '家宴'], farmIds: ['F009'], skus: [{ id: 'P067-4P', name: '四人券', price: 268, cost: 112, stock: 160 }] },
]

export const selectableProducts: Product[] = products.filter((item) => item.source === 'platform' && item.id !== 'P014')

export const purchaseSupplies: Product[] = [
  { id: 'PP01', emoji: '🧂', name: '餐厨复合调味料 5kg', category: '食材调料', price: 45, cost: 28, stock: 300, sales: 120, source: 'platform', status: 'active', image: '/static/images/chili.webp', supplier: '中台供应链', tags: ['食材调料', '中台甄选'], farmIds: [], skus: [{ id: 'PP01-1', name: '5kg', price: 45, cost: 28, stock: 300 }] },
  { id: 'PP02', emoji: '🛏', name: '民宿一次性洗漱套装', category: '民宿用品', price: 3.5, cost: 1.5, stock: 12000, sales: 600, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '中台供应链', tags: ['民宿用品', '100 套/箱'], farmIds: [], skus: [{ id: 'PP02-1', name: '100 套/箱', price: 3.5, cost: 1.5, stock: 12000 }] },
  { id: 'PP04', emoji: '🍶', name: '本地散装料酒 5L', category: '酒水饮料', price: 36, cost: 22, stock: 500, sales: 300, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '中台供应链', tags: ['酒水饮料', '烹饪用'], farmIds: [], skus: [{ id: 'PP04-1', name: '5L', price: 36, cost: 22, stock: 500 }] },
  { id: 'PP03', emoji: '🥡', name: '环保打包餐盒 ×300', category: '包装耗材', price: 1.2, cost: 0.6, stock: 20000, sales: 800, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '中台供应链', tags: ['包装耗材', '可降解'], farmIds: [], skus: [{ id: 'PP03-1', name: '300只/箱', price: 1.2, cost: 0.6, stock: 20000 }] },
  { id: 'PP05', emoji: '🌾', name: '生态富硒米 25kg', category: '食材调料', price: 230, cost: 168, stock: 200, sales: 150, source: 'platform', status: 'active', image: '/static/images/rice.webp', supplier: '中台供应链', tags: ['食材调料', '产地直发'], farmIds: [], skus: [{ id: 'PP05-1', name: '25kg', price: 230, cost: 168, stock: 200 }] },
  { id: 'PP06', emoji: '🧻', name: '商用厨房纸 ×12 卷', category: '包装耗材', price: 58, cost: 36, stock: 600, sales: 200, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '中台供应链', tags: ['包装耗材', '整箱装'], farmIds: [], skus: [{ id: 'PP06-1', name: '12卷/箱', price: 58, cost: 36, stock: 600 }] }
]

const qualification = (license: string, permit: string, validUntil: string, reviewNote: string): SupplierQualification => ({ businessLicense: license, permit, validUntil, reviewNote })

export const suppliers: Supplier[] = [
  { id: 'S001', emoji: '🏭', name: '靖州杨梅专业合作社', contactPhone: '13973015588', region: '怀化靖州', category: '生鲜农产', certified: false, status: 'pending', productCount: 0, coop: false, qualification: qualification('91431229MA4L8X21', '待补充', '2026-12-31', '等待合作社资质材料核验') },
  { id: 'S002', emoji: '🥓', name: '湘西腊味合作社', contactPhone: '13787366688', region: '湘西州', category: '腊味/预制菜', certified: true, status: 'cooperating', productCount: 32, coop: true, qualification: qualification('91433100MA4L8X21', 'SC10443310001821', '2028-06-30', '证照齐全，年度复核通过') },
  { id: 'S003', emoji: '🍵', name: '安化茶业集团', contactPhone: '13873790012', region: '益阳安化', category: '茶叶/伴手礼', certified: true, status: 'cooperating', productCount: 18, coop: false, qualification: qualification('91430923MA4Q2A18', 'SC11443092300216', '2027-12-31', '生产许可与商标授权已核验') },
  { id: 'S004', emoji: '🍑', name: '炎陵果业有限公司', contactPhone: '13574902233', region: '株洲炎陵', category: '生鲜农产', certified: true, status: 'cooperating', productCount: 9, coop: false, qualification: qualification('91430225MA4R7H09', 'NY4302252026018', '2027-09-15', '产地证明和抽检报告有效') },
  { id: 'S005', emoji: '🏪', name: '县供销社惠农服务中心', contactPhone: '13973615566', region: '常德', category: '综合品类', certified: true, status: 'cooperating', productCount: 46, coop: true, qualification: qualification('91430700MA4T9L31', 'SC12430700000158', '2028-03-31', '供销社体系网点，证照齐全') },
  { id: 'S006', emoji: '🍯', name: '武陵蜂业专业合作社', contactPhone: '13637448899', region: '张家界', category: '蜂蜜/土特产', certified: true, status: 'cooperating', productCount: 6, coop: false, qualification: qualification('93430800MA4P6B17', 'SC12643080000412', '2027-03-20', '最新批次质检报告已通过') },
  { id: 'S007', emoji: '🍶', name: '湘窖酒业经销商', contactPhone: '15080835577', region: '邵阳', category: '酒水饮料', certified: false, status: 'pending', productCount: 0, coop: false, qualification: qualification('91430500MA4R2H09', '资料补充中', '2026-10-31', '缺少酒类流通许可附件') },
  { id: 'S008', emoji: '🐟', name: '洞庭湖水产品合作社', contactPhone: '13774021133', region: '岳阳', category: '生鲜农产', certified: true, status: 'cooperating', productCount: 12, coop: true, qualification: qualification('91430600MA4P9D27', 'SC12443060000365', '2028-05-31', '活鲜冷链资质与质检报告已核验') },
  { id: 'S009', emoji: '🥩', name: '宁乡花猪生态养殖场', contactPhone: '13974886622', region: '长沙宁乡', category: '综合品类', certified: true, status: 'cooperating', productCount: 8, coop: false, qualification: qualification('91430124MA4T1C64', 'SC11443012400981', '2028-01-31', '定点屠宰与防疫合格证明齐全') },
  { id: 'S010', emoji: '🍄', name: '道县瑶山菌业合作社', contactPhone: '15074763399', region: '永州道县', category: '生鲜农产', certified: false, status: 'pending', productCount: 0, coop: false, qualification: qualification('91431124MA4R8F43', '待补充', '2027-03-31', '等待食用菌种植基地资质核验') },
  { id: 'S011', emoji: '🌾', name: '衡阳金雁粮油加工厂', contactPhone: '13873467711', region: '衡阳', category: '综合品类', certified: true, status: 'cooperating', productCount: 15, coop: false, qualification: qualification('91430400MA4L2B19', 'SC12443040001542', '2028-09-30', '粮食加工许可与溯源档案已核验') },
  { id: 'S012', emoji: '🥡', name: '邵阳宝庆预制菜食品厂', contactPhone: '15273908844', region: '邵阳', category: '腊味/预制菜', certified: false, status: 'pending', productCount: 0, coop: false, qualification: qualification('91430502MA4R9H66', '资料补充中', '2027-01-31', '缺少预制菜生产许可附件') },
  { id: 'S013', emoji: '🍅', name: '望城蔬果种植基地', contactPhone: '13873152211', region: '长沙望城', category: '生鲜农产', certified: true, status: 'cooperating', productCount: 10, coop: true, qualification: qualification('91430112MA4Q6C42', 'NY4301122026009', '2028-04-30', '绿色食品认证与基地备案齐全') },
  { id: 'S014', emoji: '🍲', name: '浏阳蒸菜食品厂', contactPhone: '13787183345', region: '长沙浏阳', category: '腊味/预制菜', certified: true, status: 'cooperating', productCount: 14, coop: false, qualification: qualification('91430181MA4M2E87', 'SC11443018100763', '2028-11-30', '蒸菜工艺标准备案有效') },
  { id: 'S015', emoji: '🥒', name: '白关丝瓜种植合作社', contactPhone: '13973365577', region: '株洲芦淞', category: '生鲜农产', certified: false, status: 'pending', productCount: 0, coop: false, qualification: qualification('91430203MA4L9D15', '待补充', '2027-05-31', '等待地理标志授权材料') },
  { id: 'S016', emoji: '🪷', name: '湘潭湘莲食品有限公司', contactPhone: '15073219988', region: '湘潭', category: '综合品类', certified: true, status: 'cooperating', productCount: 7, coop: false, qualification: qualification('91430300MA4R1A56', 'SC11443030000428', '2028-02-28', '莲制品加工许可有效') },
  { id: 'S017', emoji: '🌼', name: '祁东黄花菜产业园', contactPhone: '13875766601', region: '衡阳祁东', category: '生鲜农产', certified: true, status: 'cooperating', productCount: 6, coop: true, qualification: qualification('91430426MA4T3B72', 'NY4304262027003', '2028-06-30', '产地直采协议与质检报告有效') },
  { id: 'S018', emoji: '🌿', name: '邵东中药材合作社', contactPhone: '13647398866', region: '邵阳邵东', category: '综合品类', certified: false, status: 'pending', productCount: 0, coop: false, qualification: qualification('91430521MA4N5F21', '待补充', '2026-12-31', '等待GAP种植基地认证') },
  { id: 'S019', emoji: '🥜', name: '平江豆干食品厂', contactPhone: '13975023310', region: '岳阳平江', category: '综合品类', certified: true, status: 'cooperating', productCount: 11, coop: false, qualification: qualification('91430626MA4L3G58', 'SC11443062600159', '2028-03-31', '豆制品生产许可有效') },
  { id: 'S020', emoji: '🍊', name: '石门柑橘专业合作社', contactPhone: '13787649922', region: '常德石门', category: '生鲜农产', certified: true, status: 'cooperating', productCount: 9, coop: true, qualification: qualification('91430726MA4P2A63', 'NY4307262026005', '2027-10-31', '柑橘出口基地备案有效') },
  { id: 'S021', emoji: '🍃', name: '张家界莓茶产业合作社', contactPhone: '15074421168', region: '张家界永定', category: '茶叶/伴手礼', certified: true, status: 'cooperating', productCount: 8, coop: false, qualification: qualification('91430802MA4R5E91', 'SC11443080200841', '2028-08-31', '莓茶地理标志授权有效') },
  { id: 'S022', emoji: '🦐', name: '南县稻虾合作社', contactPhone: '13873780055', region: '益阳南县', category: '生鲜农产', certified: false, status: 'pending', productCount: 0, coop: false, qualification: qualification('91430921MA4M7H34', '待补充', '2027-06-30', '等待稻虾共作基地认证') },
  { id: 'S023', emoji: '🦆', name: '临武鸭业股份有限公司', contactPhone: '13975702234', region: '郴州临武', category: '腊味/预制菜', certified: true, status: 'cooperating', productCount: 16, coop: true, qualification: qualification('91431025MA4L1B96', 'SC11443102500537', '2028-05-31', '养殖屠宰加工全链资质齐全') },
  { id: 'S024', emoji: '🍠', name: '江永香芋种植基地', contactPhone: '13674661190', region: '永州江永', category: '生鲜农产', certified: true, status: 'cooperating', productCount: 5, coop: false, qualification: qualification('91431125MA4R2D77', 'NY4311252027001', '2027-09-30', '香芋绿色种植认证有效') },
  { id: 'S025', emoji: '🥝', name: '麻阳冰糖橙合作社', contactPhone: '15074538812', region: '怀化麻阳', category: '生鲜农产', certified: false, status: 'pending', productCount: 0, coop: false, qualification: qualification('91431226MA4P8B23', '待补充', '2027-02-28', '等待冰糖橙商标授权') },
  { id: 'S026', emoji: '🌶', name: '双峰辣酱世家', contactPhone: '13873895544', region: '娄底双峰', category: '综合品类', certified: true, status: 'cooperating', productCount: 6, coop: false, qualification: qualification('91431321MA4M6A18', 'SC11443132100462', '2028-01-31', '酱料加工非遗工艺备案') },
  { id: 'S027', emoji: '🍵', name: '古丈毛尖茶厂', contactPhone: '13787932260', region: '湘西古丈', category: '茶叶/伴手礼', certified: true, status: 'cooperating', productCount: 7, coop: false, qualification: qualification('91433126MA4L2C84', 'SC11443312600173', '2028-07-31', '绿茶生产许可有效') },
  { id: 'S028', emoji: '🥘', name: '长沙马王堆预制菜工厂', contactPhone: '15273146688', region: '长沙芙蓉', category: '腊味/预制菜', certified: true, status: 'paused', productCount: 3, coop: false, qualification: qualification('91430102MA4T5A39', 'SC11443010200691', '2027-08-31', '暂停止产整改中') },
  { id: 'S029', emoji: '🍑', name: '炎陵黄桃第二基地', contactPhone: '13974109925', region: '株洲炎陵', category: '生鲜农产', certified: true, status: 'paused', productCount: 2, coop: false, qualification: qualification('91430225MA4R8K52', 'NY4302252026015', '2027-07-31', '基地升级改造中') },
  { id: 'S030', emoji: '🍠', name: '耒阳红薯粉加工厂', contactPhone: '13677445532', region: '衡阳耒阳', category: '综合品类', certified: false, status: 'pending', productCount: 0, coop: false, qualification: qualification('91430481MA4M3E67', '待补充', '2027-04-30', '等待淀粉加工许可') },
  { id: 'S031', emoji: '🍗', name: '武冈卤味食品有限公司', contactPhone: '13787963378', region: '邵阳武冈', category: '腊味/预制菜', certified: true, status: 'cooperating', productCount: 12, coop: false, qualification: qualification('91430581MA4L7D92', 'SC11443058100318', '2028-10-31', '卤制品SC与门店备案齐全') },
  { id: 'S032', emoji: '🍵', name: '君山银针茶业', contactPhone: '15073089913', region: '岳阳君山', category: '茶叶/伴手礼', certified: true, status: 'cooperating', productCount: 6, coop: false, qualification: qualification('91430611MA4P1B45', 'SC11443061100724', '2028-09-30', '黄茶生产许可有效') },
  { id: 'S033', emoji: '🐢', name: '汉寿甲鱼养殖基地', contactPhone: '13875624407', region: '常德汉寿', category: '生鲜农产', certified: false, status: 'pending', productCount: 0, coop: false, qualification: qualification('91430722MA4R3E58', '待补充', '2027-03-31', '等待水产品质检报告') },
  { id: 'S034', emoji: '🍯', name: '桑植蜂蜜养殖合作社', contactPhone: '13974456621', region: '张家界桑植', category: '蜂蜜/土特产', certified: true, status: 'cooperating', productCount: 4, coop: false, qualification: qualification('91430822MA4M9B16', 'SC11443082200295', '2028-03-31', '蜂产品生产许可有效') },
  { id: 'S035', emoji: '🎋', name: '沅江芦笋合作社', contactPhone: '15274732258', region: '益阳沅江', category: '生鲜农产', certified: false, status: 'pending', productCount: 0, coop: false, qualification: qualification('91430981MA4T1H27', '待补充', '2027-01-31', '等待洞庭湖湿地种植备案') },
  { id: 'S036', emoji: '🍜', name: '祁阳米粉食品厂', contactPhone: '13874693370', region: '永州祁阳', category: '综合品类', certified: true, status: 'cooperating', productCount: 8, coop: false, qualification: qualification('91430421MA4Q7F83', 'SC11443042100638', '2028-12-31', '米粉制品SC有效') },
]

export const dictGroups: DictGroup[] = [
  { id: 'DG01', type: 'city', name: '城市信息' },
  { id: 'DG02', type: 'afterSaleReason', name: '售后原因' },
  { id: 'DG03', type: 'supplierStatus', name: '供应商状态' },
  { id: 'DG04', type: 'productStatus', name: '商品状态' },
  { id: 'DG05', type: 'farmStatus', name: '门店状态' },
  { id: 'DG06', type: 'orderStatus', name: '订单状态' },
  { id: 'DG07', type: 'afterSaleStatus', name: '售后状态' },
  { id: 'DG08', type: 'promoterStatus', name: '推客状态' },
  { id: 'DG09', type: 'settlementStatus', name: '结算状态' },
  { id: 'DG10', type: 'unit', name: '商品单位' },
  { id: 'DG11', type: 'logistics', name: '物流公司' },
]

export const dictItems: DictItem[] = [
  { id: 'DIC01', type: 'city', code: '湘西州', label: '湘西州', enabled: true, sort: 1 },
  { id: 'DIC02', type: 'city', code: '张家界市', label: '张家界市', enabled: true, sort: 2 },
  { id: 'DIC03', type: 'city', code: '常德市', label: '常德市', enabled: true, sort: 3 },
  { id: 'DIC04', type: 'city', code: '长沙市', label: '长沙市', enabled: true, sort: 4 },
  { id: 'DIC05', type: 'city', code: '湘潭市', label: '湘潭市', enabled: true, sort: 5 },
  { id: 'DIC06', type: 'city', code: '株洲市', label: '株洲市', enabled: true, sort: 6 },
  { id: 'DIC07', type: 'city', code: '怀化市', label: '怀化市', enabled: true, sort: 7 },
  { id: 'DIC08', type: 'city', code: '益阳市', label: '益阳市', enabled: true, sort: 8 },
  { id: 'DIC09', type: 'city', code: '邵阳市', label: '邵阳市', enabled: true, sort: 9 },
  { id: 'DIC10', type: 'city', code: '衡阳市', label: '衡阳市', enabled: true, sort: 10 },
  { id: 'DIC11', type: 'city', code: '岳阳市', label: '岳阳市', enabled: true, sort: 11 },
  { id: 'DIC12', type: 'city', code: '娄底市', label: '娄底市', enabled: true, sort: 12 },
  { id: 'DIC13', type: 'city', code: '郴州市', label: '郴州市', enabled: true, sort: 13 },
  { id: 'DIC14', type: 'city', code: '永州市', label: '永州市', enabled: true, sort: 14 },
  { id: 'DIR01', type: 'afterSaleReason', code: 'transport', label: '运输破损', enabled: true, sort: 1 },
  { id: 'DIR02', type: 'afterSaleReason', code: 'quality', label: '质量问题', enabled: true, sort: 2 },
  { id: 'DIR03', type: 'afterSaleReason', code: 'seven-day', label: '七天无理由', enabled: true, sort: 3 },
  { id: 'DIR04', type: 'afterSaleReason', code: 'shortage', label: '少发漏发', enabled: true, sort: 4 },
  { id: 'DIR05', type: 'afterSaleReason', code: 'taste', label: '口感风味不符', enabled: true, sort: 5 },
  { id: 'DIR06', type: 'afterSaleReason', code: 'cancel', label: '预约取消', enabled: true, sort: 6 },
  { id: 'DIR07', type: 'afterSaleReason', code: 'other', label: '其他', enabled: true, sort: 7 },
  { id: 'DISS01', type: 'supplierStatus', code: 'pending', label: '待处理', enabled: true, sort: 1 },
  { id: 'DISS02', type: 'supplierStatus', code: 'cooperating', label: '合作中', enabled: true, sort: 2 },
  { id: 'DISS03', type: 'supplierStatus', code: 'paused', label: '已暂停', enabled: true, sort: 3 },
  { id: 'DISS04', type: 'supplierStatus', code: 'rejected', label: '已驳回', enabled: true, sort: 4 },
  { id: 'DISP01', type: 'productStatus', code: 'pending', label: '待审核', enabled: true, sort: 1 },
  { id: 'DISP02', type: 'productStatus', code: 'active', label: '已上架', enabled: true, sort: 2 },
  { id: 'DISP03', type: 'productStatus', code: 'offline', label: '已下架', enabled: true, sort: 3 },
  { id: 'DISP04', type: 'productStatus', code: 'rejected', label: '已驳回', enabled: true, sort: 4 },
  { id: 'DISF01', type: 'farmStatus', code: 'pending', label: '筹备中', enabled: true, sort: 1 },
  { id: 'DISF02', type: 'farmStatus', code: 'active', label: '经营中', enabled: true, sort: 2 },
  { id: 'DISF03', type: 'farmStatus', code: 'paused', label: '已停用', enabled: true, sort: 3 },
  { id: 'DISO01', type: 'orderStatus', code: 'pending', label: '待发货', enabled: true, sort: 1 },
  { id: 'DISO02', type: 'orderStatus', code: 'shipping', label: '已发货', enabled: true, sort: 2 },
  { id: 'DISO03', type: 'orderStatus', code: 'delivered', label: '已完成', enabled: true, sort: 3 },
  { id: 'DISO04', type: 'orderStatus', code: 'after-sale', label: '售后中', enabled: true, sort: 4 },
  { id: 'DISO05', type: 'orderStatus', code: 'paid-cancelled', label: '已支付取消', enabled: true, sort: 5 },
  { id: 'DISO06', type: 'orderStatus', code: 'unpaid-cancelled', label: '未支付取消', enabled: true, sort: 6 },
  { id: 'DISA01', type: 'afterSaleStatus', code: 'processing', label: '售后中', enabled: true, sort: 1 },
  { id: 'DISA02', type: 'afterSaleStatus', code: 'rejected', label: '售后拒绝', enabled: true, sort: 2 },
  { id: 'DISA03', type: 'afterSaleStatus', code: 'refund-pending', label: '待退款', enabled: true, sort: 3 },
  { id: 'DISA04', type: 'afterSaleStatus', code: 'return-pending', label: '待退货', enabled: true, sort: 4 },
  { id: 'DISA05', type: 'afterSaleStatus', code: 'refunded', label: '已退款', enabled: true, sort: 5 },
  { id: 'DISA06', type: 'afterSaleStatus', code: 'refund-failed', label: '退款失败', enabled: true, sort: 6 },
  { id: 'DIPR01', type: 'promoterStatus', code: 'active', label: '启用', enabled: true, sort: 1 },
  { id: 'DIPR02', type: 'promoterStatus', code: 'paused', label: '停用', enabled: true, sort: 2 },
  { id: 'DIPR03', type: 'promoterStatus', code: 'pending', label: '待审核', enabled: true, sort: 3 },
  { id: 'DISE01', type: 'settlementStatus', code: 'settled', label: '已结算', enabled: true, sort: 1 },
  { id: 'DISE02', type: 'settlementStatus', code: 'pending', label: '待结算', enabled: true, sort: 2 },
  { id: 'DISE03', type: 'settlementStatus', code: 'processing', label: '处理中', enabled: true, sort: 3 },
  { id: 'DICU01', type: 'unit', code: 'jin', label: '斤', enabled: true, sort: 1 },
  { id: 'DICU02', type: 'unit', code: 'bag', label: '袋', enabled: true, sort: 2 },
  { id: 'DICU03', type: 'unit', code: 'box', label: '盒', enabled: true, sort: 3 },
  { id: 'DICU04', type: 'unit', code: 'carton', label: '箱', enabled: true, sort: 4 },
  { id: 'DICU05', type: 'unit', code: 'piece', label: '件', enabled: true, sort: 5 },
  { id: 'DICU06', type: 'unit', code: 'portion', label: '份', enabled: true, sort: 6 },
  { id: 'DICU07', type: 'unit', code: 'bottle', label: '瓶', enabled: true, sort: 7 },
  { id: 'DICU08', type: 'unit', code: 'jar', label: '罐', enabled: true, sort: 8 },
  { id: 'DICU09', type: 'unit', code: 'barrel', label: '桶', enabled: true, sort: 9 },
  { id: 'DICU10', type: 'unit', code: 'strip', label: '条', enabled: true, sort: 10 },
  { id: 'DICL01', type: 'logistics', code: 'sf', label: '顺丰速运', enabled: true, sort: 1 },
  { id: 'DICL02', type: 'logistics', code: 'zt', label: '中通快递', enabled: true, sort: 2 },
  { id: 'DICL03', type: 'logistics', code: 'yt', label: '圆通速递', enabled: true, sort: 3 },
  { id: 'DICL04', type: 'logistics', code: 'yd', label: '韵达快递', enabled: true, sort: 4 },
  { id: 'DICL05', type: 'logistics', code: 'jd', label: '京东物流', enabled: true, sort: 5 },
  { id: 'DICL06', type: 'logistics', code: 'ems', label: '邮政EMS', enabled: true, sort: 6 },
  { id: 'DICL07', type: 'logistics', code: 'db', label: '德邦快递', enabled: true, sort: 7 },
  { id: 'DICL08', type: 'logistics', code: 'jitu', label: '极兔速递', enabled: true, sort: 8 },
  { id: 'DICL09', type: 'logistics', code: 'cainiao', label: '菜鸟裹裹', enabled: true, sort: 9 },
  { id: 'DICL10', type: 'logistics', code: 'huolala', label: '货拉拉', enabled: true, sort: 10 }
]

export const storeAccounts: StoreAccount[] = [
  { id: 'SA001', farmId: 'F001', name: '王店长', account: '13800000001', password: '123456', role: 'owner', enabled: true, createdAt: '2026-08-01 09:00' },
  { id: 'SA002', farmId: 'F001', name: '李店员', account: '13800000002', password: '123456', role: 'staff', enabled: true, promoEnabled: true, createdAt: '2026-08-01 09:00' },
  { id: 'SA003', farmId: 'F002', name: '张店长', account: '13800000003', password: '123456', role: 'owner', enabled: true, createdAt: '2026-08-01 09:00' },
  { id: 'SA004', farmId: 'F003', name: '王店长', account: '13800000004', password: '123456', role: 'owner', enabled: true, createdAt: '2026-08-02 10:00' },
  { id: 'SA005', farmId: 'F003', name: '李店员', account: '13800000005', password: '123456', role: 'staff', enabled: true, createdAt: '2026-08-02 10:00' },
  { id: 'SA006', farmId: 'F002', name: '赵店长', account: '13800000006', password: '123456', role: 'owner', enabled: true, createdAt: '2026-08-03 09:30' },
  { id: 'SA007', farmId: 'F005', name: '孙店长', account: '13800000007', password: '123456', role: 'owner', enabled: false, createdAt: '2026-08-04 14:20' },
  { id: 'SA008', farmId: 'F007', name: '周店员', account: '13800000008', password: '123456', role: 'staff', enabled: true, createdAt: '2026-08-05 11:10' },
  { id: 'SA009', farmId: 'F006', name: '刘店长', account: '13800000009', password: '123456', role: 'owner', enabled: true, createdAt: '2026-08-06 09:40' },
  { id: 'SA010', farmId: 'F008', name: '黄店长', account: '13800000010', password: '123456', role: 'owner', enabled: true, createdAt: '2026-08-06 10:20' },
  { id: 'SA011', farmId: 'F009', name: '陈店员', account: '13800000011', password: '123456', role: 'staff', enabled: true, createdAt: '2026-08-07 14:00' },
  { id: 'SA012', farmId: 'F011', name: '杨店长', account: '13800000012', password: '123456', role: 'owner', enabled: true, createdAt: '2026-08-07 15:30' },
  { id: 'SA013', farmId: 'F013', name: '罗店员', account: '13800000013', password: '123456', role: 'staff', enabled: true, createdAt: '2026-08-08 09:10' },
  { id: 'SA014', farmId: 'F015', name: '何店长', account: '13800000014', password: '123456', role: 'owner', enabled: false, createdAt: '2026-08-08 11:40' },
  { id: 'SA015', farmId: 'F016', name: '蒋店长', account: '13800000015', password: '123456', role: 'owner', enabled: true, createdAt: '2026-08-09 10:00' },
  { id: 'SA016', farmId: 'F018', name: '邓店员', account: '13800000016', password: '123456', role: 'staff', enabled: true, createdAt: '2026-08-09 16:20' },
  { id: 'SA017', farmId: 'F020', name: '曹店长', account: '13800000017', password: '123456', role: 'owner', enabled: true, createdAt: '2026-08-10 09:50' },
  { id: 'SA018', farmId: 'F022', name: '袁店员', account: '13800000018', password: '123456', role: 'staff', enabled: true, createdAt: '2026-08-10 13:30' },
  { id: 'SA019', farmId: 'F024', name: '谢店长', account: '13800000019', password: '123456', role: 'owner', enabled: true, createdAt: '2026-08-11 10:10' },
  { id: 'SA020', farmId: 'F026', name: '谭店长', account: '13800000020', password: '123456', role: 'owner', enabled: false, createdAt: '2026-08-11 15:00' }
]

export const categories: Category[] = [
  { id: 'C001', name: '农产品', type: 'product' },
  { id: 'C002', name: '预制菜', type: 'product' },
  { id: 'C003', name: '食材调料', type: 'product' },
  { id: 'C004', name: '文旅伴手礼', type: 'product' },
  { id: 'C005', name: '民宿用品', type: 'product' },
  { id: 'C006', name: '包装耗材', type: 'product' },
  { id: 'C007', name: '土特产', type: 'product' },
  { id: 'C008', name: '伴手礼', type: 'product' },
  { id: 'C009', name: '套餐券', type: 'product' },
  { id: 'C010', name: '腊味/预制菜', type: 'supplier' },
  { id: 'C011', name: '茶叶/伴手礼', type: 'supplier' },
  { id: 'C012', name: '蜂蜜/土特产', type: 'supplier' },
  { id: 'C013', name: '综合品类', type: 'supplier' },
  { id: 'C014', name: '生鲜农产', type: 'general' },
  { id: 'C015', name: '酒水饮料', type: 'general' },
  { id: 'C016', name: '有机蔬菜', type: 'product' },
  { id: 'C017', name: '时令水果', type: 'product' },
  { id: 'C018', name: '粮油米面', type: 'product' },
  { id: 'C019', name: '水产养殖', type: 'supplier' },
  { id: 'C020', name: '蔬菜种植', type: 'supplier' },
  { id: 'C021', name: '禽蛋养殖', type: 'supplier' },
  { id: 'C022', name: '农家体验', type: 'general' },
  { id: 'C023', name: '露营烧烤', type: 'general' },
  { id: 'C024', name: '研学亲子', type: 'general' }
]

export const farms: FarmStore[] = [
  { id: 'F001', core: true, emoji: '🏡', adminDesc: '样板店 · 柴火土菜', name: '石板溪农家乐', region: '湘西州永顺县', city: '湘西州', availability: 'bookable', livePopularity: 9842, distance: 0.8, rating: 4.9, monthlySales: 1280, averageSpend: 78, status: 'active', selectedCount: 86, gmv: 42860, image: '/static/images/farmhouse.webp', tags: ['柴火土菜', '临溪包厢', '可直播'], storeTags: ['柴火土灶', '山泉养鱼', '亲子研学'] },
  { id: 'F002', core: true, emoji: '⛰', adminDesc: '山景民宿', name: '云上人家山景农庄', region: '张家界永定区', city: '张家界市', availability: 'bookable', livePopularity: 8657, distance: 1.1, rating: 4.8, monthlySales: 960, averageSpend: 120, status: 'active', selectedCount: 64, gmv: 38420, image: '/static/images/mountain.webp', tags: ['山景民宿', '家宴大厅'] },
  { id: 'F003', core: true, emoji: '🌾', adminDesc: '亲子研学', name: '稻香村生态农庄', region: '常德桃源县', city: '常德市', availability: 'full', livePopularity: 7321, distance: 1.6, rating: 4.7, monthlySales: 720, averageSpend: 65, status: 'active', selectedCount: 52, gmv: 31200, image: '/static/images/field.webp', tags: ['亲子研学', '研学基地'] },
  { id: 'F004', core: true, emoji: '🍊', name: '橘子洲畔农家院', region: '长沙湘江新区', city: '长沙市', availability: 'bookable', livePopularity: 6890, distance: 2.0, rating: 4.6, monthlySales: 680, averageSpend: 88, status: 'active', selectedCount: 40, gmv: 26800, image: '/static/images/field.webp', tags: ['湘江夜景', '江畔餐厅'] },
  { id: 'F005', core: true, emoji: '🏮', adminDesc: '红色研学', name: '韶山红色记忆农庄', region: '湘潭韶山市', city: '湘潭市', availability: 'closed', livePopularity: 6204, distance: 3.5, rating: 4.7, monthlySales: 610, averageSpend: 68, status: 'pending', selectedCount: 12, gmv: 0, image: '/static/images/field.webp', tags: ['红色研学'] },
  { id: 'F006', emoji: '⛰', adminDesc: '南岳祈福 · 山野土菜', name: '衡山南岳农家乐', region: '衡阳市南岳区', city: '衡阳市', availability: 'bookable', livePopularity: 5210, distance: 2.6, rating: 4.6, monthlySales: 520, averageSpend: 72, status: 'active', selectedCount: 28, gmv: 18900, image: '/static/images/mountain.webp', tags: ['南岳祈福', '山野土菜'] },
  { id: 'F007', emoji: '🍵', adminDesc: '云溪茶香 · 山野民宿', name: '炎陵云溪农庄', region: '株洲炎陵县', city: '株洲市', availability: 'bookable', livePopularity: 4680, distance: 3.1, rating: 4.5, monthlySales: 430, averageSpend: 66, status: 'active', selectedCount: 22, gmv: 15200, image: '/static/images/tea.webp', tags: ['茶山民宿', '云海日出'] },
  { id: 'F008', emoji: '🐟', adminDesc: '洞庭湖畔 · 全鱼宴', name: '岳阳洞庭渔村', region: '岳阳市君山区', city: '岳阳市', availability: 'full', livePopularity: 3980, distance: 4.2, rating: 4.4, monthlySales: 360, averageSpend: 88, status: 'pending', selectedCount: 10, gmv: 0, image: '/static/images/field.webp', tags: ['全鱼宴', '湖景'] },
  { id: 'F009', emoji: '🏞', adminDesc: '崀山丹霞人家', name: '邵阳崀山人家', region: '邵阳市新宁县', city: '邵阳市', availability: 'bookable', livePopularity: 4520, distance: 2.9, rating: 4.7, monthlySales: 470, averageSpend: 70, status: 'active', selectedCount: 26, gmv: 17600, image: '/static/images/farmhouse.webp', tags: ['丹霞风光', '柴火饭'] },
  { id: 'F010', emoji: '🍃', adminDesc: '安化茶乡小院', name: '益阳安化茶乡小院', region: '益阳市安化县', city: '益阳市', availability: 'closed', livePopularity: 2150, distance: 5.0, rating: 4.3, monthlySales: 280, averageSpend: 60, status: 'paused', selectedCount: 8, gmv: 0, image: '/static/images/tea.webp', tags: ['黑茶体验', '民宿'] },
  { id: 'F011', emoji: '🐠', adminDesc: '侗寨风味 · 河鲜码头', name: '怀化侗乡渔寨', region: '怀化市洪江区', city: '怀化市', availability: 'bookable', livePopularity: 3320, distance: 3.8, rating: 4.5, monthlySales: 410, averageSpend: 76, status: 'active', selectedCount: 18, gmv: 14200, image: '/static/images/field.webp', tags: ['侗寨风情', '河鲜'] },
  { id: 'F012', emoji: '🌶', adminDesc: '十八洞苗家院 · 筹备中', name: '湘西十八洞苗家院', region: '湘西州花垣县', city: '湘西州', availability: 'closed', livePopularity: 1860, distance: 6.2, rating: 4.4, monthlySales: 0, averageSpend: 0, status: 'pending', selectedCount: 6, gmv: 0, image: '/static/images/farmhouse.webp', tags: ['苗家酸汤', '即将开业'] },
  { id: 'F013', emoji: '🪷', adminDesc: '柳叶湖景 · 荷香餐厅', name: '常德柳叶湖荷香农庄', region: '常德市武陵区', city: '常德市', availability: 'bookable', livePopularity: 2980, distance: 2.8, rating: 4.6, monthlySales: 520, averageSpend: 82, status: 'active', selectedCount: 24, gmv: 19800, image: '/static/images/mountain.webp', tags: ['湖景餐厅', '荷塘月色'] },
  { id: 'F014', emoji: '🏞', adminDesc: '神农谷林间民宿', name: '株洲神农谷山居', region: '株洲市炎陵县', city: '株洲市', availability: 'closed', livePopularity: 1520, distance: 4.6, rating: 4.3, monthlySales: 0, averageSpend: 0, status: 'paused', selectedCount: 5, gmv: 0, image: '/static/images/field.webp', tags: ['森林康养', '暂停营业'] },
  { id: 'F015', emoji: '🐔', adminDesc: '乌石山野土鸡庄', name: '湘潭乌石土鸡农庄', region: '湘潭市湘潭县', city: '湘潭市', availability: 'bookable', livePopularity: 2650, distance: 3.4, rating: 4.5, monthlySales: 380, averageSpend: 68, status: 'active', selectedCount: 16, gmv: 12800, image: '/static/images/farmhouse.webp', tags: ['散养土鸡', '柴火灶'] },
  { id: 'F016', emoji: '🐟', adminDesc: '捞刀河畔 · 渔家土菜', name: '长沙捞刀河渔家乐', region: '长沙市开福区', city: '长沙市', availability: 'bookable', livePopularity: 3860, distance: 2.4, rating: 4.6, monthlySales: 460, averageSpend: 82, status: 'active', selectedCount: 22, gmv: 17600, image: '/static/images/field.webp', tags: ['河鲜渔家', '临水包厢'] },
  { id: 'F017', emoji: '⛰', adminDesc: '酒埠江山水人家', name: '株洲酒埠江山水农庄', region: '株洲市攸县', city: '株洲市', availability: 'bookable', livePopularity: 2460, distance: 3.6, rating: 4.4, monthlySales: 320, averageSpend: 70, status: 'active', selectedCount: 14, gmv: 11600, image: '/static/images/mountain.webp', tags: ['水库鱼', '山水民宿'] },
  { id: 'F018', emoji: '🏘', adminDesc: '古村人家 · 明清院落', name: '岳阳张谷英古村农家', region: '岳阳市岳阳县', city: '岳阳市', availability: 'bookable', livePopularity: 3120, distance: 3.9, rating: 4.6, monthlySales: 440, averageSpend: 76, status: 'active', selectedCount: 20, gmv: 15200, image: '/static/images/farmhouse.webp', tags: ['古村文化', '土灶菜'] },
  { id: 'F019', emoji: '🌄', adminDesc: '祝融峰下 · 云海人家', name: '衡山祝融云海人家', region: '衡阳市南岳区', city: '衡阳市', availability: 'bookable', livePopularity: 3540, distance: 3.0, rating: 4.7, monthlySales: 500, averageSpend: 74, status: 'active', selectedCount: 24, gmv: 18400, image: '/static/images/mountain.webp', tags: ['云海日出', '衡山土菜'] },
  { id: 'F020', emoji: '🏞', adminDesc: '东江湖畔 · 渔村人家', name: '郴州东江湖人家', region: '郴州市资兴市', city: '郴州市', availability: 'bookable', livePopularity: 4280, distance: 3.2, rating: 4.7, monthlySales: 540, averageSpend: 86, status: 'active', selectedCount: 26, gmv: 21000, image: '/static/images/field.webp', tags: ['东江湖鲜', '环湖民宿'] },
  { id: 'F021', emoji: '🛖', adminDesc: '九嶷山麓 · 瑶寨风情', name: '永州九嶷山瑶寨', region: '永州市宁远县', city: '永州市', availability: 'bookable', livePopularity: 2680, distance: 4.1, rating: 4.5, monthlySales: 360, averageSpend: 66, status: 'active', selectedCount: 16, gmv: 12800, image: '/static/images/farmhouse.webp', tags: ['瑶家油茶', '长桌宴'] },
  { id: 'F022', emoji: '🌾', adminDesc: '紫鹊界梯田人家', name: '娄底紫鹊界梯田农庄', region: '娄底市新化县', city: '娄底市', availability: 'bookable', livePopularity: 2980, distance: 4.4, rating: 4.6, monthlySales: 420, averageSpend: 72, status: 'active', selectedCount: 18, gmv: 15800, image: '/static/images/field.webp', tags: ['梯田风光', '柴火腊肉'] },
  { id: 'F023', emoji: '🏜', adminDesc: '崀山丹霞客栈', name: '邵阳崀山丹霞客栈', region: '邵阳市新宁县', city: '邵阳市', availability: 'closed', livePopularity: 2240, distance: 3.7, rating: 4.4, monthlySales: 0, averageSpend: 0, status: 'pending', selectedCount: 8, gmv: 0, image: '/static/images/mountain.webp', tags: ['丹霞奇观', '即将开业'] },
  { id: 'F024', emoji: '🏮', adminDesc: '洪江古商城驿站', name: '怀化洪江古商城驿站', region: '怀化市洪江区', city: '怀化市', availability: 'bookable', livePopularity: 2760, distance: 3.5, rating: 4.5, monthlySales: 400, averageSpend: 78, status: 'active', selectedCount: 18, gmv: 14600, image: '/static/images/farmhouse.webp', tags: ['古商城', '明清客栈'] },
  { id: 'F025', emoji: '🦢', adminDesc: '白马湖畔 · 田园餐厅', name: '常德桃源白马湖农庄', region: '常德市桃源县', city: '常德市', availability: 'bookable', livePopularity: 2320, distance: 2.7, rating: 4.5, monthlySales: 380, averageSpend: 70, status: 'active', selectedCount: 16, gmv: 13800, image: '/static/images/field.webp', tags: ['田园风光', '土家腊肉'] },
  { id: 'F026', emoji: '🏞', adminDesc: '武陵源溪畔小院', name: '张家界武陵源溪畔院', region: '张家界市武陵源区', city: '张家界市', availability: 'bookable', livePopularity: 4120, distance: 2.2, rating: 4.7, monthlySales: 520, averageSpend: 90, status: 'active', selectedCount: 26, gmv: 19600, image: '/static/images/mountain.webp', tags: ['溪畔民宿', '张家界景'] },
  { id: 'F027', emoji: '🎋', adminDesc: '芦花小院 · 洞庭人家', name: '益阳沅江芦花小院', region: '益阳市沅江市', city: '益阳市', availability: 'closed', livePopularity: 1680, distance: 4.8, rating: 4.3, monthlySales: 0, averageSpend: 0, status: 'pending', selectedCount: 6, gmv: 0, image: '/static/images/field.webp', tags: ['芦苇荡', '筹备中'] },
  { id: 'F028', emoji: '🏔', adminDesc: '矮寨大桥 · 峡谷人家', name: '湘西矮寨峡谷人家', region: '湘西州吉首市', city: '湘西州', availability: 'bookable', livePopularity: 3480, distance: 2.9, rating: 4.6, monthlySales: 480, averageSpend: 74, status: 'active', selectedCount: 22, gmv: 17200, image: '/static/images/farmhouse.webp', tags: ['峡谷风光', '苗家酸汤'] },
  { id: 'F029', emoji: '🌉', adminDesc: '窑湾江畔 · 夜泊人家', name: '湘潭窑湾江畔农庄', region: '湘潭市雨湖区', city: '湘潭市', availability: 'closed', livePopularity: 1420, distance: 3.3, rating: 4.2, monthlySales: 0, averageSpend: 0, status: 'paused', selectedCount: 4, gmv: 0, image: '/static/images/field.webp', tags: ['江畔夜景', '暂停营业'] },
  { id: 'F030', emoji: '🪷', adminDesc: '洋湖湿地 · 荷塘月色', name: '长沙洋湖荷塘月色院', region: '长沙市岳麓区', city: '长沙市', availability: 'closed', livePopularity: 1980, distance: 2.6, rating: 4.4, monthlySales: 0, averageSpend: 0, status: 'pending', selectedCount: 10, gmv: 0, image: '/static/images/field.webp', tags: ['湿地公园', '荷塘餐厅'] },
]

export const orders: Order[] = [
  { id: 'NJ202608110928', productName: '炎陵黄桃礼盒', quantity: 2, amount: 136, customer: '石板溪农家乐', channel: 'live', status: 'pending', createdAt: '2026-08-11 09:28', supplierId: 'S004', items: [{ productId: 'P002', skuId: 'P002-5J', name: '炎陵黄桃 5斤礼盒', skuName: '5斤礼盒', image: '/static/images/peach.webp', quantity: 2, price: 68 }], flow: [{ time: '2026-08-11 09:28', action: '用户下单', operator: '石板溪农家乐' }, { time: '2026-08-11 09:28', action: '订单支付成功', operator: '石板溪农家乐' }] },
  { id: 'NJ202608110915', productName: '湘西烟熏柴火腊肉', quantity: 5, amount: 277.7, customer: '云上人家山景农庄', channel: 'shop', status: 'pending', createdAt: '2026-08-11 09:15', supplierId: 'S002', items: [{ productId: 'P001', skuId: 'P001-500', name: '湘西烟熏柴火腊肉 500g', skuName: '500g', image: '/static/images/bacon.webp', quantity: 3, price: 59.9 }, { productId: 'P009', skuId: 'P009-1', name: '招牌酱板鸭 整只装', skuName: '整只装', image: '/static/images/bacon.webp', quantity: 2, price: 49 }] },
  { id: 'NJ202608110903', productName: '民宿一次性洗漱套装', quantity: 200, amount: 360, customer: '云上人家山景农庄', channel: 'purchase', status: 'shipping', createdAt: '2026-08-11 09:03', supplierId: 'S005', items: [{ productId: 'P014', skuId: 'P014-100', name: '民宿一次性洗漱套装', skuName: '100套/箱', image: '/static/images/field.webp', quantity: 200, price: 1.8 }], flow: [{ time: '2026-08-11 09:03', action: '用户下单', operator: '云上人家山景农庄' }, { time: '2026-08-11 09:03', action: '订单支付成功', operator: '云上人家山景农庄' }, { time: '2026-08-11 09:03', action: '已发货 · 已安排司机配送', operator: '运营管理员' }] },
  { id: 'NJ202608110851', productName: '安化黑茶礼盒', quantity: 1, amount: 128, customer: '联盟推客 · 张同学', channel: 'live', status: 'shipping', createdAt: '2026-08-11 08:51', supplierId: 'S003', items: [{ productId: 'P003', skuId: 'P003-GIFT', name: '安化黑茶礼盒装', skuName: '雅藏礼盒', image: '/static/images/tea.webp', quantity: 1, price: 128 }] },
  { id: 'NJ202608110842', productName: '武陵山野生土蜂蜜', quantity: 3, amount: 264, customer: '稻香村生态农庄', channel: 'shop', status: 'delivered', createdAt: '2026-08-11 08:42', supplierId: 'S006', items: [{ productId: 'P005', skuId: 'P005-500', name: '武陵山野生土蜂蜜 500g', skuName: '500g', image: '/static/images/honey.webp', quantity: 3, price: 88 }], flow: [{ time: '2026-08-11 08:42', action: '用户下单', operator: '稻香村生态农庄' }, { time: '2026-08-11 08:42', action: '订单支付成功', operator: '稻香村生态农庄' }, { time: '2026-08-11 08:42', action: '已发货 · 已安排司机配送', operator: '运营管理员' }, { time: '2026-08-11 08:42', action: '已确认收货', operator: '运营管理员' }] },
  { id: 'NJ202608121030', productName: '湘西烟熏柴火腊肉', quantity: 6, amount: 359.4, customer: '石板溪农家乐', channel: 'shop', status: 'pending', createdAt: '2026-08-12 10:30', supplierId: 'S002', items: [{ productId: 'P001', skuId: 'P001-500', name: '湘西烟熏柴火腊肉 500g', skuName: '500g', image: '/static/images/bacon.webp', quantity: 6, price: 59.9 }] },
  { id: 'NJ202608121015', productName: '安化黑茶礼盒装', quantity: 2, amount: 256, customer: '云上人家山景农庄', channel: 'purchase', status: 'unpaid-cancelled', createdAt: '2026-08-12 10:15', supplierId: 'S003', items: [{ productId: 'P003', skuId: 'P003-GIFT', name: '安化黑茶礼盒装', skuName: '雅藏礼盒', image: '/static/images/tea.webp', quantity: 2, price: 128 }], flow: [{ time: '2026-08-12 10:15', action: '用户下单', operator: '云上人家山景农庄' }, { time: '2026-08-12 10:15', action: '未支付取消', operator: '云上人家山景农庄' }] },
  { id: 'NJ202608120958', productName: '洞庭湖风干刁子鱼', quantity: 10, amount: 428, customer: '联盟推客 · 苗家阿妹', channel: 'live', status: 'shipping', createdAt: '2026-08-12 09:58', supplierId: 'S008', trackingNo: 'SF1493208660121', items: [{ productId: 'P016', skuId: 'P016-400', name: '洞庭湖风干刁子鱼 400g', skuName: '400g', image: '/static/images/field.webp', quantity: 10, price: 42.8 }] },
  { id: 'NJ202608120945', productName: '民宿一次性洗漱套装', quantity: 100, amount: 350, customer: '稻香村生态农庄', channel: 'purchase', status: 'shipping', createdAt: '2026-08-12 09:45', supplierId: 'S005', trackingNo: 'DB4321689092', logistics: [{ time: '2026-08-12 09:45', title: '商家已发货', detail: '订单已由 德邦快递 揽收' }, { time: '2026-08-12 11:02', title: '运输中', detail: '包裹已到达长沙转运中心' }], items: [{ productId: 'P014', skuId: 'P014-100', name: '民宿一次性洗漱套装', skuName: '100套/箱', image: '/static/images/field.webp', quantity: 100, price: 3.5 }] },
  { id: 'NJ202608120931', productName: '武陵山野生土蜂蜜', quantity: 2, amount: 176, customer: '联盟推客 · 土家幺妹', channel: 'live', status: 'paid-cancelled', createdAt: '2026-08-12 09:31', supplierId: 'S006', trackingNo: 'ZT7231096554', items: [{ productId: 'P005', skuId: 'P005-500', name: '武陵山野生土蜂蜜 500g', skuName: '500g', image: '/static/images/honey.webp', quantity: 2, price: 88 }], flow: [{ time: '2026-08-12 09:31', action: '用户下单', operator: '联盟推客 · 土家幺妹' }, { time: '2026-08-12 09:31', action: '订单支付成功', operator: '联盟推客 · 土家幺妹' }, { time: '2026-08-12 09:31', action: '已支付取消', operator: '联盟推客 · 土家幺妹' }] },
  { id: 'NJ202608120918', productName: '农家自制剁辣椒', quantity: 20, amount: 798, customer: '橘子洲畔农家院', channel: 'shop', status: 'delivered', createdAt: '2026-08-12 09:18', items: [{ productId: 'P004', skuId: 'P004-2', name: '农家自制剁辣椒 2瓶', skuName: '2瓶装', image: '/static/images/chili.webp', quantity: 20, price: 39.9 }] },
  { id: 'NJ202608120905', productName: '宁乡花猪腊肠', quantity: 15, amount: 582, customer: '衡山南岳农家乐', channel: 'shop', status: 'delivered', createdAt: '2026-08-12 09:05', supplierId: 'S009', trackingNo: 'YT7754219833', logistics: [{ time: '2026-08-11 16:20', title: '商家已发货', detail: '订单已由 圆通速递 揽收' }, { time: '2026-08-11 21:47', title: '运输中', detail: '包裹已到达衡阳分拨中心' }, { time: '2026-08-12 08:35', title: '派送中', detail: '快递员正在派送' }], items: [{ productId: 'P017', skuId: 'P017-400', name: '宁乡花猪腊肠 400g', skuName: '400g', image: '/static/images/bacon.webp', quantity: 15, price: 38.8 }] },
  { id: 'NJ202608120851', productName: '农家四人欢聚套餐券', quantity: 3, amount: 864, customer: '联盟推客 · 湘农达人', channel: 'live', status: 'after-sale', createdAt: '2026-08-12 08:51', items: [{ productId: 'P007', skuId: 'P007-4P', name: '农家四人欢聚套餐券', skuName: '四人套餐券', image: '/static/images/farmhouse.webp', quantity: 3, price: 288 }] },
  { id: 'NJ202608120842', productName: '山泉土鸡汤礼盒', quantity: 4, amount: 432, customer: '韶山红色记忆农庄', channel: 'purchase', status: 'shipping', createdAt: '2026-08-12 08:42', trackingNo: 'JDV00152633821', items: [{ productId: 'P011', skuId: 'P011-1', name: '山泉土鸡汤礼盒', skuName: '2只装', image: '/static/images/farmhouse.webp', quantity: 4, price: 108 }] },
  { id: 'NJ202608120830', productName: '安化擂茶粉', quantity: 8, amount: 319.2, customer: '益阳安化茶乡小院', channel: 'shop', status: 'delivered', createdAt: '2026-08-12 08:30', supplierId: 'S003', trackingNo: 'EMS555882761', items: [{ productId: 'P023', skuId: 'P023-500', name: '安化擂茶粉 500g', skuName: '500g', image: '/static/images/tea.webp', quantity: 8, price: 39.9 } ] },
  { id: 'NJ202607201600', productName: '宝庆糯米甜酒 2L坛装', quantity: 4, amount: 184, customer: '岳阳洞庭渔村', channel: 'shop', status: 'delivered', createdAt: '2026-07-20 16:00', supplierId: 'S012', trackingNo: 'DB4320001000', logistics: [{ time: '2026-07-20 16:00', title: '商家已发货', detail: '订单已由 德邦快递 揽收' }, { time: '2026-07-20 16:13', title: '运输中', detail: '包裹已到达长沙转运中心' }, { time: '2026-07-20 16:38', title: '派送中', detail: '快递员正在派送，请保持电话畅通' }, { time: '2026-07-20 16:30', title: '已签收', detail: '包裹已由本人签收，感谢使用' }], items: [{ productId: 'P021', skuId: 'P021-2L', name: '宝庆糯米甜酒 2L坛装', skuName: '2L坛装', image: '/static/images/field.webp', quantity: 4, price: 46 }] },
  { id: 'NJ202607201109', productName: '麻阳猕猴桃汁 6瓶', quantity: 4, amount: 159.6, customer: '岳阳洞庭渔村', channel: 'shop', status: 'delivered', createdAt: '2026-07-20 11:09', supplierId: 'S025', trackingNo: 'YD8840001001', logistics: [{ time: '2026-07-20 11:09', title: '商家已发货', detail: '订单已由 韵达快递 揽收' }, { time: '2026-07-20 11:44', title: '运输中', detail: '包裹已到达长沙转运中心' }, { time: '2026-07-20 11:27', title: '派送中', detail: '快递员正在派送，请保持电话畅通' }, { time: '2026-07-20 11:03', title: '已签收', detail: '包裹已由本人签收，感谢使用' }], items: [{ productId: 'P056', skuId: 'P056-6', name: '麻阳猕猴桃汁 6瓶', skuName: '6瓶装', image: '/static/images/field.webp', quantity: 4, price: 39.9 }] },
  { id: 'NJ202607211215', productName: '白关丝瓜 3斤装', quantity: 2, amount: 39.8, customer: '联盟推客 · 湘农达人', channel: 'shop', status: 'delivered', createdAt: '2026-07-21 12:15', supplierId: 'S015', trackingNo: 'YD8840001002', logistics: [{ time: '2026-07-21 12:15', title: '商家已发货', detail: '订单已由 韵达快递 揽收' }, { time: '2026-07-21 12:01', title: '运输中', detail: '包裹已到达长沙转运中心' }, { time: '2026-07-21 12:38', title: '派送中', detail: '快递员正在派送，请保持电话畅通' }, { time: '2026-07-21 12:03', title: '已签收', detail: '包裹已由本人签收，感谢使用' }], items: [{ productId: 'P026', skuId: 'P026-3J', name: '白关丝瓜 3斤装', skuName: '3斤装', image: '/static/images/field.webp', quantity: 2, price: 19.9 }] },
  { id: 'NJ202607211740', productName: '宁乡花猪腊肠 400g', quantity: 6, amount: 691.2, customer: '橘子洲畔农家院', channel: 'shop', status: 'delivered', createdAt: '2026-07-21 17:40', supplierId: 'S009', trackingNo: 'EMS550001003', logistics: [{ time: '2026-07-21 17:40', title: '商家已发货', detail: '订单已由 邮政EMS 揽收' }, { time: '2026-07-21 17:30', title: '运输中', detail: '包裹已到达长沙转运中心' }, { time: '2026-07-21 17:01', title: '派送中', detail: '快递员正在派送，请保持电话畅通' }, { time: '2026-07-21 17:28', title: '已签收', detail: '包裹已由本人签收，感谢使用' }], items: [{ productId: 'P017', skuId: 'P017-400', name: '宁乡花猪腊肠 400g', skuName: '400g', image: '/static/images/bacon.webp', quantity: 4, price: 38.8 }, { productId: 'P055', skuId: 'P055-1', name: '山景民宿一晚券', skuName: '1晚', image: '/static/images/mountain.webp', quantity: 2, price: 268 }] },
  { id: 'NJ202607221134', productName: '石门柑橘 5kg', quantity: 2, amount: 91.6, customer: '云上人家山景农庄', channel: 'live', status: 'delivered', createdAt: '2026-07-22 11:34', supplierId: 'S020', items: [{ productId: 'P028', skuId: 'P028-5K', name: '石门柑橘 5kg', skuName: '5kg', image: '/static/images/peach.webp', quantity: 2, price: 45.8 }] },
  { id: 'NJ202607220823', productName: '靖州杨梅干 250g', quantity: 4, amount: 107.2, customer: '联盟推客 · 土家幺妹', channel: 'live', status: 'delivered', createdAt: '2026-07-22 08:23', supplierId: 'S001', items: [{ productId: 'P019', skuId: 'P019-250', name: '靖州杨梅干 250g', skuName: '250g', image: '/static/images/peach.webp', quantity: 4, price: 26.8 }] },
  { id: 'NJ202607231022', productName: '竹纤维浴巾 20条', quantity: 2, amount: 500, customer: '游客 · 李女士', channel: 'live', status: 'delivered', createdAt: '2026-07-23 10:22', supplierId: 'S005', items: [{ productId: 'P044', skuId: 'P044-20', name: '竹纤维浴巾 20条', skuName: '20条/箱', image: '/static/images/field.webp', quantity: 2, price: 250 }] },
  { id: 'NJ202607240956', productName: '湘莲莲子羹 400g', quantity: 7, amount: 300.4, customer: '怀化侗乡渔寨', channel: 'purchase', status: 'delivered', createdAt: '2026-07-24 09:56', supplierId: 'S016', trackingNo: 'EMS550001004', logistics: [{ time: '2026-07-24 09:56', title: '商家已发货', detail: '订单已由 邮政EMS 揽收' }, { time: '2026-07-24 09:15', title: '运输中', detail: '包裹已到达长沙转运中心' }, { time: '2026-07-24 09:09', title: '派送中', detail: '快递员正在派送，请保持电话畅通' }, { time: '2026-07-24 09:46', title: '已签收', detail: '包裹已由本人签收，感谢使用' }], items: [{ productId: 'P050', skuId: 'P050-400', name: '湘莲莲子羹 400g', skuName: '400g', image: '/static/images/field.webp', quantity: 4, price: 46 }, { productId: 'P031', skuId: 'P031-300', name: '浏阳蒸火焙鱼 300g', skuName: '300g', image: '/static/images/field.webp', quantity: 3, price: 38.8 }] },
  { id: 'NJ202607240808', productName: '湘西剁椒鱼头酱 500g', quantity: 2, amount: 59.8, customer: '联盟推客 · 岳阳小龙虾哥', channel: 'purchase', status: 'delivered', createdAt: '2026-07-24 08:08', supplierId: 'S002', trackingNo: 'EMS550001005', logistics: [{ time: '2026-07-24 08:08', title: '商家已发货', detail: '订单已由 邮政EMS 揽收' }, { time: '2026-07-24 08:40', title: '运输中', detail: '包裹已到达长沙转运中心' }, { time: '2026-07-24 08:21', title: '派送中', detail: '快递员正在派送，请保持电话畅通' }, { time: '2026-07-24 08:00', title: '已签收', detail: '包裹已由本人签收，感谢使用' }], items: [{ productId: 'P018', skuId: 'P018-500', name: '湘西剁椒鱼头酱 500g', skuName: '500g', image: '/static/images/chili.webp', quantity: 2, price: 29.9 }] },
  { id: 'NJ202607251625', productName: '亲子研学半日券', quantity: 4, amount: 392, customer: '炎陵云溪农庄', channel: 'shop', status: 'delivered', createdAt: '2026-07-25 16:25', trackingNo: 'JDV1500001006', logistics: [{ time: '2026-07-25 16:25', title: '商家已发货', detail: '订单已由 京东物流 揽收' }, { time: '2026-07-25 16:34', title: '运输中', detail: '包裹已到达长沙转运中心' }, { time: '2026-07-25 16:07', title: '派送中', detail: '快递员正在派送，请保持电话畅通' }, { time: '2026-07-25 16:06', title: '已签收', detail: '包裹已由本人签收，感谢使用' }], items: [{ productId: 'P054', skuId: 'P054-2', name: '亲子研学半日券', skuName: '1大1小', image: '/static/images/field.webp', quantity: 4, price: 98 }] },
  { id: 'NJ202607250843', productName: '洞庭湖风干刁子鱼 400g', quantity: 3, amount: 128.4, customer: '韶山红色记忆农庄', channel: 'shop', status: 'delivered', createdAt: '2026-07-25 08:43', supplierId: 'S008', items: [{ productId: 'P016', skuId: 'P016-400', name: '洞庭湖风干刁子鱼 400g', skuName: '400g', image: '/static/images/field.webp', quantity: 3, price: 42.8 }] },
  { id: 'NJ202607261435', productName: '亲子研学半日券', quantity: 6, amount: 490, customer: '联盟推客 · 辣妹子', channel: 'shop', status: 'delivered', createdAt: '2026-07-26 14:35', items: [{ productId: 'P054', skuId: 'P054-2', name: '亲子研学半日券', skuName: '1大1小', image: '/static/images/field.webp', quantity: 4, price: 98 }, { productId: 'P009', skuId: 'P009-1', name: '招牌酱板鸭 整只装', skuName: '整只装', image: '/static/images/bacon.webp', quantity: 2, price: 49 }] },
  { id: 'NJ202607271207', productName: '宝庆糯米甜酒 2L坛装', quantity: 3, amount: 138, customer: '韶山红色记忆农庄', channel: 'shop', status: 'delivered', createdAt: '2026-07-27 12:07', supplierId: 'S012', trackingNo: 'EMS550001007', logistics: [{ time: '2026-07-27 12:07', title: '商家已发货', detail: '订单已由 邮政EMS 揽收' }, { time: '2026-07-27 12:10', title: '运输中', detail: '包裹已到达长沙转运中心' }, { time: '2026-07-27 12:48', title: '派送中', detail: '快递员正在派送，请保持电话畅通' }, { time: '2026-07-27 12:45', title: '已签收', detail: '包裹已由本人签收，感谢使用' }], items: [{ productId: 'P021', skuId: 'P021-2L', name: '宝庆糯米甜酒 2L坛装', skuName: '2L坛装', image: '/static/images/field.webp', quantity: 3, price: 46 }] },
  { id: 'NJ202607281702', productName: '湘西农家伴手礼大礼包', quantity: 2, amount: 316, customer: '游客 · 刘女士', channel: 'shop', status: 'delivered', createdAt: '2026-07-28 17:02', supplierId: 'S005', trackingNo: 'SF1490001008', logistics: [{ time: '2026-07-28 17:02', title: '商家已发货', detail: '订单已由 顺丰速运 揽收' }, { time: '2026-07-28 17:47', title: '运输中', detail: '包裹已到达长沙转运中心' }, { time: '2026-07-28 17:48', title: '派送中', detail: '快递员正在派送，请保持电话畅通' }, { time: '2026-07-28 17:26', title: '已签收', detail: '包裹已由本人签收，感谢使用' }], items: [{ productId: 'P022', skuId: 'P022-8', name: '湘西农家伴手礼大礼包', skuName: '8件装', image: '/static/images/farmhouse.webp', quantity: 2, price: 158 }] },
  { id: 'NJ202607281733', productName: '望城蔬果脆片 200g', quantity: 1, amount: 19.8, customer: '联盟推客 · 衡山云姐', channel: 'live', status: 'delivered', createdAt: '2026-07-28 17:33', supplierId: 'S013', trackingNo: 'JDV1500001009', items: [{ productId: 'P049', skuId: 'P049-200', name: '望城蔬果脆片 200g', skuName: '200g', image: '/static/images/field.webp', quantity: 1, price: 19.8 }] },
  { id: 'NJ202607291837', productName: '麻阳冰糖橙 5kg礼盒', quantity: 3, amount: 247.8, customer: '长沙捞刀河渔家乐', channel: 'live', status: 'delivered', createdAt: '2026-07-29 18:37', supplierId: 'S025', items: [{ productId: 'P025', skuId: 'P025-5K', name: '麻阳冰糖橙 5kg礼盒', skuName: '5kg礼盒', image: '/static/images/peach.webp', quantity: 2, price: 59.9 }, { productId: 'P010', skuId: 'P010-1', name: '安化黑茶 · 农家自藏', skuName: '礼盒装', image: '/static/images/tea.webp', quantity: 1, price: 128 }] },
  { id: 'NJ202607291457', productName: '武陵山野生土蜂蜜 500g', quantity: 2, amount: 176, customer: '衡山南岳农家乐', channel: 'live', status: 'delivered', createdAt: '2026-07-29 14:57', supplierId: 'S006', trackingNo: 'YD8840001010', logistics: [{ time: '2026-07-29 14:57', title: '商家已发货', detail: '订单已由 韵达快递 揽收' }, { time: '2026-07-29 14:15', title: '运输中', detail: '包裹已到达长沙转运中心' }, { time: '2026-07-29 14:29', title: '派送中', detail: '快递员正在派送，请保持电话畅通' }, { time: '2026-07-29 14:29', title: '已签收', detail: '包裹已由本人签收，感谢使用' }], items: [{ productId: 'P005', skuId: 'P005-500', name: '武陵山野生土蜂蜜 500g', skuName: '500g', image: '/static/images/honey.webp', quantity: 2, price: 88 }] },
  { id: 'NJ202607301917', productName: '武陵山野生土蜂蜜 500g', quantity: 2, amount: 176, customer: '联盟推客 · 衡山云姐', channel: 'purchase', status: 'delivered', createdAt: '2026-07-30 19:17', supplierId: 'S006', trackingNo: 'YD8840001011', logistics: [{ time: '2026-07-30 19:17', title: '商家已发货', detail: '订单已由 韵达快递 揽收' }, { time: '2026-07-30 19:43', title: '运输中', detail: '包裹已到达长沙转运中心' }, { time: '2026-07-30 19:06', title: '派送中', detail: '快递员正在派送，请保持电话畅通' }, { time: '2026-07-30 19:07', title: '已签收', detail: '包裹已由本人签收，感谢使用' }], items: [{ productId: 'P005', skuId: 'P005-500', name: '武陵山野生土蜂蜜 500g', skuName: '500g', image: '/static/images/honey.webp', quantity: 2, price: 88 }] },
  { id: 'NJ202607301510', productName: '民宿四件套床上用品', quantity: 2, amount: 178, customer: '云上人家山景农庄', channel: 'purchase', status: 'delivered', createdAt: '2026-07-30 15:10', supplierId: 'S005', trackingNo: 'ZT7230001012', logistics: [{ time: '2026-07-30 15:10', title: '商家已发货', detail: '订单已由 中通快递 揽收' }, { time: '2026-07-30 15:05', title: '运输中', detail: '包裹已到达长沙转运中心' }, { time: '2026-07-30 15:36', title: '派送中', detail: '快递员正在派送，请保持电话畅通' }, { time: '2026-07-30 15:20', title: '已签收', detail: '包裹已由本人签收，感谢使用' }], items: [{ productId: 'P024', skuId: 'P024-1', name: '民宿四件套床上用品', skuName: '四件套', image: '/static/images/field.webp', quantity: 2, price: 89 }] },
  { id: 'NJ202607311634', productName: '民宿一次性凉拖 100双', quantity: 6, amount: 632, customer: '橘子洲畔农家院', channel: 'shop', status: 'delivered', createdAt: '2026-07-31 16:34', supplierId: 'S005', trackingNo: 'YT7750001013', logistics: [{ time: '2026-07-31 16:34', title: '商家已发货', detail: '订单已由 圆通速递 揽收' }, { time: '2026-07-31 16:42', title: '运输中', detail: '包裹已到达长沙转运中心' }, { time: '2026-07-31 16:26', title: '派送中', detail: '快递员正在派送，请保持电话畅通' }, { time: '2026-07-31 16:13', title: '已签收', detail: '包裹已由本人签收，感谢使用' }], items: [{ productId: 'P043', skuId: 'P043-100', name: '民宿一次性凉拖 100双', skuName: '100双/箱', image: '/static/images/field.webp', quantity: 2, price: 180 }, { productId: 'P012', skuId: 'P012-1', name: '湘西柴火腊肉真空装', skuName: '500g', image: '/static/images/bacon.webp', quantity: 4, price: 68 }] },
  { id: 'NJ202607311856', productName: '湘莲莲子羹 400g', quantity: 3, amount: 138, customer: '联盟推客 · 洞庭湖渔哥', channel: 'shop', status: 'delivered', createdAt: '2026-07-31 18:56', supplierId: 'S016', items: [{ productId: 'P050', skuId: 'P050-400', name: '湘莲莲子羹 400g', skuName: '400g', image: '/static/images/field.webp', quantity: 3, price: 46 }] },
  { id: 'NJ202608011306', productName: '洞庭湖风干刁子鱼 400g', quantity: 3, amount: 128.4, customer: '长沙捞刀河渔家乐', channel: 'shop', status: 'delivered', createdAt: '2026-08-01 13:06', supplierId: 'S008', items: [{ productId: 'P016', skuId: 'P016-400', name: '洞庭湖风干刁子鱼 400g', skuName: '400g', image: '/static/images/field.webp', quantity: 3, price: 42.8 }] },
  { id: 'NJ202608010857', productName: '商用保鲜膜 300米', quantity: 4, amount: 112, customer: '稻香村生态农庄', channel: 'shop', status: 'delivered', createdAt: '2026-08-01 08:57', supplierId: 'S005', trackingNo: 'SF1490001014', items: [{ productId: 'P046', skuId: 'P046-300', name: '商用保鲜膜 300米', skuName: '300米/卷', image: '/static/images/field.webp', quantity: 4, price: 28 }] },
  { id: 'NJ202608010816', productName: '双峰辣酱 500g', quantity: 6, amount: 451.8, customer: '联盟推客 · 湘农达人', channel: 'shop', status: 'delivered', createdAt: '2026-08-01 08:16', supplierId: 'S026', trackingNo: 'DB4320001015', logistics: [{ time: '2026-08-01 08:16', title: '商家已发货', detail: '订单已由 德邦快递 揽收' }, { time: '2026-08-01 08:37', title: '运输中', detail: '包裹已到达长沙转运中心' }, { time: '2026-08-01 08:05', title: '派送中', detail: '快递员正在派送，请保持电话畅通' }, { time: '2026-08-01 08:13', title: '已签收', detail: '包裹已由本人签收，感谢使用' }], items: [{ productId: 'P036', skuId: 'P036-500', name: '双峰辣酱 500g', skuName: '500g', image: '/static/images/chili.webp', quantity: 2, price: 29.9 }, { productId: 'P054', skuId: 'P054-2', name: '亲子研学半日券', skuName: '1大1小', image: '/static/images/field.webp', quantity: 4, price: 98 }] },
  { id: 'NJ202608021854', productName: '湘西剁椒鱼头酱 500g', quantity: 4, amount: 119.6, customer: '橘子洲畔农家院', channel: 'live', status: 'delivered', createdAt: '2026-08-02 18:54', supplierId: 'S002', trackingNo: 'JDV1500001016', items: [{ productId: 'P018', skuId: 'P018-500', name: '湘西剁椒鱼头酱 500g', skuName: '500g', image: '/static/images/chili.webp', quantity: 4, price: 29.9 }] },
  { id: 'NJ202608021520', productName: '平江香干 300g', quantity: 3, amount: 47.4, customer: '橘子洲畔农家院', channel: 'live', status: 'delivered', createdAt: '2026-08-02 15:20', supplierId: 'S019', trackingNo: 'DB4320001017', logistics: [{ time: '2026-08-02 15:20', title: '商家已发货', detail: '订单已由 德邦快递 揽收' }, { time: '2026-08-02 15:28', title: '运输中', detail: '包裹已到达长沙转运中心' }, { time: '2026-08-02 15:47', title: '派送中', detail: '快递员正在派送，请保持电话畅通' }, { time: '2026-08-02 15:22', title: '已签收', detail: '包裹已由本人签收，感谢使用' }], items: [{ productId: 'P033', skuId: 'P033-300', name: '平江香干 300g', skuName: '300g', image: '/static/images/field.webp', quantity: 3, price: 15.8 }] },
  { id: 'NJ202608021027', productName: '民宿一次性洗漱套装', quantity: 2, amount: 7, customer: '联盟推客 · 山里阿强', channel: 'live', status: 'delivered', createdAt: '2026-08-02 10:27', supplierId: 'S005', trackingNo: 'YT7750001018', logistics: [{ time: '2026-08-02 10:27', title: '商家已发货', detail: '订单已由 圆通速递 揽收' }, { time: '2026-08-02 10:20', title: '运输中', detail: '包裹已到达长沙转运中心' }, { time: '2026-08-02 10:16', title: '派送中', detail: '快递员正在派送，请保持电话畅通' }, { time: '2026-08-02 10:09', title: '已签收', detail: '包裹已由本人签收，感谢使用' }], items: [{ productId: 'P014', skuId: 'P014-100', name: '民宿一次性洗漱套装', skuName: '100套/箱', image: '/static/images/field.webp', quantity: 2, price: 3.5 }] },
  { id: 'NJ202608021514', productName: '安化黑茶 · 农家自藏', quantity: 2, amount: 187.9, customer: '游客 · 李女士', channel: 'purchase', status: 'delivered', createdAt: '2026-08-02 15:14', items: [{ productId: 'P010', skuId: 'P010-1', name: '安化黑茶 · 农家自藏', skuName: '礼盒装', image: '/static/images/tea.webp', quantity: 1, price: 128 }, { productId: 'P025', skuId: 'P025-5K', name: '麻阳冰糖橙 5kg礼盒', skuName: '5kg礼盒', image: '/static/images/peach.webp', quantity: 1, price: 59.9 }] },
  { id: 'NJ202608031958', productName: '农家自制剁辣椒 2瓶', quantity: 3, amount: 119.7, customer: '邵阳崀山人家', channel: 'purchase', status: 'delivered', createdAt: '2026-08-03 19:58', trackingNo: 'YD8840001019', logistics: [{ time: '2026-08-03 19:58', title: '商家已发货', detail: '订单已由 韵达快递 揽收' }, { time: '2026-08-03 19:04', title: '运输中', detail: '包裹已到达长沙转运中心' }, { time: '2026-08-03 19:13', title: '派送中', detail: '快递员正在派送，请保持电话畅通' }, { time: '2026-08-03 19:10', title: '已签收', detail: '包裹已由本人签收，感谢使用' }], items: [{ productId: 'P004', skuId: 'P004-2', name: '农家自制剁辣椒 2瓶', skuName: '2瓶装', image: '/static/images/chili.webp', quantity: 3, price: 39.9 }] },
  { id: 'NJ202608031449', productName: '武冈卤香干 400g', quantity: 4, amount: 91.2, customer: '联盟推客 · 苗家阿妹', channel: 'shop', status: 'delivered', createdAt: '2026-08-03 14:49', supplierId: 'S031', items: [{ productId: 'P034', skuId: 'P034-400', name: '武冈卤香干 400g', skuName: '400g', image: '/static/images/field.webp', quantity: 4, price: 22.8 }] },
  { id: 'NJ202608030831', productName: '山景民宿一晚券', quantity: 1, amount: 268, customer: '石板溪农家乐', channel: 'shop', status: 'shipping', createdAt: '2026-08-03 08:31', items: [{ productId: 'P055', skuId: 'P055-1', name: '山景民宿一晚券', skuName: '1晚', image: '/static/images/mountain.webp', quantity: 1, price: 268 }] },
  { id: 'NJ202608031951', productName: '农家四人欢聚套餐券', quantity: 2, amount: 347.9, customer: '常德柳叶湖荷香农庄', channel: 'shop', status: 'shipping', createdAt: '2026-08-03 19:51', trackingNo: 'YD8840001020', items: [{ productId: 'P007', skuId: 'P007-4P', name: '农家四人欢聚套餐券', skuName: '四人套餐券', image: '/static/images/farmhouse.webp', quantity: 1, price: 288 }, { productId: 'P025', skuId: 'P025-5K', name: '麻阳冰糖橙 5kg礼盒', skuName: '5kg礼盒', image: '/static/images/peach.webp', quantity: 1, price: 59.9 }] },
  { id: 'NJ202608030902', productName: '望城富硒米 10kg', quantity: 2, amount: 178, customer: '联盟推客 · 湘农达人', channel: 'shop', status: 'shipping', createdAt: '2026-08-03 09:02', supplierId: 'S013', trackingNo: 'DB4320001021', items: [{ productId: 'P060', skuId: 'P060-10K', name: '望城富硒米 10kg', skuName: '10kg', image: '/static/images/rice.webp', quantity: 2, price: 89 }] },
  { id: 'NJ202608041934', productName: '亲子研学半日券', quantity: 2, amount: 196, customer: '石板溪农家乐', channel: 'shop', status: 'shipping', createdAt: '2026-08-04 19:34', trackingNo: 'SF1490001022', items: [{ productId: 'P054', skuId: 'P054-2', name: '亲子研学半日券', skuName: '1大1小', image: '/static/images/field.webp', quantity: 2, price: 98 }] },
  { id: 'NJ202608041938', productName: '古丈毛尖礼盒', quantity: 2, amount: 276, customer: '游客 · 李女士', channel: 'live', status: 'shipping', createdAt: '2026-08-04 19:38', supplierId: 'S027', items: [{ productId: 'P042', skuId: 'P042-250', name: '古丈毛尖礼盒', skuName: '250g礼盒', image: '/static/images/tea.webp', quantity: 2, price: 138 }] },
  { id: 'NJ202608041912', productName: '湘绣团扇伴手礼', quantity: 6, amount: 350.4, customer: '联盟推客 · 苗家阿妹', channel: 'live', status: 'shipping', createdAt: '2026-08-04 19:12', supplierId: 'S016', items: [{ productId: 'P052', skuId: 'P052-1', name: '湘绣团扇伴手礼', skuName: '单把装', image: '/static/images/field.webp', quantity: 3, price: 88 }, { productId: 'P029', skuId: 'P029-500', name: '祁东黄花菜 500g', skuName: '500g', image: '/static/images/field.webp', quantity: 3, price: 28.8 }] },
  { id: 'NJ202608050907', productName: '宝庆糯米甜酒 2L坛装', quantity: 1, amount: 46, customer: '郴州东江湖人家', channel: 'live', status: 'shipping', createdAt: '2026-08-05 09:07', supplierId: 'S012', trackingNo: 'YD8840001023', items: [{ productId: 'P021', skuId: 'P021-2L', name: '宝庆糯米甜酒 2L坛装', skuName: '2L坛装', image: '/static/images/field.webp', quantity: 1, price: 46 }] },
  { id: 'NJ202608051756', productName: '祁东黄花菜 500g', quantity: 4, amount: 115.2, customer: '石板溪农家乐', channel: 'purchase', status: 'shipping', createdAt: '2026-08-05 17:56', supplierId: 'S017', items: [{ productId: 'P029', skuId: 'P029-500', name: '祁东黄花菜 500g', skuName: '500g', image: '/static/images/field.webp', quantity: 4, price: 28.8 }] },
  { id: 'NJ202608050803', productName: '山泉土鸡汤礼盒', quantity: 2, amount: 216, customer: '联盟推客 · 岳阳小龙虾哥', channel: 'purchase', status: 'shipping', createdAt: '2026-08-05 08:03', trackingNo: 'DB4320001024', items: [{ productId: 'P011', skuId: 'P011-1', name: '山泉土鸡汤礼盒', skuName: '2只装', image: '/static/images/farmhouse.webp', quantity: 2, price: 108 }] },
  { id: 'NJ202608061158', productName: '浏阳蒸火焙鱼 300g', quantity: 7, amount: 253.6, customer: '岳阳洞庭渔村', channel: 'shop', status: 'shipping', createdAt: '2026-08-06 11:58', supplierId: 'S014', items: [{ productId: 'P031', skuId: 'P031-300', name: '浏阳蒸火焙鱼 300g', skuName: '300g', image: '/static/images/field.webp', quantity: 4, price: 38.8 }, { productId: 'P027', skuId: 'P027-5J', name: '江永香芋 5斤装', skuName: '5斤装', image: '/static/images/field.webp', quantity: 3, price: 32.8 }] },
  { id: 'NJ202608061224', productName: '亲子研学半日券', quantity: 4, amount: 392, customer: '长沙捞刀河渔家乐', channel: 'shop', status: 'shipping', createdAt: '2026-08-06 12:24', trackingNo: 'ZT7230001025', items: [{ productId: 'P054', skuId: 'P054-2', name: '亲子研学半日券', skuName: '1大1小', image: '/static/images/field.webp', quantity: 4, price: 98 }] },
  { id: 'NJ202608061220', productName: '竹纤维浴巾 20条', quantity: 2, amount: 500, customer: '联盟推客 · 茶香小妹', channel: 'shop', status: 'shipping', createdAt: '2026-08-06 12:20', supplierId: 'S005', trackingNo: 'ZT7230001026', items: [{ productId: 'P044', skuId: 'P044-20', name: '竹纤维浴巾 20条', skuName: '20条/箱', image: '/static/images/field.webp', quantity: 2, price: 250 }] },
  { id: 'NJ202608070836', productName: '山景民宿一晚券', quantity: 1, amount: 268, customer: '怀化侗乡渔寨', channel: 'shop', status: 'shipping', createdAt: '2026-08-07 08:36', items: [{ productId: 'P055', skuId: 'P055-1', name: '山景民宿一晚券', skuName: '1晚', image: '/static/images/mountain.webp', quantity: 1, price: 268 }] },
  { id: 'NJ202608071039', productName: '桑植土蜂蜜 1kg', quantity: 5, amount: 191.2, customer: '常德柳叶湖荷香农庄', channel: 'shop', status: 'shipping', createdAt: '2026-08-07 10:39', supplierId: 'S034', items: [{ productId: 'P047', skuId: 'P047-1K', name: '桑植土蜂蜜 1kg', skuName: '1kg', image: '/static/images/honey.webp', quantity: 1, price: 128 }, { productId: 'P033', skuId: 'P033-300', name: '平江香干 300g', skuName: '300g', image: '/static/images/field.webp', quantity: 4, price: 15.8 }] },
  { id: 'NJ202608070928', productName: '永州米粉干 2kg', quantity: 3, amount: 80.4, customer: '联盟推客 · 张同学', channel: 'live', status: 'shipping', createdAt: '2026-08-07 09:28', supplierId: 'S036', items: [{ productId: 'P038', skuId: 'P038-2K', name: '永州米粉干 2kg', skuName: '2kg', image: '/static/images/field.webp', quantity: 3, price: 26.8 }] },
  { id: 'NJ202608081904', productName: '民宿四件套床上用品', quantity: 3, amount: 267, customer: '云上人家山景农庄', channel: 'live', status: 'pending', createdAt: '2026-08-08 19:04', supplierId: 'S005', items: [{ productId: 'P024', skuId: 'P024-1', name: '民宿四件套床上用品', skuName: '四件套', image: '/static/images/field.webp', quantity: 3, price: 89 }] },
  { id: 'NJ202608081249', productName: '麻阳猕猴桃汁 6瓶', quantity: 3, amount: 119.7, customer: '石板溪农家乐', channel: 'live', status: 'pending', createdAt: '2026-08-08 12:49', supplierId: 'S025', items: [{ productId: 'P056', skuId: 'P056-6', name: '麻阳猕猴桃汁 6瓶', skuName: '6瓶装', image: '/static/images/field.webp', quantity: 3, price: 39.9 }] },
  { id: 'NJ202608080934', productName: '张家界莓茶礼盒', quantity: 4, amount: 652, customer: '联盟推客 · 辣妹子', channel: 'purchase', status: 'pending', createdAt: '2026-08-08 09:34', supplierId: 'S021', items: [{ productId: 'P040', skuId: 'P040-200', name: '张家界莓茶礼盒', skuName: '200g礼盒', image: '/static/images/tea.webp', quantity: 2, price: 168 }, { productId: 'P022', skuId: 'P022-8', name: '湘西农家伴手礼大礼包', skuName: '8件装', image: '/static/images/farmhouse.webp', quantity: 2, price: 158 }] },
  { id: 'NJ202608080837', productName: '平江香干 300g', quantity: 3, amount: 47.4, customer: '游客 · 李女士', channel: 'purchase', status: 'pending', createdAt: '2026-08-08 08:37', supplierId: 'S019', items: [{ productId: 'P033', skuId: 'P033-300', name: '平江香干 300g', skuName: '300g', image: '/static/images/field.webp', quantity: 3, price: 15.8 }] },
  { id: 'NJ202608081036', productName: '湘西柴火腊肉真空装', quantity: 1, amount: 68, customer: '岳阳洞庭渔村', channel: 'shop', status: 'pending', createdAt: '2026-08-08 10:36', items: [{ productId: 'P012', skuId: 'P012-1', name: '湘西柴火腊肉真空装', skuName: '500g', image: '/static/images/bacon.webp', quantity: 1, price: 68 }] },
  { id: 'NJ202608091500', productName: '湖南特产八件套', quantity: 2, amount: 336, customer: '联盟推客 · 岳阳小龙虾哥', channel: 'shop', status: 'pending', createdAt: '2026-08-09 15:00', supplierId: 'S014', items: [{ productId: 'P051', skuId: 'P051-8', name: '湖南特产八件套', skuName: '8件装', image: '/static/images/farmhouse.webp', quantity: 2, price: 168 }] },
  { id: 'NJ202608090803', productName: '湘西柴火腊肉真空装', quantity: 6, amount: 331.8, customer: '石板溪农家乐', channel: 'shop', status: 'pending', createdAt: '2026-08-09 08:03', items: [{ productId: 'P012', skuId: 'P012-1', name: '湘西柴火腊肉真空装', skuName: '500g', image: '/static/images/bacon.webp', quantity: 4, price: 68 }, { productId: 'P018', skuId: 'P018-500', name: '湘西剁椒鱼头酱 500g', skuName: '500g', image: '/static/images/chili.webp', quantity: 2, price: 29.9 }] },
  { id: 'NJ202608091348', productName: '民宿四件套床上用品', quantity: 3, amount: 267, customer: '衡山南岳农家乐', channel: 'shop', status: 'pending', createdAt: '2026-08-09 13:48', supplierId: 'S005', items: [{ productId: 'P024', skuId: 'P024-1', name: '民宿四件套床上用品', skuName: '四件套', image: '/static/images/field.webp', quantity: 3, price: 89 }] },
  { id: 'NJ202608090937', productName: '耒阳红薯粉 1kg', quantity: 3, amount: 59.7, customer: '联盟推客 · 土家幺妹', channel: 'shop', status: 'pending', createdAt: '2026-08-09 09:37', supplierId: 'S030', items: [{ productId: 'P037', skuId: 'P037-1K', name: '耒阳红薯粉 1kg', skuName: '1kg', image: '/static/images/field.webp', quantity: 3, price: 19.9 }] },
  { id: 'NJ202608091559', productName: '东江鱼仔香辣味 200g', quantity: 1, amount: 32.8, customer: '常德柳叶湖荷香农庄', channel: 'live', status: 'pending', createdAt: '2026-08-09 15:59', items: [{ productId: 'P008', skuId: 'P008-200', name: '东江鱼仔香辣味 200g', skuName: '200g', image: '/static/images/field.webp', quantity: 1, price: 32.8 }] },
  { id: 'NJ202608101841', productName: '民宿一次性凉拖 100双', quantity: 5, amount: 444, customer: '游客 · 王先生', channel: 'live', status: 'pending', createdAt: '2026-08-10 18:41', supplierId: 'S005', items: [{ productId: 'P043', skuId: 'P043-100', name: '民宿一次性凉拖 100双', skuName: '100双/箱', image: '/static/images/field.webp', quantity: 2, price: 180 }, { productId: 'P046', skuId: 'P046-300', name: '商用保鲜膜 300米', skuName: '300米/卷', image: '/static/images/field.webp', quantity: 3, price: 28 }] },
  { id: 'NJ202608101312', productName: '古丈蒿子粑粑 6个装', quantity: 1, amount: 22.8, customer: '联盟推客 · 岳阳小龙虾哥', channel: 'live', status: 'pending', createdAt: '2026-08-10 13:12', supplierId: 'S027', items: [{ productId: 'P048', skuId: 'P048-6', name: '古丈蒿子粑粑 6个装', skuName: '6个装', image: '/static/images/field.webp', quantity: 1, price: 22.8 }] },
  { id: 'NJ202608101724', productName: '临武鸭蛋 20枚', quantity: 4, amount: 128, customer: '衡山南岳农家乐', channel: 'purchase', status: 'pending', createdAt: '2026-08-10 17:24', supplierId: 'S023', items: [{ productId: 'P059', skuId: 'P059-20', name: '临武鸭蛋 20枚', skuName: '20枚', image: '/static/images/farmhouse.webp', quantity: 4, price: 32 }] },
  { id: 'NJ202608101149', productName: '湘西烟熏柴火腊肉 500g', quantity: 3, amount: 179.7, customer: '云上人家山景农庄', channel: 'purchase', status: 'pending', createdAt: '2026-08-10 11:49', supplierId: 'S002', items: [{ productId: 'P001', skuId: 'P001-500', name: '湘西烟熏柴火腊肉 500g', skuName: '500g', image: '/static/images/bacon.webp', quantity: 3, price: 59.9 }] },
  { id: 'NJ202608101542', productName: '君山银针礼盒', quantity: 3, amount: 571, customer: '联盟推客 · 湘农达人', channel: 'shop', status: 'pending', createdAt: '2026-08-10 15:42', supplierId: 'S032', items: [{ productId: 'P041', skuId: 'P041-250', name: '君山银针礼盒', skuName: '250g礼盒', image: '/static/images/tea.webp', quantity: 2, price: 198 }, { productId: 'P045', skuId: 'P045-500', name: '牛皮纸打包袋 ×500', skuName: '500只/箱', image: '/static/images/field.webp', quantity: 1, price: 175 }] },
  { id: 'NJ202608111521', productName: '南县稻虾米 5kg', quantity: 2, amount: 119.8, customer: '岳阳洞庭渔村', channel: 'shop', status: 'after-sale', createdAt: '2026-08-11 15:21', supplierId: 'S022', items: [{ productId: 'P030', skuId: 'P030-5K', name: '南县稻虾米 5kg', skuName: '5kg', image: '/static/images/rice.webp', quantity: 2, price: 59.9 }] },
  { id: 'NJ202608110926', productName: '农家自制剁辣椒 2瓶', quantity: 3, amount: 119.7, customer: '怀化侗乡渔寨', channel: 'shop', status: 'after-sale', createdAt: '2026-08-11 09:26', trackingNo: 'YT7750001027', items: [{ productId: 'P004', skuId: 'P004-2', name: '农家自制剁辣椒 2瓶', skuName: '2瓶装', image: '/static/images/chili.webp', quantity: 3, price: 39.9 }] },
  { id: 'NJ202608111718', productName: '宝庆糯米甜酒 2L坛装', quantity: 4, amount: 184, customer: '联盟推客 · 洞庭湖渔哥', channel: 'shop', status: 'after-sale', createdAt: '2026-08-11 17:18', supplierId: 'S012', items: [{ productId: 'P021', skuId: 'P021-2L', name: '宝庆糯米甜酒 2L坛装', skuName: '2L坛装', image: '/static/images/field.webp', quantity: 4, price: 46 }] },
  { id: 'NJ202608111646', productName: '平江香干 300g', quantity: 6, amount: 214.8, customer: '炎陵云溪农庄', channel: 'shop', status: 'after-sale', createdAt: '2026-08-11 16:46', supplierId: 'S019', items: [{ productId: 'P033', skuId: 'P033-300', name: '平江香干 300g', skuName: '300g', image: '/static/images/field.webp', quantity: 2, price: 15.8 }, { productId: 'P028', skuId: 'P028-5K', name: '石门柑橘 5kg', skuName: '5kg', image: '/static/images/peach.webp', quantity: 4, price: 45.8 }] },
{ id: 'NJ202608121952', productName: '沅江芦笋 500g', quantity: 1, amount: 24.9, customer: '郴州东江湖人家', channel: 'live', status: 'after-sale', createdAt: '2026-08-12 19:52', supplierId: 'S035', items: [{ productId: 'P039', skuId: 'P039-500', name: '沅江芦笋 500g', skuName: '500g', image: '/static/images/field.webp', quantity: 1, price: 24.9 }] },
]

export const pricePolicies: PricePolicy[] = [
  { id: 'R001', name: '全平台集采价', type: 'group', scope: '全部农家乐', discount: 18, enabled: true },
  { id: 'R002', name: '腊味阶梯采购', type: 'ladder', scope: '腊味类商品', discount: 24, enabled: true, tiers: [
    { minQty: 1, maxQty: 49, price: 42, discountOff: 30 },
    { minQty: 50, maxQty: 199, price: 39, discountOff: 35 },
    { minQty: 200, maxQty: 499, price: 37, discountOff: 38 },
    { minQty: 500, maxQty: null, price: 35, discountOff: 42 }
  ] },
  { id: 'R003', name: '湘西区域扶持价', type: 'region', scope: '湘西州门店', discount: 8, enabled: true },
  { id: 'R004', name: '金牌会员专享价', type: 'member', scope: '金牌会员', discount: 6, enabled: false },
  { id: 'R005', name: '生鲜果蔬集采价', type: 'group', scope: '生鲜类目', discount: 12, enabled: true },
  { id: 'R006', name: '餐具耗材阶梯价', type: 'ladder', scope: '打包/耗材类', discount: 20, enabled: true, tiers: [
    { minQty: 1, maxQty: 99, price: 1.2, discountOff: 15 },
    { minQty: 100, maxQty: 499, price: 1, discountOff: 25 },
    { minQty: 500, maxQty: null, price: 0.8, discountOff: 35 }
  ] },
  { id: 'R007', name: '长沙城区配送价', type: 'region', scope: '长沙城区门店', discount: 5, enabled: false },
  { id: 'R008', name: '钻石会员特供价', type: 'member', scope: '钻石会员', discount: 10, enabled: true },
  { id: 'R009', name: '蜂蜜/土特产阶梯价', type: 'ladder', scope: '蜂蜜/土特产类目', discount: 15, enabled: true, tiers: [
    { minQty: 1, maxQty: 49, price: 88, discountOff: 10 },
    { minQty: 50, maxQty: 199, price: 82, discountOff: 16 },
    { minQty: 200, maxQty: null, price: 78, discountOff: 20 }
  ] },
  { id: 'R010', name: '湘西州配送补贴价', type: 'region', scope: '湘西州门店', discount: 6, enabled: true },
  { id: 'R011', name: '银牌会员优惠价', type: 'member', scope: '银牌会员', discount: 4, enabled: true },
  { id: 'R012', name: '茶酒礼盒集采价', type: 'group', scope: '茶酒礼盒类目', discount: 15, enabled: true },
  { id: 'R013', name: '农产品集采价', type: 'group', scope: '农产品类目', discount: 10, enabled: true },
  { id: 'R014', name: '预制菜阶梯价', type: 'ladder', scope: '预制菜类目', discount: 18, enabled: true, tiers: [
    { minQty: 1, maxQty: 99, price: 38.8, discountOff: 15 },
    { minQty: 100, maxQty: 499, price: 35.5, discountOff: 22 },
    { minQty: 500, maxQty: null, price: 33, discountOff: 28 }
  ] },
  { id: 'R015', name: '张家界区域价', type: 'region', scope: '张家界市门店', discount: 7, enabled: true },
  { id: 'R016', name: '会员日全场价', type: 'member', scope: '会员日全场', discount: 5, enabled: true },
  { id: 'R017', name: '民宿耗材集采价', type: 'group', scope: '民宿耗材类目', discount: 12, enabled: true },
  { id: 'R018', name: '土特产阶梯价', type: 'ladder', scope: '土特产类目', discount: 16, enabled: true, tiers: [
    { minQty: 1, maxQty: 49, price: 42.8, discountOff: 10 },
    { minQty: 50, maxQty: 199, price: 39.9, discountOff: 16 },
    { minQty: 200, maxQty: null, price: 36.5, discountOff: 23 }
  ] },
  { id: 'R019', name: '长沙周边配送价', type: 'region', scope: '长沙城区门店', discount: 4, enabled: false },
  { id: 'R020', name: '大客户协议价', type: 'member', scope: '大客户协议', discount: 12, enabled: true }
]

export const afterSales: AfterSale[] = [
  { id: 'SH20582', orderId: 'NJ202608110928', productName: '黄桃礼盒', applicant: '石板溪农家乐', type: 'reship', amount: 136, status: 'processing', issue: '运输破损 2 盒', quantity: 2, image: '/static/images/peach.webp' },
  { id: 'SH20577', orderId: 'NJ202608110851', productName: '黑茶礼盒', applicant: '联盟推客订单', type: 'refund', amount: 128, status: 'processing', issue: '客户七天无理由', quantity: 1, image: '/static/images/tea.webp' },
  { id: 'SH20561', orderId: 'NJ202608110915', productName: '柴火腊肉', applicant: '云上人家山景农庄', type: 'claim', amount: 59.9, status: 'refunded', issue: '质量问题理赔', quantity: 5, image: '/static/images/bacon.webp', refundAmount: 59.9, refundMethod: 'only', refundMode: 'full' },
  { id: 'SH20590', orderId: 'NJ202608120851', productName: '四人套餐券', applicant: '联盟推客订单', type: 'claim', amount: 864, status: 'processing', issue: '到店核销人数不符', quantity: 3, image: '/static/images/farmhouse.webp', history: [{ time: '2026-08-12 09:12', action: '提交理赔申请', operator: '联盟推客 · 湘农达人' }] },
  { id: 'SH20588', orderId: 'NJ202608120958', productName: '洞庭湖风干刁子鱼', applicant: '联盟推客订单', type: 'reship', amount: 428, status: 'processing', issue: '运输破损 2 袋', quantity: 2, image: '/static/images/field.webp', history: [{ time: '2026-08-12 10:05', action: '提交补发申请', operator: '联盟推客 · 苗家阿妹' }] },
  { id: 'SH20585', orderId: 'NJ202608120918', productName: '剁辣椒', applicant: '橘子洲畔农家院', type: 'refund', amount: 798, status: 'processing', issue: '口感风味不符', quantity: 8, image: '/static/images/chili.webp', refundAmount: 239.4, refundMethod: 'only', refundMode: 'ratio', history: [{ time: '2026-08-12 09:30', action: '申请部分退款', operator: '橘子洲畔农家院' }] },
  { id: 'SH20583', orderId: 'NJ202608120842', productName: '土鸡汤礼盒', applicant: '韶山红色记忆农庄', type: 'refund', amount: 432, status: 'processing', issue: '七天无理由', quantity: 4, image: '/static/images/farmhouse.webp', history: [{ time: '2026-08-12 09:02', action: '提交退款申请', operator: '韶山红色记忆农庄' }] },
  { id: 'SH20580', orderId: 'NJ202608121030', productName: '柴火腊肉', applicant: '石板溪农家乐', type: 'claim', amount: 359.4, status: 'processing', issue: '物流延误理赔', quantity: 6, image: '/static/images/bacon.webp', refundAmount: 119.8, refundMethod: 'only', refundMode: 'ratio', history: [{ time: '2026-08-12 10:45', action: '提交理赔申请', operator: '石板溪农家乐' } ] },
  { id: 'SH20601', orderId: 'NJ202608111521', productName: '南县稻虾米', applicant: '岳阳洞庭渔村', type: 'reship', amount: 119.8, status: 'processing', issue: '少发漏发', quantity: 2, image: '/static/images/rice.webp', history: [{ time: '2026-08-11 15:21', action: '提交补发申请', operator: '岳阳洞庭渔村' }] },
  { id: 'SH20602', orderId: 'NJ202608110926', productName: '农家自制剁辣椒', applicant: '怀化侗乡渔寨', type: 'claim', amount: 119.7, status: 'processing', issue: '质量问题', quantity: 3, image: '/static/images/chili.webp', history: [{ time: '2026-08-11 09:26', action: '提交理赔申请', operator: '怀化侗乡渔寨' }] },
  { id: 'SH20603', orderId: 'NJ202608111718', productName: '宝庆糯米甜酒', applicant: '联盟推客订单', type: 'refund', amount: 184, status: 'refunded', issue: '口感风味不符', quantity: 4, image: '/static/images/field.webp', refundAmount: 55.2, refundMethod: 'only', refundMode: 'ratio', history: [{ time: '2026-08-11 17:18', action: '处理完成，退款到账', operator: '运营管理员' }] },
  { id: 'SH20604', orderId: 'NJ202608111646', productName: '平江香干', applicant: '炎陵云溪农庄', type: 'refund', amount: 214.8, status: 'processing', issue: '七天无理由', quantity: 2, image: '/static/images/field.webp', history: [{ time: '2026-08-11 16:46', action: '提交退款申请', operator: '炎陵云溪农庄' }] },
  { id: 'SH20605', orderId: 'NJ202608121952', productName: '沅江芦笋', applicant: '郴州东江湖人家', type: 'refund', amount: 24.9, status: 'processing', issue: '预约取消', quantity: 1, image: '/static/images/field.webp', history: [{ time: '2026-08-12 19:52', action: '提交退款申请', operator: '郴州东江湖人家' }] },
  { id: 'SH20606', orderId: 'NJ202607201600', productName: '宝庆糯米甜酒', applicant: '岳阳洞庭渔村', type: 'claim', amount: 184, status: 'refunded', issue: '其他', quantity: 4, image: '/static/images/field.webp', refundAmount: 55.2, refundMethod: 'only', refundMode: 'ratio', history: [{ time: '2026-07-20 16:00', action: '处理完成，退款到账', operator: '运营管理员' }] },
  { id: 'SH20607', orderId: 'NJ202607201109', productName: '麻阳猕猴桃汁', applicant: '岳阳洞庭渔村', type: 'reship', amount: 159.6, status: 'processing', issue: '运输破损', quantity: 4, image: '/static/images/field.webp', history: [{ time: '2026-07-20 11:09', action: '提交补发申请', operator: '岳阳洞庭渔村' }] },
  { id: 'SH20608', orderId: 'NJ202607211215', productName: '白关丝瓜', applicant: '联盟推客订单', type: 'reship', amount: 39.8, status: 'processing', issue: '少发漏发', quantity: 2, image: '/static/images/field.webp', history: [{ time: '2026-07-21 12:15', action: '提交补发申请', operator: '联盟推客订单' }] },
  { id: 'SH20609', orderId: 'NJ202607211740', productName: '宁乡花猪腊肠', applicant: '橘子洲畔农家院', type: 'claim', amount: 691.2, status: 'refunded', issue: '质量问题', quantity: 4, image: '/static/images/bacon.webp', refundAmount: 207.4, refundMethod: 'only', refundMode: 'ratio', history: [{ time: '2026-07-21 17:40', action: '处理完成，退款到账', operator: '运营管理员' }] },
  { id: 'SH20610', orderId: 'NJ202607221134', productName: '石门柑橘', applicant: '云上人家山景农庄', type: 'refund', amount: 91.6, status: 'processing', issue: '口感风味不符', quantity: 2, image: '/static/images/peach.webp', history: [{ time: '2026-07-22 11:34', action: '提交退款申请', operator: '云上人家山景农庄' }] },
  { id: 'SH20611', orderId: 'NJ202607220823', productName: '靖州杨梅干', applicant: '联盟推客订单', type: 'refund', amount: 107.2, status: 'processing', issue: '七天无理由', quantity: 4, image: '/static/images/peach.webp', history: [{ time: '2026-07-22 08:23', action: '提交退款申请', operator: '联盟推客订单' }] },
  { id: 'SH20612', orderId: 'NJ202607231022', productName: '竹纤维浴巾', applicant: '游客 · 李女士', type: 'refund', amount: 500, status: 'refunded', issue: '预约取消', quantity: 2, image: '/static/images/field.webp', refundAmount: 150, refundMethod: 'only', refundMode: 'ratio', history: [{ time: '2026-07-23 10:22', action: '处理完成，退款到账', operator: '运营管理员' }] },
  { id: 'SH20613', orderId: 'NJ202607240956', productName: '湘莲莲子羹', applicant: '怀化侗乡渔寨', type: 'claim', amount: 300.4, status: 'processing', issue: '其他', quantity: 4, image: '/static/images/field.webp', history: [{ time: '2026-07-24 09:56', action: '提交理赔申请', operator: '怀化侗乡渔寨' }] },
  { id: 'SH20614', orderId: 'NJ202607240808', productName: '湘西剁椒鱼头酱', applicant: '联盟推客订单', type: 'reship', amount: 59.8, status: 'processing', issue: '运输破损', quantity: 2, image: '/static/images/chili.webp', history: [{ time: '2026-07-24 08:08', action: '提交补发申请', operator: '联盟推客订单' }] },
  { id: 'SH20615', orderId: 'NJ202607251625', productName: '亲子研学半日券', applicant: '炎陵云溪农庄', type: 'reship', amount: 392, status: 'refunded', issue: '少发漏发', quantity: 4, image: '/static/images/field.webp', refundAmount: 117.6, refundMethod: 'only', refundMode: 'ratio', history: [{ time: '2026-07-25 16:25', action: '处理完成，退款到账', operator: '运营管理员' }] },
  { id: 'SH20616', orderId: 'NJ202607250843', productName: '洞庭湖风干刁子鱼', applicant: '韶山红色记忆农庄', type: 'claim', amount: 128.4, status: 'processing', issue: '质量问题', quantity: 3, image: '/static/images/field.webp', history: [{ time: '2026-07-25 08:43', action: '提交理赔申请', operator: '韶山红色记忆农庄' }] },
{ id: 'SH20617', orderId: 'NJ202607261435', productName: '亲子研学半日券', applicant: '联盟推客订单', type: 'refund', amount: 490, status: 'processing', issue: '口感风味不符', quantity: 4, image: '/static/images/field.webp', history: [{ time: '2026-07-26 14:35', action: '提交退款申请', operator: '联盟推客订单' }] },
]

export const promoters: Promoter[] = [
  { id: 'T001', name: '张同学', level: 'V3 金牌推客', type: '推客', fans: 326, orders: 142, gmv: 86420, commission: 2486.5, cumulativeCommission: 18920, settled: false, status: 'active' },
  { id: 'T002', name: '山里阿强', level: '带货主播', type: '主播', fans: 0, orders: 286, gmv: 124800, commission: 14976, settled: false, status: 'active' },
  { id: 'T003', name: '湘农达人', level: '助农达人', type: '达人', fans: 198, orders: 96, gmv: 48200, commission: 6748, settled: false, status: 'active' },
  { id: 'T004', name: '乡村小李', level: 'V2 推客', type: '推客', fans: 142, orders: 58, gmv: 32600, commission: 3912, settled: true, status: 'active' },
  { id: 'T005', name: '茶香小妹', level: 'V3 推客', type: '推客', fans: 286, orders: 168, gmv: 68900, commission: 4120, cumulativeCommission: 28600, settled: false, status: 'active' },
  { id: 'T006', name: '腊味老李', level: 'V2 推客', type: '推客', fans: 96, orders: 74, gmv: 32600, commission: 1580, cumulativeCommission: 12600, settled: true, status: 'active' },
  { id: 'T007', name: '苗家阿妹', level: '助农达人', type: '达人', fans: 420, orders: 132, gmv: 92000, commission: 5200, cumulativeCommission: 39800, settled: false, status: 'active' },
  { id: 'T008', name: '溪谷骑行客', level: 'V1 推客', type: '推客', fans: 58, orders: 40, gmv: 16800, commission: 720, cumulativeCommission: 3200, settled: false, status: 'active' },
  { id: 'T009', name: '土家幺妹', level: '带货主播', type: '主播', fans: 1500, orders: 320, gmv: 156000, commission: 9860, cumulativeCommission: 76200, settled: false, status: 'active' },
  { id: 'T010', name: '果园大叔', level: 'V2 推客', type: '推客', fans: 132, orders: 88, gmv: 41200, commission: 2100, cumulativeCommission: 15400, settled: true, status: 'active' },
  { id: 'T011', name: '板栗哥', level: 'V1 推客', type: '推客', fans: 64, orders: 26, gmv: 11800, commission: 560, cumulativeCommission: 1800, settled: false, status: 'active' },
  { id: 'T012', name: '辣妹子', level: '带货主播', type: '主播', fans: 680, orders: 150, gmv: 72000, commission: 8260, cumulativeCommission: 38600, settled: false, status: 'active' },
  { id: 'T013', name: '山货老王', level: 'V2 推客', type: '推客', fans: 88, orders: 36, gmv: 15800, commission: 620, cumulativeCommission: 4600, settled: true, status: 'paused' },
  { id: 'T014', name: '土菜一姐', level: '助农达人', type: '达人', fans: 260, orders: 84, gmv: 38600, commission: 3120, cumulativeCommission: 21800, settled: false, status: 'active' },
  { id: 'T015', name: '竹笋妹', level: 'V3 推客', type: '推客', fans: 214, orders: 96, gmv: 44800, commission: 2860, cumulativeCommission: 16900, settled: false, status: 'active' },
  { id: 'T016', name: '洞庭湖渔哥', level: 'V2 推客', type: '推客', fans: 168, orders: 62, gmv: 28600, commission: 1960, cumulativeCommission: 11200, settled: false, status: 'active' },
  { id: 'T017', name: '橘子洲头阿明', level: 'V1 推客', type: '推客', fans: 72, orders: 32, gmv: 12600, commission: 610, cumulativeCommission: 2400, settled: true, status: 'active' },
  { id: 'T018', name: '湘西米酒妹', level: 'V3 推客', type: '推客', fans: 312, orders: 148, gmv: 68200, commission: 4520, cumulativeCommission: 31800, settled: false, status: 'active' },
  { id: 'T019', name: '茶园春晓', level: '带货主播', type: '主播', fans: 820, orders: 210, gmv: 98000, commission: 11200, cumulativeCommission: 52400, settled: false, status: 'active' },
  { id: 'T020', name: '高山银针姐', level: '助农达人', type: '达人', fans: 356, orders: 118, gmv: 52600, commission: 4860, cumulativeCommission: 22600, settled: false, status: 'active' },
  { id: 'T021', name: '桃花源小张', level: 'V2 推客', type: '推客', fans: 118, orders: 52, gmv: 23800, commission: 1240, cumulativeCommission: 6800, settled: true, status: 'active' },
  { id: 'T022', name: '醴陵烟花哥', level: 'V1 推客', type: '推客', fans: 46, orders: 24, gmv: 9800, commission: 480, cumulativeCommission: 1600, settled: false, status: 'active' },
  { id: 'T023', name: '衡山云姐', level: '助农达人', type: '达人', fans: 268, orders: 94, gmv: 43800, commission: 3680, cumulativeCommission: 19200, settled: false, status: 'active' },
  { id: 'T024', name: '郴州雾漫姑娘', level: 'V3 推客', type: '推客', fans: 298, orders: 132, gmv: 58600, commission: 3960, cumulativeCommission: 25400, settled: false, status: 'active' },
  { id: 'T025', name: '永州香芋哥', level: 'V2 推客', type: '推客', fans: 132, orders: 58, gmv: 26400, commission: 1480, cumulativeCommission: 7200, settled: true, status: 'active' },
  { id: 'T026', name: '怀化侗家阿妹', level: 'V1 推客', type: '推客', fans: 64, orders: 30, gmv: 13200, commission: 650, cumulativeCommission: 2800, settled: false, status: 'active' },
  { id: 'T027', name: '娄底辣酱哥', level: 'V3 推客', type: '推客', fans: 286, orders: 126, gmv: 54600, commission: 3740, cumulativeCommission: 19800, settled: false, status: 'active' },
  { id: 'T028', name: '岳阳小龙虾哥', level: '带货主播', type: '主播', fans: 640, orders: 168, gmv: 82600, commission: 9360, cumulativeCommission: 42800, settled: false, status: 'active' },
  { id: 'T029', name: '常德柳叶姐', level: 'V2 推客', type: '推客', fans: 148, orders: 68, gmv: 29800, commission: 1680, cumulativeCommission: 8600, settled: false, status: 'active' },
  { id: 'T030', name: '益阳竹艺匠人', level: '助农达人', type: '达人', fans: 226, orders: 82, gmv: 38600, commission: 3260, cumulativeCommission: 14600, settled: false, status: 'paused' }
]

export const commissionSettlements: CommissionSettlementRecord[] = [
  { id: 'CS20260808', promoterIds: ['T001', 'T002', 'T003', 'T005', 'T009'], amount: 38190.5, createdAt: '2026-08-08 10:00', items: [
    { promoterId: 'T001', promoterName: '张同学', amount: 2486.5 },
    { promoterId: 'T002', promoterName: '山里阿强', amount: 14976 },
    { promoterId: 'T003', promoterName: '湘农达人', amount: 6748 },
    { promoterId: 'T005', promoterName: '茶香小妹', amount: 4120 },
    { promoterId: 'T009', promoterName: '土家幺妹', amount: 9860 }
  ] },
  { id: 'CS20260801', promoterIds: ['T004', 'T007'], amount: 9112, createdAt: '2026-08-01 10:00', items: [
    { promoterId: 'T004', promoterName: '乡村小李', amount: 3912 },
    { promoterId: 'T007', promoterName: '苗家阿妹', amount: 5200 }
  ] },
  { id: 'CS20260725', promoterIds: ['T006', 'T008', 'T010'], amount: 4400, createdAt: '2026-07-25 10:00', items: [
    { promoterId: 'T006', promoterName: '腊味老李', amount: 1580 },
    { promoterId: 'T008', promoterName: '溪谷骑行客', amount: 720 },
    { promoterId: 'T010', promoterName: '果园大叔', amount: 2100 }
  ] },
  { id: 'CS20260730', promoterIds: ['T004', 'T011'], amount: 4472, createdAt: '2026-07-30 10:00', items: [
    { promoterId: 'T004', promoterName: '乡村小李', amount: 3912 },
    { promoterId: 'T011', promoterName: '板栗哥', amount: 560 }
  ] },
  { id: 'CS20260802', promoterIds: ['T017', 'T022'], amount: 1090, createdAt: '2026-08-02 10:00', items: [
    { promoterId: 'T017', promoterName: '橘子洲头阿明', amount: 610 },
    { promoterId: 'T022', promoterName: '醴陵烟花哥', amount: 480 }
  ] },
  { id: 'CS20260804', promoterIds: ['T011', 'T013', 'T030'], amount: 4440, createdAt: '2026-08-04 10:00', items: [
    { promoterId: 'T011', promoterName: '板栗哥', amount: 560 },
    { promoterId: 'T013', promoterName: '山货老王', amount: 620 },
    { promoterId: 'T030', promoterName: '益阳竹艺匠人', amount: 3260 }
  ] },
  { id: 'CS20260806', promoterIds: ['T015', 'T021', 'T025'], amount: 5580, createdAt: '2026-08-06 10:00', items: [
    { promoterId: 'T015', promoterName: '竹笋妹', amount: 2860 },
    { promoterId: 'T021', promoterName: '桃花源小张', amount: 1240 },
    { promoterId: 'T025', promoterName: '永州香芋哥', amount: 1480 }
  ] },
  { id: 'CS20260807', promoterIds: ['T029', 'T026'], amount: 2330, createdAt: '2026-08-07 10:00', items: [
    { promoterId: 'T029', promoterName: '常德柳叶姐', amount: 1680 },
    { promoterId: 'T026', promoterName: '怀化侗家阿妹', amount: 650 }
  ] },
  { id: 'CS20260809', promoterIds: ['T016', 'T018', 'T023', 'T027'], amount: 13900, createdAt: '2026-08-09 10:00', items: [
    { promoterId: 'T016', promoterName: '洞庭湖渔哥', amount: 1960 },
    { promoterId: 'T018', promoterName: '湘西米酒妹', amount: 4520 },
    { promoterId: 'T023', promoterName: '衡山云姐', amount: 3680 },
    { promoterId: 'T027', promoterName: '娄底辣酱哥', amount: 3740 }
  ] },
  { id: 'CS20260811', promoterIds: ['T012', 'T019', 'T020', 'T024', 'T028'], amount: 37640, createdAt: '2026-08-11 10:00', items: [
    { promoterId: 'T012', promoterName: '辣妹子', amount: 8260 },
    { promoterId: 'T019', promoterName: '茶园春晓', amount: 11200 },
    { promoterId: 'T020', promoterName: '高山银针姐', amount: 4860 },
    { promoterId: 'T024', promoterName: '郴州雾漫姑娘', amount: 3960 },
    { promoterId: 'T028', promoterName: '岳阳小龙虾哥', amount: 9360 }
  ] }
]

export const supplierSettlements: SupplierSettlementRecord[] = [
  { id: 'ST20260806', period: '2026-08', supplierIds: ['S001', 'S002', 'S005'], orderIds: ['NJ202608110928', 'NJ202608110915', 'NJ202608110842'], amount: 699.5, createdAt: '2026-08-06 10:00', items: [
    { supplierId: 'S001', supplierName: '靖州杨梅专业合作社', orderIds: ['NJ202608110928'], amount: 136 },
    { supplierId: 'S002', supplierName: '湘西腊味合作社', orderIds: ['NJ202608110915'], amount: 299.5 },
    { supplierId: 'S005', supplierName: '县供销社惠农服务中心', orderIds: ['NJ202608110842'], amount: 264 }
  ] },
  { id: 'ST20260720', period: '2026-07', supplierIds: ['S003', 'S004'], orderIds: ['NJ202607301201', 'NJ202607281101'], amount: 486, createdAt: '2026-07-20 10:00', items: [
    { supplierId: 'S003', supplierName: '安化茶业集团', orderIds: ['NJ202607301201'], amount: 128 },
    { supplierId: 'S004', supplierName: '炎陵果业有限公司', orderIds: ['NJ202607281101'], amount: 358 }
  ] },
  { id: 'ST20260728', period: '2026-07', supplierIds: ['S025', 'S014', 'S023'], orderIds: ['NJ202607221134', 'NJ202607240956', 'NJ202607250843'], amount: 396.4, createdAt: '2026-07-28 10:00', items: [
    { supplierId: 'S025', supplierName: '麻阳冰糖橙合作社', orderIds: ['NJ202607221134'], amount: 239.6 },
    { supplierId: 'S014', supplierName: '浏阳蒸菜食品厂', orderIds: ['NJ202607240956'], amount: 116.4 },
    { supplierId: 'S023', supplierName: '临武鸭业股份有限公司', orderIds: ['NJ202607250843'], amount: 40.4 }
  ] },
  { id: 'ST20260802', period: '2026-08', supplierIds: ['S020', 'S021', 'S002'], orderIds: ['NJ202608010857', 'NJ202608011306', 'NJ202608010816'], amount: 328.5, createdAt: '2026-08-02 10:00', items: [
    { supplierId: 'S020', supplierName: '石门柑橘专业合作社', orderIds: ['NJ202608010857'], amount: 91.6 },
    { supplierId: 'S021', supplierName: '张家界莓茶产业合作社', orderIds: ['NJ202608011306'], amount: 168 },
    { supplierId: 'S002', supplierName: '湘西腊味合作社', orderIds: ['NJ202608010816'], amount: 68.9 }
  ] },
  { id: 'ST20260804', period: '2026-08', supplierIds: ['S036', 'S009', 'S017'], orderIds: ['NJ202608031958', 'NJ202608030831', 'NJ202608031449'], amount: 311.9, createdAt: '2026-08-04 10:00', items: [
    { supplierId: 'S036', supplierName: '祁阳米粉食品厂', orderIds: ['NJ202608031958'], amount: 107.2 },
    { supplierId: 'S009', supplierName: '宁乡花猪生态养殖场', orderIds: ['NJ202608030831'], amount: 155.2 },
    { supplierId: 'S017', supplierName: '祁东黄花菜产业园', orderIds: ['NJ202608031449'], amount: 49.5 }
  ] },
  { id: 'ST20260808', period: '2026-08', supplierIds: ['S006', 'S008', 'S010'], orderIds: ['NJ202608061158', 'NJ202608081904', 'NJ202608070928'], amount: 501.4, createdAt: '2026-08-08 10:00', items: [
    { supplierId: 'S006', supplierName: '武陵蜂业合作社', orderIds: ['NJ202608061158'], amount: 176 },
    { supplierId: 'S008', supplierName: '洞庭湖水产品合作社', orderIds: ['NJ202608081904'], amount: 171.2 },
    { supplierId: 'S010', supplierName: '道县瑶山菌业合作社', orderIds: ['NJ202608070928'], amount: 154.2 }
  ] },
  { id: 'ST20260810', period: '2026-08', supplierIds: ['S002', 'S003'], orderIds: ['NJ202608101841', 'NJ202608101312'], amount: 532.6, createdAt: '2026-08-10 10:00', items: [
    { supplierId: 'S002', supplierName: '湘西腊味合作社', orderIds: ['NJ202608101841'], amount: 403.6 },
    { supplierId: 'S003', supplierName: '安化茶业集团', orderIds: ['NJ202608101312'], amount: 129 }
  ] },
  { id: 'ST20260812', period: '2026-08', supplierIds: ['S002', 'S003', 'S008', 'S005', 'S006'], orderIds: ['NJ202608121030', 'NJ202608121015', 'NJ202608120958', 'NJ202608120945', 'NJ202608120931'], amount: 1569.4, createdAt: '2026-08-12 10:00', items: [
    { supplierId: 'S002', supplierName: '湘西腊味合作社', orderIds: ['NJ202608121030'], amount: 359.4 },
    { supplierId: 'S003', supplierName: '安化茶业集团', orderIds: ['NJ202608121015'], amount: 256 },
    { supplierId: 'S008', supplierName: '洞庭湖水产品合作社', orderIds: ['NJ202608120958'], amount: 428 },
    { supplierId: 'S005', supplierName: '县供销社惠农服务中心', orderIds: ['NJ202608120945'], amount: 350 },
    { supplierId: 'S006', supplierName: '武陵蜂业合作社', orderIds: ['NJ202608120931'], amount: 176 }
  ] }
]


export const liveRooms: LiveRoom[] = [
  { id: 'L001', emoji: '🐔', title: '石板溪掌柜带你吃土鸡宴', host: '山里阿强', hostRole: '推客主播', viewers: 32000, productName: '四人套餐券', productPrice: 288, status: 'live', reminded: false, image: '/static/images/farmhouse.webp', farmId: 'F001', city: '湘西州', promoterId: 'T001', linkedFarms: [{ farmId: 'F001', packageIds: ['P007', 'P053'] }, { farmId: 'F002', packageIds: ['P055'] }] },
  { id: 'L002', emoji: '🍑', title: '炎陵黄桃产地直发抢鲜', host: '湘农达人', hostRole: '助农主播', viewers: 18000, productName: '黄桃礼盒', productPrice: 68, status: 'live', reminded: false, image: '/static/images/peach.webp', farmId: 'F002', city: '张家界市', promoterId: 'T001', linkedFarms: [{ farmId: 'F001', packageIds: ['P007'] }, { farmId: 'F002', packageIds: ['P055'] }] },
  { id: 'L003', emoji: '🍵', title: '安化黑茶 · 老茶人开仓', host: '茶香小妹', viewers: 9560, productName: '黑茶礼盒', productPrice: 128, status: 'live', reminded: false, image: '/static/images/tea.webp', city: '益阳市' },
  { id: 'L004', emoji: '🥓', title: '湘西腊味节专场直播', host: '腊味老李', viewers: 0, productName: '柴火腊肉', productPrice: 59.9, status: 'preview', reminded: false, image: '/static/images/bacon.webp', farmId: 'F001', city: '湘西州' },
  { id: 'L005', emoji: '🐟', title: '东江湖鲜开捕节 · 刁子鱼直发', host: '洞庭湖渔哥', hostRole: '推客主播', viewers: 15200, productName: '风干刁子鱼', productPrice: 42.8, status: 'live', reminded: false, image: '/static/images/field.webp', farmId: 'F020', city: '郴州市', promoterId: 'T001', linkedFarms: [{ farmId: 'F003', packageIds: ['P054'] }, { farmId: 'F006', packageIds: ['P065'] }] },
  { id: 'L006', emoji: '🦆', title: '临武鸭卤味工厂专场', host: '岳阳小龙虾哥', hostRole: '带货主播', viewers: 12800, productName: '酱板鸭', productPrice: 58, status: 'live', reminded: false, image: '/static/images/bacon.webp', farmId: 'F020', city: '郴州市' },
  { id: 'L007', emoji: '🍊', title: '麻阳冰糖橙开园直播', host: '郴州雾漫姑娘', hostRole: '推客主播', viewers: 8900, productName: '冰糖橙礼盒', productPrice: 59.9, status: 'live', reminded: false, image: '/static/images/peach.webp', farmId: 'F024', city: '怀化市' },
  { id: 'L008', emoji: '🍵', title: '张家界莓茶尝鲜 · 土家神茶', host: '茶园春晓', hostRole: '带货主播', viewers: 0, productName: '莓茶礼盒', productPrice: 168, status: 'preview', reminded: false, image: '/static/images/tea.webp', farmId: 'F026', city: '张家界市' },
  { id: 'L009', emoji: '🪷', title: '湘莲莲子羹秋冬上新', host: '高山银针姐', hostRole: '助农主播', viewers: 0, productName: '莲子羹', productPrice: 46, status: 'preview', reminded: false, image: '/static/images/field.webp', farmId: 'F029', city: '湘潭市' },
  { id: 'L010', emoji: '🧋', title: '常德擂茶夜话 · 老字号开讲', host: '常德柳叶姐', hostRole: '推客主播', viewers: 7300, productName: '常德擂茶', productPrice: 25.8, status: 'live', reminded: false, image: '/static/images/field.webp', farmId: 'F025', city: '常德市' },
  { id: 'L011', emoji: '🍠', title: '永州香芋大集 · 粉糯爆款', host: '永州香芋哥', hostRole: '推客主播', viewers: 0, productName: '江永香芋', productPrice: 32.8, status: 'preview', reminded: false, image: '/static/images/field.webp', farmId: 'F021', city: '永州市' },
  { id: 'L012', emoji: '🌶', title: '双峰辣酱下饭专场', host: '娄底辣酱哥', hostRole: '推客主播', viewers: 11200, productName: '双峰辣酱', productPrice: 29.9, status: 'live', reminded: false, image: '/static/images/chili.webp', farmId: 'F022', city: '娄底市' },
  { id: 'L013', emoji: '🐟', title: '洞庭湖鲜开渔季 · 刁子鱼秒杀', host: '山里阿强', hostRole: '推客主播', viewers: 12400, productName: '风干刁子鱼', productPrice: 42.8, status: 'live', reminded: false, image: '/static/images/field.webp', farmId: 'F020', city: '郴州市', promoterId: 'T001', linkedFarms: [{ farmId: 'F003', packageIds: ['P054'] }, { farmId: 'F006', packageIds: ['P065'] }] },
  { id: 'L014', emoji: '🍵', title: '高山云雾茶 · 春日采茶慢直播', host: '张同学', hostRole: '推客主播', viewers: 0, productName: '高山云雾茶', productPrice: 128, status: 'preview', reminded: false, image: '/static/images/tea.webp', farmId: 'F002', city: '张家界市', promoterId: 'T001', linkedFarms: [{ farmId: 'F002', packageIds: ['P055'] }] }
]

export const members: Member[] = [
  { id: 'M001', name: '王女士', level: 'gold', balance: 386.5, points: 2860, phone: '138****6688', memberNo: 'SBX·8829', cumulativeCommission: 1286, fans: 68, monthlyOrders: 23 },
  { id: 'M002', name: '张先生', level: 'silver', balance: 628, points: 1580, phone: '139****2255', memberNo: 'SBX·6631', cumulativeCommission: 486, fans: 26, monthlyOrders: 12 },
  { id: 'M003', name: '李女士', level: 'gold', balance: 1280, points: 5200, phone: '137****8812', memberNo: 'SBX·7745', cumulativeCommission: 3260, fans: 182, monthlyOrders: 46 },
  { id: 'M004', name: '陈先生', level: 'normal', balance: 200, points: 320, phone: '150****3398', memberNo: 'SBX·5568', monthlyOrders: 3 },
  { id: 'M005', name: '刘女士', level: 'silver', balance: 460, points: 1180, phone: '136****5521', memberNo: 'SBX·9012', cumulativeCommission: 358, fans: 18, monthlyOrders: 9 },
  { id: 'M006', name: '赵先生', level: 'gold', balance: 896, points: 4600, phone: '158****7733', memberNo: 'SBX·4487', cumulativeCommission: 1986, fans: 96, monthlyOrders: 31 },
  { id: 'M007', name: '孙女士', level: 'normal', balance: 88, points: 120, phone: '152****0098', memberNo: 'SBX·3351', monthlyOrders: 2 },
  { id: 'M008', name: '周先生', level: 'silver', balance: 1020, points: 2980, phone: '139****6677', memberNo: 'SBX·2294', cumulativeCommission: 862, fans: 42, monthlyOrders: 18 }
]

export const commissionRules: CommissionRule[] = [
  { id: 'CR001', name: '门店推广佣金', targetType: 'farm', rate: 8, enabled: true, updatedAt: '2026-08-11 09:00' },
  { id: 'CR002', name: '商品推广佣金', targetType: 'product', rate: 12, enabled: true, updatedAt: '2026-08-11 09:00' },
  { id: 'CR003', name: '直播推广佣金', targetType: 'live', rate: 10, enabled: true, updatedAt: '2026-08-11 09:00' },
  { id: 'CR004', name: '门店带客佣金', targetType: 'farm', rate: 6, enabled: true, updatedAt: '2026-08-12 09:00' },
  { id: 'CR005', name: '生鲜品类推广佣金', targetType: 'product', rate: 10, enabled: true, updatedAt: '2026-08-12 09:00' },
  { id: 'CR006', name: '联名直播佣金', targetType: 'live', rate: 15, enabled: false, updatedAt: '2026-08-12 09:00' },
  { id: 'CR007', name: '门店会员转化佣金', targetType: 'farm', rate: 5, enabled: true, updatedAt: '2026-08-12 14:00' },
  { id: 'CR008', name: '年货专场佣金', targetType: 'product', rate: 18, enabled: false, updatedAt: '2026-08-12 14:00' },
  { id: 'CR009', name: '助农直播扶持佣金', targetType: 'live', rate: 12, enabled: true, updatedAt: '2026-08-13 09:30' },
  { id: 'CR010', name: '民宿推广佣金', targetType: 'farm', rate: 9, enabled: true, updatedAt: '2026-08-13 09:30' },
  { id: 'CR011', name: '茶酒类目佣金', targetType: 'product', rate: 14, enabled: true, updatedAt: '2026-08-13 10:00' },
  { id: 'CR012', name: '跨店联播佣金', targetType: 'live', rate: 8, enabled: true, updatedAt: '2026-08-13 10:00' }
]

export const cityOptions = ['张家界永定区', '长沙岳麓区', '湘西州', '常德桃源县']

export const farmhouseFoods = [
  { id: 'FD01', emoji: '🐔', name: '山泉土鸡汤', description: '散养土鸡 · 文火慢炖三小时', price: 88, originalPrice: 108, image: '/static/images/farmhouse.webp' },
  { id: 'FD02', emoji: '🥓', name: '湘西柴火腊肉', description: '松柏烟熏 · 农家自晒', price: 58, originalPrice: 68, image: '/static/images/bacon.webp' },
  { id: 'FD03', emoji: '🐟', name: '剁椒石板鱼', description: '山泉活鱼 · 现杀现做', price: 68, image: '/static/images/chili.webp' },
  { id: 'FD04', emoji: '🌶', name: '擂辣椒皮蛋', description: '本地青椒 · 农家味道', price: 26, image: '/static/images/field.webp' },
  { id: 'FD05', emoji: '🐠', name: '酸汤黄鸭叫', description: '山泉黄鸭叫 · 酸汤开胃', price: 58, image: '/static/images/field.webp' },
  { id: 'FD06', emoji: '🦆', name: '血粑鸭', description: '苗家血粑 · 土鸭现宰', price: 68, image: '/static/images/farmhouse.webp' },
  { id: 'FD07', emoji: '🍘', name: '蒿子粑粑', description: '清明蒿子 · 香糯拉丝', price: 18, originalPrice: 22, image: '/static/images/field.webp' },
  { id: 'FD08', emoji: '🍗', name: '茶油蒸土鸡', description: '山茶油 · 土鸡整只蒸', price: 98, originalPrice: 118, image: '/static/images/farmhouse.webp' },
  { id: 'FD09', emoji: '🎃', name: '蒸南瓜花', description: '应季南瓜花 · 清甜软糯', price: 22, image: '/static/images/field.webp' },
  { id: 'FD10', emoji: '🍲', name: '柴火豆腐', description: '石磨豆浆 · 柴火慢炖', price: 28, image: '/static/images/chili.webp' }
]

export const travelRoutes: TravelRoute[] = [
  { id: 'RT01', name: '湘西土家风情 2 日游', description: '凤凰古城 · 矮寨大桥 · 农家土菜宴', meta: '含 3 家联盟农家乐 · 沿途特产采购', price: 399, city: '湘西州', image: '/static/images/farmhouse.webp' },
  { id: 'RT02', name: '张家界山水康养 3 日游', description: '天门山 · 大峡谷 · 山景民宿农庄', meta: '含 4 家联盟农家乐 · 直播同款好物', price: 599, city: '张家界市', image: '/static/images/mountain.webp' },
  { id: 'RT03', name: '长沙窑文化一日游', description: '铜官窑 · 靖港古镇 · 渔家土菜', meta: '含 2 家联盟农家乐 · 非遗体验', price: 299, city: '长沙市', image: '/static/images/farmhouse.webp' },
  { id: 'RT04', name: '常德桃花源二日游', description: '桃花源 · 柳叶湖 · 擂茶宴', meta: '含 2 家联盟农家乐 · 田园民宿', price: 469, city: '常德市', image: '/static/images/field.webp' },
  { id: 'RT05', name: '怀化侗族风情三日游', description: '洪江古商城 · 通道侗寨 · 合拢宴', meta: '含 3 家联盟农家乐 · 侗歌侗舞', price: 629, city: '怀化市', image: '/static/images/farmhouse.webp' },
  { id: 'RT06', name: '邵阳崀山丹霞二日游', description: '崀山八角寨 · 辣椒峰 · 农家腊味宴', meta: '含 2 家联盟农家乐 · 丹霞日出', price: 459, city: '邵阳市', image: '/static/images/mountain.webp' }
]

export interface DerivedPlatformMetrics {
  gmv: number
  farmCount: number
  supplierCount: number
  orderCount: number
  pendingCommission: number
  orderStats: { total: number; pending: number; shipping: number }
  afterSaleStats: { settlement: number; count: number; processing: number; resolved: number; rate: string }
  farmStats: { total: number; liveCount: number; configuring: number; selfProducts: number; pendingSelfProducts: number }
  promoterStats: { pendingCommission: number; activePromoters: number; liveHosts: number; liveSessions: number; lockedFans: number }
  hotProducts: Array<{ name: string; supplier: string; amount: number; units: number; image: string }>
  categoryShares: Array<{ name: string; value: number }>
  dailyTrend: Array<{ label: string; amount: number; count: number }>
}

export function derivePlatformMetrics(input: {
  orders: Order[]
  products: Product[]
  farms: FarmStore[]
  suppliers: Supplier[]
  afterSales: AfterSale[]
  promoters: Promoter[]
}): DerivedPlatformMetrics {
  const { orders, products, farms, suppliers, afterSales, promoters } = input
  const gmv = Math.round(orders.reduce((sum, order) => sum + order.amount, 0) * 100) / 100
  const orderStats = {
    total: orders.length,
    pending: orders.filter((order) => order.status === 'pending').length,
    shipping: orders.filter((order) => order.status === 'shipping').length,
  }
  const resolved = afterSales.filter((afterSale) => afterSale.status === 'refunded').length
  const afterSaleStats = {
    settlement: Math.round(afterSales.filter((afterSale) => afterSale.status === 'refunded').reduce((sum, afterSale) => sum + (afterSale.refundAmount ?? afterSale.amount), 0) * 100) / 100,
    count: afterSales.length,
    processing: afterSales.filter((afterSale) => afterSale.status === 'processing').length,
    resolved,
    rate: afterSales.length ? `${Math.round((resolved / afterSales.length) * 1000) / 10}%` : '0%',
  }
  const farmhouseProducts = products.filter((product) => product.source === 'farmhouse')
  const farmStats = {
    total: farms.length,
    liveCount: farms.filter((farm) => farm.status === 'active').length,
    configuring: farms.filter((farm) => farm.status === 'pending').length,
    selfProducts: farmhouseProducts.length,
    pendingSelfProducts: farmhouseProducts.filter((product) => product.status === 'pending').length,
  }
  const liveHosts = promoters.filter((promoter) => promoter.type === '主播' || promoter.type === '达人').length
  const promoterStats = {
    pendingCommission: Math.round(promoters.filter((promoter) => !promoter.settled).reduce((sum, promoter) => sum + promoter.commission, 0) * 100) / 100,
    activePromoters: promoters.filter((promoter) => promoter.status === 'active').length,
    liveHosts,
    liveSessions: promoters.filter((promoter) => promoter.type === '主播').length,
    lockedFans: promoters.reduce((sum, promoter) => sum + promoter.fans, 0),
  }
  const hotProducts = [...products]
    .filter((product) => product.status === 'active')
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 5)
    .map((product) => ({ name: product.name, supplier: product.supplier, amount: Math.round(product.sales * product.price), units: product.sales, image: product.image }))
  const categoryCount = new Map<string, number>()
  products.forEach((product) => categoryCount.set(product.category, (categoryCount.get(product.category) || 0) + 1))
  const categoryShares = [...categoryCount.entries()].map(([name, value]) => ({ name, value }))
  const dayMap = new Map<string, { amount: number; count: number }>()
  orders.forEach((order) => {
    const date = (order.createdAt || '').slice(0, 10)
    if (!date) return
    const current = dayMap.get(date) || { amount: 0, count: 0 }
    current.amount += order.amount
    current.count += 1
    dayMap.set(date, current)
  })
  const dailyTrend = [...dayMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, value]) => ({ label: `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`, amount: round2(value.amount), count: value.count }))
  return {
    gmv, farmCount: farms.length, supplierCount: suppliers.length, orderCount: orders.length,
    pendingCommission: promoterStats.pendingCommission, orderStats, afterSaleStats, farmStats, promoterStats,
    hotProducts, categoryShares, dailyTrend,
  }
}

export function cloneSeed<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function formatNumber(value: number): string {
  return round2(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

export function money(value: number): string {
  return `¥${formatNumber(value)}`
}

export function calcCartTotal(items: Array<{ price: number; quantity: number }>): number {
  return Math.round(items.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100) / 100
}

export function calcMargin(cost: number, retail: number): { amount: number; rate: number } {
  const amount = Math.round((retail - cost) * 100) / 100
  return { amount, rate: retail > 0 ? Math.round((amount / retail) * 1000) / 10 : 0 }
}

let idSequence = 0

export function createId(prefix: string): string {
  idSequence = (idSequence + 1) % 1000
  return `${prefix}${Date.now().toString().slice(-9)}${idSequence.toString().padStart(3, '0')}`
}

export function toCsv(rows: Array<Array<string | number>>): string {
  return `\ufeff${rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')}`
}

export function enableKeyboardButtons(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('uni-button:not([tabindex])').forEach((button) => { button.tabIndex = 0 })
}

export function focusFirstInteractive(root: ParentNode): void {
  enableKeyboardButtons(root)
  root.querySelector<HTMLElement>('uni-button:not([disabled]), input:not(:disabled), select:not(:disabled)')?.focus()
}

export function installKeyboardButtonSupport(): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => undefined
  const sync = () => enableKeyboardButtons(document)
  const activate = (event: KeyboardEvent) => {
    const target = event.target
    if (!(target instanceof HTMLElement) || target.tagName !== 'UNI-BUTTON' || target.hasAttribute('disabled') || !['Enter', ' '].includes(event.key)) return
    event.preventDefault()
    target.click()
  }
  sync()
  const observer = new MutationObserver(sync)
  observer.observe(document.body, { childList: true, subtree: true })
  document.addEventListener('keydown', activate)
  return () => {
    observer.disconnect()
    document.removeEventListener('keydown', activate)
  }
}

export function mockDelay<T>(value: T, delay = 180, scenario: MockScenario = 'normal', emptyValue?: T): Promise<T> {
  return new Promise((resolve, reject) => setTimeout(() => {
    if (scenario === 'failure') {
      reject(new Error('模拟数据加载失败，请重试'))
      return
    }
    resolve(cloneSeed(scenario === 'empty' ? (emptyValue ?? value) : value))
  }, delay))
}

function mergePersisted(defaultValue: unknown, savedValue: unknown): unknown {
  if (savedValue === undefined || savedValue === null) return cloneSeed(defaultValue)
  if (Array.isArray(defaultValue) && Array.isArray(savedValue)) {
    return savedValue.map((savedItem) => {
      if (!savedItem || typeof savedItem !== 'object' || !('id' in savedItem)) return savedItem
      const base = defaultValue.find((item) => item && typeof item === 'object' && 'id' in item && item.id === savedItem.id)
      return base ? mergePersisted(base, savedItem) : savedItem
    })
  }
  if (defaultValue && savedValue && typeof defaultValue === 'object' && typeof savedValue === 'object') {
    const merged: Record<string, unknown> = { ...(defaultValue as Record<string, unknown>) }
    Object.entries(savedValue as Record<string, unknown>).forEach(([key, value]) => {
      merged[key] = key in merged ? mergePersisted(merged[key], value) : value
    })
    return merged
  }
  return savedValue
}

export function mergePersistedDefaults<T>(defaults: T, saved: unknown): T {
  return mergePersisted(defaults, saved) as T
}

export function mergeEntitySeeds<T extends { id: string }>(defaults: T[], saved: T[]): T[] {
  const savedById = new Map(saved.map((item) => [item.id, item]))
  const merged = defaults.map((item) => mergePersistedDefaults(item, savedById.get(item.id)))
  const defaultIds = new Set(defaults.map((item) => item.id))
  return [...merged, ...saved.filter((item) => !defaultIds.has(item.id)).map(cloneSeed)]
}

type PersistedObject = Record<string, unknown>
type StateMigration = (state: PersistedObject, defaults: PersistedObject) => PersistedObject

const transientStateKeys = new Set(['initialized', 'loading', 'error', 'mockScenario', 'checkoutError', 'purchaseError', 'operationKey'])

export function selectPersistedState<T>(state: T, keys?: readonly (keyof T)[]): Partial<T> {
  if (!state || typeof state !== 'object') return state as Partial<T>
  const allowed = keys ? new Set(keys.map(String)) : null
  return Object.fromEntries(Object.entries(state as PersistedObject).filter(([key]) => !transientStateKeys.has(key) && (!allowed || allowed.has(key)))) as Partial<T>
}

const stateMigrations: Record<number, StateMigration> = {
  1: (state) => state,
  2: (state, defaults) => {
    if ('member' in defaults && !state.member && ('balance' in state || 'points' in state)) {
      state.member = { balance: state.balance, points: state.points }
      delete state.balance
      delete state.points
    }
    return state
  },
  3: (state) => {
    if (Array.isArray(state.commissionEntries)) {
      state.commissionEntries = state.commissionEntries.map((entry) => {
        if (!entry || typeof entry !== 'object' || 'status' in entry) return entry
        return { ...entry, status: entry.type === 'withdrawal' ? 'completed' : 'available' }
      })
    }
    transientStateKeys.forEach((key) => delete state[key])
    return state
  },
  4: (state, defaults) => {
    if (Array.isArray(state.products)) {
      state.products = state.products.map((product) => {
        if (!product || typeof product !== 'object' || !Array.isArray(product.skus)) return product
        const hasOnlyLegacySku = product.skus.length > 0 && product.skus.every((sku: unknown) => sku && typeof sku === 'object' && 'id' in sku && String(sku.id).endsWith('-DEFAULT'))
        if (!hasOnlyLegacySku) return product
        const { skus: _legacySkus, ...rest } = product
        return rest
      })
    }
    if ('member' in defaults && Array.isArray(state.orders)) {
      state.orders = state.orders.map((order) => order && typeof order === 'object' && !Array.isArray(order.items) ? { ...order, items: [] } : order)
    }
    if (Array.isArray(state.supplierSettlementRecords)) {
      state.supplierSettlementRecords = state.supplierSettlementRecords.map((record) => {
        if (!record || typeof record !== 'object') return record
        const createdAt = typeof record.createdAt === 'string' ? record.createdAt : ''
        return { orderIds: [], period: createdAt.slice(0, 7), ...record }
      })
    }
    delete state.withdrawalRecords
    return state
  },
  5: (state) => {
    if (Array.isArray(state.suppliers)) {
      state.suppliers = state.suppliers.map((supplier) => {
        if (!supplier || typeof supplier !== 'object' || !supplier.qualification || typeof supplier.qualification !== 'object') return supplier
        if (!Object.values(supplier.qualification).some((value) => String(value).includes('旧版演示数据') || String(value) === '待补充')) return supplier
        const { qualification: _legacyQualification, ...rest } = supplier
        return rest
      })
    }
    return state
  },
  6: (state) => {
    if (Array.isArray(state.purchaseOrders)) {
      state.purchaseOrders = state.purchaseOrders.map((order) => {
        if (!order || typeof order !== 'object' || !Array.isArray(order.items)) return order
        return { ...order, items: order.items.map((item: unknown) => {
          if (!item || typeof item !== 'object' || !('productId' in item)) return item
          return { skuId: `${String(item.productId)}-DEFAULT`, skuName: '默认规格', image: '', ...item }
        }) }
      })
    }
    if (Array.isArray(state.supplierSettlementRecords)) {
      state.supplierSettlementRecords = state.supplierSettlementRecords.map((record) => {
        if (!record || typeof record !== 'object' || Array.isArray(record.items)) return record
        const supplierIds: string[] = Array.isArray(record.supplierIds) ? record.supplierIds.map(String) : []
        const orderIds: string[] = Array.isArray(record.orderIds) ? record.orderIds.map(String) : []
        const amount = typeof record.amount === 'number' ? record.amount : 0
        return { ...record, items: supplierIds.map((supplierId, index) => ({ supplierId, supplierName: supplierId, orderIds: supplierIds.length === 1 ? orderIds : [], amount: supplierIds.length === 1 || index === 0 ? amount : 0 })) }
      })
    }
    if (Array.isArray(state.commissionSettlementRecords)) {
      state.commissionSettlementRecords = state.commissionSettlementRecords.map((record) => {
        if (!record || typeof record !== 'object' || Array.isArray(record.items)) return record
        const promoterIds: string[] = Array.isArray(record.promoterIds) ? record.promoterIds.map(String) : []
        const amount = typeof record.amount === 'number' ? record.amount : 0
        return { ...record, items: promoterIds.map((promoterId, index) => ({ promoterId, promoterName: promoterId, amount: promoterIds.length === 1 || index === 0 ? amount : 0 })) }
      })
    }
    return state
  }
}

export function migratePersistedState<T>(saved: unknown, defaults: T, version = PERSISTENCE_VERSION): T {
  if (!saved || typeof saved !== 'object') return cloneSeed(defaults)
  const envelope = saved as { version?: number; state?: unknown }
  const rawState = envelope.state && typeof envelope.state === 'object' ? envelope.state : saved
  let migrated = cloneSeed(rawState as PersistedObject)
  const savedVersion = Number.isInteger(envelope.version) ? Math.max(0, Number(envelope.version)) : 0
  for (let nextVersion = savedVersion + 1; nextVersion <= version; nextVersion += 1) {
    migrated = (stateMigrations[nextVersion] || ((state) => state))(migrated, defaults as PersistedObject)
  }
  return mergePersisted(defaults, migrated) as T
}

export function persistedEnvelope<T>(state: T, keys?: readonly (keyof T)[], version = PERSISTENCE_VERSION): { version: number; state: Partial<T> } {
  return { version, state: cloneSeed(selectPersistedState(state, keys)) }
}

export const purchaseSteps: PurchaseStatus[] = ['submitted', 'accepted', 'shipped', 'delivering', 'received', 'completed']

export function nextPurchaseStatus(status: PurchaseStatus): PurchaseStatus {
  return purchaseSteps[Math.min(purchaseSteps.indexOf(status) + 1, purchaseSteps.length - 1)]
}


export interface PricePolicyInput {
  name: string
  type: PricePolicy['type']
  discount: number
  tiers?: PriceTier[]
}

export function validatePricePolicy(input: PricePolicyInput): string[] {
  const errors: string[] = []
  if (!input.name.trim()) errors.push('请填写策略名称')
  if (!Number.isFinite(input.discount) || input.discount < 1 || input.discount > 100) errors.push('优惠比例需在 1-100 之间')
  if (input.type === 'ladder') {
    const tiers = input.tiers || []
    if (!tiers.length) {
      errors.push('阶梯价至少需要 1 个档位')
    } else {
      let prevMax: number | null = null
      tiers.forEach((tier, index) => {
        const label = `档位${index + 1}`
        if (!Number.isInteger(tier.minQty) || tier.minQty < 1) { errors.push(`${label}：起始数量需为 ≥1 的整数`); return }
        if (tier.maxQty !== null && (!Number.isInteger(tier.maxQty) || tier.maxQty < tier.minQty)) { errors.push(`${label}：上限数量需为 ≥ 起始数量的整数，或留空表示无上限`); return }
        if (!Number.isFinite(tier.price) || tier.price <= 0) { errors.push(`${label}：集采单价需大于 0`); return }
        if (!Number.isFinite(tier.discountOff) || tier.discountOff < 0 || tier.discountOff > 100) { errors.push(`${label}：让利比例需在 0-100 之间`); return }
        if (index > 0) {
          if (prevMax === null) { errors.push('无上限档（上限留空）必须排在最后'); return }
          if (tier.minQty <= prevMax) { errors.push(`${label}：起始数量需大于上一档上限，区间不能重叠`); return }
        }
        prevMax = tier.maxQty
      })
    }
  }
  return errors
}


// ===== 中台发布数据：admin 维护的门店图片/商品图片/门店人气值统一发布，其他应用读取覆盖 =====
export const PLATFORM_MEDIA_STORAGE_KEY = 'agritainment-platform-media'

export interface PlatformMedia {
  farms: Record<string, string>
  products: Record<string, { image: string; images?: string[] }>
  farmPopularity?: Record<string, number>
  updatedAt: string
}

interface PlatformMediaStorage {
  read: () => unknown
  write: (value: unknown) => void
}

function platformMediaStorage(): PlatformMediaStorage | null {
  // H5：直接使用 localStorage，保证同一 origin 下多端共享
  try {
    const scope = globalThis as { localStorage?: Storage }
    const storage = scope.localStorage
    if (storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function') {
      return {
        read: () => storage.getItem(PLATFORM_MEDIA_STORAGE_KEY),
        write: (value) => storage.setItem(PLATFORM_MEDIA_STORAGE_KEY, String(value))
      }
    }
  } catch {
    // 无 localStorage 时继续尝试 uni
  }
  // 小程序等端：尝试全局 uni
  try {
    const scope = globalThis as { uni?: { getStorageSync?: (key: string) => unknown; setStorageSync?: (key: string, value: unknown) => void } }
    const uniRef = scope.uni
    if (uniRef?.getStorageSync && uniRef.setStorageSync) {
      return {
        read: () => uniRef.getStorageSync!(PLATFORM_MEDIA_STORAGE_KEY),
        write: (value) => uniRef.setStorageSync!(PLATFORM_MEDIA_STORAGE_KEY, value)
      }
    }
  } catch {
    // 忽略
  }
  return null
}

export function emptyPlatformMedia(): PlatformMedia {
  return { farms: {}, products: {}, farmPopularity: {}, updatedAt: '' }
}

export function readPlatformMedia(): PlatformMedia | null {
  const storage = platformMediaStorage()
  if (!storage) return null
  try {
    let saved = storage.read()
    if (typeof saved === 'string') saved = JSON.parse(saved)
    if (saved && typeof saved === 'object') {
      const media = saved as Partial<PlatformMedia>
      if (media.farms && typeof media.farms === 'object' && media.products && typeof media.products === 'object') {
        return {
          farms: media.farms as Record<string, string>,
          products: media.products as Record<string, { image: string; images?: string[] }>,
          farmPopularity: media.farmPopularity && typeof media.farmPopularity === 'object' ? media.farmPopularity as Record<string, number> : {},
          updatedAt: typeof media.updatedAt === 'string' ? media.updatedAt : ''
        }
      }
    }
  } catch {
    // 读取异常时回退默认图
  }
  return null
}

export function writePlatformMedia(media: PlatformMedia): void {
  const storage = platformMediaStorage()
  if (!storage) return
  try {
    storage.write(JSON.stringify(media))
  } catch {
    // 存储失败不阻断业务
  }
}

function isUploadedImage(value: string | undefined): boolean {
  return !!value && (value.startsWith('data:image/') || value.startsWith('blob:'))
}

/** 发布门店图片：上传图写入素材库，非上传图（默认图/移除）则删除对应记录 */
export function upsertPlatformFarm(media: PlatformMedia | null, id: string, image: string): PlatformMedia {
  const base = media ?? emptyPlatformMedia()
  const farms = { ...base.farms }
  if (isUploadedImage(image)) farms[id] = image
  else delete farms[id]
  return { ...base, farms, updatedAt: new Date().toISOString() }
}

/** 发布门店人气值：人气值始终写入（0 也有效），无删除语义 */
export function upsertPlatformFarmPopularity(media: PlatformMedia | null, id: string, value: number): PlatformMedia {
  const base = media ?? emptyPlatformMedia()
  const farmPopularity = { ...(base.farmPopularity || {}) }
  farmPopularity[id] = Math.max(0, Math.round(value))
  return { ...base, farmPopularity, updatedAt: new Date().toISOString() }
}

/** 发布商品图片：主图/详情图任一为上传图则写入，否则删除对应记录 */
export function upsertPlatformProduct(media: PlatformMedia | null, id: string, image: string, images?: string[]): PlatformMedia {
  const base = media ?? emptyPlatformMedia()
  const products = { ...base.products }
  const uploadedImages = (images ?? []).filter(isUploadedImage)
  if (isUploadedImage(image) || uploadedImages.length) {
    products[id] = { image, images: uploadedImages }
  } else {
    delete products[id]
  }
  return { ...base, products, updatedAt: new Date().toISOString() }
}

/** 用素材库覆盖实体图片：无记录的实体保持原图 */
export function applyPlatformMedia(
  farms: FarmStore[] | null | undefined,
  products: Product[] | null | undefined,
  media: PlatformMedia | null = readPlatformMedia()
): void {
  if (!media) return
  if (Array.isArray(farms)) {
    farms.forEach((farm) => {
      const override = media.farms[farm.id]
      if (typeof override === 'string' && override) farm.image = override
      const popularity = media.farmPopularity?.[farm.id]
      if (typeof popularity === 'number') farm.livePopularity = popularity
    })
  }
  if (Array.isArray(products)) {
    products.forEach((product) => {
      const override = media.products[product.id]
      if (override && typeof override.image === 'string' && override.image) {
        product.image = override.image
        if (Array.isArray(override.images) && override.images.length) product.images = [...override.images]
      }
    })
  }
}


// ===== 共享业务数据通道：H5 同源共享，小程序回退种子 =====
export const PLATFORM_LIVES_STORAGE_KEY = 'agritainment-platform-lives'
export const PLATFORM_BINDINGS_STORAGE_KEY = 'agritainment-platform-bindings'
export const PLATFORM_CONFIG_STORAGE_KEY = 'agritainment-platform-config'
export const PLATFORM_SHARES_STORAGE_KEY = 'agritainment-platform-shares'
export const PLATFORM_STORE_ACCOUNTS_STORAGE_KEY = 'agritainment-platform-store-accounts'

export interface UserBinding {
  userId: string
  promoterId?: string
  staffAccountId?: string
  status: 'pending' | 'bound'
  boundAt?: string
}

export interface ShareConfig {
  promoterRate: number
  staffRate: number
}

export interface ShareRecord {
  id: string
  userId: string
  orderId: string
  orderAmount: number
  role: 'promoter' | 'staff'
  promoterId?: string
  staffAccountId?: string
  rate: number
  amount: number
  createdAt: string
  settled?: boolean
}

interface PlatformJsonStorage {
  read: (key: string) => unknown
  write: (key: string, value: unknown) => void
}

function platformJsonStorage(): PlatformJsonStorage | null {
  try {
    const scope = globalThis as { localStorage?: Storage }
    const storage = scope.localStorage
    if (storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function') {
      return { read: (key) => storage.getItem(key), write: (key, value) => storage.setItem(key, String(value)) }
    }
  } catch {
    // 无 localStorage 时继续尝试 uni
  }
  try {
    const scope = globalThis as { uni?: { getStorageSync?: (key: string) => unknown; setStorageSync?: (key: string, value: unknown) => void } }
    const uniRef = scope.uni
    if (uniRef?.getStorageSync && uniRef.setStorageSync) {
      return { read: (key) => uniRef.getStorageSync!(key), write: (key, value) => uniRef.setStorageSync!(key, value) }
    }
  } catch {
    // 忽略
  }
  return null
}

function readPlatformJson<T>(key: string, fallback: T | null = null): T | null {
  const storage = platformJsonStorage()
  if (!storage) return fallback
  try {
    let saved = storage.read(key)
    if (typeof saved === 'string') saved = JSON.parse(saved)
    return (saved ?? fallback) as T | null
  } catch {
    return fallback
  }
}

function writePlatformJson(key: string, value: unknown): void {
  const storage = platformJsonStorage()
  if (!storage) return
  try {
    storage.write(key, JSON.stringify(value))
  } catch {
    // 忽略
  }
}

/** 推客直播：创建/更新即发布，用户端合并读取；下架写 null 删除标记，防止种子直播复活 */
export function readPlatformLives(): Record<string, LiveRoom | null> | null {
  const lives = readPlatformJson<Record<string, LiveRoom | null>>(PLATFORM_LIVES_STORAGE_KEY)
  return lives && typeof lives === 'object' ? lives : null
}
export function writePlatformLive(room: LiveRoom): void {
  const lives = readPlatformLives() ?? {}
  writePlatformJson(PLATFORM_LIVES_STORAGE_KEY, { ...lives, [room.id]: room })
}
export function removePlatformLive(id: string): void {
  const lives = readPlatformLives() ?? {}
  lives[id] = null
  writePlatformJson(PLATFORM_LIVES_STORAGE_KEY, lives)
}
export function mergePlatformLives(rooms: LiveRoom[]): LiveRoom[] {
  const published = readPlatformLives()
  if (!published) return rooms
  const merged = [...rooms]
  Object.entries(published).forEach(([id, room]) => {
    if (room === null) {
      const index = merged.findIndex((item) => item.id === id)
      if (index >= 0) merged.splice(index, 1)
      return
    }
    const index = merged.findIndex((item) => item.id === id)
    if (index >= 0) merged[index] = room
    else merged.unshift(room)
  })
  return merged
}

/** 用户绑定：临时可覆盖，下单后正式锁定 */
export function readUserBindings(): Record<string, UserBinding> | null {
  const bindings = readPlatformJson<Record<string, UserBinding>>(PLATFORM_BINDINGS_STORAGE_KEY)
  return bindings && typeof bindings === 'object' ? bindings : null
}
export function upsertUserBinding(binding: UserBinding): void {
  const bindings = readUserBindings() ?? {}
  writePlatformJson(PLATFORM_BINDINGS_STORAGE_KEY, { ...bindings, [binding.userId]: binding })
}

/** 分成比例配置：中控台设置，各端读取 */
export const DEFAULT_SHARE_CONFIG: ShareConfig = { promoterRate: 5, staffRate: 3 }
export function readShareConfig(): ShareConfig {
  const saved = readPlatformJson<Partial<ShareConfig>>(PLATFORM_CONFIG_STORAGE_KEY)
  return {
    promoterRate: typeof saved?.promoterRate === 'number' ? saved.promoterRate : DEFAULT_SHARE_CONFIG.promoterRate,
    staffRate: typeof saved?.staffRate === 'number' ? saved.staffRate : DEFAULT_SHARE_CONFIG.staffRate
  }
}
export function writeShareConfig(config: ShareConfig): void {
  writePlatformJson(PLATFORM_CONFIG_STORAGE_KEY, { promoterRate: config.promoterRate, staffRate: config.staffRate })
}

/** 分成记录 */
export function readShareRecords(): ShareRecord[] | null {
  const records = readPlatformJson<ShareRecord[]>(PLATFORM_SHARES_STORAGE_KEY)
  return Array.isArray(records) ? records : null
}
export function writeShareRecord(record: ShareRecord): void {
  const records = readShareRecords() ?? []
  writePlatformJson(PLATFORM_SHARES_STORAGE_KEY, [record, ...records])
}

/** 整表覆盖写入分成记录（结算标记等） */
export function writeShareRecords(records: ShareRecord[]): void {
  writePlatformJson(PLATFORM_SHARES_STORAGE_KEY, records)
}

/** 按 id 批量标记分成已结算 */
export function markShareSettled(ids: string[]): void {
  const records = readShareRecords() ?? []
  const idSet = new Set(ids)
  let changed = false
  records.forEach((item) => { if (idSet.has(item.id) && !item.settled) { item.settled = true; changed = true } })
  if (changed) writeShareRecords(records)
}

/** 推客未结算分成求和（佣金结算口径） */
export function pendingShareAmount(promoterId: string): number {
  const records = readShareRecords() ?? []
  const sum = records
    .filter((item) => item.role === 'promoter' && item.promoterId === promoterId && !item.settled)
    .reduce((acc, item) => acc + item.amount, 0)
  return Math.round(sum * 100) / 100
}

/** 所有推客未结算分成总额 */
export function pendingShareTotal(): number {
  const records = readShareRecords() ?? []
  const sum = records.filter((item) => item.role === 'promoter' && !item.settled).reduce((acc, item) => acc + item.amount, 0)
  return Math.round(sum * 100) / 100
}

/** 推客端演示数据：仅在对应存储通道为空时写入一次，不覆盖用户真实数据 */
export const demoShareRecords: ShareRecord[] = [
  { id: 'SR-D001', userId: 'U9001', orderId: 'NJ202608151132', orderAmount: 288, role: 'promoter', promoterId: 'T001', rate: 5, amount: 14.4, createdAt: '2026-08-15 11:32' },
  { id: 'SR-D002', userId: 'U9002', orderId: 'NJ202608141026', orderAmount: 128, role: 'promoter', promoterId: 'T001', rate: 8, amount: 10.24, createdAt: '2026-08-14 10:26' },
  { id: 'SR-D003', userId: 'U9003', orderId: 'NJ202608121843', orderAmount: 68.9, role: 'promoter', promoterId: 'T001', rate: 10, amount: 6.89, createdAt: '2026-08-12 18:43' },
  { id: 'SR-D004', userId: 'U9004', orderId: 'NJ202608110947', orderAmount: 59.9, role: 'promoter', promoterId: 'T001', rate: 8, amount: 4.79, createdAt: '2026-08-11 09:47' },
  { id: 'SR-D005', userId: 'U9005', orderId: 'NJ202608091618', orderAmount: 45, role: 'promoter', promoterId: 'T001', rate: 5, amount: 2.25, createdAt: '2026-08-09 16:18' }
]

export const demoUserBindings: Record<string, UserBinding> = {
  U9001: { userId: 'U9001', promoterId: 'T001', status: 'bound', boundAt: '2026-08-15 11:35' },
  U9002: { userId: 'U9002', promoterId: 'T001', status: 'bound', boundAt: '2026-08-14 10:30' },
  U9003: { userId: 'U9003', promoterId: 'T001', status: 'pending' },
  U9004: { userId: 'U9004', promoterId: 'T001', status: 'bound', boundAt: '2026-08-11 09:50' },
  U9005: { userId: 'U9005', promoterId: 'T001', status: 'pending' }
}

export function seedPlatformDemoData(): void {
  if (!readShareRecords()) writePlatformJson(PLATFORM_SHARES_STORAGE_KEY, demoShareRecords)
  if (!readUserBindings()) writePlatformJson(PLATFORM_BINDINGS_STORAGE_KEY, demoUserBindings)
}

// ===== 中台主数据发布：admin 维护的商品/门店/供应商/价格策略/品类全字段发布，其他应用读取覆盖 =====
export const PLATFORM_ENTITIES_STORAGE_KEY = 'agritainment-platform-entities'

export type PlatformEntityKind = 'products' | 'farms' | 'suppliers' | 'policies' | 'categories'

export interface PlatformEntities {
  products?: Record<string, Product>
  farms?: Record<string, FarmStore>
  suppliers?: Record<string, Supplier>
  policies?: Record<string, PricePolicy>
  categories?: Record<string, Category>
  updatedAt: string
}

export function readPlatformEntities(): PlatformEntities | null {
  const entities = readPlatformJson<PlatformEntities>(PLATFORM_ENTITIES_STORAGE_KEY)
  return entities && typeof entities === 'object' ? entities : null
}

export function writePlatformEntities(entities: PlatformEntities): void {
  writePlatformJson(PLATFORM_ENTITIES_STORAGE_KEY, entities)
}

/** 按 id 整体覆盖某类实体快照（无删除语义：商品/门店用上下架/停用表达业务状态） */
export function upsertPlatformEntity(kind: PlatformEntityKind, id: string, entity: unknown): PlatformEntities {
  const base = readPlatformEntities() ?? { updatedAt: '' }
  const map = { ...((base[kind] as Record<string, unknown> | undefined) || {}) }
  map[id] = entity
  const next: PlatformEntities = { ...base, [kind]: map, updatedAt: new Date().toISOString() }
  writePlatformEntities(next)
  return next
}

/** 平台实体覆盖种子：按 id 整体替换，追加平台独有实体；无记录保持种子 */
export function mergePlatformEntities<T extends { id: string }>(list: T[], map: Record<string, T> | undefined): T[] {
  if (!map) return list
  const existing = new Set(list.map((item) => item.id))
  const merged = list.map((item) => (map[item.id] ? { ...item, ...map[item.id] } : item))
  for (const entity of Object.values(map)) {
    if (!existing.has(entity.id)) merged.push(entity)
  }
  return merged
}

export function applyPlatformEntities(
  products: Product[] | null | undefined,
  farms: FarmStore[] | null | undefined,
  suppliers: Supplier[] | null | undefined,
  policies: PricePolicy[] | null | undefined,
  categories: Category[] | null | undefined,
  entities: PlatformEntities | null = readPlatformEntities()
): void {
  if (!entities) return
  if (Array.isArray(products) && entities.products) products.splice(0, products.length, ...mergePlatformEntities(products, entities.products))
  if (Array.isArray(farms) && entities.farms) farms.splice(0, farms.length, ...mergePlatformEntities(farms, entities.farms))
  if (Array.isArray(suppliers) && entities.suppliers) suppliers.splice(0, suppliers.length, ...mergePlatformEntities(suppliers, entities.suppliers))
  if (Array.isArray(policies) && entities.policies) policies.splice(0, policies.length, ...mergePlatformEntities(policies, entities.policies))
  if (Array.isArray(categories) && entities.categories) categories.splice(0, categories.length, ...mergePlatformEntities(categories, entities.categories))
}

// ===== 订单/售后跨端串联：消费端下单写入，中台履约/售后处理回写 =====
export const PLATFORM_ORDERS_STORAGE_KEY = 'agritainment-platform-orders'
export const PLATFORM_AFTERSALES_STORAGE_KEY = 'agritainment-platform-after-sales'

export function readPlatformOrders(): Record<string, Order> | null {
  const orders = readPlatformJson<Record<string, Order>>(PLATFORM_ORDERS_STORAGE_KEY)
  return orders && typeof orders === 'object' ? orders : null
}
export function writePlatformOrder(order: Order): void {
  const orders = readPlatformOrders() ?? {}
  writePlatformJson(PLATFORM_ORDERS_STORAGE_KEY, { ...orders, [order.id]: order })
}
export function mergePlatformOrders(defaults: Order[], published: Record<string, Order> | null): Order[] {
  if (!published) return defaults
  const byId = new Map(defaults.map((item) => [item.id, item]))
  const merged = defaults.map((item) => published[item.id] ?? item)
  for (const order of Object.values(published)) {
    if (!byId.has(order.id)) merged.unshift(order)
  }
  return merged
}
export function readPlatformAfterSales(): Record<string, AfterSale> | null {
  const works = readPlatformJson<Record<string, AfterSale>>(PLATFORM_AFTERSALES_STORAGE_KEY)
  return works && typeof works === 'object' ? works : null
}
export function writePlatformAfterSale(work: AfterSale): void {
  const works = readPlatformAfterSales() ?? {}
  writePlatformJson(PLATFORM_AFTERSALES_STORAGE_KEY, { ...works, [work.id]: work })
}
export function mergePlatformAfterSales(defaults: AfterSale[], published: Record<string, AfterSale> | null): AfterSale[] {
  if (!published) return defaults
  const byId = new Map(defaults.map((item) => [item.id, item]))
  const merged = defaults.map((item) => published[item.id] ?? item)
  for (const work of Object.values(published)) {
    if (!byId.has(work.id)) merged.unshift(work)
  }
  return merged
}

export const ORDER_STATUS_TEXT: Record<OrderStatus, string> = {
  pending: '待发货', shipping: '已发货', delivered: '已完成', 'after-sale': '已完成',
  'paid-cancelled': '已支付取消', 'unpaid-cancelled': '未支付取消'
}

export function orderStatusText(status: OrderStatus): string {
  return ORDER_STATUS_TEXT[status] || status
}

/** 消费端读取中台回写的订单状态（未出现在平台通道返回 null） */
export function readPlatformOrderStatus(orderId: string): string | null {
  const order = readPlatformOrders()?.[orderId]
  return order ? orderStatusText(order.status) : null
}

export function readPlatformOrder(orderId: string): Order | null {
  return readPlatformOrders()?.[orderId] || null
}
export function readPlatformAfterSaleStatus(orderId: string): string | null {
  const work = Object.values(readPlatformAfterSales() || {}).find((item) => item.orderId === orderId)
  if (!work) return null
  const map: Record<string, string> = { processing: '售后中', rejected: '售后拒绝', 'refund-pending': '待退款', 'return-pending': '待退货', refunded: '已退款', 'refund-failed': '退款失败' }
  return map[work.status] || work.status
}

// ===== 佣金结算回流：中台结算后同步推客端/联盟端 =====
export const PLATFORM_SETTLEMENTS_STORAGE_KEY = 'agritainment-platform-settlements'

export interface PlatformCommissionSettlement {
  commission: number
  settled: boolean
  settledAt?: string
}

export function readPlatformCommissionSettlement(promoterId: string): PlatformCommissionSettlement | null {
  const settlements = readPlatformJson<Record<string, PlatformCommissionSettlement>>(PLATFORM_SETTLEMENTS_STORAGE_KEY)
  return settlements?.[promoterId] || null
}

export function writePlatformCommissionSettlement(promoterId: string, payload: PlatformCommissionSettlement): void {
  const settlements = readPlatformJson<Record<string, PlatformCommissionSettlement>>(PLATFORM_SETTLEMENTS_STORAGE_KEY) || {}
  settlements[promoterId] = payload
  writePlatformJson(PLATFORM_SETTLEMENTS_STORAGE_KEY, settlements)
}



/** 门店账号：中控台与门店端店长工作台共享 */
export function readPlatformStoreAccounts(): StoreAccount[] | null {
  const accounts = readPlatformJson<StoreAccount[]>(PLATFORM_STORE_ACCOUNTS_STORAGE_KEY)
  return Array.isArray(accounts) ? accounts : null
}
export function writePlatformStoreAccounts(accounts: StoreAccount[]): void {
  writePlatformJson(PLATFORM_STORE_ACCOUNTS_STORAGE_KEY, accounts)
}
export function mergePlatformStoreAccounts(defaults: StoreAccount[], published: StoreAccount[] | null): StoreAccount[] {
  if (!published) return defaults
  const byId = new Map(published.map((item) => [item.id, item]))
  const merged = defaults.map((item) => byId.get(item.id) ?? item)
  const ids = new Set(merged.map((item) => item.id))
  return [...merged, ...published.filter((item) => !ids.has(item.id))]
}

/** 消费分成计算：正式绑定 + 全局比例 */
export function resolveShare(
  binding: UserBinding | null | undefined,
  config: ShareConfig,
  amount: number
): { role: 'promoter' | 'staff'; rate: number; amount: number } | null {
  if (!binding || binding.status !== 'bound' || !Number.isFinite(amount) || amount <= 0) return null
  const role = binding.promoterId ? 'promoter' : binding.staffAccountId ? 'staff' : null
  if (!role) return null
  const rate = role === 'promoter' ? config.promoterRate : config.staffRate
  return { role, rate, amount: round2((amount * rate) / 100) }
}


/** 用户身份：openid 锚定到稳定 userId，用户端 / 门店端统一 */
export const USER_ID_STORAGE_KEY = 'agritainment-user-id'
export const PLATFORM_USER_LINKS_STORAGE_KEY = 'agritainment-platform-user-links'

function readUserStorageValue(key: string): string {
  const storage = platformJsonStorage()
  if (!storage) return ''
  try {
    let saved = storage.read(key)
    if (typeof saved === 'string') {
      try {
        saved = JSON.parse(saved)
      } catch {
        // 非 JSON 字符串（如纯 userId）
      }
    }
    if (typeof saved === 'string') return saved
    if (saved && typeof saved === 'object' && 'data' in saved) {
      const data = (saved as { data?: unknown }).data
      if (typeof data === 'string') return data
    }
  } catch {
    // 忽略
  }
  return ''
}

function writeUserStorageValue(key: string, value: string): void {
  const storage = platformJsonStorage()
  if (!storage) return
  try {
    storage.write(key, value)
  } catch {
    // 忽略
  }
}

/** 读取或生成本地匿名 userId（两端共用，H5 同源一致） */
export function getOrCreateUserId(): string {
  const saved = readUserStorageValue(USER_ID_STORAGE_KEY)
  if (saved) return saved
  const userId = createId('U')
  writeUserStorageValue(USER_ID_STORAGE_KEY, userId)
  return userId
}

/** openid -> userId 映射（共享通道，H5 同域共享） */
export function readUserLinks(): Record<string, string> | null {
  const links = readPlatformJson<Record<string, string>>(PLATFORM_USER_LINKS_STORAGE_KEY)
  return links && typeof links === 'object' ? links : null
}
export function writeUserLink(openid: string, userId: string): void {
  if (!openid || !userId) return
  const links = readUserLinks() ?? {}
  writePlatformJson(PLATFORM_USER_LINKS_STORAGE_KEY, { ...links, [openid]: userId })
}
export function resolveUserIdByOpenid(openid: string): string {
  if (!openid) return ''
  return (readUserLinks() ?? {})[openid] || ''
}

/** 以 openid 解析统一 userId：已映射则复用；否则用本地 userId 并建立 openid↔userId 映射 */
export function resolveUserIdentity(openid: string): string {
  if (!openid) return getOrCreateUserId()
  const linked = resolveUserIdByOpenid(openid)
  if (linked) return linked
  const userId = getOrCreateUserId()
  writeUserLink(openid, userId)
  return userId
}

// ===== 供应商履约：司机账号 / 配送交接 / 缺货（apps/supplier）=====
export const PLATFORM_DRIVERS_STORAGE_KEY = 'agritainment-platform-drivers'
export const SUPPLIER_DEMO_ID = 'S002'
export const SUPPLIER_DEMO_ACCOUNT = 'supplier'
export const SUPPLIER_DEMO_PASSWORD = '123456'

export function readPlatformDrivers(): DriverAccount[] | null {
  const drivers = readPlatformJson<DriverAccount[]>(PLATFORM_DRIVERS_STORAGE_KEY)
  return Array.isArray(drivers) ? drivers : null
}
export function writePlatformDrivers(drivers: DriverAccount[]): void {
  writePlatformJson(PLATFORM_DRIVERS_STORAGE_KEY, drivers)
}
export function mergePlatformDrivers(defaults: DriverAccount[], published: DriverAccount[] | null): DriverAccount[] {
  if (!published) return defaults
  const byId = new Map(published.map((item) => [item.id, item]))
  const merged = defaults.map((item) => byId.get(item.id) ?? item)
  const ids = new Set(merged.map((item) => item.id))
  return [...merged, ...published.filter((item) => !ids.has(item.id))]
}

export const demoDrivers: DriverAccount[] = [
  { id: 'D001', supplierId: SUPPLIER_DEMO_ID, name: '张伟', account: 'driver01', password: '123456', phone: '13711110001', status: 'active', createdAt: '2026-08-18 09:00' },
  { id: 'D002', supplierId: SUPPLIER_DEMO_ID, name: '李强', account: 'driver02', password: '123456', phone: '13711110002', status: 'active', createdAt: '2026-08-18 09:05' },
  { id: 'D003', supplierId: SUPPLIER_DEMO_ID, name: '王芳', account: 'driver03', password: '123456', phone: '13711110003', status: 'active', createdAt: '2026-08-18 09:10' }
]

const supplierStatusToOrderStatus: Record<PurchaseStatus, OrderStatus> = {
  submitted: 'pending', accepted: 'pending', shipped: 'shipping', delivering: 'shipping', received: 'delivered', completed: 'delivered', cancelled: 'unpaid-cancelled'
}

/** 门店进货单若无履约信息（如 store 直接提交的单），按 Order.status 推导初始履约状态 */
export function ensureSupplierFulfillment(order: Order): SupplierFulfillment {
  if (order.supplierFulfillment) return order.supplierFulfillment
  const status: PurchaseStatus =
    order.status === 'shipping' ? 'shipped' :
    order.status === 'delivered' ? 'received' :
    order.status === 'unpaid-cancelled' || order.status === 'paid-cancelled' ? 'cancelled' : 'submitted'
  return { status, shortages: [], handovers: [], updatedAt: order.createdAt }
}

export function computeShortage(items: OrderItem[], actuals: Record<string, number>): ShortageItem[] {
  return items
    .map((item) => {
      const raw = actuals[item.skuId]
      const actual = Number.isFinite(raw) ? Math.max(0, Math.min(item.quantity, Math.round(raw))) : item.quantity
      return { skuId: item.skuId, name: item.name, ordered: item.quantity, actual, shortage: item.quantity - actual }
    })
    .filter((item) => item.shortage > 0)
}

export interface SupplierMetrics {
  toAcceptCount: number
  toDispatchCount: number
  toHandoverCount: number
  deliveringCount: number
  shortageOrderCount: number
  todayOrderCount: number
  todayAmount: number
}

export function deriveSupplierMetrics(orders: Order[]): SupplierMetrics {
  const now = new Date()
  const todayPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const isToday = (value: string) => value.startsWith(todayPrefix)
  const todayOrders = orders.filter((order) => isToday(order.createdAt))
  return {
    toAcceptCount: orders.filter((order) => ensureSupplierFulfillment(order).status === 'submitted').length,
    toDispatchCount: orders.filter((order) => ensureSupplierFulfillment(order).status === 'accepted').length,
    toHandoverCount: orders.filter((order) => ensureSupplierFulfillment(order).status === 'shipped').length,
    deliveringCount: orders.filter((order) => ensureSupplierFulfillment(order).status === 'delivering').length,
    shortageOrderCount: orders.filter((order) => (order.supplierFulfillment?.shortages.length || 0) > 0).length,
    todayOrderCount: todayOrders.length,
    todayAmount: round2(todayOrders.reduce((sum, order) => sum + order.amount, 0))
  }
}

export function driverActiveTaskCounts(orders: Order[]): Record<string, number> {
  const result: Record<string, number> = {}
  for (const order of orders) {
    const fulfillment = order.supplierFulfillment
    if (fulfillment?.driverId && fulfillment.shipType === 'driver' && (fulfillment.status === 'shipped' || fulfillment.status === 'delivering')) {
      result[fulfillment.driverId] = (result[fulfillment.driverId] || 0) + 1
    }
  }
  return result
}

export function validateSupplierAccount(account: string, password: string): boolean {
  return account.trim() === SUPPLIER_DEMO_ACCOUNT && password === SUPPLIER_DEMO_PASSWORD
}
export function findDriverByAccount(drivers: DriverAccount[], account: string): DriverAccount | null {
  return drivers.find((driver) => driver.account === account.trim()) || null
}
export function findActiveDriver(drivers: DriverAccount[], account: string, password: string): DriverAccount | null {
  const driver = findDriverByAccount(drivers, account)
  return driver && driver.status === 'active' && driver.password === password ? driver : null
}

function flowEvent(action: string, operator: string, note?: string): OrderFlowEvent {
  const event: OrderFlowEvent = { time: new Date().toLocaleString('zh-CN'), action, operator }
  if (note) event.note = note
  return event
}

export function acceptSupplierOrder(order: Order, operator: string): Order | null {
  const fulfillment = ensureSupplierFulfillment(order)
  if (fulfillment.status !== 'submitted') return null
  const now = new Date().toLocaleString('zh-CN')
  return {
    ...order,
    status: 'pending',
    flow: [...(order.flow || []), flowEvent('中台已接单 · 供应商已接单，备货中', operator)],
    supplierFulfillment: { ...fulfillment, status: 'accepted', updatedAt: now }
  }
}

export function assignSupplierDriver(order: Order, driver: DriverAccount, operator: string): Order | null {
  const fulfillment = ensureSupplierFulfillment(order)
  if (fulfillment.status !== 'accepted') return null
  if (!driver || driver.status !== 'active') return null
  if (driver.supplierId !== (order.supplierId || SUPPLIER_DEMO_ID)) return null
  const now = new Date().toLocaleString('zh-CN')
  return {
    ...order,
    status: 'shipping',
    flow: [...(order.flow || []), flowEvent(`已发货 · 已指派司机 ${driver.name} 配送`, operator)],
    supplierFulfillment: { ...fulfillment, status: 'shipped', shipType: 'driver', driverId: driver.id, driverName: driver.name, updatedAt: now }
  }
}

export function reassignSupplierDriver(order: Order, driver: DriverAccount, operator: string): Order | null {
  const fulfillment = ensureSupplierFulfillment(order)
  if (!fulfillment.driverId || fulfillment.shipType !== 'driver') return null
  if (fulfillment.status !== 'shipped' && fulfillment.status !== 'delivering') return null
  if (!driver || driver.status !== 'active' || driver.id === fulfillment.driverId) return null
  if (driver.supplierId !== (order.supplierId || SUPPLIER_DEMO_ID)) return null
  const now = new Date().toLocaleString('zh-CN')
  return {
    ...order,
    status: 'shipping',
    flow: [...(order.flow || []), flowEvent(`改派司机 · ${driver.name}（原 ${fulfillment.driverName || '未指派'}）`, operator)],
    supplierFulfillment: { ...fulfillment, driverId: driver.id, driverName: driver.name, updatedAt: now }
  }
}

export function shipSupplierCourier(order: Order, trackingNo: string, operator: string): Order | null {
  const fulfillment = ensureSupplierFulfillment(order)
  if (fulfillment.status !== 'accepted') return null
  if (!trackingNo || !trackingNo.trim()) return null
  const now = new Date().toLocaleString('zh-CN')
  return {
    ...order,
    status: 'shipping',
    trackingNo: trackingNo.trim(),
    flow: [...(order.flow || []), flowEvent(`已发货 · 快递直发，运单 ${trackingNo.trim()}`, operator)],
    supplierFulfillment: { ...fulfillment, status: 'shipped', shipType: 'courier', trackingNo: trackingNo.trim(), updatedAt: now }
  }
}

export function handoverSupplierOut(order: Order, actuals: Record<string, number>, operator: { id: string; name: string; role: 'supplier' | 'driver' }, note?: string): Order | null {
  const fulfillment = ensureSupplierFulfillment(order)
  if (fulfillment.status !== 'shipped') return null
  const shortages = computeShortage(order.items || [], actuals)
  const now = new Date().toLocaleString('zh-CN')
  const handover: HandoverLog = { id: createId('H'), type: 'out', orderId: order.id, time: now, operatorId: operator.id, operatorName: operator.name, operatorRole: operator.role, shortageCount: shortages.length }
  if (note) handover.note = note
  const flow = [...(order.flow || []), flowEvent(fulfillment.shipType === 'courier' ? '出库交接完成 · 快递揽收' : `出库交接完成 · 司机 ${fulfillment.driverName || ''} 领货`, operator.name)]
  if (shortages.length) {
    flow.push(flowEvent(`缺货 ${shortages.length} 项：${shortages.map((item) => `${item.name} -${item.shortage}`).join('、')}`, operator.name))
  }
  return {
    ...order,
    status: 'shipping',
    flow,
    supplierFulfillment: { ...fulfillment, status: 'delivering', shortages, handovers: [...fulfillment.handovers, handover], updatedAt: now }
  }
}

export function handoverSupplierIn(order: Order, operator: { id: string; name: string; role: 'supplier' | 'driver' }, note?: string): Order | null {
  const fulfillment = ensureSupplierFulfillment(order)
  if (fulfillment.status !== 'delivering' || fulfillment.shipType !== 'driver') return null
  if (fulfillment.driverId !== operator.id) return null
  const now = new Date().toLocaleString('zh-CN')
  const handover: HandoverLog = { id: createId('H'), type: 'in', orderId: order.id, time: now, operatorId: operator.id, operatorName: operator.name, operatorRole: operator.role }
  if (note) handover.note = note
  return {
    ...order,
    status: 'delivered',
    flow: [...(order.flow || []), flowEvent(`到店交接完成 · 司机 ${operator.name} 已与门店交接`, operator.name)],
    supplierFulfillment: { ...fulfillment, status: 'received', handovers: [...fulfillment.handovers, handover], updatedAt: now }
  }
}

export function confirmCourierDelivered(order: Order, operator: { id: string; name: string; role: 'supplier' | 'driver' }): Order | null {
  const fulfillment = ensureSupplierFulfillment(order)
  if (fulfillment.status !== 'delivering' || fulfillment.shipType !== 'courier') return null
  const now = new Date().toLocaleString('zh-CN')
  return {
    ...order,
    status: 'delivered',
    flow: [...(order.flow || []), flowEvent('已签收 · 快递送达门店', operator.name)],
    supplierFulfillment: { ...fulfillment, status: 'received', updatedAt: now }
  }
}

export * from './auth'
