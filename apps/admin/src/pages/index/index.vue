<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import type { ECharts } from 'echarts'
import type { AfterSale, AfterSaleStatus, Category, CommissionRule, DictGroup, DictItem, FarmStore, Order, OrderFlowEvent, OrderItem, OrderStatus, PricePolicy, Product, Promoter, StoreAccount, StoreRole, Supplier } from '@agritainment/shared'
import { derivePlatformMetrics, focusFirstInteractive, formatNumber, installKeyboardButtonSupport, money, pendingShareAmount, readShareConfig, readShareRecords, round2, toCsv, validatePricePolicy, writeShareConfig } from '@agritainment/shared'
import UiIcon from '../../components/UiIcon.vue'
import PaginationBar from '../../components/PaginationBar.vue'

import { useAdminStore } from '../../stores/admin'

type ModuleKey = 'dashboard' | 'suppliers' | 'products' | 'categories' | 'prices' | 'orders' | 'afterSales' | 'farms' | 'promoters' | 'commissions' | 'dict'

const store = useAdminStore()
const metrics = computed(() => derivePlatformMetrics({ orders: store.orders, products: store.products, farms: store.farms, suppliers: store.suppliers, afterSales: store.afterSales, promoters: store.promoters }))
const active = ref<ModuleKey>('dashboard')
const keyword = ref('')
const page = ref(1)
const pageSize = 20
const dialog = ref<'supplier' | 'supplier-edit' | 'policy' | 'policy-edit' | 'farm' | 'farm-edit' | 'product' | 'product-edit' | 'category' | 'category-edit' | 'promoter' | 'promoter-edit' | 'after-sale-init' | 'commission' | 'dict' | 'dict-edit' | 'dict-group' | 'dict-group-edit' | 'store-account' | 'store-account-edit' | null>(null)
type DetailType = 'todos' | 'supplier' | 'order' | 'afterSale' | 'farm'
type TierFormRow = { minQty: number; maxQty: number | null | ''; price: number; discountOff: number }
const detail = ref<{ type: DetailType; id?: string } | null>(null)
const form = ref({ id: '', skuId: '', name: '', category: '综合品类', type: 'group' as PricePolicy['type'], scope: '全部农家乐', discount: 8, tiers: [] as TierFormRow[], spec: '', image: '', images: [] as string[], region: '湖南省', price: 59.9, cost: 42, stock: 100, source: 'platform' as Product['source'], supplier: '平台自营', result: 'refund' as AfterSale['type'], refundMethod: 'return' as 'return' | 'only', refundMode: 'full' as 'full' | 'ratio' | 'custom', refundRatio: 100, refundAmount: 0, rate: 10, enabled: true, contactPhone: '', businessLicense: '', permit: '', validUntil: '', reviewNote: '运营邀请入驻，等待供应商补充资质', city: '', tags: '', rating: 5, averageSpend: 0, livePopularity: 0, coop: false, farmStatus: 'pending' as FarmStore['status'], categoryType: 'product' as Category['type'], level: '', promoterType: '推客', promoterStatus: 'active' as Promoter['status'], dictCode: '', dictLabel: '', dictSort: 0, dictGroupName: '', dictGroupType: '', accountFarmId: '', accountName: '', accountPhone: '', accountPassword: '', accountRole: 'staff' as StoreRole, accountPromo: false, initIssue: '' })
const period = ref('本月')
const trendRange = ref<'7d' | '1m' | '3m' | '1y'>('7d')
const nowText = ref('')
function refreshNow() {
  nowText.value = new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-')
}
function switchPeriod(value: string) {
  period.value = value
  showToast(`已切换统计周期：${value}`)
}
const supplierKeyword = ref('')
const supplierStatusFilter = ref('全部')
const orderKeyword = ref('')
const orderStatusFilter = ref('全部')
const orderChannelFilter = ref('全部来源')
const orderAfterFilter = ref('全部')
const orderStoreFilter = ref('')
const orderStoreSearch = ref('')
const storeDropdownOpen = ref(false)
const afterKeyword = ref('')
const afterTypeFilter = ref('全部')
const farmKeyword = ref('')
const farmStatusFilter = ref('全部门店')
const farmCityFilter = ref('全部城市')
const promoterKeyword = ref('')
const promoterTypeFilter = ref('全部')
const commissionTab = ref('佣金结算')
const commissionKeyword = ref('')
const commissionStatusFilter = ref('全部')
const commissionHistoryPage = ref(1)
const supplierSettleKeyword = ref('')
const ruleKeyword = ref('')
const categoryKeyword = ref('')
const categoryTypeFilter = ref('全部')
const dictTypeTab = ref<string>('city')
const dictKeyword = ref('')
const farmTab = ref('门店列表')
const farmAccountFilter = ref('全部')
const afterReasonFilter = ref('全部')
const productKeyword = ref('')
const productSourceFilter = ref('全部')
const productCategoryFilter = ref('全部')
const productStatusFilter = ref('全部')
const promoterRankTab = ref('推客排行')
const afterTab = ref('售后工单')
const selectedOrderIds = ref<string[]>([])
const busy = ref(false)
const operationKeys = ref<Record<string, boolean>>({})
let overlayTrigger: HTMLElement | null = null
let disposeKeyboardButtons: () => void = () => undefined
const trendEl = ref<HTMLElement | null>(null)
const categoryEl = ref<HTMLElement | null>(null)
let trendChart: ECharts | null = null
let categoryChart: ECharts | null = null

const navItems: Array<{ key: ModuleKey; label: string; icon: string; badge?: () => number }> = [
  { key: 'dashboard', label: '数据看板', icon: 'layout-dashboard' },
  { key: 'suppliers', label: '供应商管理', icon: 'factory', badge: () => store.pendingSuppliers },
  { key: 'products', label: '商品库管理', icon: 'package', badge: () => store.pendingProducts },
  { key: 'categories', label: '品类管理', icon: 'list-tree' },
  { key: 'prices', label: '价格体系', icon: 'tags' },
  { key: 'orders', label: '订单履约', icon: 'truck', badge: () => store.pendingOrders },
  { key: 'afterSales', label: '售后结算', icon: 'headset', badge: () => store.pendingAfterSales },
  { key: 'farms', label: '农家乐管理', icon: 'store' },
  { key: 'promoters', label: '推客管理', icon: 'megaphone' },
  { key: 'commissions', label: '佣金结算', icon: 'badge-percent' },
  { key: 'dict', label: '字典数据', icon: 'book-open' }
]

const navGroups = [
  { name: '数据中心', items: navItems.filter((item) => item.key === 'dashboard') },
  { name: '供应链管理', items: navItems.filter((item) => ['suppliers','products','categories','prices','orders','afterSales','dict'].includes(item.key)) },
  { name: '经营端', items: navItems.filter((item) => ['farms','promoters','commissions'].includes(item.key)) }
]

const titles: Record<ModuleKey, { title: string; subtitle: string }> = {
  dashboard: { title: '数据看板', subtitle: '平台经营全景与实时待办' },
  suppliers: { title: '供应商管理', subtitle: '供应商入驻、资质审核与合作状态' },
  products: { title: '商品库管理', subtitle: '统一选品 · 统一标准 · 覆盖农产品、预制菜、食材调料、酒水饮料、文旅伴手礼、民宿用品' },
  categories: { title: '品类管理', subtitle: '商品品类与供应商品类统一维护 · 支持新增、修改与删除' },
  prices: { title: '价格体系', subtitle: '支持集采价、阶梯价、区域价、会员价等多维价格策略 · 帮助农家乐降低采购成本' },
  orders: { title: '订单履约', subtitle: '订单、库存、发货、配送统一管理 · 直播成交订单由中台统一承接履约' },
  afterSales: { title: '售后结算', subtitle: '统一售后服务与结算分账 · 减少农家乐履约压力' },
  farms: { title: '农家乐管理', subtitle: '门店入驻、经营状态与选品数据' },
  promoters: { title: '推客管理', subtitle: '推客、达人、主播资源管理 · 锁粉归因与排行' },
  commissions: { title: '佣金结算', subtitle: '佣金规则配置与结算流水 · 含供应商结算记录' },
  dict: { title: '字典数据', subtitle: '城市信息 · 售后原因 · 数据状态统一维护' }
}

const filteredSuppliers = computed(() => store.suppliers.filter((item) => {
  const matchesGlobal = `${item.name}${item.region}${item.category}`.includes(keyword.value)
  const q = supplierKeyword.value.trim().toLowerCase()
  const matchesKeyword = !q || `${item.name}${item.region}${item.category}`.toLowerCase().includes(q)
  const matchesStatus = supplierStatusFilter.value === '全部' || (supplierStatusFilter.value === '待审核' && item.status === 'pending') || (supplierStatusFilter.value === '已合作' && item.status === 'cooperating') || (supplierStatusFilter.value === '已停用' && item.status === 'paused') || (supplierStatusFilter.value === '供销社' && item.coop)
  return matchesGlobal && matchesKeyword && matchesStatus
}))
const filteredProducts = computed(() => store.products.filter((item) => {
  const matchesGlobal = `${item.name}${item.category}${item.supplier}`.includes(keyword.value)
  const q = productKeyword.value.trim().toLowerCase()
  const matchesProductKeyword = !q || item.name.toLowerCase().includes(q)
  const matchesSource = productSourceFilter.value === '全部' || item.source === productSourceFilter.value
  const matchesCategory = productCategoryFilter.value === '全部' || item.category === productCategoryFilter.value
  const matchesStatus = productStatusFilter.value === '全部' || item.status === productStatusFilter.value
  return matchesGlobal && matchesProductKeyword && matchesSource && matchesCategory && matchesStatus
}))
const filteredOrders = computed(() => store.orders.filter((item) => {
  const matchesGlobal = `${item.id}${item.productName}${item.customer}`.includes(keyword.value)
  const q = orderKeyword.value.trim().toLowerCase()
  const matchesKeyword = !q || `${item.id}${item.productName}${item.customer}`.toLowerCase().includes(q)
  const matchesStore = !orderStoreFilter.value || item.customer === orderStoreFilter.value
  const channelMap = { '商城': 'shop', '直播': 'live', '进货': 'purchase' } as Record<string, Order['channel']>
  const matchesChannel = orderChannelFilter.value === '全部来源' || item.channel === channelMap[orderChannelFilter.value]
  const after = store.afterSales.find((a) => a.orderId === item.id)
  const afterStatusMap = { '未发起': 'none', '售后中': 'processing', '售后拒绝': 'rejected', '待退款': 'refund-pending', '待退货': 'return-pending', '已退款': 'refunded', '退款失败': 'refund-failed' } as Record<string, string>
  const matchesAfter = orderAfterFilter.value === '全部' || (orderAfterFilter.value === '未发起' ? !after : after?.status === afterStatusMap[orderAfterFilter.value])
  return matchesGlobal && matchesKeyword && matchesStore && matchesChannel && matchesAfter
}))
const visibleOrders = computed(() => {
  if (orderStatusFilter.value === '待发货') return filteredOrders.value.filter((item) => item.status === 'pending')
  if (orderStatusFilter.value === '已发货') return filteredOrders.value.filter((item) => item.status === 'shipping')
  if (orderStatusFilter.value === '已完成') return filteredOrders.value.filter((item) => item.status === 'delivered' || item.status === 'after-sale')
  if (orderStatusFilter.value === '已支付取消') return filteredOrders.value.filter((item) => item.status === 'paid-cancelled')
  if (orderStatusFilter.value === '未支付取消') return filteredOrders.value.filter((item) => item.status === 'unpaid-cancelled')
  return filteredOrders.value
})
const filteredPolicies = computed(() => store.policies.filter((item) => `${item.name}${item.scope}${item.type}`.includes(keyword.value)))
const filteredAfterSales = computed(() => store.afterSales.filter((item) => {
  const matchesGlobal = `${item.id}${item.orderId}${item.productName}${item.applicant}`.includes(keyword.value)
  const q = afterKeyword.value.trim().toLowerCase()
  const matchesKeyword = !q || `${item.id}${item.orderId}${item.productName}${item.applicant}`.toLowerCase().includes(q)
  const matchesType = afterTypeFilter.value === '全部' || item.type === afterTypeFilter.value
  const matchesReason = afterReasonFilter.value === '全部' || (item.issue || '').includes(afterReasonFilter.value)
  return matchesGlobal && matchesKeyword && matchesType && matchesReason
}))
const afterReasonOptions = computed(() => store.dictItems.filter((item) => item.type === 'afterSaleReason' && item.enabled).map((item) => item.label))
const filteredFarms = computed(() => store.farms.filter((item) => {
  if (item.id === 'F004') return false
  const matchesGlobal = `${item.name}${item.region}${item.tags.join('')}`.includes(keyword.value)
  const q = farmKeyword.value.trim().toLowerCase()
  const matchesKeyword = !q || `${item.name}${item.region}${item.tags.join('')}`.toLowerCase().includes(q)
  const matchesStatus = farmStatusFilter.value === '全部门店' || (farmStatusFilter.value === '试点样板' && item.id === 'F001') || (farmStatusFilter.value === '经营中' && item.status === 'active') || (farmStatusFilter.value === '筹备中' && item.status === 'pending') || (farmStatusFilter.value === '已停用' && item.status === 'paused')
  const matchesCity = farmCityFilter.value === '全部城市' || item.city === farmCityFilter.value
  return matchesGlobal && matchesKeyword && matchesStatus && matchesCity
}))
const farmCityOptions = computed(() => store.dictItems.filter((item) => item.type === 'city' && item.enabled).map((item) => item.code))
const filteredPromoters = computed(() => store.promoters.filter((item) => {
  const matchesGlobal = `${item.name}${item.level}`.includes(keyword.value)
  const q = promoterKeyword.value.trim().toLowerCase()
  const matchesKeyword = !q || `${item.name}${item.level}`.toLowerCase().includes(q)
  const matchesType = promoterTypeFilter.value === '全部' || item.type === promoterTypeFilter.value
  return matchesGlobal && matchesKeyword && matchesType
}))
const visiblePromoters = computed(() => {
  const list = promoterRankTab.value === '主播排行' ? filteredPromoters.value.filter((item) => item.type === '主播' || item.type === '达人') : filteredPromoters.value
  return [...list].sort((a, b) => b.commission - a.commission)
})
const pagedSuppliers = computed(() => filteredSuppliers.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const productRows = computed(() => filteredProducts.value.flatMap((product) => {
  const skus = product.skus?.length ? product.skus : [{ id: `${product.id}-DEFAULT`, name: product.spec || '默认规格', price: product.price, cost: product.cost, stock: product.stock }]
  return skus.map((sku) => ({ key: `${product.id}-${sku.id}`, product, sku }))
}))
const pagedProductRows = computed(() => productRows.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const pagedOrders = computed(() => visibleOrders.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const pagedAfterSales = computed(() => filteredAfterSales.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const pagedFarms = computed(() => filteredFarms.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const filteredStoreAccounts = computed(() => store.storeAccounts.filter((item) => farmAccountFilter.value === '全部' || item.farmId === farmAccountFilter.value))
const pagedStoreAccounts = computed(() => filteredStoreAccounts.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const pagedPromoters = computed(() => visiblePromoters.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const pagedPolicies = computed(() => filteredPolicies.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const policyGroups = computed(() => {
  const order: PricePolicy['type'][] = ['group', 'ladder', 'region', 'member']
  return order.map((type) => ({ type, items: pagedPolicies.value.filter((p) => p.type === type) })).filter((g) => g.items.length > 0)
})
const settlementRecords = computed(() => [
  ...store.supplierSettlementRecords.map((r) => ({ ...r, kind: 'supplier' as const })),
  ...store.commissionSettlementRecords.map((r) => ({ ...r, kind: 'commission' as const })),
])
const pagedSettlementRecords = computed(() => settlementRecords.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const filteredCommissionRecords = computed(() => {
  const q = commissionKeyword.value.trim().toLowerCase()
  return store.commissionSettlementRecords.filter((record) => {
    const matchesQ = !q || `${record.id}${record.amount}${record.items.map((item) => item.promoterName).join('')}`.toLowerCase().includes(q)
    return matchesQ
  })
})
const filteredSupplierRecords = computed(() => {
  const q = supplierSettleKeyword.value.trim().toLowerCase()
  return store.supplierSettlementRecords.filter((record) => {
    const matchesQ = !q || `${record.id}${record.amount}${record.items.map((item) => item.supplierName).join('')}`.toLowerCase().includes(q)
    return matchesQ
  })
})
const filteredRules = computed(() => {
  const q = ruleKeyword.value.trim().toLowerCase()
  return store.commissionRules.filter((rule) => {
    return !q || rule.name.toLowerCase().includes(q)
  })
})
const pagedCommissionRecords = computed(() => filteredCommissionRecords.value.slice((commissionHistoryPage.value - 1) * pageSize, commissionHistoryPage.value * pageSize))
const filteredPromoterCommissionRows = computed(() => {
  const q = commissionKeyword.value.trim().toLowerCase()
  return store.promoters.filter((item) => {
    const matchesKeyword = !q || `${item.name}${item.level}`.toLowerCase().includes(q)
    const pending = pendingShareAmount(item.id)
    const matchesStatus = commissionStatusFilter.value === '全部' || (commissionStatusFilter.value === '未结算' && pending > 0) || (commissionStatusFilter.value === '已结算' && pending <= 0)
    return matchesKeyword && matchesStatus
  })
})
const pagedPromoterCommissionRows = computed(() => filteredPromoterCommissionRows.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const pagedSupplierSettlementRecords = computed(() => filteredSupplierRecords.value.slice((page.value - 1) * pageSize, page.value * pageSize))
function settlementLabel(record: (typeof settlementRecords.value)[number]) {
  return record.kind === 'supplier'
    ? `供应商结算 · ${record.items.length} 家供应商 · ${record.orderIds.length} 笔订单`
    : `佣金结算 · ${record.items.length} 位推客`
}
const selectedSupplier = computed<Supplier | undefined>(() => store.suppliers.find((item) => item.id === detail.value?.id))
const selectedOrder = computed<Order | undefined>(() => store.orders.find((item) => item.id === detail.value?.id))
const selectedAfterSale = computed<AfterSale | undefined>(() => store.afterSales.find((item) => item.id === detail.value?.id))
const selectedFarm = computed<FarmStore | undefined>(() => store.farms.find((item) => item.id === detail.value?.id))
const editingProduct = computed(() => store.products.find((item) => item.id === form.value.id))
const supplierOptions = computed(() => ['平台自营', ...Array.from(new Set([...store.suppliers.map((item) => item.name), ...store.products.map((item) => item.supplier)]))])
const productCategories = computed(() => store.categories.filter((item) => item.type !== 'supplier'))
const supplierCategories = computed(() => store.categories.filter((item) => item.type !== 'product'))
const filteredCategories = computed(() => {
  const q = categoryKeyword.value.trim().toLowerCase()
  return store.categories.filter((item) => {
    const typeText = item.type === 'product' ? '商品品类' : item.type === 'supplier' ? '供应商品类' : '通用'
    const matchesKeyword = !q || `${item.name}${typeText}`.toLowerCase().includes(q)
    const matchesType = categoryTypeFilter.value === '全部' || item.type === categoryTypeFilter.value
    return matchesKeyword && matchesType
  })
})
const pagedCategories = computed(() => filteredCategories.value.slice((page.value - 1) * pageSize, page.value * pageSize))

const activeDictGroup = computed(() => store.dictGroups.find((group) => group.type === dictTypeTab.value))
const filteredDictItems = computed(() => {
  const q = dictKeyword.value.trim().toLowerCase()
  return store.dictItems.filter((item) => item.type === dictTypeTab.value && (!q || `${item.code}${item.label}`.toLowerCase().includes(q)))
})
const pagedDictItems = computed(() => filteredDictItems.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const supplierStatCounts = computed(() => ({
  cooperating: store.suppliers.filter((item) => item.status === 'cooperating').length,
  pending: store.suppliers.filter((item) => item.status === 'pending').length,
  coop: store.suppliers.filter((item) => item.coop).length
}))

function isOperating(key: string) {
  return operationKeys.value[key] === true
}

function showToast(title: string) {
  uni.showToast({ title, icon: 'none' })
}

function retryLoad() {
  store.setMockScenario('normal')
  store.initialize(true)
}

function selectModule(key: ModuleKey) {
  active.value = key
  keyword.value = ''
  page.value = 1
}

function rememberOverlayTrigger() {
  overlayTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
}

function closeOverlay() {
  dialog.value = null
  detail.value = null
  nextTick(() => overlayTrigger?.focus())
}

function markAllRead() {
  store.markNotificationsRead()
  closeOverlay()
  showToast('已全部标为已读')
}

function trapFocus(event: KeyboardEvent) {
  if (event.key !== 'Tab') return
  const root = event.currentTarget as HTMLElement
  const focusable = [...root.querySelectorAll<HTMLElement>('uni-button:not([disabled]), input:not(:disabled), select:not(:disabled)')]
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}

function focusOverlay() {
  nextTick(() => {
    const root = document.querySelector<HTMLElement>('.modal, .drawer')
    if (!root) return
    focusFirstInteractive(root)
  })
}

async function runOperation(key: string, action: () => boolean | void, success: string, failure = '当前没有可处理的数据') {
  if (isOperating(key)) return
  operationKeys.value[key] = true
  try {
    await new Promise((resolve) => setTimeout(resolve, 180))
    const result = action()
    if (success || result === false) showToast(result === false ? failure : success)
  } finally {
    delete operationKeys.value[key]
  }
}

function auditSupplier(id: string, approved: boolean) {
  return runOperation(`supplier-${id}`, () => store.auditSupplier(id, approved), approved ? '审核通过' : '已驳回')
}

function toggleSupplier(id: string) {
  return runOperation(`supplier-${id}`, () => store.toggleSupplier(id), '合作状态已更新')
}


function openDialog(type: 'supplier' | 'policy' | 'farm') {
  rememberOverlayTrigger()
  form.value = { id: '', skuId: '', name: '', category: '综合品类', type: 'group', scope: '全部农家乐', discount: 8, tiers: [], spec: '', image: '', images: [], region: type === 'farm' ? '' : '湖南省', price: 59.9, cost: 42, stock: 100, source: 'platform', supplier: '平台自营', result: 'refund', refundMethod: 'return', refundMode: 'full', refundRatio: 100, refundAmount: 0, rate: 10, enabled: true, contactPhone: '', businessLicense: '', permit: '', validUntil: '', reviewNote: '运营邀请入驻，等待供应商补充资质', city: '', tags: '', rating: 5, averageSpend: 0, livePopularity: 0, coop: false, farmStatus: 'pending', categoryType: 'product', level: '', promoterType: '推客', promoterStatus: 'active', dictCode: '', dictLabel: '', dictSort: 0, dictGroupName: '', dictGroupType: '', accountFarmId: '', accountName: '', accountPhone: '', accountPassword: '', accountRole: 'staff', accountPromo: false, initIssue: '' }
  if (type === 'supplier') form.value.category = '生鲜农产'
  dialog.value = type
  focusOverlay()
}

function openProductDialog(product?: Product, skuId?: string) {
  openDialog('farm')
  if (product) {
    const sku = product.skus.find((item) => item.id === skuId) || product.skus[0]
    Object.assign(form.value, product, { skuId: sku?.id || '', price: sku?.price ?? product.price, stock: sku?.stock ?? product.stock, images: product.images ? [...product.images] : [] })
  }
  dialog.value = product ? 'product-edit' : 'product'
}

function selectProductSku() {
  const sku = editingProduct.value?.skus.find((item) => item.id === form.value.skuId)
  if (sku) Object.assign(form.value, { price: sku.price, stock: sku.stock })
}

const orderStoreOptions = computed(() => Array.from(new Set(store.orders.map((item) => item.customer))))
const filteredOrderStoreOptions = computed(() => {
  const q = orderStoreSearch.value.trim().toLowerCase()
  if (!q) return orderStoreOptions.value
  return orderStoreOptions.value.filter((name) => name.toLowerCase().includes(q))
})

function orderItems(order: Order): Array<{ name: string; quantity: number; image?: string }> {
  if (order.items?.length) return order.items
  return [{ name: order.productName, quantity: order.quantity, image: '' }]
}

function orderTotalQty(order: Order) {
  if (order.items?.length) return order.items.reduce((sum, p) => sum + p.quantity, 0)
  return order.quantity
}

function orderFulfillmentText(status: OrderStatus) {
  return ({ pending: '待发货', shipping: '已发货', delivered: '已完成', 'after-sale': '已完成', 'paid-cancelled': '已支付取消', 'unpaid-cancelled': '未支付取消' } as Record<OrderStatus, string>)[status]
}

function orderFlow(order: Order): OrderFlowEvent[] {
  if (order.flow?.length) return order.flow
  const base: OrderFlowEvent[] = [
    { time: order.createdAt, action: '用户下单', operator: order.customer },
    { time: order.createdAt, action: '订单支付成功', operator: order.customer }
  ]
  if (order.status === 'paid-cancelled') return [...base, { time: order.createdAt, action: '已支付取消', operator: order.customer }]
  if (order.status === 'unpaid-cancelled') return [base[0], { time: order.createdAt, action: '未支付取消', operator: order.customer }]
  if (order.status === 'shipping') return [...base, { time: order.createdAt, action: '已发货 · 已安排司机配送', operator: '运营管理员' }]
  if (order.status === 'delivered' || order.status === 'after-sale') return [...base, { time: order.createdAt, action: '已发货 · 已安排司机配送', operator: '运营管理员' }, { time: order.createdAt, action: '已确认收货', operator: '运营管理员' }]
  return base
}

function orderPaidAmount(order: Order) {
  return order.status === 'unpaid-cancelled' ? 0 : order.amount
}

function afterSaleStatusText(status: AfterSaleStatus) {
  return ({ processing: '售后中', rejected: '售后拒绝', 'refund-pending': '待退款', 'return-pending': '待退货', refunded: '已退款', 'refund-failed': '退款失败' } as Record<AfterSaleStatus, string>)[status]
}

function orderAfterStatus(order: Order) {
  const after = store.afterSales.find((a) => a.orderId === order.id)
  return after ? afterSaleStatusText(after.status) : '未发起'
}

function selectOrderStore(name: string) {
  orderStoreFilter.value = name
  orderStoreSearch.value = name
  storeDropdownOpen.value = false
}

function closeStoreDropdown() {
  setTimeout(() => { storeDropdownOpen.value = false }, 120)
}

function openPolicyEdit(policy: PricePolicy) {
  openDialog('policy')
  Object.assign(form.value, policy, { tiers: policy.tiers ? policy.tiers.map((t) => ({ ...t })) : [] })
  dialog.value = 'policy-edit'
}

function addTier() {
  form.value.tiers.push({ minQty: 1, maxQty: null, price: 0, discountOff: 0 })
}

function removeTier(index: number) {
  form.value.tiers.splice(index, 1)
}

function openSupplierEdit(supplier: Supplier) {
  detail.value = null
  openDialog('supplier')
  Object.assign(form.value, {
    id: supplier.id,
    name: supplier.name,
    category: supplier.category,
    region: supplier.region,
    contactPhone: supplier.contactPhone || '',
    businessLicense: supplier.qualification.businessLicense,
    permit: supplier.qualification.permit,
    validUntil: supplier.qualification.validUntil,
    reviewNote: supplier.qualification.reviewNote,
    coop: !!supplier.coop
  })
  dialog.value = 'supplier-edit'
}

function openFarmEdit(farm: FarmStore) {
  detail.value = null
  openDialog('farm')
  Object.assign(form.value, {
    id: farm.id,
    name: farm.name,
    region: farm.region,
    city: farm.city,
    tags: (farm.tags || []).join('，'),
    rating: farm.rating,
    averageSpend: farm.averageSpend,
    livePopularity: farm.livePopularity,
    farmStatus: farm.status,
    image: farm.image
  })
  dialog.value = 'farm-edit'
}

function splitTags(text: string) {
  return text.split(/[,，、]/).map((item) => item.trim()).filter(Boolean)
}

function categoryUsage(category: Category) {
  return store.products.filter((product) => product.category === category.name).length + store.suppliers.filter((supplier) => supplier.category === category.name).length
}

function openCategoryDialog() {
  openDialog('farm')
  dialog.value = 'category'
}

function openCategoryEdit(category: Category) {
  openDialog('farm')
  Object.assign(form.value, { id: category.id, name: category.name, categoryType: category.type })
  dialog.value = 'category-edit'
}

function openDictDialog(item?: DictItem) {
  openDialog('farm')
  if (item) {
    Object.assign(form.value, { id: item.id, dictCode: item.code, dictLabel: item.label, dictSort: item.sort, enabled: item.enabled })
    dialog.value = 'dict-edit'
  } else {
    form.value.dictCode = ''
    form.value.dictLabel = ''
    form.value.dictSort = 0
    form.value.enabled = true
    dialog.value = 'dict'
  }
}

function openDictGroupDialog() {
  openDialog('farm')
  dialog.value = 'dict-group'
}

function openDictGroupEdit(group: DictGroup) {
  openDialog('farm')
  Object.assign(form.value, { id: group.id, dictGroupName: group.name, dictGroupType: group.type })
  dialog.value = 'dict-group-edit'
}

function removeDictGroup(group: DictGroup) {
  confirmAction(`确认删除分组「${group.name}」？`, () => {
    const removed = store.removeDictGroup(group.id)
    showToast(removed ? '分组已删除' : '该分组下还有字典项，请先清空')
    if (removed && dictTypeTab.value === group.type) {
      dictTypeTab.value = store.dictGroups[0]?.type || ''
      page.value = 1
    }
  })
}

const shareConfig = ref(readShareConfig())
const shareRecords = computed(() => readShareRecords() ?? [])
function saveShareConfig() {
  const config = { promoterRate: Math.max(0, Math.min(100, Number(shareConfig.value.promoterRate) || 0)), staffRate: Math.max(0, Math.min(100, Number(shareConfig.value.staffRate) || 0)) }
  shareConfig.value = config
  writeShareConfig(config)
  showToast('消费分成比例已保存并发布')
}

function openAccountDialog(item?: StoreAccount) {
  openDialog('farm')
  if (item) {
    Object.assign(form.value, { id: item.id, accountFarmId: item.farmId, accountName: item.name, accountPhone: item.account, accountPassword: item.password, accountRole: item.role, accountPromo: !!item.promoEnabled })
    dialog.value = 'store-account-edit'
  } else {
    form.value.accountFarmId = ''
    form.value.accountName = ''
    form.value.accountPhone = ''
    form.value.accountPassword = ''
    form.value.accountRole = 'staff'
    form.value.accountPromo = false
    dialog.value = 'store-account'
  }
}

function removeCategory(category: Category) {
  confirmAction(`确认删除品类「${category.name}」？`, () => {
    runOperation(`category-${category.id}`, () => store.removeCategory(category.id), '品类已删除', '该品类正在使用，无法删除')
  })
}


function supplierProducts(supplier: Supplier) {
  return store.products.filter((product) => product.supplier === supplier.name)
}

function isImageData(value?: string) {
  return !!value && (value.startsWith('data:image/') || value.startsWith('blob:'))
}

function fileToImageDataUrl(path: string) {
  return new Promise<string>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      try {
        const max = 800
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.width * scale))
        canvas.height = Math.max(1, Math.round(img.height * scale))
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('canvas'))
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.8))
      } catch (error) {
        reject(error)
      }
    }
    img.onerror = () => reject(new Error('image'))
    img.src = path
  })
}

function chooseLicense() {
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    success: async (res) => {
      const path = res.tempFilePaths[0]
      if (!path) return
      try {
        form.value.businessLicense = await fileToImageDataUrl(path)
      } catch {
        showToast('图片读取失败，请重试')
      }
    }
  })
}

function choosePermit() {
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    success: async (res) => {
      const path = res.tempFilePaths[0]
      if (!path) return
      try {
        form.value.permit = await fileToImageDataUrl(path)
      } catch {
        showToast('图片读取失败，请重试')
      }
    }
  })
}

function removeLicense() {
  form.value.businessLicense = ''
}

function removePermit() {
  form.value.permit = ''
}

function chooseFarmImage() {
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    success: async (res) => {
      const path = res.tempFilePaths[0]
      if (!path) return
      try {
        form.value.image = await fileToImageDataUrl(path)
      } catch {
        showToast('图片读取失败，请重试')
      }
    }
  })
}

function removeFarmImage() {
  form.value.image = ''
}

function openPromoterDialog() {
  openDialog('farm')
  dialog.value = 'promoter'
}

function openPromoterEdit(promoter: Promoter) {
  openDialog('farm')
  Object.assign(form.value, {
    id: promoter.id,
    name: promoter.name,
    level: promoter.level,
    promoterType: promoter.type || '推客',
    promoterStatus: promoter.status
  })
  dialog.value = 'promoter-edit'
}

function chooseProductMain() {
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    success: async (res) => {
      const path = res.tempFilePaths[0]
      if (!path) return
      try {
        form.value.image = await fileToImageDataUrl(path)
      } catch {
        showToast('图片读取失败，请重试')
      }
    }
  })
}

function removeProductMain() {
  form.value.image = ''
}

function chooseProductImages() {
  uni.chooseImage({
    count: Math.max(1, 9 - form.value.images.length),
    sizeType: ['compressed'],
    success: async (res) => {
      try {
        const paths = Array.isArray(res.tempFilePaths) ? res.tempFilePaths : [res.tempFilePaths]
        const urls = await Promise.all(paths.map((p) => fileToImageDataUrl(p)))
        form.value.images.push(...urls)
      } catch {
        showToast('图片读取失败，请重试')
      }
    }
  })
}

function removeProductImage(index: number) {
  form.value.images.splice(index, 1)
}

function onValidUntilChange(event: { detail: { value: string } }) {
  form.value.validUntil = event.detail.value
}

function previewImage(src: string) {
  if (!src) return
  uni.previewImage({ current: src, urls: [src] })
}

function previewSupplierLicenses(current: 'businessLicense' | 'permit') {
  const supplier = selectedSupplier.value
  if (!supplier) return
  const urls = [supplier.qualification.businessLicense, supplier.qualification.permit].filter(isImageData) as string[]
  if (!urls.length) return
  const currentUrl = supplier.qualification[current]
  uni.previewImage({ current: isImageData(currentUrl) ? currentUrl : urls[0], urls })
}

function confirmShip(order: Order) {
  if (!store.shipOrder(order.id)) return showToast('该订单当前不可发货')
  showToast('已发货，司机配送中')
}

function confirmOrder(order: Order) {
  if (!store.confirmOrder(order.id)) return showToast('该订单当前不可确认收货')
  showToast('已确认收货')
}

const editingAfterSale = computed(() => store.afterSales.find((item) => item.id === form.value.id))

function openAfterSaleInit(order: Order) {
  openDialog('farm')
  form.value.id = order.id
  form.value.result = 'refund'
  form.value.initIssue = ''
  dialog.value = 'after-sale-init'
}

function openCommission(rule: CommissionRule) {
  openDialog('farm')
  form.value.id = rule.id
  form.value.name = rule.name
  form.value.rate = rule.rate
  form.value.enabled = rule.enabled
  dialog.value = 'commission'
}

async function saveDialog() {
  if (busy.value) return
  busy.value = true
  await new Promise((resolve) => setTimeout(resolve, 180))
  let saved = true
  let errorMessage = ''
  if (dialog.value === 'supplier') {
    if (!form.value.name.trim()) { saved = false; errorMessage = '请填写供应商名称' }
    else if (form.value.contactPhone.trim() && !/^1[3-9]\d{9}$/.test(form.value.contactPhone.trim())) { saved = false; errorMessage = '请输入正确的11位手机号' }
    else saved = store.inviteSupplier({
      name: form.value.name, category: form.value.category, region: form.value.region, coop: form.value.coop,
      contactPhone: form.value.contactPhone, businessLicense: form.value.businessLicense,
      permit: form.value.permit, validUntil: form.value.validUntil
    })
  }
  if (dialog.value === 'supplier-edit') {
    if (!form.value.name.trim()) { saved = false; errorMessage = '请填写供应商名称' }
    else if (form.value.contactPhone.trim() && !/^1[3-9]\d{9}$/.test(form.value.contactPhone.trim())) { saved = false; errorMessage = '请输入正确的11位手机号' }
    else saved = store.updateSupplier(form.value.id, {
      name: form.value.name, category: form.value.category, region: form.value.region, coop: form.value.coop,
      contactPhone: form.value.contactPhone, businessLicense: form.value.businessLicense,
      permit: form.value.permit, validUntil: form.value.validUntil
    })
  }
  if (dialog.value === 'category') {
    if (!form.value.name.trim()) { saved = false; errorMessage = '请填写品类名称' }
    else saved = store.addCategory(form.value.name, form.value.categoryType)
  }
  if (dialog.value === 'category-edit') {
    if (!form.value.name.trim()) { saved = false; errorMessage = '请填写品类名称' }
    else saved = store.updateCategory(form.value.id, form.value.name, form.value.categoryType)
  }
  if (dialog.value === 'dict') {
    if (!form.value.dictCode.trim() || !form.value.dictLabel.trim()) { saved = false; errorMessage = '请填写字典编码和名称' }
    else saved = store.addDictItem({ type: dictTypeTab.value, code: form.value.dictCode, label: form.value.dictLabel, enabled: form.value.enabled, sort: Number(form.value.dictSort) })
  }
  if (dialog.value === 'dict-edit') {
    if (!form.value.dictCode.trim() || !form.value.dictLabel.trim()) { saved = false; errorMessage = '请填写字典编码和名称' }
    else saved = store.updateDictItem(form.value.id, { code: form.value.dictCode, label: form.value.dictLabel, enabled: form.value.enabled, sort: Number(form.value.dictSort) })
  }
  if (dialog.value === 'dict-group') {
    if (!form.value.dictGroupName.trim() || !form.value.dictGroupType.trim()) { saved = false; errorMessage = '请填写分组名称和类型编码' }
    else {
      saved = store.addDictGroup({ type: form.value.dictGroupType, name: form.value.dictGroupName })
      if (saved) {
        dictTypeTab.value = form.value.dictGroupType.trim()
        page.value = 1
      }
    }
  }
  if (dialog.value === 'dict-group-edit') {
    if (!form.value.dictGroupName.trim()) { saved = false; errorMessage = '请填写分组名称' }
    else saved = store.updateDictGroup(form.value.id, { name: form.value.dictGroupName })
  }
  if (dialog.value === 'store-account') {
    if (!form.value.accountFarmId || !form.value.accountName.trim() || !form.value.accountPhone.trim() || !form.value.accountPassword.trim()) { saved = false; errorMessage = '请填写门店、姓名、账号和密码' }
    else saved = store.addStoreAccount({ farmId: form.value.accountFarmId, name: form.value.accountName, account: form.value.accountPhone, password: form.value.accountPassword, role: form.value.accountRole, promoEnabled: form.value.accountPromo })
  }
  if (dialog.value === 'store-account-edit') {
    if (!form.value.accountName.trim() || !form.value.accountPhone.trim()) { saved = false; errorMessage = '请填写姓名和账号' }
    else saved = store.updateStoreAccount(form.value.id, { name: form.value.accountName, account: form.value.accountPhone, password: form.value.accountPassword || undefined, role: form.value.accountRole, promoEnabled: form.value.accountPromo })
  }
  if (dialog.value === 'policy' || dialog.value === 'policy-edit') {
    const tiers = form.value.tiers.map((t) => ({
      minQty: Number(t.minQty),
      maxQty: t.maxQty === '' || t.maxQty == null ? null : Number(t.maxQty),
      price: Number(t.price),
      discountOff: Number(t.discountOff)
    }))
    const policyErrors = validatePricePolicy({ name: form.value.name, type: form.value.type, discount: Number(form.value.discount), tiers })
    if (policyErrors.length) { saved = false; errorMessage = policyErrors[0] }
    else if (dialog.value === 'policy') saved = store.createPolicy(form.value.name, form.value.type, form.value.scope, Number(form.value.discount), tiers)
    else saved = store.updatePolicy(form.value.id, form.value.name, form.value.scope, Number(form.value.discount), form.value.enabled, tiers)
  }
  if (dialog.value === 'farm') {
    if (!form.value.name.trim()) { saved = false; errorMessage = '请填写门店名称' }
    else saved = store.addFarm({
      name: form.value.name, region: form.value.region, city: form.value.city, tags: splitTags(form.value.tags),
      rating: Number(form.value.rating), averageSpend: Number(form.value.averageSpend), livePopularity: Number(form.value.livePopularity) || 0, status: form.value.farmStatus, image: form.value.image
    })
  }
  if (dialog.value === 'farm-edit') {
    if (!form.value.name.trim()) { saved = false; errorMessage = '请填写门店名称' }
    else saved = store.updateFarm(form.value.id, {
      name: form.value.name, region: form.value.region, city: form.value.city, tags: splitTags(form.value.tags),
      rating: Number(form.value.rating), averageSpend: Number(form.value.averageSpend), livePopularity: Number(form.value.livePopularity) || 0, status: form.value.farmStatus, image: form.value.image
    })
  }
  if (dialog.value === 'product' || dialog.value === 'product-edit') {
    if (Number(form.value.price) <= Number(form.value.cost)) { saved = false; errorMessage = '零售价必须大于采集价' }
    else if (dialog.value === 'product') saved = store.createProduct({ name: form.value.name, category: form.value.category, price: Number(form.value.price), cost: Number(form.value.cost), stock: Number(form.value.stock), source: form.value.source, supplier: form.value.supplier, spec: form.value.spec, image: form.value.image || undefined, images: form.value.images })
    else saved = store.updateProduct(form.value.id, { name: form.value.name, category: form.value.category, supplier: form.value.supplier, cost: Number(form.value.cost), price: Number(form.value.price), stock: Number(form.value.stock), skuId: form.value.skuId, spec: form.value.spec, image: form.value.image || undefined, images: form.value.images })
  }
  if (dialog.value === 'after-sale-init') {
    if (!form.value.initIssue) { saved = false; errorMessage = '请选择售后原因' }
    else saved = store.initiateAfterSale(form.value.id, form.value.result, form.value.initIssue)
  }
  if (dialog.value === 'promoter') {
    if (!form.value.name.trim()) { saved = false; errorMessage = '请填写推客姓名' }
    else saved = store.addPromoter({ name: form.value.name, level: form.value.level, type: form.value.promoterType, status: form.value.promoterStatus })
  }
  if (dialog.value === 'promoter-edit') {
    if (!form.value.name.trim()) { saved = false; errorMessage = '请填写推客姓名' }
    else saved = store.updatePromoter(form.value.id, { name: form.value.name, level: form.value.level, type: form.value.promoterType, status: form.value.promoterStatus })
  }
  if (dialog.value === 'commission') saved = store.updateCommissionRule(form.value.id, Number(form.value.rate), true)
  busy.value = false
  if (!saved) return showToast(errorMessage || '请检查必填项和数值范围')
  dialog.value = null
  showToast('已保存到演示数据')
}

async function batchShip() {
  if (!selectedOrderIds.value.length) return showToast('请选择待发货订单')
  const ids = [...selectedOrderIds.value]
  await runOperation('batch-ship', () => {
    const count = store.batchShipOrders(ids)
    if (!count) return false
    showToast(`已批量发货 ${count} 单`)
  }, '', '没有可发货的订单')
  selectedOrderIds.value = []
}

function toggleOrderSelection(id: string) {
  selectedOrderIds.value = selectedOrderIds.value.includes(id)
    ? selectedOrderIds.value.filter((item) => item !== id)
    : [...selectedOrderIds.value, id]
}

function confirmAction(content: string, action: () => void) {
  uni.showModal({ title: '操作确认', content, success: ({ confirm }) => { if (confirm) action() } })
}

function openDetail(type: DetailType, id?: string) {
  rememberOverlayTrigger()
  detail.value = { type, id }
  focusOverlay()
}

function detailModule(key: ModuleKey) {
  detail.value = null
  selectModule(key)
}

function exportCurrent() {
  const exports: Record<ModuleKey, Array<Array<string | number>>> = {
    dashboard: [['指标', '数值'], ['平台交易额', round2(store.totalGmv)], ['入驻门店', store.farms.length], ['合作供应商', store.activeSupplierCount], ['履约订单', store.shippedOrderCount]],
    suppliers: [['供应商', '区域', '品类', '商品数', '状态'], ...filteredSuppliers.value.map((item) => [item.name, item.region, item.category, supplierProducts(item).length, statusText(item.status)])],
    products: [['商品', '规格', '品类', '供应商', '集采价', '建议零售', '库存', '状态'], ...productRows.value.map((row) => [row.product.name, row.sku.name, row.product.category, row.product.supplier, row.product.source === 'platform' ? round2(row.sku.cost) : '', round2(row.sku.price), row.sku.stock, statusText(row.product.status)])],
    categories: [['品类', '类型', '使用数量'], ...filteredCategories.value.map((item) => [item.name, item.type === 'product' ? '商品品类' : item.type === 'supplier' ? '供应商品类' : '通用', categoryUsage(item)])],
    prices: [['策略', '类型', '范围', '优惠比例', '状态'], ...filteredPolicies.value.map((item) => [item.name, item.type, item.scope, item.discount, item.enabled ? '启用' : '停用'])],
    orders: [['订单号', '商品', '数量', '客户', '渠道', '金额', '实付金额', '状态', '售后状态'], ...visibleOrders.value.map((item) => [item.id, item.items?.map((p) => p.name).join('、') || item.productName, orderTotalQty(item), item.customer, channelText(item.channel), round2(item.amount), round2(orderPaidAmount(item)), orderFulfillmentText(item.status), orderAfterStatus(item)])],
    afterSales: [['工单', '订单', '商品', '申请方', '类型', '金额', '状态'], ...filteredAfterSales.value.map((item) => [item.id, item.orderId, item.productName, item.applicant, item.type, round2(item.amount), afterSaleStatusText(item.status)])],
    farms: [['门店', '区域', '选品数', 'GMV', '状态'], ...filteredFarms.value.map((item) => [item.name, item.region, item.selectedCount, round2(item.gmv), statusText(item.status)])],
    promoters: [['推客', '等级', '锁粉', '订单', 'GMV', '佣金'], ...filteredPromoters.value.map((item) => [item.name, item.level, item.fans, item.orders, round2(item.gmv), round2(item.commission)])],
    commissions: [['类型', '单号', '金额', '时间'], ...store.commissionSettlementRecords.map((r) => ['佣金结算', r.id, round2(r.amount), r.createdAt]), ...store.supplierSettlementRecords.map((r) => ['供应商结算', r.id, round2(r.amount), r.createdAt])],
    dict: [['编码', '名称', '分组', '排序', '启用'], ...store.dictItems.map((item) => [item.code, item.label, store.dictGroups.find((group) => group.type === item.type)?.name || item.type, item.sort, item.enabled ? '启用' : '停用'])]
  }
  const rows = exports[active.value]
  const csv = toCsv(rows)
  store.recordExport(titles[active.value].title, rows.length - 1)
  // #ifdef H5
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${titles[active.value].title}-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
  // #endif
  showToast(`已导出 ${rows.length - 1} 条数据`)
}

function policyDesc(type: PricePolicy['type']) {
  const skuCount = store.products.length
  const ladderTiers = store.policies.filter((p) => p.type === 'ladder').reduce((sum, p) => sum + (p.tiers?.length || 0), 0)
  const regionCount = store.policies.filter((p) => p.type === 'region').length
  const memberCount = store.policies.filter((p) => p.type === 'member').length
  return ({
    group: `平台统一谈判集中采购价，所有农家乐均可享受。已覆盖 ${skuCount} 个 SKU`,
    ladder: `按采购量分档定价，量越大单价越低，鼓励集中采购。已配置 ${skuCount} 个 SKU · 共 ${ladderTiers} 个档位`,
    region: `按市州 / 县区差异化定价，匹配物流与本地供给。已配置 ${regionCount} 条区域策略`,
    member: `面向农家乐会员等级的专属采购价。${memberCount} 条会员策略`
  } as Record<PricePolicy['type'], string>)[type]
}

function productSkuNo(item: Product) {
  const n = Number(item.id.replace(/\D/g, '')) || 0
  return `SKU·${100000 + n * 26 + 260}`
}

function rowEmoji(name: string) {
  const map: Record<string, string> = { 腊肉: '🥓', 黄桃: '🍑', 黑茶: '🍵', 蜂蜜: '🍯', 洗漱: '🛏', 鱼仔: '🐟', 剁辣椒: '🫙', 富硒米: '🌾' }
  return map[Object.keys(map).find((k) => name.includes(k)) || ''] || '📦'
}

function statusText(status: string) {
  const dict = store.dictItems.find((item) => (item.type === 'status' || item.type.endsWith('Status')) && item.code === status && item.enabled)
  if (dict) return dict.label
  return ({ pending: '待处理', cooperating: '合作中', paused: '已暂停', active: '已上架', offline: '已下架', rejected: '已驳回', shipping: '已发货', delivered: '已完成', 'after-sale': '售后中', processing: '处理中', resolved: '已解决' } as Record<string, string>)[status] || status
}

function channelText(channel: string) {
  return ({ shop: '商城', live: '直播', purchase: '进货' } as Record<string, string>)[channel] || channel
}

const trendSeries = computed(() => {
  const orders = store.orders
  const latest = orders.reduce((value, order) => Math.max(value, new Date(order.createdAt.replace(' ', 'T')).getTime() || 0), 0) || Date.now()
  const end = new Date(latest)
  const keyOf = (date: Date, kind: 'day' | 'week' | 'month') => {
    if (kind === 'month') return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    if (kind === 'week') {
      const d = new Date(date)
      const day = (d.getDay() + 6) % 7
      d.setDate(d.getDate() - day)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }
  const labelOf = (date: Date, kind: 'day' | 'week' | 'month') => {
    if (kind === 'month') return `${date.getMonth() + 1}月`
    return `${date.getMonth() + 1}/${date.getDate()}`
  }
  const buckets: Array<{ key: string; label: string; amount: number; count: number }> = []
  const kind = trendRange.value === '1y' ? 'month' : trendRange.value === '3m' ? 'week' : 'day'
  if (trendRange.value === '1y') {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(end.getFullYear(), end.getMonth() - i, 1)
      buckets.push({ key: keyOf(d, 'month'), label: labelOf(d, 'month'), amount: 0, count: 0 })
    }
  } else if (trendRange.value === '3m') {
    const start = new Date(end)
    const day = (start.getDay() + 6) % 7
    start.setDate(start.getDate() - day)
    for (let i = 12; i >= 0; i--) {
      const d = new Date(start)
      d.setDate(d.getDate() - i * 7)
      buckets.push({ key: keyOf(d, 'week'), label: labelOf(d, 'week'), amount: 0, count: 0 })
    }
  } else {
    const total = trendRange.value === '1m' ? 29 : 6
    for (let i = total; i >= 0; i--) {
      const d = new Date(end)
      d.setDate(d.getDate() - i)
      buckets.push({ key: keyOf(d, 'day'), label: labelOf(d, 'day'), amount: 0, count: 0 })
    }
  }
  const map = new Map(buckets.map((b) => [b.key, b]))
  orders.forEach((order) => {
    const date = new Date(order.createdAt.replace(' ', 'T'))
    if (Number.isNaN(date.getTime())) return
    const bucket = map.get(keyOf(date, kind))
    if (bucket) { bucket.amount = round2(bucket.amount + order.amount); bucket.count += 1 }
  })
  return buckets
})

function renderCharts() {
  if (active.value !== 'dashboard' || !trendEl.value || !categoryEl.value) return
  trendChart?.dispose()
  categoryChart?.dispose()
  trendChart = echarts.init(trendEl.value)
  categoryChart = echarts.init(categoryEl.value)
  const trend = trendSeries.value
  trendChart.setOption({
    grid: { left: 52, right: 46, top: 34, bottom: 30 },
    tooltip: { trigger: 'axis', confine: true },
    legend: { top: 4, left: 'center', itemWidth: 9, itemHeight: 9, textStyle: { color: '#6f786f', fontSize: 11 } },
    xAxis: { type: 'category', data: trend.map((item) => item.label), axisLine: { lineStyle: { color: '#d9ddd6' } }, axisLabel: { color: '#7a8279' } },
    yAxis: [
      { type: 'value', name: '交易额', splitLine: { lineStyle: { color: '#eef0eb' } }, axisLabel: { color: '#7a8279' } },
      { type: 'value', name: '订单量', splitLine: { show: false }, axisLabel: { color: '#7a8279' } }
    ],
    series: [
      { name: '交易额', type: 'line', yAxisIndex: 0, smooth: true, data: trend.map((item) => item.amount), symbolSize: 7, lineStyle: { width: 3, color: '#1d6b44' }, itemStyle: { color: '#1d6b44' }, areaStyle: { color: 'rgba(29,107,68,.08)' } },
      { name: '订单量', type: 'bar', yAxisIndex: 1, data: trend.map((item) => item.count), barWidth: 11, itemStyle: { color: '#c2a25a', borderRadius: [3, 3, 0, 0] } }
    ]
  })
  categoryChart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {d}%' },
    title: { text: `${metrics.value.categoryShares.length} 类`, left: '42%', top: '42%', textAlign: 'center', textVerticalAlign: 'middle', textStyle: { fontSize: 16, fontWeight: 700, color: '#23291f' }, subtext: '商品品类', subtextStyle: { fontSize: 10, color: '#6f786f' } },
    legend: { orient: 'vertical', right: 6, top: 'middle', itemWidth: 9, itemHeight: 9, textStyle: { color: '#6f786f', fontSize: 11 } },
    series: [{ type: 'pie', radius: ['46%', '66%'], center: ['42%', '42%'], label: { show: false }, data: metrics.value.categoryShares.map((item, index) => ({ value: item.value, name: item.name, itemStyle: { color: ['#1d6b44', '#c2a25a', '#a65735', '#52617f', '#8c998b'][index % 5] } })) }]
  })
}

function resizeCharts() {
  trendChart?.resize()
  categoryChart?.resize()
}

watch(active, async () => { await nextTick(); renderCharts() })
watch(trendRange, async () => { if (active.value === 'dashboard') { await nextTick(); renderCharts() } })
watch([() => store.loading, () => store.auth.isLoggedIn], async () => { if (!store.loading && store.auth.isLoggedIn) { await nextTick(); renderCharts() } })
watch(keyword, () => { page.value = 1 })
watch([productKeyword, productSourceFilter, productCategoryFilter, productStatusFilter], () => { page.value = 1 })
watch([supplierKeyword, supplierStatusFilter, orderKeyword, orderStatusFilter, orderChannelFilter, orderAfterFilter, orderStoreFilter, afterKeyword, afterTypeFilter, farmKeyword, farmStatusFilter, farmCityFilter, promoterKeyword, promoterTypeFilter, categoryKeyword, categoryTypeFilter, commissionKeyword, commissionStatusFilter, supplierSettleKeyword, ruleKeyword, dictKeyword, farmAccountFilter, afterReasonFilter], () => { page.value = 1; commissionHistoryPage.value = 1 })
watch(orderStatusFilter, () => { page.value = 1; selectedOrderIds.value = [] })
const loginAccount = ref('admin')
const loginPassword = ref('123456')
function submitLogin() {
  if (!store.login(loginAccount.value, loginPassword.value)) {
    showToast('账号或密码错误（演示账号 admin / 123456）')
    return
  }
  showToast('登录成功，欢迎回来')
}
function logout() {
  store.logout()
  showToast('已退出登录')
}

onMounted(async () => {
  const scenario = new URLSearchParams(window.location.search).get('mock')
  if (scenario === 'empty' || scenario === 'failure') store.setMockScenario(scenario)
  await store.initialize()
  await nextTick()
  renderCharts()
  refreshNow()
  setInterval(refreshNow, 30000)
  disposeKeyboardButtons = installKeyboardButtonSupport()
  window.addEventListener('resize', resizeCharts)
})

onBeforeUnmount(() => {
  disposeKeyboardButtons()
  window.removeEventListener('resize', resizeCharts)
  trendChart?.dispose()
  categoryChart?.dispose()
})
</script>

<template>
  <view v-if="!store.auth.isLoggedIn" class="login-page">
    <view class="login-card">
      <view class="login-brand">
        <view class="brand-mark"><UiIcon name="sprout" :size="24" /></view>
        <view><text class="brand-title">甄选好物供应链</text><text class="brand-sub">湖南省电子商务协会 · 运营管理后台</text></view>
      </view>
      <view class="login-fields">
        <label class="login-field"><text>账号</text><input v-model="loginAccount" placeholder="请输入账号" confirm-type="next" /></label>
        <label class="login-field"><text>密码</text><input v-model="loginPassword" type="password" placeholder="请输入密码" confirm-type="done" @confirm="submitLogin" /></label>
      </view>
      <button class="login-button" @click="submitLogin">登 录</button>
      <text class="login-hint">演示账号：admin　密码：123456</text>
    </view>
  </view>
  <view v-else class="admin-shell">
    <aside class="sidebar">
      <view class="brand">
        <view class="brand-mark"><UiIcon name="sprout" :size="22" /></view>
        <view><text class="brand-title">甄选好物供应链</text><text class="brand-sub">湖南省电子商务协会</text></view>
      </view>
      <nav class="nav-list">
        <template v-for="group in navGroups" :key="group.name">
          <text class="nav-group">{{ group.name }}</text>
          <button v-for="item in group.items" :key="item.key" class="nav-item" :class="{ active: active === item.key }" @click="selectModule(item.key)">
            <UiIcon :name="item.icon" :size="18" />
            <text>{{ item.label }}</text>
            <text v-if="item.badge && item.badge()" class="nav-badge">{{ item.badge() }}</text>
          </button>
        </template>
      </nav>
      <view class="operator">
        <view class="avatar">管</view>
        <view><text>运营管理员</text><small>平台超级管理员 · {{ store.auth.account }}</small></view>
        <button class="logout-button" @click="logout">退出登录</button>
      </view>
    </aside>

    <main class="main">
      <header class="topbar">
        <view class="crumb">供应链中台 / <strong>{{ titles[active].title }}</strong></view>
        <view class="top-actions">
          <label class="search-box"><UiIcon name="search" :size="17" /><input v-model="keyword" placeholder="搜索商品 / 供应商 / 订单号" /></label>
          <button class="period-button" :class="{ on: period === '本月' }" @click="switchPeriod(period === '本月' ? '本周' : '本月')">📅 {{ period }}</button>
          <button class="icon-button" title="待办提醒" @click="openDetail('todos')"><UiIcon name="bell" :size="19" /><span v-if="!store.notificationsRead && store.pendingSuppliers + store.pendingProducts + store.pendingAfterSales" class="notice-dot"></span></button>
        </view>
      </header>

      <view class="content">
        <view class="page-head">
          <view><h1>{{ titles[active].title }}</h1><p>{{ active === 'dashboard' ? '平台经营全景 · 实时更新 · ' + nowText : active === 'farms' ? `${metrics.farmStats.total} 个农家乐独立小程序统一管理 · 门店入驻、选品上架、经营数据` : titles[active].subtitle }}</p></view>
          <view class="head-actions">
            <button class="button secondary" @click="exportCurrent"><UiIcon name="download" :size="16" />⬇ {{ active === 'dashboard' ? '导出报表' : '导出' }}</button>
            <button v-if="active === 'suppliers'" class="button primary" @click="openDialog('supplier')"><UiIcon name="plus" :size="16" />邀请供应商</button>
            <button v-if="active === 'products'" class="button primary" @click="openProductDialog()"><UiIcon name="plus" :size="16" />新增商品</button>
            <button v-if="active === 'categories'" class="button primary" @click="openCategoryDialog()"><UiIcon name="plus" :size="16" />新增品类</button>
            <button v-if="active === 'prices'" class="button primary" @click="openDialog('policy')"><UiIcon name="plus" :size="16" />＋ 新建价格策略</button>
            <button v-if="active === 'farms'" class="button primary" @click="openDialog('farm')"><UiIcon name="plus" :size="16" />＋ 新增农家乐门店</button>
            <button v-if="active === 'promoters'" class="button primary" @click="openPromoterDialog()"><UiIcon name="plus" :size="16" />新增推客</button>
            <button v-if="active === 'commissions'" class="button secondary" :disabled="isOperating('supplier-settle')" @click="confirmAction('确认结算全部合作供应商的未结订单？', () => runOperation('supplier-settle', () => store.settleSuppliers(store.suppliers.map(item => item.id)), '供应商批量结算完成', '没有可结算的供应商订单'))">{{ isOperating('supplier-settle') ? '结算中...' : '供应商结算' }}</button><button v-if="active === 'commissions'" class="button primary" :disabled="!store.totalCommission || isOperating('commission-settle')" @click="confirmAction('确认结算当前全部模拟佣金？', () => runOperation('commission-settle', () => store.settleCommissions(), '佣金已结算'))">{{ isOperating('commission-settle') ? '结算中...' : '发起佣金结算' }}</button><button v-if="active === 'commissions' && store.commissionRules.length" class="button secondary" @click="openCommission(store.commissionRules[0])">佣金规则</button>
          </view>
        </view>

        <view v-if="store.loading" class="loading">正在加载运营数据...</view>
        <view v-else-if="store.error" class="state-panel"><UiIcon name="radio" :size="28" /><strong>{{ store.error }}</strong><button class="button primary" @click="retryLoad">重新加载</button></view>

        <template v-else-if="active === 'dashboard'">
          <view class="kpi-grid">
            <view class="kpi-card"><span class="kpi-icon">💴</span><text>平台交易额(GMV)</text><strong>{{ money(metrics.gmv) }}</strong><small>共 {{ metrics.orderCount }} 笔订单</small></view>
            <view class="kpi-card"><span class="kpi-icon">🏡</span><text>入驻农家乐</text><strong>{{ metrics.farmCount }} 家</strong><small>经营中 {{ metrics.farmStats.liveCount }} 家</small></view>
            <view class="kpi-card"><span class="kpi-icon">🏭</span><text>合作供应商</text><strong>{{ metrics.supplierCount }} 家</strong><small>待审核 {{ store.pendingSuppliers }} 家</small></view>
            <view class="kpi-card"><span class="kpi-icon">📦</span><text>履约订单</text><strong>{{ metrics.orderCount.toLocaleString('zh-CN') }} 单</strong><small>待发货 {{ metrics.orderStats.pending }} 单</small></view>
          </view>
          <view class="chart-grid">
            <section class="panel trend-panel"><view class="panel-head"><h2>交易与订单趋势</h2><select v-model="trendRange" class="trend-range-select"><option value="7d">最近7天</option><option value="1m">最近一个月</option><option value="3m">最近三个月</option><option value="1y">最近一年</option></select></view><div ref="trendEl" class="chart"></div></section>
            <section class="panel"><view class="panel-head"><h2>品类销售占比</h2><text>8 类商品品类</text></view><div ref="categoryEl" class="chart"></div></section>
          </view>
          <view class="lower-grid">
            <section class="panel"><view class="panel-head"><h2>热销商品 TOP 5</h2><text>本月</text></view>
              <view v-for="product in metrics.hotProducts" :key="product.name" class="rank-row">
                <image class="hot-thumb" :src="product.image || '/static/images/rice.webp'" mode="aspectFit" /><view><strong>{{ product.name }}</strong><small>供应商：{{ product.supplier }}</small></view><view class="hot-right"><b>{{ money(product.amount) }}</b><small>{{ product.units }} 件</small></view>
              </view>
            </section>
            <section class="panel"><view class="panel-head"><h2>待办事项</h2><text>{{ store.pendingSuppliers + store.pendingProducts + store.pendingAfterSales + 1 }} 项待处理</text></view>
              <button class="todo-row" @click="selectModule('suppliers')"><span class="todo-emoji">🏭</span><view><strong>供应商资质待审核</strong><small>靖州杨梅专业合作社 等 {{ store.pendingSuppliers }} 家</small></view><span class="todo-pill wait">待审核</span></button>
              <button class="todo-row" @click="selectModule('products')"><span class="todo-emoji">📦</span><view><strong>农家乐自有商品待审</strong><small>石板溪 · 农家自制剁辣椒 等 {{ store.pendingProducts }} 件</small></view><span class="todo-pill wait">待审核</span></button>
              <button class="todo-row" @click="selectModule('afterSales')"><span class="todo-emoji">🛠</span><view><strong>售后工单待处理</strong><small>黄桃礼盒破损理赔 等 {{ store.pendingAfterSales }} 单</small></view><span class="todo-pill no">待处理</span></button>
              <button class="todo-row" @click="selectModule('commissions')"><span class="todo-emoji">💰</span><view><strong>推客佣金待结算</strong><small>本周期应结 {{ money(metrics.pendingCommission) }}</small></view><span class="todo-pill">待结算</span></button>
            </section>
          </view>
        </template>

        <section v-else-if="active === 'suppliers'" class="data-panel">
          <view class="stat-strip three">
            <view><small>合作供应商</small><strong>{{ supplierStatCounts.cooperating }} 家</strong></view>
            <view><small>待审核资质</small><strong>{{ supplierStatCounts.pending }} 家</strong><span>需在 48h 内处理</span></view>
            <view><small>供销社渠道</small><strong>{{ supplierStatCounts.coop }} 家</strong></view>
          </view>
          <view class="module-search"><label class="search-box"><UiIcon name="search" :size="16" /><input v-model="supplierKeyword" placeholder="搜索供应商名称 / 品类 / 区域" /></label><select v-model="supplierStatusFilter"><option value="全部">全部状态</option><option value="待审核">待审核</option><option value="已合作">已合作</option><option value="已停用">已停用</option><option value="供销社">供销社</option></select></view>
          <view class="table-row table-head supplier-grid"><text>供应商</text><text>主营品类</text><text>商品数</text><text>资质与状态</text><text>操作</text></view>
          <view v-for="item in pagedSuppliers" :key="item.id" class="table-row supplier-grid">
            <view><strong>{{ item.name }}</strong><small>{{ item.region }} · {{ item.coop ? '供销社' : (item.name.includes('合作社') ? '合作社' : '供应商') }}</small></view><view><strong>{{ item.category }}</strong><small>{{ item.region }}</small></view><text>{{ supplierProducts(item).length }}</text>
            <view><span class="status" :class="item.status">{{ item.certified ? '已认证' : '待认证' }} · {{ statusText(item.status) }}</span></view>
             <view class="row-actions"><button @click="openDetail('supplier', item.id)">详情</button><button @click="openSupplierEdit(item)">修改</button><button v-if="item.status === 'pending'" :disabled="isOperating(`supplier-${item.id}`)" @click="runOperation(`supplier-${item.id}`, () => store.auditSupplier(item.id, true), '审核通过')">{{ isOperating(`supplier-${item.id}`) ? '处理中...' : '通过' }}</button><button v-if="item.status === 'pending'" class="danger" :disabled="isOperating(`supplier-${item.id}`)" @click="runOperation(`supplier-${item.id}`, () => store.auditSupplier(item.id, false), '已驳回')">驳回</button></view>
          </view>
          <view v-if="!filteredSuppliers.length" class="empty-state">没有符合条件的供应商</view>
          <PaginationBar :page="page" :page-size="pageSize" :total="filteredSuppliers.length" @change="page = $event" />
        </section>

        <section v-else-if="active === 'categories'" class="data-panel">
          <view class="module-search"><label class="search-box"><UiIcon name="search" :size="16" /><input v-model="categoryKeyword" placeholder="搜索品类名称 / 类型" /></label><select v-model="categoryTypeFilter"><option value="全部">全部类型</option><option value="product">商品品类</option><option value="supplier">供应商品类</option><option value="general">通用</option></select></view>
          <view class="table-row table-head category-grid"><text>品类名称</text><text>类型</text><text>使用数量</text><text>操作</text></view>
          <view v-for="item in pagedCategories" :key="item.id" class="table-row category-grid">
            <strong>{{ item.name }}</strong>
            <span class="status" :class="item.type">{{ item.type === 'product' ? '商品品类' : item.type === 'supplier' ? '供应商品类' : '通用' }}</span>
            <text>{{ categoryUsage(item) }} 处</text>
            <view class="row-actions"><button @click="openCategoryEdit(item)">修改</button><button class="danger" @click="removeCategory(item)">删除</button></view>
          </view>
          <view v-if="!filteredCategories.length" class="empty-state">暂无品类</view>
          <PaginationBar :page="page" :page-size="pageSize" :total="filteredCategories.length" @change="page = $event" />
        </section>

        <section v-else-if="active === 'products'" class="data-panel">
          <view class="goods-tools"><view class="module-search"><label class="search-box"><UiIcon name="search" :size="16" /><input v-model="productKeyword" placeholder="搜索商品名称" /></label><select v-model="productCategoryFilter"><option value="全部">全品类</option><option v-for="option in productCategories" :key="option.id" :value="option.name">{{ option.name }}</option></select><select v-model="productSourceFilter"><option value="全部">全部来源</option><option value="platform">中台甄选</option><option value="farmhouse">门店自有(待审{{ store.pendingProducts }})</option></select><select v-model="productStatusFilter"><option value="全部">全部状态</option><option value="active">已上架</option><option value="offline">已下架</option><option value="pending">待审核</option></select></view><text class="goods-count">共 {{ productRows.length }} 条规格数据</text></view>
          <view class="table-row table-head product-grid"><text>商品</text><text>品类</text><text>来源</text><text>规格</text><text>集采价</text><text>建议零售</text><text>库存</text><text>已售</text><text>状态</text><text>操作</text></view>
          <view v-for="row in pagedProductRows" :key="row.key" class="table-row product-grid">
            <view class="product-cell"><image class="product-thumb" :src="row.product.image || '/static/images/rice.webp'" mode="aspectFit" /><view><strong>{{ row.product.name }}</strong><small class="sku-no">{{ row.sku.name }} · {{ row.product.source === 'platform' ? productSkuNo(row.product) : `${row.product.supplier} 提交` }}</small></view></view>
            <text>{{ row.product.category }}</text><span class="source-pill" :class="row.product.source">{{ row.product.source === 'platform' ? '中台甄选' : '农家乐自有' }}</span><text>{{ row.sku.name }}</text><strong>{{ row.product.source === 'platform' ? '¥' + formatNumber(row.sku.cost) : '—' }}</strong><strong>¥{{ formatNumber(row.sku.price) }}</strong><text>{{ row.sku.stock.toLocaleString('zh-CN') }}</text><text>{{ row.product.sales.toLocaleString('zh-CN') }}</text>
            <span class="status" :class="row.product.status">{{ row.product.status === 'pending' ? '待审核' : statusText(row.product.status) }}</span>
             <view class="row-actions"><button @click="openProductDialog(row.product, row.sku.id)">编辑</button><template v-if="row.product.status === 'pending'"><button :disabled="isOperating(`product-${row.product.id}`)" @click="runOperation(`product-${row.product.id}`, () => store.auditProduct(row.product.id, true), '商品已通过审核')">{{ isOperating(`product-${row.product.id}`) ? '处理中...' : '审核' }}</button><button class="danger" :disabled="isOperating(`product-${row.product.id}`)" @click="runOperation(`product-${row.product.id}`, () => store.auditProduct(row.product.id, false), '商品已驳回')">驳回</button></template><button v-else :disabled="isOperating(`product-${row.product.id}`)" @click="runOperation(`product-${row.product.id}`, () => store.toggleProduct(row.product.id), '商品状态已更新')">{{ isOperating(`product-${row.product.id}`) ? '处理中...' : row.product.status === 'active' ? '下架' : '上架' }}</button></view>
          </view>
          <view v-if="!productRows.length" class="empty-state">没有符合条件的商品</view>
          <PaginationBar :page="page" :page-size="pageSize" :total="productRows.length" @change="page = $event" />
        </section>

        <view v-else-if="active === 'prices'" class="policy-panels">
          <section v-for="group in policyGroups" :key="group.type" class="panel policy-group">
            <view class="panel-head policy-group-head"><view><h2>{{ group.type === 'group' ? '🏷 集采价' : group.type === 'ladder' ? '📶 阶梯价' : group.type === 'region' ? '🗺 区域价' : '👑 会员价' }}</h2><text>{{ policyDesc(group.type) }}</text></view><text class="policy-group-count">{{ group.items.length }} 条策略</text></view>
            <view class="policy-card-grid">
              <view v-for="item in group.items" :key="item.id" class="policy-data-card">
                <view class="policy-data-top"><view><strong>{{ item.name }}</strong><text class="policy-scope">{{ item.scope }}</text></view><view class="policy-actions"><button class="compact-button" @click="openPolicyEdit(item)">编辑</button><button class="switch" :class="{ on: item.enabled }" :disabled="isOperating(`policy-${item.id}`)" :aria-label="item.enabled ? '停用价格策略' : '启用价格策略'" @click="runOperation(`policy-${item.id}`, () => store.togglePolicy(item.id), '价格策略状态已更新')"><span></span></button></view></view>
                <view class="policy-data-meta"><text class="policy-discount">优惠 {{ item.discount }}%</text><span class="status" :class="item.enabled ? 'active' : 'rejected'">{{ item.enabled ? '启用' : '停用' }}</span></view>
                <view v-if="item.type === 'ladder' && item.tiers && item.tiers.length" class="tier-table">
                  <view class="table-row table-head tier-grid"><text>采购数量档位</text><text>集采单价</text><text>让利比例</text><text>适用对象</text></view>
                  <view v-for="(tier, ti) in item.tiers" :key="ti" class="table-row tier-grid"><text>{{ tier.maxQty === null ? `≥ ${tier.minQty} 件` : `${tier.minQty} – ${tier.maxQty} 件` }}</text><strong>¥{{ formatNumber(tier.price) }}</strong><text class="tier-off">↓ {{ tier.discountOff }}%</text><text>{{ item.scope }}</text></view>
                </view>
                <view v-else-if="item.type === 'ladder'" class="tier-empty">暂未配置档位</view>
              </view>
            </view>
          </section>
          <view v-if="!filteredPolicies.length" class="empty-state">没有符合条件的价格策略</view>
          <PaginationBar :page="page" :page-size="pageSize" :total="filteredPolicies.length" @change="page = $event" />
        </view>

        <section v-else-if="active === 'orders'" class="data-panel">
           <view class="module-toolbar"><view class="module-search"><label class="search-box"><UiIcon name="search" :size="16" /><input v-model="orderKeyword" placeholder="搜索订单号 / 商品" /></label><view class="store-filter"><input v-model="orderStoreSearch" placeholder="全部门店（可搜索）" @focus="storeDropdownOpen = true" @click="storeDropdownOpen = true" @input="storeDropdownOpen = true" @blur="closeStoreDropdown" /><view v-if="storeDropdownOpen" class="store-dropdown"><view class="store-option" @mousedown.prevent @click="selectOrderStore('')">全部门店</view><view v-for="option in filteredOrderStoreOptions" :key="option" class="store-option" @mousedown.prevent @click="selectOrderStore(option)">{{ option }}</view></view></view><select v-model="orderChannelFilter"><option value="全部来源">全部来源</option><option value="商城">商城</option><option value="直播">直播</option><option value="进货">进货</option></select><select v-model="orderStatusFilter"><option value="全部">全部状态</option><option value="待发货">待发货</option><option value="已发货">已发货</option><option value="已完成">已完成</option><option value="已支付取消">已支付取消</option><option value="未支付取消">未支付取消</option></select><select v-model="orderAfterFilter"><option value="全部">全部售后</option><option value="未发起">未发起</option><option value="售后中">售后中</option><option value="售后拒绝">售后拒绝</option><option value="待退款">待退款</option><option value="待退货">待退货</option><option value="已退款">已退款</option><option value="退款失败">退款失败</option></select></view><view class="toolbar-actions"><button class="button secondary" :disabled="!selectedOrderIds.length || isOperating('batch-ship')" @click="batchShip">{{ isOperating('batch-ship') ? '发货处理中...' : '批量发货' }}</button><button class="button primary" @click="exportCurrent">⬇ 导出订单</button></view></view>
          <view class="fulfill-strip">
            <view class="done"><b>✓</b><small>下单付款</small><strong>{{ metrics.orderStats.total }} 单</strong></view>
            <view class="done"><b>✓</b><small>中台接单</small><strong>自动分配供应商</strong></view>
            <view class="cur"><b>3</b><small>仓配发货</small><strong>{{ metrics.orderStats.pending }} 单处理中</strong></view>
            <view><b>4</b><small>司机配送</small><strong>在途 {{ metrics.orderStats.shipping }} 单</strong></view>
            <view><b>5</b><small>确认收货</small><strong>—</strong></view>
            <view><b>6</b><small>结算分账</small><strong>T+1 结算</strong></view>
          </view>
                    <view class="table-row table-head order-grid"><text>订单号</text><text>商品</text><text>数量</text><text>下单门店 / 渠道</text><text>金额</text><text>实付金额</text><text>来源</text><text>状态</text><text>售后状态</text><text>操作</text></view>
          <view v-for="item in pagedOrders" :key="item.id" class="table-row order-grid"><view class="order-id"><button v-if="item.status === 'pending'" class="order-select" :class="{ selected: selectedOrderIds.includes(item.id) }" :title="selectedOrderIds.includes(item.id) ? '取消选择' : '选择订单'" @click="toggleOrderSelection(item.id)"><UiIcon v-if="selectedOrderIds.includes(item.id)" name="check" :size="12" /></button><view><strong>{{ item.id }}</strong><small>{{ item.createdAt }}</small></view></view><view class="order-products"><view v-for="(p, idx) in orderItems(item)" :key="idx" class="order-product"><image v-if="p.image" class="order-thumb" :src="p.image" mode="aspectFit" @click="previewImage(p.image)" /><span v-else class="row-emoji">{{ rowEmoji(p.name) }}</span><text>{{ p.name }} ×{{ p.quantity }}</text></view></view><text class="order-qty">{{ orderTotalQty(item) }}</text><view><strong>{{ item.customer }}</strong></view><strong>¥{{ formatNumber(item.amount) }}</strong><strong>¥{{ formatNumber(orderPaidAmount(item)) }}</strong><text>{{ channelText(item.channel) }}</text><span class="status" :class="item.status">{{ orderFulfillmentText(item.status) }}</span><text>{{ orderAfterStatus(item) }}</text><view class="row-actions"><button v-if="item.status === 'delivered' && !store.afterSales.some((a) => a.orderId === item.id)" @click="openAfterSaleInit(item)">发起售后</button><button v-if="item.status === 'pending'" @click="confirmShip(item)">发货</button><button v-else @click="openDetail('order', item.id)">流转</button></view></view>
          <view v-if="!visibleOrders.length" class="empty-state">没有符合筛选条件的订单</view><PaginationBar :page="page" :page-size="pageSize" :total="visibleOrders.length" @change="page = $event" />
        </section>

        <section v-else-if="active === 'afterSales'" class="data-panel">
          <view class="settle-banner">
            <view><small>本周期应结算</small><strong>{{ money(metrics.afterSaleStats.settlement) }}</strong><span>T+1 自动分账 · 含供应商货款</span></view>
            <view><small>售后工单</small><strong>{{ metrics.afterSaleStats.count }} 单</strong><span>处理中 {{ metrics.afterSaleStats.processing }} · 已完结 {{ metrics.afterSaleStats.resolved }}</span></view>
            <view><small>售后率</small><strong>{{ metrics.afterSaleStats.rate }}</strong><span class="positive">按当前工单统计</span></view>
            <button class="button primary" @click="store.recordExport('售后结算', store.afterSales.length); showToast('已发起批量结算并记录流水')">发起批量结算</button>
          </view>
          <view class="summary-strip"><view><small>工单总量</small><strong>{{ store.afterSales.length }} 单</strong></view><view><small>处理中</small><strong>{{ store.pendingAfterSales }} 单</strong></view><view><small>售后金额</small><strong>{{ money(store.afterSales.reduce((sum,item) => sum + item.amount, 0)) }}</strong></view><view><small>已退款</small><strong>{{ store.afterSales.filter(item => item.status === 'refunded').length }} 单</strong></view></view>
          <view class="filter-chips"><button v-for="item in ['售后工单','结算流水']" :key="item" :class="{ active: afterTab === item }" @click="afterTab = item; page = 1">{{ item }}</button></view>
          <template v-if="afterTab === '售后工单'">
          <view class="module-search"><label class="search-box"><UiIcon name="search" :size="16" /><input v-model="afterKeyword" placeholder="搜索工单号 / 订单号 / 商品 / 申请方" /></label><select v-model="afterTypeFilter"><option value="全部">全部类型</option><option value="reship">破损补寄</option><option value="refund">退货退款</option><option value="claim">质量理赔</option></select><select v-model="afterReasonFilter"><option value="全部">全部原因</option><option v-for="reason in afterReasonOptions" :key="reason" :value="reason">{{ reason }}</option></select></view>
          <view class="table-row table-head after-grid"><text>工单</text><text>商品</text><text>数量</text><text>类型</text><text>申请金额</text><text>退款金额</text><text>状态</text><text>操作</text></view>
          <view v-for="item in pagedAfterSales" :key="item.id" class="table-row after-grid"><view><strong>{{ item.id }}</strong><small>{{ item.orderId }}</small></view><view class="product-cell"><image class="after-thumb" :src="item.image || '/static/images/rice.webp'" mode="aspectFit" /><view><strong>{{ item.productName }}</strong><small>{{ item.issue || item.applicant }}</small></view></view><text>{{ item.quantity ?? '—' }}</text><text>{{ item.type === 'reship' ? '破损补寄' : item.type === 'refund' ? '退货退款' : '质量理赔' }}</text><strong>{{ money(item.amount) }}</strong><text class="refund-amount">{{ item.refundAmount != null ? money(item.refundAmount) : '—' }}</text><span class="status" :class="item.status">{{ afterSaleStatusText(item.status) }}</span><view class="row-actions"><template v-if="item.status === 'processing'"><button @click="confirmAction('确认拒绝该售后申请？', () => runOperation(`after-${item.id}`, () => store.rejectAfterSale(item.id), '已拒绝售后'))">拒绝</button><button @click="confirmAction('确认同意退款？', () => runOperation(`after-${item.id}`, () => store.approveAfterSaleRefund(item.id), '已同意退款'))">同意退款</button><button @click="confirmAction('确认同意退货？', () => runOperation(`after-${item.id}`, () => store.approveAfterSaleReturn(item.id), '已同意退货'))">同意退货</button></template><template v-else-if="item.status === 'refund-pending' || item.status === 'return-pending'"><button @click="confirmAction('确认退款已到账？', () => runOperation(`after-${item.id}`, () => store.refundAfterSale(item.id, true), '退款成功'))">确认退款</button><button class="danger" @click="confirmAction('确认退款失败？', () => runOperation(`after-${item.id}`, () => store.refundAfterSale(item.id, false), '已标记退款失败'))">退款失败</button></template><button v-else @click="openDetail('afterSale', item.id)">记录</button></view></view><view v-if="!filteredAfterSales.length" class="empty-state">没有符合条件的售后工单</view><PaginationBar :page="page" :page-size="pageSize" :total="filteredAfterSales.length" @change="page = $event" />
          </template>
          <view v-else class="settlement-history after-flow">
            <view v-if="!store.supplierSettlementRecords.length && !store.commissionSettlementRecords.length" class="empty-state">暂无结算流水</view>
            <view v-for="record in pagedSettlementRecords" :key="`${record.kind}-${record.id}`" class="history-row"><strong>{{ record.id }} · {{ money(record.amount) }}</strong><small>{{ settlementLabel(record) }} · {{ record.createdAt }}</small></view>
            <PaginationBar :page="page" :page-size="pageSize" :total="settlementRecords.length" @change="page = $event" />
          </view>
        </section>

        <section v-else-if="active === 'farms'" class="data-panel">
          <view class="filter-chips solid"><button v-for="tab in ['门店列表','门店账号']" :key="tab" :class="{ active: farmTab === tab }" @click="farmTab = tab; page = 1">{{ tab }}</button></view>
          <template v-if="farmTab === '门店列表'">
          <view class="stat-strip three">
            <view><small>入驻农家乐</small><strong>{{ metrics.farmStats.total }} 家</strong><span class="positive">经营中 {{ metrics.farmStats.liveCount }} 家</span></view>
            <view><small>已开通小程序</small><strong>{{ metrics.farmStats.liveCount }} 个</strong><span>{{ metrics.farmStats.configuring }} 家配置中</span></view>
            <view><small>门店自有商品</small><strong>{{ metrics.farmStats.selfProducts }} 个</strong><span class="pending-text">待审核 {{ metrics.farmStats.pendingSelfProducts }} 个</span></view>
          </view>
          <view class="module-search"><label class="search-box"><UiIcon name="search" :size="16" /><input v-model="farmKeyword" placeholder="搜索门店名称 / 区域" /></label><select v-model="farmCityFilter"><option value="全部城市">全部城市</option><option v-for="city in farmCityOptions" :key="city" :value="city">{{ city }}</option></select><select v-model="farmStatusFilter"><option value="全部门店">全部门店</option><option value="经营中">经营中</option><option value="筹备中">筹备中</option><option value="已停用">已停用</option><option value="试点样板">试点样板</option></select></view>
          <view class="table-row table-head farm-grid"><text>农家乐门店</text><text>区域</text><text>小程序</text><text>已选品</text><text>本月 GMV</text><text>人气值</text><text>状态</text><text>操作</text></view>
          <view v-for="item in pagedFarms" :key="item.id" class="table-row farm-grid"><view class="product-cell"><image class="farm-thumb" :src="item.image || '/static/images/farmhouse.webp'" mode="aspectFit" @click="previewImage(item.image || '/static/images/farmhouse.webp')" /><view><strong>{{ item.name }}</strong><small>{{ item.adminDesc || item.tags[0] }}</small></view></view><text>{{ item.region }}</text><text>{{ item.status === 'pending' ? '配置中' : '已上线' }}</text><text>{{ item.selectedCount }} SKU</text><strong>{{ money(item.gmv) }}</strong><text>{{ item.livePopularity.toLocaleString('zh-CN') }}</text><span class="status" :class="item.status">{{ item.status === 'active' ? '经营中' : item.status === 'pending' ? '筹备中' : '已停用' }}</span><view class="row-actions"><button @click="openDetail('farm', item.id)">详情</button><button @click="openFarmEdit(item)">修改</button></view></view><view v-if="!filteredFarms.length" class="empty-state">没有符合条件的门店</view><PaginationBar :page="page" :page-size="pageSize" :total="filteredFarms.length" @change="page = $event" />
          </template>
          <template v-else>
            <view class="module-search"><select v-model="farmAccountFilter"><option value="全部">全部门店</option><option v-for="farm in store.farms" :key="farm.id" :value="farm.id">{{ farm.name }}</option></select><button class="button primary" @click="openAccountDialog()"><UiIcon name="plus" :size="16" />新增门店账号</button></view>
            <view class="table-row table-head account-grid"><text>门店</text><text>姓名</text><text>登录账号</text><text>角色</text><text>推广</text><text>状态</text><text>操作</text></view>
            <view v-for="item in pagedStoreAccounts" :key="item.id" class="table-row account-grid"><text>{{ store.farms.find((farm) => farm.id === item.farmId)?.name || item.farmId }}</text><strong>{{ item.name }}</strong><text>{{ item.account }}</text><span class="status" :class="item.role === 'owner' ? 'active' : 'pending'">{{ item.role === 'owner' ? '店主' : '店员' }}</span><span class="status" :class="item.promoEnabled ? 'active' : 'rejected'">{{ item.promoEnabled ? '已开' : '关闭' }}</span><span class="status" :class="item.enabled ? 'active' : 'rejected'">{{ item.enabled ? '启用' : '停用' }}</span><view class="row-actions"><button @click="openAccountDialog(item)">修改</button><button class="danger" @click="store.toggleStoreAccount(item.id)">{{ item.enabled ? '停用' : '启用' }}</button></view></view>
            <view v-if="!filteredStoreAccounts.length" class="empty-state">暂无门店账号</view>
            <PaginationBar :page="page" :page-size="pageSize" :total="filteredStoreAccounts.length" @change="page = $event" />
          </template>
        </section>

        <section v-else-if="active === 'promoters'" class="data-panel">
          <view class="stat-strip four">
            <view><small>本期应结佣金</small><strong>{{ money(metrics.promoterStats.pendingCommission) }}</strong><span>待结算 · T+7 周期</span></view>
            <view><small>活跃推客</small><strong>{{ metrics.promoterStats.activePromoters }} 人</strong><span class="positive">未结算 {{ store.promoters.filter((p) => !p.settled).length }} 人</span></view>
            <view><small>带货主播</small><strong>{{ metrics.promoterStats.liveHosts }} 人</strong><span>本月直播 {{ metrics.promoterStats.liveSessions }} 场</span></view>
            <view><small>累计锁粉</small><strong>{{ metrics.promoterStats.lockedFans.toLocaleString('zh-CN') }}</strong><span class="positive">带货 GMV ¥{{ formatNumber(store.promoters.reduce((sum, p) => sum + p.gmv, 0)) }}</span></view>
          </view>
          <view class="filter-chips solid"><button v-for="item in ['推客排行','主播排行']" :key="item" :class="{ active: promoterRankTab === item }" @click="promoterRankTab = item; page = 1">{{ item }}</button></view>
          <view class="module-search"><label class="search-box"><UiIcon name="search" :size="16" /><input v-model="promoterKeyword" placeholder="搜索推客名称 / 等级" /></label><select v-model="promoterTypeFilter"><option value="全部">全部类型</option><option value="推客">推客</option><option value="主播">主播</option><option value="达人">达人</option></select></view>
          <view class="table-row table-head promoter-grid"><text>推客 / 主播</text><text>类型</text><text>锁粉数</text><text>订单</text><text>带货 GMV</text><text>佣金</text><text>状态</text><text>操作</text></view>
          <view v-for="item in pagedPromoters" :key="item.id" class="table-row promoter-grid"><view><strong>{{ item.name }}</strong><small>{{ item.level }}</small></view><span class="source-pill" :class="item.type === '主播' ? 'host' : item.type === '达人' ? 'expert' : 'platform'">{{ item.type || '推客' }}</span><text>{{ item.fans }}</text><text>{{ item.orders }}</text><strong>{{ money(item.gmv) }}</strong><strong class="commission">{{ money(item.commission) }}</strong><span class="status" :class="item.settled ? 'delivered' : 'pending'">{{ item.settled ? '已结算' : '待结算' }}</span><view class="row-actions"><button @click="openPromoterEdit(item)">修改</button></view></view>
          <view v-if="!visiblePromoters.length" class="empty-state">没有符合条件的推客</view><PaginationBar :page="page" :page-size="pageSize" :total="visiblePromoters.length" @change="page = $event" />
        </section>

        <section v-else-if="active === 'commissions'" class="data-panel">
          <view class="filter-chips solid"><button v-for="item in ['佣金结算','供应商结算','佣金规则','消费分成']" :key="item" :class="{ active: commissionTab === item }" @click="commissionTab = item; page = 1">{{ item }}</button></view>
          <template v-if="commissionTab === '佣金结算'">
            <view class="module-search"><label class="search-box"><UiIcon name="search" :size="16" /><input v-model="commissionKeyword" placeholder="搜索单号 / 金额 / 推客" /></label><select v-model="commissionStatusFilter"><option value="全部">全部结算状态</option><option value="未结算">未结算</option><option value="已结算">已结算</option></select></view>
            <view class="commission-status-table">
              <view class="panel-head"><h2>推客结算状态</h2><text>未结算 {{ store.promoters.filter((p) => pendingShareAmount(p.id) > 0).length }} 人 · 已结算 {{ store.promoters.filter((p) => pendingShareAmount(p.id) <= 0).length }} 人</text></view>
              <view class="table-row table-head commission-status-grid"><text>推客</text><text>类型</text><text>待结佣金</text><text>结算状态</text></view>
              <view v-for="item in pagedPromoterCommissionRows" :key="item.id" class="table-row commission-status-grid" :class="pendingShareAmount(item.id) <= 0 ? 'status-settled' : 'status-unsettled'">
                <view><strong>{{ item.name }}</strong><small>{{ item.level }}</small></view>
                <span class="source-pill" :class="item.type === '主播' ? 'host' : item.type === '达人' ? 'expert' : 'platform'">{{ item.type || '推客' }}</span>
                <strong>{{ money(pendingShareAmount(item.id)) }}</strong>
                <span class="status" :class="pendingShareAmount(item.id) <= 0 ? 'delivered' : 'pending'">{{ pendingShareAmount(item.id) <= 0 ? '已结算' : '未结算' }}</span>
              </view>
              <view v-if="!filteredPromoterCommissionRows.length" class="empty-state">暂无推客结算数据</view>
              <PaginationBar :page="page" :page-size="pageSize" :total="filteredPromoterCommissionRows.length" @change="page = $event" />
            </view>
            <view class="settlement-history"><view class="panel-head"><h2>佣金结算记录</h2><text>累计 {{ money(filteredCommissionRecords.reduce((sum, item) => sum + item.amount, 0)) }}</text></view>
              <view v-if="!filteredCommissionRecords.length" class="empty-state">暂无佣金流水</view>
              <view v-for="record in pagedCommissionRecords" :key="record.id" class="history-row"><strong>{{ record.id }} · {{ money(record.amount) }}</strong><small>佣金结算 · {{ record.items.length }} 位推客 · {{ record.createdAt }}</small><view class="history-items"><view v-for="item in record.items" :key="item.promoterId"><span>{{ item.promoterName }}</span><small>{{ item.promoterId }}</small><b>{{ money(item.amount) }}</b></view></view></view>
              <PaginationBar :page="commissionHistoryPage" :page-size="pageSize" :total="filteredCommissionRecords.length" @change="commissionHistoryPage = $event" />
            </view>
          </template>
          <template v-else-if="commissionTab === '供应商结算'">
            <view class="module-search"><label class="search-box"><UiIcon name="search" :size="16" /><input v-model="supplierSettleKeyword" placeholder="搜索单号 / 金额 / 供应商" /></label></view>
            <view class="settlement-history"><view class="panel-head"><h2>供应商结算记录</h2><text>累计 {{ money(filteredSupplierRecords.reduce((sum, item) => sum + item.amount, 0)) }}</text></view>
              <view v-if="!filteredSupplierRecords.length" class="empty-state">暂无供应商结算记录</view>
              <view v-for="record in pagedSupplierSettlementRecords" :key="record.id" class="history-row"><strong>{{ record.id }} · {{ money(record.amount) }}</strong><small>{{ record.period }} · {{ record.items.length }} 家供应商 · {{ record.orderIds.length }} 笔订单 · {{ record.createdAt }}</small><view class="history-items"><view v-for="item in record.items" :key="item.supplierId"><span>{{ item.supplierName }}</span><small>{{ item.orderIds.join('、') || '无关联订单' }}</small><b>{{ money(item.amount) }}</b></view></view></view>
              <PaginationBar :page="page" :page-size="pageSize" :total="filteredSupplierRecords.length" @change="page = $event" />
            </view>
          </template>
          <template v-else-if="commissionTab === '佣金规则'">
            <view class="module-search"><label class="search-box"><UiIcon name="search" :size="16" /><input v-model="ruleKeyword" placeholder="搜索规则名称" /></label></view>
            <view class="commission-rules"><view class="panel-head"><h2>佣金规则</h2><text>本地模拟配置 · 点击编辑调整比例</text></view><view class="commission-rule-grid"><view v-for="rule in filteredRules" :key="rule.id" class="commission-rule-card"><view class="rule-top"><text class="rule-icon">{{ rule.targetType === 'farm' ? '🏡' : rule.targetType === 'product' ? '📦' : '📺' }}</text><button class="compact-button" @click="openCommission(rule)">编辑</button></view><strong class="rule-name">{{ rule.name }}</strong><view class="rule-rate">{{ rule.rate }}<small>%</small></view><small class="rule-meta">{{ rule.targetType === 'farm' ? '门店推广' : rule.targetType === 'product' ? '商品推广' : '直播推广' }} · 更新于 {{ rule.updatedAt }}</small></view></view></view>
          </template>
          <template v-else-if="commissionTab === '消费分成'">
            <view class="commission-rules"><view class="panel-head"><h2>消费分成设置</h2><text>用户消费后按正式绑定给推客 / 店员分成 · 全局比例</text></view><view class="share-config-row"><label class="field"><text>推客分成比例（%）</text><input v-model.number="shareConfig.promoterRate" type="number" min="0" max="100" /></label><label class="field"><text>店员分成比例（%）</text><input v-model.number="shareConfig.staffRate" type="number" min="0" max="100" /></label><button class="button primary" @click="saveShareConfig">保存比例</button></view></view>
            <view class="settlement-history"><view class="panel-head"><h2>消费分成记录</h2><text>共 {{ shareRecords.length }} 笔 · 累计 {{ money(shareRecords.reduce((sum, item) => sum + item.amount, 0)) }}</text></view>
              <view v-if="!shareRecords.length" class="empty-state">暂无消费分成记录</view>
              <view v-for="record in shareRecords" :key="record.id" class="history-row"><strong>{{ record.userId }} · {{ record.orderId }} · 消费 {{ money(record.orderAmount) }}</strong><small>{{ record.role === 'promoter' ? '推客' : '店员' }} 分成 {{ record.rate }}% · {{ money(record.amount) }} · {{ record.createdAt }}</small></view>
            </view>
          </template>
        </section>

        <section v-else class="data-panel">
          <view class="dict-toolbar">
            <view class="dict-tabs">
              <view v-for="group in store.dictGroups" :key="group.type" class="dict-tab" :class="{ active: dictTypeTab === group.type }">
                <button class="dict-tab-btn" @click="dictTypeTab = group.type; page = 1">{{ group.name }}</button>
              </view>
            </view>
            <view class="dict-tool-actions">
              <template v-if="activeDictGroup">
                <button class="button secondary" @click="openDictGroupEdit(activeDictGroup)">编辑分组</button>
                <button class="button danger-button" @click="removeDictGroup(activeDictGroup)">删除分组</button>
              </template>
              <button class="button secondary" @click="openDictGroupDialog()"><UiIcon name="plus" :size="16" />新增分组</button>
              <button class="button primary" @click="openDictDialog()"><UiIcon name="plus" :size="16" />新增字典项</button>
            </view>
          </view>
          <view class="module-search"><label class="search-box"><UiIcon name="search" :size="16" /><input v-model="dictKeyword" placeholder="搜索编码 / 名称" /></label></view>
          <view class="dict-table"><view class="table-row table-head dict-grid"><text>编码</text><text>名称</text><text>启用</text><text>排序</text><text>操作</text></view><view v-for="item in pagedDictItems" :key="item.id" class="table-row dict-grid"><strong>{{ item.code }}</strong><text>{{ item.label }}</text><span class="status" :class="item.enabled ? 'active' : 'rejected'">{{ item.enabled ? '启用' : '停用' }}</span><text>{{ item.sort }}</text><view class="row-actions"><button @click="openDictDialog(item)">修改</button><button class="danger" @click="store.removeDictItem(item.id)">删除</button></view></view></view>
          <view v-if="!filteredDictItems.length" class="empty-state">暂无字典项</view>
          <PaginationBar :page="page" :page-size="pageSize" :total="filteredDictItems.length" @change="page = $event" />
        </section>
      </view>
    </main>

     <view v-if="dialog" class="modal-mask" @click.self="closeOverlay">
       <view class="modal" role="dialog" aria-modal="true" @keydown="trapFocus">
         <view class="modal-head"><view><h2>{{ dialog === 'supplier' ? '邀请供应商入驻' : dialog === 'supplier-edit' ? '编辑供应商' : dialog === 'category' ? '新增品类' : dialog === 'category-edit' ? '编辑品类' : dialog === 'policy' ? '新建价格策略' : dialog === 'policy-edit' ? '编辑价格策略' : dialog === 'product' ? '新增商品' : dialog === 'product-edit' ? '编辑商品' : dialog === 'after-sale-init' ? '发起售后' : dialog === 'commission' ? '编辑佣金规则' : dialog === 'promoter' ? '新增推客' : dialog === 'promoter-edit' ? '编辑推客' : dialog === 'farm-edit' ? '编辑农家乐门店' : dialog === 'dict' ? '新增字典项' : dialog === 'dict-edit' ? '编辑字典项' : dialog === 'dict-group' ? '新增分组' : dialog === 'dict-group-edit' ? '编辑分组' : dialog === 'store-account' ? '新增门店账号' : dialog === 'store-account-edit' ? '编辑门店账号' : '新增农家乐门店' }}</h2><p>保存后立即写入本地演示数据</p></view><button class="icon-button" aria-label="关闭弹窗" @click="closeOverlay"><UiIcon name="x" :size="18" /></button></view>
        <label v-if="['policy','policy-edit'].includes(dialog)" class="field"><text>名称</text><input v-model="form.name" placeholder="请输入名称" /></label>
        <template v-if="dialog === 'supplier' || dialog === 'supplier-edit'">
          <label class="field"><text>供应商名称</text><input v-model="form.name" placeholder="请输入供应商名称" /></label>
          <label class="field"><text>供应商类型</text><select v-model="form.coop"><option :value="false">合作供应商</option><option :value="true">供销社渠道</option></select></label>
          <label class="field"><text>主营品类</text><select v-model="form.category"><option v-for="option in supplierCategories" :key="option.id" :value="option.name">{{ option.name }}</option></select></label>
          <label class="field"><text>所在区域</text><input v-model="form.region" placeholder="如 怀化靖州" /></label>
          <label class="field"><text>联系人手机</text><input v-model="form.contactPhone" maxlength="11" placeholder="请输入11位手机号" /></label>
          <view class="field"><text>营业执照</text>
            <view class="upload-row">
              <button v-if="!form.businessLicense" class="upload-button" @click="chooseLicense">＋ 上传图片</button>
              <template v-else>
                <image class="upload-preview" :src="form.businessLicense" mode="aspectFit" @click="previewImage(form.businessLicense)" />
                <button class="upload-button" @click="chooseLicense">重新选择</button>
                <button class="upload-button danger" @click="removeLicense">移除</button>
              </template>
            </view>
          </view>
          <view class="field"><text>生产 / 经营许可</text>
            <view class="upload-row">
              <button v-if="!form.permit" class="upload-button" @click="choosePermit">＋ 上传图片</button>
              <template v-else>
                <image class="upload-preview" :src="form.permit" mode="aspectFit" @click="previewImage(form.permit)" />
                <button class="upload-button" @click="choosePermit">重新选择</button>
                <button class="upload-button danger" @click="removePermit">移除</button>
              </template>
            </view>
          </view>
          <view class="field"><text>证照有效期</text>
            <picker mode="date" :value="form.validUntil" @change="onValidUntilChange">
              <view class="picker-field" :class="{ placeholder: !form.validUntil }">{{ form.validUntil || '请选择日期' }}</view>
            </picker>
          </view>
        </template>
        <template v-if="dialog === 'category' || dialog === 'category-edit'">
          <label class="field"><text>品类名称</text><input v-model="form.name" placeholder="请输入品类名称" /></label>
          <label class="field"><text>品类类型</text><select v-model="form.categoryType"><option value="product">商品品类</option><option value="supplier">供应商品类</option><option value="general">通用</option></select></label>
        </template>
        <template v-if="dialog === 'dict' || dialog === 'dict-edit'">
          <label class="field"><text>字典编码</text><input v-model="form.dictCode" placeholder="如 pending / 湘西州 / transport" /></label>
          <label class="field"><text>显示名称</text><input v-model="form.dictLabel" placeholder="如 待处理" /></label>
          <label class="field"><text>排序</text><input v-model.number="form.dictSort" type="number" min="0" /></label>
          <label class="field"><text>启用状态</text><select v-model="form.enabled"><option :value="true">启用</option><option :value="false">停用</option></select></label>
        </template>
        <template v-if="dialog === 'dict-group' || dialog === 'dict-group-edit'">
          <label class="field"><text>分组名称</text><input v-model="form.dictGroupName" placeholder="如 城市信息 / 数据状态" /></label>
          <label class="field"><text>类型编码</text><input v-model="form.dictGroupType" placeholder="如 city / status（英文小写，唯一）" :disabled="dialog === 'dict-group-edit'" /></label>
        </template>
        <template v-if="dialog === 'store-account' || dialog === 'store-account-edit'">
          <label class="field"><text>所属门店</text><select v-model="form.accountFarmId" :disabled="dialog === 'store-account-edit'"><option value="">请选择门店</option><option v-for="farm in store.farms" :key="farm.id" :value="farm.id">{{ farm.name }}</option></select></label>
          <label class="field"><text>姓名</text><input v-model="form.accountName" placeholder="如 王店长" /></label>
          <label class="field"><text>登录账号（手机号）</text><input v-model="form.accountPhone" placeholder="如 13800000001" /></label>
          <label class="field"><text>登录密码</text><input v-model="form.accountPassword" placeholder="如 123456" /></label>
          <label class="field"><text>角色</text><select v-model="form.accountRole"><option value="owner">店主</option><option value="staff">店员</option></select></label><label v-if="form.accountRole === 'staff'" class="field"><text>店员推广权限</text><select v-model="form.accountPromo"><option :value="true">开启（可生成推广码）</option><option :value="false">关闭</option></select></label>
        </template>
        <template v-if="dialog === 'policy' || dialog === 'policy-edit'"><label class="field"><text>策略类型</text><select v-model="form.type" :disabled="dialog === 'policy-edit'"><option value="group">集采价</option><option value="ladder">阶梯价</option><option value="region">区域价</option><option value="member">会员价</option></select></label><label class="field"><text>适用范围</text><input v-model="form.scope" /></label><label class="field"><text>优惠比例（1-100%）</text><input v-model.number="form.discount" type="number" min="1" max="100" /></label><label v-if="dialog === 'policy-edit'" class="field"><text>规则状态</text><select v-model="form.enabled"><option :value="true">启用</option><option :value="false">停用</option></select></label><view v-if="form.type === 'ladder'" class="tier-editor"><view class="tier-editor-head"><text>阶梯档位</text><button class="mini-button" type="button" @click="addTier">＋ 添加档位</button></view><view v-for="(tier, ti) in form.tiers" :key="ti" class="tier-editor-row"><label class="field"><text>起始数量</text><input v-model.number="tier.minQty" type="number" min="1" placeholder="如 1" /></label><label class="field"><text>上限数量（留空=无上限）</text><input v-model.number="tier.maxQty" type="number" min="1" placeholder="留空为无上限" /></label><label class="field"><text>集采单价</text><input v-model.number="tier.price" type="number" min="0" step="0.1" placeholder="如 42" /></label><label class="field"><text>让利 %</text><input v-model.number="tier.discountOff" type="number" min="0" max="100" placeholder="如 30" /></label><button class="compact-button danger" type="button" @click="removeTier(ti)">删除</button></view></view></template>
        <template v-if="dialog === 'product' || dialog === 'product-edit'"><label v-if="dialog === 'product'" class="field"><text>商品来源</text><select v-model="form.source"><option value="platform">中台商品</option><option value="farmhouse">门店自有</option></select></label><label class="field"><text>商品名称</text><input v-model="form.name" placeholder="请输入商品名称" /></label><label class="field"><text>商品规格</text><input v-model="form.spec" placeholder="如 500g/袋" /></label><label class="field"><text>品类</text><select v-model="form.category"><option v-for="option in productCategories" :key="option.id" :value="option.name">{{ option.name }}</option></select></label><label class="field"><text>供应商</text><select v-model="form.supplier"><option v-for="option in supplierOptions" :key="option" :value="option">{{ option }}</option></select></label><label v-if="dialog === 'product-edit' && editingProduct?.skus.length" class="field"><text>商品规格</text><select v-model="form.skuId" @change="selectProductSku"><option v-for="sku in editingProduct.skus" :key="sku.id" :value="sku.id">{{ sku.name }}</option></select></label><label class="field"><text>零售价</text><input v-model.number="form.price" type="number" min="0.01" /></label><label class="field"><text>采集价</text><input v-model.number="form.cost" type="number" min="0" /></label><label class="field"><text>库存</text><input v-model.number="form.stock" type="number" min="0" /></label><view class="field"><text>主图</text><view class="upload-row"><button v-if="!form.image" class="upload-button" type="button" @click="chooseProductMain">＋ 上传主图</button><image v-if="form.image" class="upload-preview" :src="form.image" mode="aspectFit" @click="previewImage(form.image)" /><template v-if="form.image"><button class="upload-button" type="button" @click="chooseProductMain">重新选择</button><button class="upload-button danger" type="button" @click="removeProductMain">移除</button></template></view></view><view class="field"><text>详情图（可多张）</text><view class="upload-row"><button class="upload-button" type="button" @click="chooseProductImages">＋ 添加详情图</button><view v-for="(img, idx) in form.images" :key="idx" class="gallery-thumb"><image :src="img" mode="aspectFit" @click="previewImage(img)" /><button class="gallery-remove" type="button" @click="removeProductImage(idx)">×</button></view></view></view></template>
        <template v-if="dialog === 'after-sale-init'"><label class="field"><text>售后订单</text><input :value="form.id" disabled /></label><label class="field"><text>售后类型</text><select v-model="form.result"><option value="refund">退款</option><option value="reship">补发</option><option value="claim">理赔</option></select></label><label class="field"><text>售后原因</text><select v-model="form.initIssue"><option value="">请选择原因</option><option v-for="reason in afterReasonOptions" :key="reason" :value="reason">{{ reason }}</option></select></label></template>
        <template v-if="dialog === 'commission'"><label class="field"><text>佣金比例（1-100%）</text><input v-model.number="form.rate" type="number" min="1" max="100" /></label></template>
        <template v-if="dialog === 'promoter' || dialog === 'promoter-edit'">
          <label class="field"><text>推客姓名</text><input v-model="form.name" placeholder="请输入推客姓名" /></label>
          <label class="field"><text>等级标签</text><input v-model="form.level" placeholder="如 V3 金牌推客" /></label>
          <label class="field"><text>类型</text><select v-model="form.promoterType"><option value="推客">推客</option><option value="主播">主播</option><option value="达人">达人</option></select></label>
          <label class="field"><text>状态</text><select v-model="form.promoterStatus"><option value="active">启用</option><option value="paused">停用</option></select></label>
        </template>
        <template v-if="dialog === 'farm' || dialog === 'farm-edit'">
          <label class="field"><text>门店名称</text><input v-model="form.name" placeholder="请输入门店名称" /></label>
          <view class="field"><text>门店图片</text>
            <view class="upload-row">
              <button v-if="!form.image" class="upload-button" @click="chooseFarmImage">＋ 上传图片</button>
              <template v-else>
                <image class="upload-preview" :src="form.image" mode="aspectFit" @click="previewImage(form.image)" />
                <button class="upload-button" @click="chooseFarmImage">重新选择</button>
                <button class="upload-button danger" @click="removeFarmImage">移除</button>
              </template>
            </view>
          </view>
          <label class="field"><text>所在区域</text><input v-model="form.region" placeholder="如 湘西州永顺县" /></label>
          <label class="field"><text>城市</text><select v-model="form.city"><option value="">请选择城市</option><option v-for="city in farmCityOptions" :key="city" :value="city">{{ city }}</option></select></label>
          <label class="field"><text>门店标签</text><input v-model="form.tags" placeholder="逗号分隔，如 柴火土菜,临溪包厢" /></label>
          <label class="field"><text>评分</text><input v-model.number="form.rating" type="number" min="0" max="5" step="0.1" /></label>
          <label class="field"><text>平均客单价</text><input v-model.number="form.averageSpend" type="number" min="0" /></label><label class="field"><text>人气值</text><input v-model.number="form.livePopularity" type="number" min="0" /></label>
          <label class="field"><text>经营状态</text><select v-model="form.farmStatus"><option value="pending">筹备中</option><option value="active">经营中</option><option value="paused">已停用</option></select></label>
        </template>
         <view class="modal-actions"><button class="button secondary" :disabled="busy" @click="closeOverlay">取消</button><button class="button primary" :disabled="busy" @click="saveDialog">{{ busy ? '处理中...' : dialog === 'supplier' ? '发送邀请' : dialog === 'supplier-edit' || dialog === 'farm-edit' ? '保存修改' : '保存' }}</button></view>
      </view>
    </view>

     <view v-if="detail" class="drawer-mask" @click.self="closeOverlay">
       <aside class="drawer" role="dialog" aria-modal="true" @keydown="trapFocus">
         <view class="drawer-head"><view><small>本地演示数据</small><h2>{{ detail.type === 'todos' ? '待办中心' : detail.type === 'supplier' ? '供应商详情' : detail.type === 'order' ? '订单流转记录' : detail.type === 'afterSale' ? '售后处理记录' : '门店经营数据' }}</h2></view><view class="drawer-head-actions"><button v-if="detail.type === 'todos'" class="mark-read-button" @click="markAllRead"><UiIcon name="check" :size="15" />全部已读</button><button class="icon-button" aria-label="关闭抽屉" @click="closeOverlay"><UiIcon name="x" :size="18" /></button></view></view>
        <view v-if="detail.type === 'todos'" class="drawer-list todo-detail">
          <button @click="detailModule('suppliers')"><span>供应商资质审核</span><b>{{ store.pendingSuppliers }}</b></button>
          <button @click="detailModule('products')"><span>门店自有商品审核</span><b>{{ store.pendingProducts }}</b></button>
          <button @click="detailModule('afterSales')"><span>售后工单处理</span><b>{{ store.pendingAfterSales }}</b></button>
          <button @click="detailModule('commissions')"><span>本周期佣金结算</span><b>{{ money(store.totalCommission) }}</b></button>
          <view class="export-history"><strong>最近导出</strong><text v-if="!store.exportRecords.length">暂无导出记录</text><text v-for="item in store.exportRecords.slice(0, 3)" :key="item.id">{{ item.module }} · {{ item.count }} 条 · {{ item.createdAt }}</text></view>
        </view>
        <view v-else-if="detail.type === 'supplier' && selectedSupplier" class="drawer-list">
          <view class="detail-hero"><view class="detail-icon"><UiIcon name="factory" :size="25" /></view><view><h3>{{ selectedSupplier.name }}</h3><text>{{ selectedSupplier.region }} · {{ selectedSupplier.category }}</text></view></view>
           <view class="detail-grid"><view><small>合作状态</small><strong>{{ statusText(selectedSupplier.status) }}</strong></view><view><small>供应商类型</small><strong>{{ selectedSupplier.coop ? '供销社渠道' : '合作供应商' }}</strong></view><view><small>供应商品</small><strong>{{ supplierProducts(selectedSupplier).length }} 款</strong></view><view><small>联系人手机</small><strong>{{ selectedSupplier.contactPhone || '—' }}</strong></view><view><small>营业执照</small><image v-if="isImageData(selectedSupplier.qualification.businessLicense)" class="license-thumb" :src="selectedSupplier.qualification.businessLicense" mode="aspectFit" @click="previewSupplierLicenses('businessLicense')" /><strong v-else>待上传</strong></view><view><small>生产 / 经营许可</small><image v-if="isImageData(selectedSupplier.qualification.permit)" class="license-thumb" :src="selectedSupplier.qualification.permit" mode="aspectFit" @click="previewSupplierLicenses('permit')" /><strong v-else>待上传</strong></view><view><small>证照有效期</small><strong>{{ selectedSupplier.qualification.validUntil }}</strong></view><view><small>审核说明</small><strong>{{ selectedSupplier.qualification.reviewNote }}</strong></view></view>
           <view class="supplier-products">
             <view class="panel-head"><h2>供应商品</h2><text>{{ supplierProducts(selectedSupplier).length }} 款</text></view>
             <view v-if="!supplierProducts(selectedSupplier).length" class="empty-state">该供应商暂无商品</view>
             <view v-for="product in supplierProducts(selectedSupplier)" :key="product.id" class="supplier-product-row">
               <image class="supplier-thumb" :src="product.image" mode="aspectFit" @click="previewImage(product.image)" />
               <view class="sp-name"><strong>{{ product.name }}</strong><small>{{ product.category }} · {{ product.supplier }}</small></view>
                <strong>¥{{ formatNumber(product.price) }}</strong>
               <span class="status" :class="product.status">{{ product.status === 'pending' ? '待审核' : statusText(product.status) }}</span>
             </view>
           </view>
           <view class="drawer-actions"><button class="button secondary" @click="openSupplierEdit(selectedSupplier)">修改资料</button><template v-if="selectedSupplier.status === 'pending'"><button class="button primary" :disabled="isOperating(`supplier-${selectedSupplier.id}`)" @click="auditSupplier(selectedSupplier.id, true)">{{ isOperating(`supplier-${selectedSupplier.id}`) ? '处理中...' : '通过资质' }}</button><button class="button danger-button" :disabled="isOperating(`supplier-${selectedSupplier.id}`)" @click="auditSupplier(selectedSupplier.id, false)">驳回</button></template><button v-else class="button primary" :disabled="isOperating(`supplier-${selectedSupplier.id}`)" @click="toggleSupplier(selectedSupplier.id)">{{ isOperating(`supplier-${selectedSupplier.id}`) ? '处理中...' : selectedSupplier.status === 'cooperating' ? '暂停合作' : '恢复合作' }}</button></view>
        </view>
        <view v-else-if="detail.type === 'order' && selectedOrder" class="drawer-list">
          <view class="detail-hero"><view class="detail-icon"><UiIcon name="list-tree" :size="25" /></view><view><h3>{{ selectedOrder.id }}</h3><text>{{ selectedOrder.customer }} · {{ selectedOrder.productName }}</text></view></view>
          <view class="detail-grid"><view><small>下单时间</small><strong>{{ selectedOrder.createdAt }}</strong></view><view><small>订单状态</small><strong>{{ orderFulfillmentText(selectedOrder.status) }}</strong></view><view><small>实付金额</small><strong>¥{{ formatNumber(orderPaidAmount(selectedOrder)) }}</strong></view><view><small>订单渠道</small><strong>{{ channelText(selectedOrder.channel) }}</strong></view></view>
          <h3>订单流转记录</h3>
          <view class="timeline-list"><view v-for="(event, index) in orderFlow(selectedOrder)" :key="`${event.time}-${index}`"><span></span><view><strong>{{ event.action }}</strong><small>{{ event.time }} · {{ event.operator }}</small><text v-if="event.note">{{ event.note }}</text></view></view></view>
          <button v-if="selectedOrder.status === 'shipping'" class="button primary wide" @click="confirmOrder(selectedOrder)">确认收货</button>
        </view>
        <view v-else-if="detail.type === 'afterSale' && selectedAfterSale" class="drawer-list">
          <view class="detail-hero"><view class="detail-icon"><UiIcon name="headset" :size="25" /></view><view><h3>{{ selectedAfterSale.id }}</h3><text>{{ selectedAfterSale.productName }} · {{ money(selectedAfterSale.amount) }}</text></view></view>
          <view class="history-row"><strong>工单创建</strong><small>{{ selectedAfterSale.applicant }} 提交申请</small></view><view v-for="item in selectedAfterSale.history || []" :key="item.time" class="history-row"><strong>{{ item.action }}</strong><small>{{ item.operator }} · {{ item.time }}</small></view>
           <view v-if="selectedAfterSale.refundAmount != null" class="history-row"><strong>{{ selectedAfterSale.refundMethod === 'return' ? '退货退款' : '仅退款' }}</strong><small>退款金额 {{ money(selectedAfterSale.refundAmount) }} · {{ selectedAfterSale.refundMode === 'full' ? '全额退款' : selectedAfterSale.refundMode === 'ratio' ? '按比例退款' : '自定义退款' }}</small></view>
        </view>
        <view v-else-if="detail.type === 'farm' && selectedFarm" class="drawer-list">
          <image class="farm-cover" :src="selectedFarm.image" mode="aspectFit" @click="previewImage(selectedFarm.image)" /><h3>{{ selectedFarm.name }}</h3><text class="drawer-muted">{{ selectedFarm.region }} · {{ selectedFarm.tags.join(' · ') }}</text>
          <view class="detail-grid"><view><small>本月 GMV</small><strong>{{ money(selectedFarm.gmv) }}</strong></view><view><small>选品数量</small><strong>{{ selectedFarm.selectedCount }} SKU</strong></view><view><small>月订单</small><strong>{{ selectedFarm.monthlySales }} 单</strong></view><view><small>门店评分</small><strong>{{ selectedFarm.rating }} 分</strong></view><view><small>人气值</small><strong>{{ selectedFarm.livePopularity.toLocaleString('zh-CN') }}</strong></view></view>
          <view class="drawer-actions"><button class="button secondary" @click="openFarmEdit(selectedFarm)">修改资料</button></view>
        </view>
      </aside>
    </view>
  </view>
</template>

<style scoped lang="scss">
.admin-shell { min-height: 100vh; display: flex; background: var(--admin-bg); }
.sidebar { position: fixed; inset: 0 auto 0 0; width: 236px; background: linear-gradient(180deg,#16322a,#101e16); color: #fff; display: flex; flex-direction: column; z-index: 10; }
.brand { height: 76px; padding: 0 18px; display: flex; align-items: center; gap: 11px; border-bottom: 1px solid rgba(255,255,255,.1); }
.brand-mark { width: 38px; height: 38px; border-radius: 7px; display: grid; place-items: center; background: #2b7a52; }
.brand-mark .ui-icon { filter: brightness(0) invert(1); }
.brand-title, .brand-sub { display: block; } .brand-title { font-size: 15px; font-weight: 800; } .brand-sub { color: #9fb7a9; font-size: 10px; margin-top: 3px; }
.nav-list { padding: 12px 10px; flex: 1; } .nav-group { display: block; color: #5f7387; font-size: 10.5px; letter-spacing: 1px; font-weight: 700; padding: 14px 12px 6px; }
.nav-item { width: 100%; padding: 10px 12px; display: flex; align-items: center; gap: 11px; color: #bcccdb; background: transparent; border-radius: 10px; cursor: pointer; text-align: left; margin-bottom: 2px; font-size: 13.5px; font-weight: 500; }
.nav-item .ui-icon { filter: brightness(0) invert(.75); } .nav-item:hover { background: rgba(255,255,255,.06); color: #fff; } .nav-item.active { background: #1d6b44; color: #fff; font-weight: 700; } .nav-item.active .ui-icon { filter: brightness(0) invert(1); }
.nav-badge { margin-left: auto; min-width: 20px; height: 20px; padding: 0 7px; border-radius: 999px; background: #a8542b; color: #fff; display: grid; place-items: center; font-size: 10px; font-weight: 700; }
.operator { padding: 16px; border-top: 1px solid rgba(255,255,255,.1); display: flex; align-items: center; gap: 10px; font-size: 12px; } .operator small { display: block; color: #80998a; margin-top: 3px; font-size: 10px; } .avatar { width: 32px; height: 32px; border-radius: 6px; background: #315d48; display: grid; place-items: center; }
.main { width: calc(100% - 236px); min-height: 100vh; margin-left: 236px; } .topbar { height: 60px; padding: 0 24px; background: #fff; border-bottom: 1px solid var(--admin-line); display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 8; }
.crumb { font-size: 13px; color: var(--admin-muted); } .crumb strong { color: var(--admin-ink); } .top-actions, .head-actions, .row-actions { display: flex; align-items: center; gap: 8px; }
.search-box { width: 240px; height: 38px; display: flex; align-items: center; gap: 8px; padding: 0 14px; background: #f4f4ef; border: 1px solid #e4e5dd; border-radius: 10px; } .search-box input { flex: 1; height: 100%; border: 0; outline: 0; background: transparent; font-size: 13px; }
.icon-button { width: 38px; height: 38px; position:relative; display: grid; place-items: center; background: #f4f4ef; border: 1px solid #e4e5dd; border-radius: 10px; cursor: pointer; }.icon-button:hover{background:#e9eee8}.notice-dot{position:absolute;right:6px;top:6px;width:7px;height:7px;border-radius:50%;background:#b64e40;border:1px solid #fff}
.content { padding: 24px 28px 40px; max-width: 1600px; margin: 0 auto; } .page-head { min-height: 58px; margin-bottom: 18px; display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
h1,h2,p { margin: 0; letter-spacing: 0; } .page-head h1 { font-size: 24px; } .page-head p { margin-top: 6px; color: var(--admin-muted); font-size: 13px; }
.button { min-height: 40px; padding: 0 14px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; cursor: pointer; font-weight: 700; font-size: 13px; } .button.primary { background: var(--admin-green-2); color: #fff; } .button.primary:hover{background:#155b39}.button.secondary { background: #fff; color: var(--admin-ink); border: 1px solid var(--admin-line); }.button.secondary:hover{background:#f7f8f4} .button:disabled { opacity: .45; cursor: default; }.button.wide{width:100%;margin-top:18px}
.loading { min-height: 420px; display: grid; place-items: center; color: var(--admin-muted); }
.kpi-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 16px; margin-bottom: 20px; } .kpi-card { padding: 18px; background: #fff; border: 1px solid var(--admin-line); border-radius: 16px; } .kpi-card text,.kpi-card small { display:block; color: var(--admin-muted); font-size: 12px; } .kpi-card strong { display:block; margin: 10px 0 7px; font-size: 27px; font-weight: 800; } .kpi-card .positive { color: #28724d; }
.chart-grid { display: grid; grid-template-columns: 1.65fr 1fr; gap: 16px; margin-bottom: 16px; } .panel,.data-panel { background: #fff; border: 1px solid var(--admin-line); border-radius: 7px; overflow: hidden; } .data-panel{overflow-x:auto;scrollbar-width:thin;scrollbar-color:#c7ccc6 transparent}.panel { padding: 17px; } .panel-head { display:flex; align-items:center; justify-content:space-between; } .panel-head h2 { font-size: 15px; } .panel-head text { color:var(--admin-muted); font-size:11px; } .chart { height: 280px; width: 100%; }
.lower-grid { display:grid; grid-template-columns:1.2fr 1fr; gap:16px; } .rank-row { display:flex; align-items:center; gap:10px; padding:13px 0; border-bottom:1px solid #e5e1d6; } .rank-row .hot-emoji { width:34px; height:34px; border-radius:8px; background:#f1f6ef; display:grid; place-items:center; font-size:18px; flex-shrink:0; } .rank-row>view:nth-child(2) { flex:1; min-width:0; } .rank-row .hot-right { text-align:right; flex-shrink:0; } .rank-row .hot-right b { color:var(--admin-green-2); } .rank-row .hot-right small { color:var(--admin-muted); font-size:11px; margin-top:2px; } .rank-row:last-child { border:0; } .rank-row image { width:42px;height:42px;border-radius:5px; } .rank-row strong,.rank-row small { display:block; } .rank-row strong { font-size:12px; } .rank-row small { color:var(--admin-muted);font-size:10px;margin-top:3px; } .rank-row b { color:var(--admin-green-2);font-size:12px; } .rank-no { font-weight:800;color:var(--admin-gold); }
.todo-row { width:100%;min-height:56px;padding:9px 0;display:flex;align-items:center;gap:11px;background:transparent;border-bottom:1px solid #eef0eb;cursor:pointer;text-align:left;color:var(--admin-ink); } .todo-row .todo-emoji { width:32px; height:32px; border-radius:8px; background:#f1f6ef; display:grid; place-items:center; font-size:16px; flex-shrink:0; } .todo-row>view { flex:1; min-width:0; } .todo-row strong,.todo-row small { display:block; } .todo-row strong { font-size:13px; } .todo-row small { color:var(--admin-muted); font-size:11px; margin-top:2px; } .todo-pill { font-size:11px; font-weight:600; border-radius:999px; padding:3px 10px; background:#eef0eb; color:#6b6b63; flex-shrink:0; } .todo-pill.wait { background:#fff3e0; color:#a65735; } .todo-pill.no { background:#fdeaea; color:#b03a2e; }
.table-row { min-height:68px; padding:0 17px; display:grid; align-items:center; gap:12px; border-bottom:1px solid #eceee8; font-size:12px; } .table-row:last-of-type { border-bottom:0; } .table-head { min-height:44px; background:#f8f9f6; color:var(--admin-muted);font-size:11px;font-weight:700; }
.supplier-grid { grid-template-columns:1.4fr 1.3fr .55fr 1fr 1fr; }.dict-grid { grid-template-columns:1.4fr 1.6fr .7fr .6fr 1fr; }.dict-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 12px;flex-wrap:wrap}.dict-tabs{display:flex;flex-wrap:wrap;gap:7px}.dict-tab{display:flex;align-items:center;min-height:30px;padding:0 4px 0 12px;border-radius:16px;border:1px solid #d9ddd6;background:#fff;color:#23291f}.dict-tab.active{background:#1d6b44;border-color:#1d6b44;color:#fff}.dict-tab-btn{min-height:28px;padding:0 8px;border:0;background:transparent;color:inherit;font-size:12px;cursor:pointer}.dict-tab.active .dict-tab-btn{font-weight:700}.dict-tool-actions{display:flex;align-items:center;gap:8px}.dict-table{border:1px solid #dfe3dc;border-radius:8px;overflow:hidden}.dict-table .table-row{min-height:52px;padding:0 14px}.dict-table .table-row:nth-child(even){background:#fafbf8}.dict-table .table-row:not(.table-head):hover{background:#f0f6f1}.dict-table .table-head{min-height:42px;background:#f0f3ee}.account-grid { grid-template-columns:1.3fr 1fr 1.3fr .6fr .7fr .7fr 1.2fr; }.product-grid { grid-template-columns:1.6fr .8fr .7fr .8fr .6fr .7fr .6fr .6fr .6fr .8fr; }.order-grid{grid-template-columns:1.2fr 1.4fr .45fr .75fr .6fr .6fr .55fr .6fr .6fr .8fr;min-width:1080px}.farm-grid{grid-template-columns:1.3fr 1.2fr .7fr .8fr .75fr .6fr .7fr .8fr}
.after-grid { grid-template-columns:1fr 1.4fr .5fr .7fr .7fr .7fr .7fr .8fr; }.promoter-grid { grid-template-columns:1.2fr 1.1fr .65fr .65fr .9fr .8fr .6fr .8fr; }
.table-row strong,.table-row small { display:block; } .table-row small { color:var(--admin-muted);font-size:10px;margin-top:4px; } .product-cell { display:flex;align-items:center;gap:10px;min-width:0; } .product-cell image { width:42px;height:42px;border-radius:5px;flex:none; } .product-cell view { min-width:0; } .product-cell strong { overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.status { width:max-content;max-width:100%;padding:5px 8px;border-radius:4px;background:#eef0eb;color:#687168;font-size:10px;white-space:nowrap; }.status.active,.status.cooperating,.status.delivered,.status.resolved { background:#dcfce7;color:#15803d; }.status.pending,.status.processing { background:#fff4da;color:#997126; }.status.rejected,.status.after-sale { background:#f9e7e4;color:#a34339; }.status.shipping { background:#e7eef8;color:#45658d; }
.row-actions button { min-height:30px;padding:5px 9px;background:#e7f1eb;color:#1d6b44;border-radius:4px;cursor:pointer;font-size:11px; }.row-actions button:hover{background:#d7e8dd}.row-actions button.danger { background:#f9e7e4;color:#a34339; }.row-actions button.danger:hover{background:#f1d6d2}

.policy-panels { display:flex;flex-direction:column;gap:16px; }.policy-group { padding:0;overflow:hidden; }.policy-group-head { padding:14px 16px;border-bottom:1px solid var(--admin-line);display:flex;align-items:flex-start;justify-content:space-between;gap:12px; }.policy-group-head h2 { font-size:15px;margin:0; }.policy-group-head text { display:block;color:var(--admin-muted);font-size:11px;margin-top:3px; }.policy-group-count { white-space:nowrap;font-size:11px;color:var(--admin-muted); }.policy-card-grid { display:grid;grid-template-columns:repeat(2,1fr);gap:14px;padding:16px; }.policy-data-card { border:1px solid var(--admin-line);border-radius:12px;padding:14px;background:#fff; }.policy-data-top { display:flex;align-items:flex-start;justify-content:space-between;gap:10px; }.policy-data-top strong { font-size:14px; }.policy-scope { display:block;margin-top:4px;color:var(--admin-muted);font-size:11px; }.policy-data-meta { display:flex;align-items:center;gap:10px;margin-top:10px; }.policy-discount { font-size:13px;font-weight:700;color:var(--admin-green-2); }.tier-table { margin-top:12px;border:1px solid #eceee8;border-radius:8px;overflow:hidden; }.tier-table .table-row { min-height:34px;padding:0 12px;font-size:11px; }.tier-table .tier-grid { grid-template-columns:1.3fr .8fr .7fr 1.2fr; }.tier-off { color:var(--admin-green-2);font-weight:700; }.tier-empty { margin-top:12px;padding:10px;border-radius:8px;background:#fafbf8;color:var(--admin-muted);font-size:11px;text-align:center; }.switch { width:42px;height:23px;padding:3px;border-radius:12px;background:#c7ccc6;cursor:pointer; }.switch span { display:block;width:17px;height:17px;border-radius:50%;background:#fff;transition:.2s; }.switch.on { background:var(--admin-green-2); }.switch.on span { transform:translateX(19px); }
.summary-strip { display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid var(--admin-line);background:#fafbf8; }.summary-strip view { padding:15px 18px;border-right:1px solid var(--admin-line); }.summary-strip view:last-child { border:0; }.summary-strip small,.summary-strip strong { display:block; }.summary-strip small { color:var(--admin-muted);font-size:10px; }.summary-strip strong { margin-top:4px;font-size:16px; }.commission-banner { min-height:108px;padding:18px;display:flex;align-items:center;justify-content:space-between;background:#f7f4ea;border-bottom:1px solid #e8dfc7; }.commission-banner small,.commission-banner strong,.commission-banner text { display:block; }.commission-banner small { color:#7a725e;font-size:11px; }.commission-banner strong { margin:5px 0;font-size:26px;color:#8c6b28; }.commission-banner text { color:#8c8370;font-size:10px; }.gold { color:#957027; }
.modal-mask { position:fixed;inset:0;background:rgba(14,25,19,.46);z-index:30;display:grid;place-items:center; }.modal { width:440px;max-width:92vw;max-height:86vh;overflow-y:auto;background:#fff;border-radius:16px;padding:24px;box-shadow:0 24px 70px rgba(0,0,0,.25); }.modal-head { display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:18px; }.modal-head h2 { font-size:19px; }.modal-head p { margin-top:5px;color:var(--admin-muted);font-size:11px; }.field { display:block;margin-bottom:14px; }.field text { display:block;margin-bottom:6px;font-size:11px;font-weight:700; }.field input,.field select { width:100%;height:40px;padding:0 11px;border:1px solid var(--admin-line);border-radius:5px;outline:0;background:#fff; }.modal-actions { display:flex;justify-content:flex-end;gap:9px;margin-top:20px; }
.drawer-mask{position:fixed;inset:0;background:rgba(14,25,19,.42);z-index:35;display:flex;justify-content:flex-end}.drawer{width:min(440px,92vw);height:100%;padding:22px;background:#fff;box-shadow:-18px 0 48px rgba(12,31,21,.2);overflow-y:auto}.drawer-head{display:flex;align-items:flex-start;justify-content:space-between;padding-bottom:18px;border-bottom:1px solid var(--admin-line)}.drawer-head small{display:block;color:var(--admin-muted);font-size:10px;margin-bottom:4px}.drawer-head h2{font-size:20px}.drawer-list{padding-top:18px}.todo-detail>button{width:100%;min-height:52px;padding:0 12px;display:flex;align-items:center;justify-content:space-between;background:#f8f9f6;border-bottom:1px solid var(--admin-line);color:var(--admin-ink);text-align:left}.todo-detail>button:hover{background:var(--admin-green-soft)}.todo-detail b{color:var(--admin-green-2)}.export-history{margin-top:20px;padding:14px;background:#f7f4ea;border-radius:6px}.export-history strong,.export-history text{display:block}.export-history text{margin-top:8px;color:var(--admin-muted);font-size:11px}.detail-hero{display:flex;align-items:center;gap:12px;padding:14px;background:#f7f8f4;border-radius:7px}.detail-icon{width:46px;height:46px;border-radius:7px;background:var(--admin-green-soft);display:grid;place-items:center}.detail-hero h3,.drawer-list>h3{margin:0;font-size:17px}.detail-hero text,.drawer-muted{display:block;margin-top:5px;color:var(--admin-muted);font-size:11px}.detail-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:16px}.detail-grid view{padding:13px;background:#f8f9f6;border:1px solid #eceee8;border-radius:6px}.detail-grid small,.detail-grid strong{display:block}.detail-grid small{color:var(--admin-muted);font-size:10px}.detail-grid strong{margin-top:5px;font-size:14px}.tracking-number{margin:16px 0;padding:13px;border:1px dashed #c8d7cd;border-radius:6px}.tracking-number small,.tracking-number strong{display:block}.tracking-number small{color:var(--admin-muted);font-size:10px}.tracking-number strong{margin-top:5px;font-size:14px}.timeline-list>view{position:relative;display:grid;grid-template-columns:16px 1fr;gap:9px;padding-bottom:18px}.timeline-list>view>span{width:10px;height:10px;margin-top:4px;border-radius:50%;background:var(--admin-green-2);box-shadow:0 0 0 4px var(--admin-green-soft)}.timeline-list>view:not(:last-child)::after{content:"";position:absolute;left:4px;top:16px;bottom:2px;width:1px;background:#cbd8cf}.timeline-list strong,.timeline-list small,.timeline-list text{display:block}.timeline-list small,.timeline-list text{margin-top:4px;color:var(--admin-muted);font-size:10px}.history-row{padding:13px 0;border-bottom:1px solid #eceee8}.history-row strong,.history-row small{display:block}.history-row small{margin-top:5px;color:var(--admin-muted);font-size:10px}.history-items{margin-top:9px;display:grid;gap:6px}.history-items>view{display:grid;grid-template-columns:minmax(120px,1fr) minmax(180px,2fr) auto;gap:12px;align-items:center;padding:8px 10px;border-radius:5px;background:#f7f8f4}.history-items span{font-size:12px;font-weight:700}.history-items small{margin:0;overflow-wrap:anywhere}.history-items b{color:var(--admin-green-2);font-size:12px}.farm-cover{width:100%;height:180px;border-radius:7px;margin-bottom:14px;cursor:zoom-in}
@media(max-width:1180px){.commission-rule-grid{grid-template-columns:repeat(2,1fr)}.sidebar{width:184px}.main{width:calc(100% - 184px);margin-left:184px}.brand{padding:0 12px}.brand-title{font-size:13px}.nav-item{padding:0 9px;gap:8px}.content{padding:20px 18px 36px}.topbar{padding:0 18px}.search-box{width:210px}.kpi-grid{grid-template-columns:repeat(2,1fr)}.chart-grid,.lower-grid{grid-template-columns:1fr}.supplier-grid{min-width:760px}.product-grid,.order-grid,.after-grid,.farm-grid{min-width:860px}.promoter-grid{min-width:900px}.summary-strip{min-width:720px}}
.search-box{height:40px}.row-actions button,.compact-button{min-height:32px}.state-panel{min-height:360px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:var(--admin-muted)}.empty-state{min-height:120px;display:grid;place-items:center;color:var(--admin-muted);font-size:12px}.module-toolbar{padding:12px 16px;display:flex;gap:10px;align-items:center;border-bottom:1px solid var(--admin-line);background:#fff}.module-toolbar select{height:40px;min-width:130px;padding:0 10px;border:1px solid var(--admin-line);border-radius:5px;background:#fff}.module-toolbar .button{margin-left:auto}.order-id{display:flex;align-items:center;gap:9px}.order-id input{width:16px;height:16px}.policy-actions{display:flex;align-items:center;gap:8px}.compact-button{padding:0 9px;border-radius:4px;background:var(--admin-green-soft);color:var(--admin-green-2);font-size:11px}.banner-actions,.drawer-actions{display:flex;gap:9px}.danger-button{background:#a34339!important;color:#fff!important}.share-config-row{display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;padding:4px 0 8px}.share-config-row .field{min-width:160px}.share-config-row .button{margin:0 0 4px}.commission-rules{margin:18px;padding:16px;border:1px solid var(--admin-line);border-radius:7px;background:#fafbf8}.commission-rules>button{width:100%;min-height:40px;padding:0 10px;display:grid;grid-template-columns:1fr auto auto;gap:12px;align-items:center;border-bottom:1px solid var(--admin-line);background:transparent;text-align:left}.commission-rules>button:last-child{border:0}.commission-rules small{color:var(--admin-muted)}
.order-select{width:24px;height:24px;border:1px solid var(--admin-line);border-radius:4px;background:#fff;display:grid;place-items:center;flex:none}.order-select.selected{background:var(--admin-green-2);border-color:var(--admin-green-2)}.order-select.selected .ui-icon{filter:brightness(0) invert(1)}
.settlement-history{margin:18px;padding:16px;border:1px solid var(--admin-line);border-radius:7px;background:#fff}.settlement-history .empty-state{min-height:72px}
.button:focus-visible,.icon-button:focus-visible,.row-actions button:focus-visible,.nav-item:focus-visible,.switch:focus-visible{outline:3px solid rgba(36,115,77,.28);outline-offset:2px}.row-actions button:disabled,.switch:disabled{opacity:.5;cursor:default}.drawer-actions{margin-top:18px}.detail-grid strong{overflow-wrap:anywhere}

/* ===== 原型 1:1 补充样式 ===== */
.page-time{display:block;margin-top:4px;font-size:11px;color:var(--muted,#6f786f)}
.kpi-icon{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:9px;background:var(--soft,#eef2e9);font-size:16px;margin-bottom:8px}
.period-button{min-height:32px;padding:0 10px;border:1px solid var(--line,#d9ddd6);border-radius:7px;background:#fff;color:var(--ink,#23291f);font-size:12px;cursor:pointer}.period-button.on{background:var(--green,#1d6b44);color:#fff;border-color:var(--green,#1d6b44)}
.trend-range-select{height:30px;padding:0 8px;border:1px solid var(--line,#d9ddd6);border-radius:7px;background:#fff;color:var(--ink,#23291f);font-size:12px;outline:0;cursor:pointer}
.stat-strip{display:grid;gap:16px;margin-bottom:20px}.stat-strip.three{grid-template-columns:repeat(3,1fr)}.stat-strip.four{grid-template-columns:repeat(4,1fr)}.stat-strip>view{background:#fff;border:1px solid var(--line,#e5e1d6);border-radius:14px;padding:16px}.stat-strip small{display:block;font-size:12.5px;color:var(--muted,#6f786f)}.stat-strip strong{display:block;margin-top:6px;font-size:22px;font-weight:800}.stat-strip span{display:block;margin-top:6px;font-size:11.5px;color:var(--muted,#6f786f);line-height:1.4}.stat-strip .positive{color:var(--green,#1d6b44)}.stat-strip .pending-text{color:#a65735}
.filter-chips{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 12px}.filter-chips button{min-height:30px;padding:0 12px;border-radius:16px;border:1px solid var(--line,#d9ddd6);background:#fff;color:var(--ink,#23291f);font-size:12px;cursor:pointer}.filter-chips button.active{background:var(--green,#1d6b44);color:#fff;border-color:var(--green,#1d6b44)}
.mini-button{min-height:24px;padding:0 8px;border-radius:5px;background:var(--green,#1d6b44);color:#fff;font-size:10px;border:none;cursor:pointer;margin-left:6px;vertical-align:2px}
.fulfill-strip{display:flex;gap:0;margin-bottom:16px;background:#fff;border:1px solid var(--line,#e5e1d6);border-radius:14px;padding:14px 8px;overflow-x:auto}.fulfill-strip>view{flex:1;min-width:96px;text-align:center;position:relative;padding:2px 4px}.fulfill-strip>view:not(:last-child)::after{content:"→";position:absolute;right:-1px;top:12px;color:#cbd5e1;font-size:16px}.fulfill-strip b{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:50%;background:#d6d3c8;color:#fff;font-size:14px;font-weight:800;margin-bottom:6px}.fulfill-strip .done b{background:var(--green,#1d6b44)}.fulfill-strip .cur b{background:#c2a25a}.fulfill-strip small{display:block;font-size:12px;font-weight:700;color:var(--ink,#23291f)}.fulfill-strip strong{display:block;margin-top:4px;font-size:10.5px;font-weight:700;line-height:1.3}
.settle-banner{display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:10px;align-items:stretch;margin-bottom:12px}.settle-banner>view{background:linear-gradient(135deg,#f7fbf5,#eef5e8);border:1px solid var(--line,#e5e1d6);border-radius:9px;padding:11px 13px}.settle-banner small{display:block;font-size:11px;color:var(--muted,#6f786f)}.settle-banner strong{display:block;margin-top:5px;font-size:18px;font-weight:800}.settle-banner span{display:block;margin-top:4px;font-size:10.5px;color:var(--muted,#6f786f)}.settle-banner .positive{color:var(--green,#1d6b44)}.settle-banner .button{min-height:40px;align-self:center;white-space:nowrap}
.tier-grid{grid-template-columns:1.2fr 1fr 1fr 1.4fr 1fr}.tier-grid strong{font-weight:700}
.status.delivered{background:#e8f2e4;color:var(--green,#1d6b44)}.status.pending{background:#fff3e0;color:#a65735}
.promoter-grid>view strong{display:block}.promoter-grid>view small{display:block;margin-top:3px;color:var(--muted,#6f786f);font-size:11px}


/* ===== P1 样式调整（对照原型） ===== */
.brand{padding:0 14px;gap:8px}
.brand-title{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kpi-card,.panel,.data-panel{border-radius:6px}
.kpi-card{box-shadow:0 1px 3px rgba(20,40,30,.05)}
.kpi-card:nth-child(1) .kpi-icon{background:#e8f2e4}
.kpi-card:nth-child(2) .kpi-icon{background:#e8f2e4}
.kpi-card:nth-child(3) .kpi-icon{background:#fdeee0}
.kpi-card:nth-child(4) .kpi-icon{background:#e8eef7}
.rank-row{padding:13px 0;border-bottom:1px solid #e5e1d6}
.filter-chips button.active{background:#eef2e9;color:#15512f;border-color:#cfe0d2}
.status{border-radius:999px}
.row-actions button{background:#1d6b44;color:#fff}
.row-actions button:hover{background:#155b39}
.row-actions button.danger{background:#f9e7e4;color:#a34339}
.row-actions button.danger:hover{background:#f1d6d2}



.drawer-head-actions{display:flex;align-items:center;gap:8px}
.mark-read-button{min-height:30px;padding:0 10px;border-radius:5px;background:#1d6b44;color:#fff;font-size:11px;display:inline-flex;align-items:center;gap:5px}


/* ===== 按钮靠左 + 文字居中（统一） ===== */
button, uni-button { text-align: center; }
.state-panel { align-items: flex-start; }
.modal-actions { justify-content: flex-start; }
.page-head { justify-content: space-between; flex-wrap: wrap; }
.commission-banner { justify-content: flex-start; gap: 18px; }
.nav-item { justify-content: flex-start; text-align: left; }
.todo-row, .todo-detail button, .commission-rules button { justify-content: flex-start; text-align: left; }
.nav-badge { margin-left: auto; }
.module-toolbar .button { margin-left: 0; }
.order-tabs{display:flex;gap:8px;flex-wrap:wrap}
.order-tabs button{min-height:30px;padding:6px 13px;border-radius:8px;background:#f5f5f1;border:1px solid #e5e1d6;color:#566;font-size:12.5px;font-weight:600}
.order-tabs button.active{background:#e8f1ea;color:#1d6b44;border-color:#c9e0cf}
.toolbar-actions{margin-left:auto;display:flex;gap:10px}
.goods-tools{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.goods-count{margin-left:auto;font-size:12px;color:var(--admin-muted);white-space:nowrap}
.sku-no{color:var(--admin-muted)!important;font-size:11px}
.source-pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600}
.source-pill.platform{background:#e8eff4;color:#3b5f7a}
.source-pill.farmhouse{background:#ececea;color:#6b6b63}




/* ===== 行内 emoji（按截图） ===== */
.row-emoji{display:inline-grid;place-items:center;width:22px;height:22px;margin-right:6px;font-size:14px;background:#f2f4ee;border-radius:5px;vertical-align:-3px}
.row-emoji.big{width:38px;height:38px;font-size:20px;border-radius:6px;vertical-align:middle}


/* ===== 中台表格密度（按截图） ===== */
.table-row{min-height:76px}
.table-head{min-height:48px;background:#fafbf8;color:#8a918a;font-weight:600}


/* ===== 推客排行标签实底（按截图） ===== */
.filter-chips.solid button{border-radius:16px}
.filter-chips.solid button.active{background:#1d6b44;color:#fff;border-color:#1d6b44;font-weight:700}


/* ===== 1:1 还原（对照原型） ===== */
.source-pill.host{background:#f3e3df;color:#a8442e}
.source-pill.expert{background:#e9ecf2;color:#52617f}
.promoter-grid .commission{color:var(--red,#b23a2c);font-weight:800}
.commission-status-table{margin-bottom:14px;border:1px solid #dfe3dc;border-radius:8px;overflow:hidden}
.commission-status-grid{grid-template-columns:1.4fr 1fr 1fr 1fr}
.commission-status-grid>view strong{display:block}
.commission-status-grid>view small{display:block;margin-top:3px;color:var(--admin-muted);font-size:11px}
.commission-status-grid .status{justify-self:start}
.commission-status-grid.status-unsettled{background:#fff7e6}
.commission-status-grid.status-settled{background:#eaf5ec}




/* ===== 按钮组靠左修复（uni-button 默认 margin:0 auto 会摊开） ===== */
.filter-chips uni-button, .order-tabs uni-button { margin: 0; }


.row-actions uni-button { margin: 0; }


.modal-head uni-button, .modal-actions uni-button, .order-id uni-button, .drawer-head uni-button { margin: 0; }


.drawer-actions uni-button { margin: 0; }

/* ===== 文字水平居中兜底 ===== */

.filter-chips uni-button, .order-tabs uni-button { text-align: center; }



/* ===== 按钮文字水平垂直居中（uni-button 默认 display:block 文字顶对齐） ===== */
.filter-chips uni-button, .order-tabs uni-button,
.row-actions uni-button,
.period-button, .mini-button, .compact-button,
.modal-actions uni-button, .drawer-actions uni-button {
  display: inline-flex; align-items: center; justify-content: center;
}


/* ===== 弹层/图标按钮水平垂直居中（uni-button 默认 padding 14px 导致 grid 图标右偏） ===== */
.icon-button, .order-id uni-button { padding: 0; }
/* ===== 登录页 ===== */
.login-page{min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0d2b1f,#1d6b44 60%,#2e8b57);padding:24px}
.login-card{width:min(380px,100%);background:#fff;border-radius:18px;padding:34px 30px 26px;box-shadow:0 24px 60px -24px rgba(0,0,0,.45)}
.login-brand{display:flex;align-items:center;gap:12px;margin-bottom:26px}
.login-brand .brand-mark{width:46px;height:46px;border-radius:12px;background:linear-gradient(135deg,#1d6b44,#2e8b57);display:grid;place-items:center;color:#fff}
.login-brand .brand-title{display:block;font-size:19px;font-weight:800;color:#123}
.login-brand .brand-sub{display:block;font-size:11px;color:#8a9a90;margin-top:3px}
.login-fields{display:flex;flex-direction:column;gap:14px;margin-bottom:20px}
.login-field{display:flex;flex-direction:column;gap:6px}
.login-field text{font-size:12px;color:#5a6a60;font-weight:700}
.login-field input{height:46px;border:1px solid #dfe7e1;border-radius:10px;padding:0 14px;font-size:14px;background:#fafcfb}
.login-button{min-height:46px;border-radius:11px;background:linear-gradient(135deg,#1d6b44,#2e8b57);color:#fff;font-size:15px;font-weight:800;display:flex;align-items:center;justify-content:center}
.login-hint{display:block;text-align:center;margin-top:16px;font-size:11.5px;color:#8a9a90}
.logout-button{min-height:26px;padding:0 10px;border-radius:6px;background:rgba(255,255,255,.14);color:#dcebe2;font-size:10.5px;margin-left:auto;display:inline-flex;align-items:center;justify-content:center;white-space:nowrap}


.upload-row{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.upload-preview{width:64px;height:64px;border:1px solid var(--admin-line);border-radius:6px;background:#fafbf8;cursor:zoom-in}
.upload-button{margin:0;min-height:32px;padding:0 11px;border:1px solid var(--admin-line);border-radius:5px;background:#fff;color:var(--admin-green-2);font-size:12px;font-weight:600;display:inline-flex;align-items:center;justify-content:center}
.upload-button.danger{color:#a34339}
.module-search{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.module-search .search-box{width:240px}
.module-search select{height:36px;min-width:120px;padding:0 8px;border:1px solid var(--admin-line);border-radius:5px;background:#fff;font-size:12px}
.product-thumb{width:42px;height:42px;border-radius:5px;background:#f1f6ef;flex:none;object-fit:contain}
.product-cell .after-thumb{width:40px;height:40px;border-radius:5px;background:#f1f6ef;flex:none;object-fit:contain}
.refund-amount{color:#a34339;font-weight:700}
.refund-apply{color:var(--admin-green-2);font-size:16px}
.flow-view{display:flex;flex-direction:column;gap:16px}
.flow-view .settlement-history{margin:0}
.commission-rule-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;padding:16px}
.commission-rule-card{border:1px solid var(--admin-line);border-radius:12px;padding:14px;background:#fff;display:flex;flex-direction:column;gap:8px;transition:border-color .16s ease,box-shadow .16s ease}
.commission-rule-card:hover{border-color:#c8d8cb;box-shadow:0 4px 14px rgba(29,107,68,.08)}
.rule-top{display:flex;align-items:center;justify-content:space-between}
.rule-icon{width:34px;height:34px;border-radius:9px;background:var(--admin-green-soft);display:inline-grid;place-items:center;font-size:17px}
.rule-name{font-size:14px}
.rule-rate{font-size:26px;font-weight:800;color:var(--admin-green-2);line-height:1;margin-top:2px}
.rule-rate small{font-size:13px;font-weight:700}
.rule-meta{color:var(--admin-muted);font-size:11px;line-height:1.5}
.rule-top .compact-button{margin:0}

.hot-thumb{width:34px;height:34px;border-radius:8px;background:#f1f6ef;flex:none;object-fit:contain}
.gallery-thumb{position:relative;width:64px;height:64px}
.gallery-thumb image{width:64px;height:64px;border:1px solid var(--admin-line);border-radius:6px;background:#fafbf8;cursor:zoom-in}
.gallery-remove{position:absolute;top:-7px;right:-7px;width:18px;height:18px;border-radius:50%;background:#a34339;color:#fff;font-size:12px;line-height:1;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0}
.picker-field{width:100%;height:40px;padding:0 11px;border:1px solid var(--admin-line);border-radius:5px;background:#fff;display:flex;align-items:center;font-size:13px;color:var(--admin-ink)}
.picker-field.placeholder{color:var(--admin-muted)}
.license-thumb{width:56px;height:56px;border:1px solid var(--admin-line);border-radius:6px;background:#fafbf8;cursor:zoom-in}
.category-grid{grid-template-columns:1.4fr 1fr 1fr 1.2fr}
.category-grid .status{justify-self:start}
.farm-thumb{width:44px;height:44px;border-radius:6px;border:1px solid var(--admin-line);background:#fafbf8;flex:none;cursor:zoom-in}
.order-products{display:flex;flex-direction:column;gap:6px;min-width:0}
.order-product{display:flex;align-items:center;gap:8px;min-width:0}
.order-thumb{width:36px;height:36px;border-radius:5px;border:1px solid var(--admin-line);background:#fafbf8;flex:none;cursor:zoom-in}
.supplier-thumb{width:36px;height:36px;border-radius:5px;border:1px solid var(--admin-line);background:#fafbf8;flex:none;cursor:zoom-in}
.order-product text{font-size:12.5px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.order-qty{font-weight:700}
.store-filter{position:relative;min-width:190px}
.store-filter>input{width:100%;height:40px;padding:0 11px;border:1px solid var(--admin-line);border-radius:5px;background:#fff;outline:0;font-size:12px}
.store-dropdown{position:absolute;top:44px;left:0;right:0;z-index:60;max-height:240px;overflow-y:auto;background:#fff;border:1px solid var(--admin-line);border-radius:6px;box-shadow:0 12px 32px rgba(0,0,0,.12)}
.store-option{padding:9px 11px;font-size:12px;cursor:pointer;border-bottom:1px solid #f0f1ec}
.store-option:hover{background:var(--admin-green-soft)}
.supplier-products{margin-top:16px;padding:13px;background:#f8f9f6;border:1px solid #eceee8;border-radius:6px}
.supplier-product-row{display:grid;grid-template-columns:auto 1fr auto auto;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid #eceee8}
.supplier-product-row:last-child{border-bottom:0}
.sp-name strong{font-size:13px}
.sp-name small{display:block;margin-top:3px;color:var(--admin-muted);font-size:11px}
.supplier-product-row .status{font-size:11px}
</style>
