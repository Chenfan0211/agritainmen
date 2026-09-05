<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { onLoad, onShareAppMessage } from '@dcloudio/uni-app'
import type { BusinessMediaValue, CAddress, COrder, CProduct, CProductSku, CSubOrder, PaymentAttempt, Product } from '@agritainment/shared'
import { PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_COMMISSION_LEDGER_STORAGE_KEY, PLATFORM_PAYMENT_ATTEMPTS_STORAGE_KEY, PLATFORM_VOUCHERS_STORAGE_KEY, PLATFORM_WITHDRAWALS_STORAGE_KEY, createPlatformDictionaryCache, defaultProductCategoryImage, displayProductTags, installKeyboardButtonSupport, money, normalizeMinimumOrderQuantity, productCategoryImage, readCDistributorProfiles, readCOrders, readPlatformDictionaries, readUserBindings, resolveProductChannels, subscribePlatformChanges, validateCatalogSkuOrderQuantity } from '@agritainment/shared'
import { BusinessImage, ImageUploader } from '@agritainment/ui'
import UiIcon from '../../components/UiIcon.vue'
import { LIVE_VIDEO_POSTER, LIVE_VIDEO_URL } from '../../config/live'
import { isDemoOrderId } from '../../data/demo-orders'
import { projectDistributorOperations } from '../../services/distributor-operations'
import { useUserStore } from '../../stores/user'

const store = useUserStore()
const dictCache = createPlatformDictionaryCache()
const dictionaryState = ref(readPlatformDictionaries())
let disposeDictionaryImages: () => void = () => undefined
const loading = ref(true)
const authorizing = ref(false)
const activeTab = ref<'home' | 'category' | 'cart' | 'me'>('home')
const meSection = ref<'main' | 'orders'>('main')
const operationsTick = ref(0)
const shareProductId = ref('')
const searchText = ref('')
const activeCategory = ref('全部')
const sheet = ref<'detail' | 'cart' | 'checkout' | 'address' | 'logistics' | 'after-sale' | null>(null)
const liveRoomOpen = ref(false)
const selectedProduct = ref<CProduct | null>(null)
const selectedSkuId = ref('')
const selectedSubOrder = ref<CSubOrder | null>(null)
const afterSaleTarget = ref<{ order: COrder; sub: CSubOrder } | null>(null)
const afterSaleEvidence = ref<BusinessMediaValue[]>([])
const afterSaleReason = ref('运输破损')
const addressEditing = ref(false)
const addressReturnToCheckout = ref(false)
const launchQuery: Record<string, string | undefined> = {}
const addressDraft = reactive<Omit<CAddress, 'id' | 'userId'>>({ receiver: '', phone: '', region: '', detail: '', isDefault: true })
let disposeStorageSync: (() => void) | null = null

onLoad((options) => Object.assign(launchQuery, options || {}))

const categories = computed(() => ['全部', ...Array.from(new Set(store.cProducts.map((item) => item.category)))])
const visibleProducts = computed(() => store.cProducts.filter((product) => {
  const matchesCategory = activeCategory.value === '全部' || product.category === activeCategory.value
  const keyword = searchText.value.trim().toLowerCase()
  return matchesCategory && product.status === 'active' && product.shippingType === 'courier' && product.productType !== 'package' && product.expressDelivery === true && resolveProductChannels(product).live && (!keyword || `${product.name}${product.supplierName}${product.tags.join('')}`.toLowerCase().includes(keyword))
}))
const waterfallColumns = computed(() => [
  visibleProducts.value.filter((_, index) => index % 2 === 0),
  visibleProducts.value.filter((_, index) => index % 2 === 1)
])
const selectedSku = computed(() => selectedProduct.value?.skus.find((sku) => sku.id === selectedSkuId.value) || selectedProduct.value?.skus[0] || null)
const selectedPrice = computed(() => selectedSku.value ? store.priceForSku(selectedSku.value) : 0)
const roleLabel = computed(() => ({ normal: '普通用户', level1: '一级分销商', level2: '二级分销商' }[store.level]))
const featuredLive = computed(() => store.availableLives.find((item) => item.id === store.liveId) || store.availableLives[0] || null)
const withdrawalRequests = computed(() => Array.isArray(store.withdrawalRequests) ? store.withdrawalRequests : [])
const operations = computed(() => {
  void operationsTick.value
  return projectDistributorOperations({ promoterId: store.currentDistributor?.promoterId || '', orders: Object.values(readCOrders() || {}), bindings: readUserBindings() || {}, profiles: readCDistributorProfiles() || {} })
})
const orderStatusLabel = (status: COrder['status']) => ({ pending_payment: '待支付', paid: '备货中', shipped: '已发货', received: '已收货', cancelled: '已取消', after_sale: '售后处理中', partially_shipped: '部分发货', partially_received: '部分收货', partially_after_sale: '部分售后' }[status])
const subStatusLabel = (status: COrder['subOrders'][number]['status']) => orderStatusLabel(status)
const formatDate = (value: string) => value.replace('T', ' ').slice(0, 16)
const withdrawalStatusLabel = (status: 'pending' | 'approved' | 'rejected') => ({ pending: '处理中', approved: '已通过', rejected: '已驳回' }[status])

function minimumOrderQuantity(sku: Pick<CProductSku, 'minimumOrderQuantity'> | null | undefined) {
  return normalizeMinimumOrderQuantity(sku?.minimumOrderQuantity)
}

function canStartOrder(sku: Pick<CProductSku, 'stock' | 'minimumOrderQuantity'> | null | undefined) {
  return !!sku && validateCatalogSkuOrderQuantity(sku, minimumOrderQuantity(sku)).ok
}

function toast(title: string) { uni.showToast({ title, icon: 'none' }) }

function productSharePath(product: CProduct) {
  if (!store.currentDistributor) return '/pages/index/index'
  return `/pages/index/index?promoter=${store.currentDistributor.promoterId}&product=${product.id}`
}

function shareProduct(product: CProduct) {
  shareProductId.value = product.id
  uni.setClipboardData({ data: productSharePath(product), success: () => toast('商品分享链接已复制') })
}

function shareIncome(product: CProduct) {
  const sku = product.skus[0]
  if (!sku) return 0
  return store.level === 'level1' ? sku.level1Commission : sku.level2Commission
}

function openOperations(type: 'income' | 'fans' | 'orders' | 'performance') {
  uni.navigateTo({ url: `/pages/operations/index?type=${type}` })
}

function openMyOrders() {
  activeTab.value = 'me'
  meSection.value = 'orders'
}

onShareAppMessage(() => {
  const product = store.cProducts.find((item) => item.id === shareProductId.value) || selectedProduct.value || store.cProducts[0]
  return { title: product ? `${product.name}｜产地好物` : '中选科技商城', path: product ? productSharePath(product) : '/pages/index/index' }
})

async function authorize() {
  if (authorizing.value) return
  authorizing.value = true
  loading.value = true
  try {
    await store.wechatLogin()
    store.applyLaunch(launchQuery)
    store.seedDemoData()
    await store.initialize(true)
  } finally {
    authorizing.value = false
    loading.value = false
  }
}

function openProduct(product: CProduct) {
  selectedProduct.value = product
  selectedSkuId.value = product.skus[0]?.id || ''
  sheet.value = 'detail'
}

function addSelectedToCart() {
  if (!selectedProduct.value || !selectedSku.value) return
  if (store.addToCart(selectedProduct.value.id, selectedSku.value.id)) {
    sheet.value = null
    toast('已加入购物车')
  } else toast(store.checkoutError || '暂时无法加入购物车')
}

function changeLine(productId: string, skuId: string, delta: number) {
  if (!store.changeCart(productId, skuId, delta)) toast(store.checkoutError || '库存不足')
}

function openCheckout() {
  if (!store.cart.length) return toast('购物车还是空的')
  sheet.value = 'checkout'
}

async function submitOrder() {
  if (!await store.submitOrder()) return toast(store.checkoutError || '请完善订单信息')
  sheet.value = null
  openMyOrders()
  toast('订单已提交，请模拟支付')
}

function editAddress(address?: CAddress) {
  Object.assign(addressDraft, address ? { receiver: address.receiver, phone: address.phone, region: address.region, detail: address.detail, isDefault: address.isDefault, id: address.id } : { receiver: '', phone: '', region: '', detail: '', isDefault: !store.addresses.length })
  addressEditing.value = true
  sheet.value = 'address'
}

function editAddressFromContext(address?: CAddress) {
  editAddress(address)
}

function openAddressManager(returnToCheckout = false) {
  addressEditing.value = false
  addressReturnToCheckout.value = returnToCheckout
  sheet.value = 'address'
}

function chooseAddress(id: string) {
  if (store.setDefaultAddress(id)) {
    sheet.value = addressReturnToCheckout.value ? 'checkout' : 'address'
    toast('已选择收货地址')
  }
}

function removeAddress(id: string) {
  if (store.removeAddress(id)) toast('地址已删除')
}

function saveAddress() {
  const input = addressDraft as Omit<CAddress, 'userId'> & { id?: string }
  if (!store.setAddress(input)) return toast('请填写正确的收货信息')
  sheet.value = 'address'
  addressEditing.value = false
  toast('地址已保存')
}

function toggleDefault() { addressDraft.isDefault = !addressDraft.isDefault }

async function pay(order: COrder) { await store.payOrder(order.id) ? toast('模拟支付成功') : toast(store.checkoutError || '当前订单不能支付') }
async function cancelPendingOrder(order: COrder) { await store.cancelOrder(order.id) ? toast('订单已取消，库存已释放') : toast('当前订单不能取消') }
function paymentAttempt(order: COrder): PaymentAttempt | null { return store.paymentAttemptForOrder(order.id) }
function paymentConfirmationPending(order: COrder) { return ['created', 'unknown', 'confirmed'].includes(paymentAttempt(order)?.status || '') }
function paymentConfirmationQueryable(order: COrder) { return ['unknown', 'confirmed'].includes(paymentAttempt(order)?.status || '') }
async function receive(order: COrder, sub: CSubOrder) { await store.confirmSubOrderReceipt(order.id, sub.id) ? toast('已确认收货，佣金已到账') : toast(store.error || '当前订单不能收货') }
function afterSale(order: COrder, sub: CSubOrder) {
  afterSaleTarget.value = { order, sub }
  afterSaleEvidence.value = []
  sheet.value = 'after-sale'
}
async function confirmAfterSale() {
  const target = afterSaleTarget.value
  if (!target) return
  const status = target.sub.status
  if (!await store.requestSubOrderAfterSale(target.order.id, target.sub.id, afterSaleEvidence.value.length ? afterSaleEvidence.value : undefined)) return toast(store.checkoutError || '当前订单不支持售后')
  sheet.value = null
  afterSaleTarget.value = null
  toast(status === 'paid' ? '已提交售后，库存已释放，待结算佣金已撤销' : status === 'shipped' ? '已提交售后，库存不再恢复' : '已提交售后，佣金已冲正')
}
function openLogistics(sub: CSubOrder) { selectedSubOrder.value = sub; sheet.value = 'logistics' }
async function withdrawCommission() {
  const result = await store.withdrawCommission('微信提现')
  toast(result === 'pending' ? '提现申请已提交' : result === 'duplicate' ? '已有提现申请处理中' : result === 'invalid' ? '暂无可提现佣金' : '提现申请失败')
}

async function logout() {
  store.logout()
  activeTab.value = 'home'
  toast('已退出登录')
}

function openLive() {
  if (!featuredLive.value) return toast('当前直播暂无有效套餐')
  store.liveId = featuredLive.value.id
  if (!store.liveFarms.length) return toast('当前直播暂无有效套餐')
  liveRoomOpen.value = true
}

function closeLiveRoom() {
  liveRoomOpen.value = false
}

async function buyPackage(item: Product) {
  const sku = item.skus.find((candidate) => canStartOrder(candidate)) || item.skus[0]
  if (!sku) return toast('该套餐暂无可售规格')
  if (!await store.buyLivePackage(item.id, sku.id)) return toast(store.checkoutError || '套餐购买失败')
  toast('套餐已购买，可在订单页查看')
}

onMounted(async () => {
  installKeyboardButtonSupport()
  disposeDictionaryImages = dictCache.subscribe((state) => { dictionaryState.value = state })
  Object.assign(launchQuery, uni.getLaunchOptionsSync().query || {})
  store.applyLaunch(launchQuery)
  store.seedDemoData()
  await store.initialize()
  const launchProduct = store.cProducts.find((product) => product.id === store.launchProductId)
  if (launchProduct) openProduct(launchProduct)
  if (typeof window !== 'undefined') {
    const keys = new Set([PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_COMMISSION_LEDGER_STORAGE_KEY, PLATFORM_PAYMENT_ATTEMPTS_STORAGE_KEY, PLATFORM_VOUCHERS_STORAGE_KEY, PLATFORM_WITHDRAWALS_STORAGE_KEY, 'agritainment-platform-c-orders', 'agritainment-platform-c-addresses', 'agritainment-platform-c-commissions', 'agritainment-platform-orders'])
    const onStorage = (event: StorageEvent) => { if (!event.key || keys.has(event.key)) { operationsTick.value += 1; void store.refreshSharedState() } }
    window.addEventListener('storage', onStorage)
    const unsubscribePlatformChanges = subscribePlatformChanges(() => { operationsTick.value += 1; void store.refreshSharedState() }, [...keys])
    disposeStorageSync = () => { window.removeEventListener('storage', onStorage); unsubscribePlatformChanges() }
  }
  loading.value = false
})

onBeforeUnmount(() => {
  disposeDictionaryImages()
  dictCache.dispose()
  disposeStorageSync?.(); disposeStorageSync = null
})
</script>

<template>
  <view class="app-shell" :class="{ 'has-cart-bar': store.cart.length && activeTab !== 'cart' }">
    <view v-if="loading" class="loading-state pc-loading">正在准备商城...</view>

    <view v-else-if="store.entryRestricted" class="auth-page">
      <view class="auth-mark">集</view>
      <text class="auth-title">该入口暂不可访问</text>
      <text class="auth-sub">请通过有效推客分享链接进入商城</text>
      <button v-if="!store.auth.isLoggedIn" class="auth-btn" :disabled="authorizing" @click="authorize">{{ authorizing ? '身份识别中...' : '已绑定用户登录' }}</button>
    </view>

    <view v-else-if="!store.auth.isLoggedIn" class="auth-page">
      <view class="auth-mark">集</view>
      <text class="auth-title">中选科技商城</text>
      <text class="auth-sub">产地好物，快递直发到家</text>
      <button class="auth-btn" :disabled="authorizing" @click="authorize">{{ authorizing ? '授权中...' : '微信一键授权' }}</button>
      <text class="auth-tip">演示环境 · 授权后可查看商品与订单</text>
    </view>

    <template v-else>
      <view v-if="activeTab === 'home'" class="c-mall" data-visual-view="user-home">
        <view class="mall-header">
          <view>
            <text class="eyebrow">ZHONGXUAN TECH</text>
            <text class="mall-title">中选科技优选</text>
          </view>
          <view class="role-chip" @click="activeTab = 'me'"><UiIcon name="user-round" :size="15" />{{ roleLabel }}</view>
        </view>

        <view class="search-box"><UiIcon name="search" :size="17" /><input v-model="searchText" class="search-input" placeholder="搜索商品、供应商或标签" /></view>
        <view v-if="featuredLive" class="live-card" @click="openLive">
          <BusinessImage class="live-card-video" :src="featuredLive.image" :fallback="LIVE_VIDEO_POSTER" mode="aspectFill" />
          <view class="live-card-overlay">
            <view class="live-card-main"><text class="live-card-status"><text></text>{{ featuredLive.status === 'live' ? '直播中' : '预告' }}</text><text class="live-card-title">{{ featuredLive.title }}</text><text class="live-card-sub">{{ featuredLive.host }} · {{ featuredLive.viewers.toLocaleString('zh-CN') }} 人关注</text></view>
            <view class="live-card-enter"><UiIcon name="play" :size="16" />进入直播间</view>
          </view>
        </view>
        <view v-else class="mall-banner"><view><text class="banner-kicker">产地直播</text><text class="banner-title">暂无有效直播</text><text class="banner-sub">新鲜好物持续上新</text></view><view class="banner-play"><UiIcon name="play" :size="18" /></view></view>

        <view class="section-line"><text>推荐好物</text><small class="meta-text">{{ visibleProducts.length }} 件</small></view>
        <view class="waterfall-grid">
          <view v-for="(column, columnIndex) in waterfallColumns" :key="columnIndex" class="waterfall-column">
          <view v-for="product in column" :key="product.id" class="product-card" @click="openProduct(product)">
            <BusinessImage class="product-image" :src="product.image" mode="aspectFill" />
            <view class="product-body"><view class="tag-row"><text v-for="tag in displayProductTags(product, 'live').slice(0, 2)" :key="tag" class="tag" data-typography-compact>{{ tag }}</text></view><text class="product-name">{{ product.name }}</text><text class="supplier-name">{{ product.supplierName }} · 产地直发</text><view class="product-foot"><view><text class="product-price">¥{{ store.priceForSku(product.skus[0]).toFixed(2) }}</text><text v-if="store.currentDistributor" class="share-income">分享赚 ¥{{ shareIncome(product).toFixed(2) }}</text></view><button class="product-action" :class="{ share: !!store.currentDistributor }" @click.stop="store.currentDistributor ? shareProduct(product) : openProduct(product)">{{ store.currentDistributor ? '分享' : '选购' }}</button></view></view>
          </view>
          </view>
        </view>
        <view v-if="!visibleProducts.length" class="empty-block pc-empty"><view class="pc-state-icon"><UiIcon name="search" :size="24" /></view><text>没有找到匹配的商品</text></view>
      </view>

      <view v-else-if="activeTab === 'category'" class="page-content category-page" data-visual-view="user-category">
        <view class="page-heading"><text class="page-title">商品分类</text><text class="page-sub">按品类挑选产地好物</text></view>
        <view class="search-box"><UiIcon name="search" :size="17" /><input v-model="searchText" class="search-input" placeholder="搜索商品、供应商或标签" /></view>
        <view class="category-grid"><button v-for="category in categories" :key="category" class="category-grid-item" :class="{ active: activeCategory === category }" :aria-label="category" :title="category" @click="activeCategory = category"><BusinessImage class="category-grid-img" :src="productCategoryImage(category, dictionaryState)" :fallback="defaultProductCategoryImage(category)" :error-fallback="defaultProductCategoryImage()" :show-error="false" mode="aspectFill" /><text class="category-grid-label">{{ category }}</text></button></view>
        <view class="waterfall-grid compact-feed"><view v-for="(column, columnIndex) in waterfallColumns" :key="columnIndex" class="waterfall-column"><view v-for="product in column" :key="product.id" class="product-card" @click="openProduct(product)"><BusinessImage class="product-image" :src="product.image" mode="aspectFill" /><view class="product-body"><view class="product-name-row"><text v-for="tag in product.tags.slice(0, 2)" :key="tag" class="tag" data-typography-compact>{{ tag }}</text><text class="product-name">{{ product.name }}</text></view><text class="supplier-name">{{ product.supplierName }}</text><view class="product-foot"><view class="product-price-box"><text class="product-price">¥{{ store.priceForSku(product.skus[0]).toFixed(2) }}</text><del v-if="(product.skus[0]?.basePrice ?? 0) > store.priceForSku(product.skus[0])" class="product-original">¥{{ (product.skus[0]?.basePrice ?? 0).toFixed(2) }}</del></view><button class="product-action" @click.stop="openProduct(product)">选购</button></view></view></view></view></view>
        <view v-if="!visibleProducts.length" class="empty-block pc-empty"><view class="pc-state-icon"><UiIcon name="shopping-bag" :size="24" /></view><text>该分类暂无商品</text></view>
      </view>

      <view v-else-if="activeTab === 'cart'" class="page-content cart-page" data-visual-view="user-cart">
        <view class="page-heading"><text class="page-title">购物车</text><text class="page-sub">已选 {{ store.cartCount }} 件商品</text></view>
        <view class="cart-content cart-page-content"><view v-if="!store.cart.length" class="empty-block large pc-empty"><view class="pc-state-icon"><UiIcon name="shopping-cart" :size="26" /></view><text>购物车还是空的</text><button class="outline-btn" @click="activeTab = 'home'">去逛逛</button></view><view v-for="line in store.cart" :key="line.productId + line.skuId" class="cart-line" :class="{ unavailable: line.unavailable }"><BusinessImage :src="line.image" mode="aspectFill" /><view class="cart-line-main"><text>{{ line.name }}</text><small class="meta-text">{{ line.skuName }} · ¥{{ line.unitPrice.toFixed(2) }}</small><small v-if="line.unavailable" class="stock-warning">库存不足或购买数量未达要求</small><view class="stepper"><button @click="changeLine(line.productId, line.skuId, -1)">−</button><text>{{ line.quantity }}</text><button @click="changeLine(line.productId, line.skuId, 1)">+</button></view></view><strong class="strong-text">¥{{ (line.unitPrice * line.quantity).toFixed(2) }}</strong><button class="outline-small cart-remove" @click="store.removeFromCart(line.productId, line.skuId)">删除</button></view><view v-if="store.cart.length" class="cart-checkout"><view><text>合计</text><strong>¥{{ store.cartTotal.toFixed(2) }}</strong></view><button class="primary-btn" :disabled="store.cartHasUnavailable" @click="openCheckout">去结算</button></view></view>
      </view>

      <view v-else-if="activeTab === 'me' && meSection === 'orders'" class="page-content orders-page" data-visual-view="user-orders">
        <view class="page-heading heading-with-back"><button aria-label="返回我的" @click="meSection = 'main'"><UiIcon name="arrow-left" :size="20" /></button><view><text class="page-title">我的订单</text><text class="page-sub">每个供应商独立发货</text></view></view>
        <view v-if="!store.orders.length" class="empty-block large"><UiIcon name="package" :size="30" /><text>还没有订单</text><button class="outline-btn" @click="activeTab = 'home'">去逛逛</button></view>
        <view v-for="order in store.orders" :key="order.id" class="order-card">
          <view class="order-head"><view><view class="order-id-line"><text class="order-id">{{ order.id }}</text><text v-if="isDemoOrderId(order.id)" class="demo-badge">演示订单</text></view><text class="order-time">{{ formatDate(order.createdAt) }}</text></view><text class="order-status">{{ orderStatusLabel(order.status) }}</text></view>
          <view v-for="sub in order.subOrders" :key="sub.id" class="sub-order"><view class="sub-head"><text>{{ sub.supplierName }}</text><text>{{ subStatusLabel(sub.status) }}</text></view><view v-for="item in sub.items" :key="item.skuId" class="order-item"><BusinessImage :src="item.image" mode="aspectFill" /><view><text>{{ item.name }}</text><small class="meta-text">{{ item.skuName }} × {{ item.quantity }}</small></view><strong class="strong-text">¥{{ (item.unitPrice * item.quantity).toFixed(2) }}</strong></view><view v-if="sub.trackingNo" class="tracking-row"><UiIcon name="truck" :size="14" />{{ sub.courier }} {{ sub.trackingNo }}</view><view class="sub-actions"><text v-if="sub.status === 'paid'" class="waiting-copy">{{ isDemoOrderId(order.id) ? '演示订单不参与真实履约' : '等待供应商发货' }}</text><button v-if="!isDemoOrderId(order.id) && sub.status === 'shipped'" class="primary-small" @click="receive(order, sub)">确认收货</button><button v-if="sub.status === 'after_sale'" class="outline-small" disabled>售后处理中</button><button v-if="!isDemoOrderId(order.id) && (sub.status === 'paid' || sub.status === 'shipped' || sub.status === 'received')" class="outline-small" @click="afterSale(order, sub)">申请售后</button><button v-if="sub.status !== 'cancelled'" class="outline-small" @click="openLogistics(sub)">查看物流</button></view></view>
          <view class="order-bottom"><text>共 {{ order.items.reduce((sum, item) => sum + item.quantity, 0) }} 件</text><strong class="strong-text">实付 ¥{{ order.amount.toFixed(2) }}</strong></view>
          <view v-if="!isDemoOrderId(order.id) && order.status === 'pending_payment' && paymentConfirmationPending(order)" class="payment-confirmation">支付结果确认中</view>
          <view v-if="!isDemoOrderId(order.id)" class="order-actions"><button v-if="order.status === 'pending_payment' && !paymentConfirmationPending(order)" class="primary-small" @click="pay(order)">模拟支付</button><button v-if="order.status === 'pending_payment' && paymentConfirmationQueryable(order)" class="primary-small" @click="pay(order)">查询支付结果</button><button v-if="order.status === 'pending_payment' && !paymentConfirmationPending(order)" class="outline-small" @click="cancelPendingOrder(order)">取消订单</button></view>
        </view>
        <view v-if="store.vouchers.length" class="order-card voucher-card"><view class="order-head"><view><text class="order-id">券订单</text><text class="order-time">直播 / 门店套餐</text></view><text class="order-status">共 {{ store.vouchers.length }} 张</text></view><view v-for="voucher in store.vouchers" :key="voucher.id" class="order-item"><view class="voucher-thumb"><UiIcon name="badge-percent" :size="20" /></view><view><text>{{ voucher.id }}</text><small class="meta-text">数量 {{ voucher.quantity }} · ¥{{ voucher.amount.toFixed(2) }} · {{ voucher.status === 'paid' ? '待核销' : voucher.status === 'redeemed' ? '已核销' : '已退款' }}</small></view><strong class="strong-text">¥{{ voucher.amount.toFixed(2) }}</strong></view></view>
      </view>

      <view v-else class="page-content me-page" data-visual-view="user-me">
        <view class="page-heading"><text class="page-title">我的</text><text class="page-sub">分销与订单都在这里管理</text></view>
        <view class="profile-panel"><view class="avatar">{{ roleLabel.slice(0, 1) }}</view><view class="profile-main"><text class="profile-role">{{ roleLabel }}</text><text class="profile-id">用户 {{ store.userId || '演示用户' }}</text></view><text class="profile-state">已登录</text></view>
        <view class="role-switch">
          <button :class="{ active: store.level === 'normal' }" @click="store.setDemoDistributorLevel('normal')">普通用户</button>
          <button :class="{ active: store.level === 'level1' }" @click="store.setDemoDistributorLevel('level1')">一级分销商</button>
          <button :class="{ active: store.level === 'level2' }" @click="store.setDemoDistributorLevel('level2')">二级分销商</button>
        </view>
        <view v-if="store.currentDistributor" class="operations-hero commission-summary"><text>销售统计</text><view><view><strong>¥{{ store.pendingCommission.toFixed(2) }}</strong><small>待结算收入</small></view><view><strong>¥{{ store.availableCommission.toFixed(2) }}</strong><small>可提现收入</small></view><view><strong>¥{{ operations.personalPerformance.toFixed(2) }}</strong><small>个人业绩</small></view><view><strong>¥{{ operations.teamPerformance.toFixed(2) }}</strong><small>团队业绩</small></view></view></view>
<view v-if="store.currentDistributor" class="operations-grid pc-tile-grid"><button class="pc-tile pc-tile--coral" @click="openOperations('income')"><view class="pc-tile-icon"><UiIcon name="badge-dollar-sign" :size="26" /></view><text class="pc-tile-label">我的收入</text></button><button class="pc-tile pc-tile--blue" @click="openOperations('fans')"><view class="pc-tile-icon"><UiIcon name="user-round-check" :size="26" /><text v-if="operations.directFans.length" class="pc-tile-badge">{{ operations.directFans.length > 99 ? '99+' : operations.directFans.length }}</text></view><text class="pc-tile-label">我的粉丝</text></button><button class="pc-tile pc-tile--green" @click="openOperations('orders')"><view class="pc-tile-icon"><UiIcon name="package-check" :size="26" /><text v-if="operations.teamOrders.length" class="pc-tile-badge">{{ operations.teamOrders.length > 99 ? '99+' : operations.teamOrders.length }}</text></view><text class="pc-tile-label">团队订单</text></button><button class="pc-tile pc-tile--amber" @click="openOperations('performance')"><view class="pc-tile-icon"><UiIcon name="chart-no-axes-combined" :size="26" /></view><text class="pc-tile-label">团队业绩</text></button></view>
        <view v-else class="normal-summary"><UiIcon name="shield-check" :size="19" /><view><text>安心购物</text><small>订单、地址与售后服务都在这里</small></view></view>
        <view class="order-entry" @click="openMyOrders"><view><text>我的订单</text><small>查看全部订单</small></view><UiIcon name="chevron-right" :size="17" /></view>
        <template v-if="store.currentDistributor">
          <view class="referral-panel"><view><text>{{ store.level === 'normal' ? '推荐关系' : '我的上级' }}</text><small class="meta-text">{{ store.level === 'normal' ? (store.referralPromoterId ? `已绑定推荐人 ${store.referralPromoterId}` : '暂无有效推荐关系') : (store.currentDistributor?.parentPromoterId ? `一级分销商 ${store.currentDistributor.parentPromoterId}` : '平台直营分销商') }}</small></view><UiIcon name="chevron-right" :size="16" /></view>
          <view class="section-line"><text>佣金明细</text><small class="meta-text">{{ store.myCommissionRecords.length }} 笔</small></view>
          <view v-if="!store.myCommissionRecords.length" class="empty-block compact"><UiIcon name="badge-dollar-sign" :size="24" /><text>确认收货后，分销佣金会在这里显示</text></view>
          <view v-for="record in store.myCommissionRecords" :key="record.id" class="commission-row"><view><text>{{ record.beneficiaryLevel === 'level1' ? '一级分佣' : '二级分佣' }}</text><small class="meta-text">{{ formatDate(record.createdAt) }} · {{ record.status === 'available' ? '可用' : record.status === 'pending' ? '待结算' : record.status === 'withdrawn' ? '已提现' : '已冲正' }}</small></view><strong class="strong-text" :class="{ reversed: record.status === 'reversed' }">{{ record.amount < 0 ? '' : '+' }}¥{{ record.amount.toFixed(2) }}</strong></view>
          <view v-if="withdrawalRequests.length" class="withdrawal-history"><view class="section-line"><text>提现申请</text><small class="meta-text">{{ withdrawalRequests.length }} 笔</small></view><view v-for="request in withdrawalRequests" :key="request.id" class="commission-row"><view><text>{{ request.method }} · {{ withdrawalStatusLabel(request.status) }}</text><small class="meta-text">{{ formatDate(request.createdAt) }}<text v-if="request.reviewedNote"> · {{ request.reviewedNote }}</text></small></view><strong class="strong-text">¥{{ request.amount.toFixed(2) }}</strong></view></view>
        </template>
        <view class="settings-list"><view @click="openAddressManager(false)"><UiIcon name="map-pin" :size="17" /><text>收货地址</text><small class="meta-text">{{ store.defaultAddress ? store.defaultAddress.region : '未设置' }}</small><UiIcon name="chevron-right" :size="15" /></view><view class="live-entry" @click="openLive"><UiIcon name="play" :size="17" /><text>直播/推客活动</text><small class="meta-text">进入活动专区</small><UiIcon name="chevron-right" :size="15" /></view><view @click="logout"><UiIcon name="door-open" :size="17" /><text>退出登录</text><small class="meta-text"></small><UiIcon name="chevron-right" :size="15" /></view></view>
      </view>

      <view v-if="store.cart.length && activeTab !== 'cart'" class="cart-bar" @click="activeTab = 'cart'"><view class="cart-bar-icon"><UiIcon name="shopping-cart" :size="19" /><small>{{ store.cartCount }}</small></view><view class="cart-bar-total"><text>购物车合计</text><strong>¥{{ store.cartTotal.toFixed(2) }}</strong></view><button @click.stop="activeTab = 'cart'">去购物车</button></view>
      <view class="bottom-tabs"><view class="tab-item" :class="{ active: activeTab === 'home' }" @click="activeTab = 'home'"><UiIcon name="house" :size="19" /><text>首页</text></view><view class="tab-item" :class="{ active: activeTab === 'category' }" @click="activeTab = 'category'"><UiIcon name="layout-dashboard" :size="19" /><text>分类</text></view><view class="tab-item" :class="{ active: activeTab === 'cart' }" @click="activeTab = 'cart'"><view class="tab-icon-wrap"><UiIcon name="shopping-cart" :size="19" /><small v-if="store.cartCount">{{ store.cartCount }}</small></view><text>购物车</text></view><view class="tab-item" :class="{ active: activeTab === 'me' }" @click="activeTab = 'me'; meSection = 'main'"><UiIcon name="user-round" :size="19" /><text>我的</text></view></view>
    </template>

    <view v-if="liveRoomOpen && featuredLive" class="live-room" data-visual-state="user-live-room">
      <view class="live-room-video-wrap"><video class="live-room-video" :src="LIVE_VIDEO_URL" :poster="LIVE_VIDEO_POSTER" autoplay controls object-fit="cover" /><view class="live-room-top"><text class="live-card-status"><text></text>直播中</text><button aria-label="关闭直播间" @click="closeLiveRoom"><UiIcon name="x" :size="20" /></button></view><view class="live-room-meta"><text class="live-room-title">{{ featuredLive.title }}</text><small>{{ featuredLive.host }} · {{ featuredLive.viewers.toLocaleString('zh-CN') }} 人关注</small></view></view>
      <view class="live-room-body"><view v-if="!store.liveFarms.length" class="empty-block compact"><UiIcon name="package" :size="24" /><text>当前直播暂无有效套餐</text></view><view v-for="group in store.liveFarms" :key="group.farm!.id" class="live-package-group"><text class="sku-label">{{ group.farm!.name }}</text><view v-for="item in group.packages" :key="item.id" class="live-package-row"><view><text>{{ item.name }}</text><small class="meta-text">{{ item.skus.filter((sku) => canStartOrder(sku)).length }} 个可售规格</small><small v-if="!item.skus.some((sku) => canStartOrder(sku))" class="stock-warning">库存不足或购买数量未达要求</small></view><view class="live-package-actions"><strong class="strong-text">¥{{ item.price.toFixed(2) }}</strong><button class="outline-btn live-buy-btn" :disabled="!item.skus.some((sku) => canStartOrder(sku))" @click="buyPackage(item)">立即购买</button></view></view></view></view>
    </view>

    <view v-if="sheet" class="sheet-mask" @click.self="sheet = null"><view class="sheet">
      <view class="sheet-head"><text>{{ sheet === 'detail' ? '商品详情' : sheet === 'cart' ? '购物车' : sheet === 'checkout' ? '确认订单' : sheet === 'address' ? '收货地址' : sheet === 'logistics' ? '物流详情' : sheet === 'after-sale' ? '申请售后' : '直播活动' }}</text><button aria-label="关闭" @click="sheet = null"><UiIcon name="x" :size="18" /></button></view>
      <view v-if="sheet === 'detail' && selectedProduct && selectedSku" class="detail-content" data-visual-state="user-detail"><BusinessImage class="detail-image" :src="selectedProduct.image" mode="aspectFill" /><view class="detail-title-row"><view><text class="detail-title">{{ selectedProduct.name }}</text><small class="meta-text">{{ selectedProduct.supplierName }}</small></view><strong class="strong-text detail-price">¥{{ selectedPrice.toFixed(2) }}</strong></view><view class="detail-tags"><text v-for="tag in displayProductTags(selectedProduct, 'live')" :key="tag" class="tag">{{ tag }}</text></view><text class="shipping-note"><UiIcon name="truck" :size="14" />快递配送 · 运费 ¥0 · 产地直发</text><text class="sku-label">选择规格</text><view class="sku-list"><view v-for="sku in selectedProduct.skus" :key="sku.id" class="sku-option" :class="{ active: selectedSkuId === sku.id }" @click="selectedSkuId = sku.id"><text>{{ sku.name }}</text><small class="meta-text">库存 {{ sku.stock }} · ¥{{ store.priceForSku(sku).toFixed(2) }}</small><small v-if="!canStartOrder(sku)" class="stock-warning">库存不足或数量未达要求</small></view></view><button class="primary-btn" :disabled="!canStartOrder(selectedSku)" @click="addSelectedToCart">加入购物车</button></view>
      <view v-else-if="sheet === 'cart'" class="cart-content" data-visual-state="user-cart"><view v-if="!store.cart.length" class="empty-block compact"><UiIcon name="shopping-cart" :size="24" /><text>购物车为空</text></view><view v-for="line in store.cart" :key="line.productId + line.skuId" class="cart-line" :class="{ unavailable: line.unavailable }"><BusinessImage :src="line.image" mode="aspectFill" /><view class="cart-line-main"><text>{{ line.name }}</text><small class="meta-text">{{ line.skuName }} · ¥{{ line.unitPrice.toFixed(2) }}</small><small v-if="line.unavailable" class="stock-warning">库存不足或购买数量未达要求</small><view class="stepper"><button @click="changeLine(line.productId, line.skuId, -1)">−</button><text>{{ line.quantity }}</text><button @click="changeLine(line.productId, line.skuId, 1)">+</button></view></view><strong class="strong-text">¥{{ (line.unitPrice * line.quantity).toFixed(2) }}</strong><button class="outline-small cart-remove" @click="store.removeFromCart(line.productId, line.skuId)">删除</button></view><view v-if="store.cart.length" class="sheet-total"><text>身份价格已锁定</text><strong class="strong-text">¥{{ store.cartTotal.toFixed(2) }}</strong></view><button v-if="store.cart.length" class="primary-btn" :disabled="store.cartHasUnavailable" @click="openCheckout">去结算</button></view>
      <view v-else-if="sheet === 'checkout'" class="checkout-content" data-visual-state="user-checkout"><view class="address-select" @click="openAddressManager(true)"><view><text>{{ store.defaultAddress ? store.defaultAddress.receiver + ' ' + store.defaultAddress.phone : '请选择收货地址' }}</text><small class="meta-text">{{ store.defaultAddress ? store.defaultAddress.region + ' ' + store.defaultAddress.detail : '至少设置一条地址才能提交订单' }}</small></view><UiIcon name="chevron-right" :size="17" /></view><view class="checkout-items"><view v-for="line in store.cart" :key="line.productId + line.skuId"><text>{{ line.name }} · {{ line.skuName }} × {{ line.quantity }}</text><strong class="strong-text">¥{{ (line.unitPrice * line.quantity).toFixed(2) }}</strong></view></view><view class="fee-row"><text>商品金额</text><strong class="strong-text">¥{{ store.cartTotal.toFixed(2) }}</strong></view><view class="fee-row"><text>快递配送</text><strong class="strong-text">¥0.00</strong></view><view class="checkout-total"><text>应付金额</text><strong class="strong-text">¥{{ store.cartTotal.toFixed(2) }}</strong></view><button class="primary-btn" :disabled="store.cartHasUnavailable" @click="submitOrder">提交订单</button></view>
      <view v-else-if="sheet === 'address'" class="address-content" data-visual-state="user-address"><view v-if="!addressEditing" class="address-list"><view v-if="!store.addresses.length" class="empty-block compact"><UiIcon name="map-pin" :size="24" /><text>还没有收货地址</text></view><view v-for="address in store.addresses" :key="address.id" class="address-row" @click="chooseAddress(address.id)"><view><text>{{ address.receiver }} {{ address.phone }}</text><small class="meta-text">{{ address.region }} {{ address.detail }}</small></view><view class="address-actions"><text v-if="address.isDefault" class="default-label" data-typography-compact>默认</text><button class="outline-small" @click.stop="editAddressFromContext(address)">编辑</button><button class="outline-small" @click.stop="removeAddress(address.id)">删除</button></view></view><button class="primary-btn" @click="editAddressFromContext()">新增地址</button></view><view v-else class="address-form"><input v-model="addressDraft.receiver" placeholder="收货人姓名" /><input v-model="addressDraft.phone" type="number" placeholder="手机号码" /><input v-model="addressDraft.region" placeholder="所在地区" /><input v-model="addressDraft.detail" placeholder="详细地址" /><view class="default-line" @click="toggleDefault"><text>设为默认地址</text><view class="toggle" :class="{ on: addressDraft.isDefault }"><view></view></view></view><button class="primary-btn" @click="saveAddress">保存地址</button></view></view>
      <view v-else-if="sheet === 'logistics' && selectedSubOrder" class="logistics-content" data-visual-state="user-logistics"><view class="logistics-summary"><text>{{ selectedSubOrder.supplierName }}</text><small class="meta-text">{{ selectedSubOrder.courier || '快递配送' }} · {{ selectedSubOrder.trackingNo || '暂无运单号' }}</small></view><view v-if="!selectedSubOrder.logistics.length" class="empty-block compact"><UiIcon name="truck" :size="24" /><text>暂无物流信息</text></view><view v-for="event in selectedSubOrder.logistics" :key="event.time + event.title" class="logistics-event"><view class="event-dot"></view><view><text>{{ event.title }}</text><small class="meta-text">{{ formatDate(event.time) }} · {{ event.detail }}</small></view></view></view>
      <view v-else-if="sheet === 'after-sale' && afterSaleTarget" class="after-sale-content" data-visual-state="user-after-sale">
        <view class="after-sale-order"><text>{{ afterSaleTarget.sub.supplierName }}</text><small class="meta-text">申请售后：{{ afterSaleTarget.sub.items[0]?.name || afterSaleTarget.sub.supplierName }}</small></view>
        <view class="after-sale-reason"><text>售后原因</text><view class="after-sale-chips"><button v-for="reason in ['运输破损', '质量问题', '少发漏发', '七天无理由', '其他']" :key="reason" :class="{ active: afterSaleReason === reason }" @click="afterSaleReason = reason">{{ reason }}</button></view></view>
        <view class="after-sale-evidence"><text>上传凭证（1-6 张，可选）</text><ImageUploader v-model="afterSaleEvidence" multiple :max-count="6" purpose="after-sale" profile="license" /></view>
        <text class="after-sale-tip">提交后客服将结合凭证审核</text>
        <button class="primary-btn" @click="confirmAfterSale">提交售后申请</button>
      </view>
    </view></view>
  </view>
</template>

<style lang="scss">
.app-shell {
  width: 100%;
  min-height: 100vh;
  overflow-x: hidden;
  padding-bottom: 0;
  box-sizing: border-box;
  background: var(--mobile-bg);
  color: var(--mobile-text);
}

.c-mall,
.page-content {
  min-width: 0;
  padding-bottom: calc(var(--mobile-tab-height) + 16px + var(--mobile-bottom-safe));
}

.app-shell.has-cart-bar .c-mall,
.app-shell.has-cart-bar .page-content {
  padding-bottom: calc(var(--mobile-tab-height) + var(--mobile-action-bar-height) + 16px + var(--mobile-bottom-safe));
}

.loading-state,
.auth-page { min-height: 100vh; }

.loading-state {
  display: grid;
  place-items: center;
  padding: 24px;
  color: var(--mobile-muted);
  font-size: 14px;
}

.auth-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 32px 24px;
  background: var(--mobile-bg);
  text-align: center;
}

.auth-mark {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border: 1px solid #cfe0d5;
  border-radius: 8px;
  background: var(--mobile-brand);
  color: #fff;
  font-size: 27px;
  font-weight: 900;
  box-shadow: var(--mobile-shadow-card);
}

.auth-title { margin-top: 10px; font-size: 20px; font-weight: 900; }
.auth-sub,
.auth-tip { max-width: 280px; color: var(--mobile-muted); font-size: 12px; line-height: 1.6; }

.auth-btn {
  width: min(240px, 100%);
  min-height: 44px;
  margin-top: 18px;
  border: 0;
  border-radius: 8px;
  background: var(--mobile-brand);
  color: #fff;
  font-size: 14px;
  font-weight: 800;
}

.mall-header,
.page-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  padding: calc(22px + env(safe-area-inset-top)) 16px 14px;
}

.page-heading { display: block; padding-bottom: 18px; }
.eyebrow { display: block; color: var(--mobile-warning); font-size: 12px; font-weight: 800; letter-spacing: 0; }
.mall-title,
.page-title { display: block; margin-top: 4px; font-size: 20px; font-weight: 900; line-height: 1.25; }
.page-sub { display: block; margin-top: 5px; color: var(--mobile-muted); font-size: 12px; }

.role-chip {
  display: flex;
  flex: none;
  align-items: center;
  gap: 5px;
  min-height: var(--mobile-control-compact);
  padding: 0 10px;
  border: 1px solid var(--mobile-border);
  border-radius: 8px;
  background: var(--mobile-surface);
  color: var(--mobile-brand);
  font-size: 12px;
  font-weight: 700;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 44px;
  margin: 0 16px 14px;
  padding: 0 13px;
  border: 1px solid var(--mobile-border);
  border-radius: 8px;
  background: var(--mobile-surface);
  color: var(--mobile-muted);
  box-shadow: var(--mobile-shadow-card);
}

.search-input { min-width: 0; flex: 1; height: 100%; color: var(--mobile-text); font-size: 14px; }

.live-card {
  position: relative;
  height: 188px;
  margin: 0 16px 20px;
  overflow: hidden;
  border-radius: 8px;
  background: var(--mobile-brand-deep);
  color: #fff;
  box-shadow: var(--mobile-shadow-card);
}

.live-card-video { display: block; width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
.live-card-overlay { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: space-between; padding: 14px; background: linear-gradient(180deg, rgba(8,20,13,.04), rgba(8,20,13,.72)); }
.live-card-main { min-width: 0; }

.live-card-status,
.live-status { display: flex; align-items: center; gap: 6px; color: #fff1dc; font-size: 12px; font-weight: 800; }
.live-card-status > text,
.live-status > text { width: 7px; height: 7px; flex: none; border-radius: 50%; background: var(--mobile-price); }

.live-card-title {
  display: -webkit-box;
  overflow: hidden;
  margin-top: 7px;
  font-size: 16px;
  font-weight: 900;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.live-card-sub { display: block; overflow: hidden; margin-top: 5px; color: #e3ece6; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.live-card-enter { display: flex; align-items: center; align-self: flex-start; gap: 6px; min-height: var(--mobile-control-compact); padding: 0 11px; border: 1px solid rgba(255,255,255,.38); border-radius: 8px; background: rgba(12,32,21,.48); color: #fff; font-size: 12px; font-weight: 800; }

.mall-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 118px;
  margin: 0 16px 20px;
  padding: 18px;
  border-radius: 8px;
  background: var(--mobile-brand-deep);
  color: #fff;
}

.banner-kicker,
.banner-title,
.banner-sub { display: block; }
.banner-kicker,
.banner-sub { color: #cfdfd5; font-size: 12px; }
.banner-title { margin: 6px 0; font-size: 16px; font-weight: 900; }
.banner-play { display: grid; place-items: center; width: 40px; height: 40px; flex: none; border-radius: 8px; background: #e3efe7; color: var(--mobile-brand-deep); }

.section-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  padding: 0 16px 11px;
  font-size: 16px;
  font-weight: 900;
}

.section-line .meta-text { flex: none; color: var(--mobile-muted); font-size: 12px; font-weight: 400; }
.waterfall-grid { display: flex; align-items: flex-start; gap: 8px; padding: 0 16px; }
.waterfall-column { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 8px; }

.product-card {
  min-width: 0;
  overflow: hidden;
  border: 1px solid #e7ece8;
  border-radius: 8px;
  background: var(--mobile-surface);
  box-shadow: var(--mobile-shadow-card);
}

.product-image { display: block; width: 100%; height: auto; aspect-ratio: 1 / 1; background: var(--mobile-surface-subtle); object-fit: cover; }

.product-body {
  display: flex;
  min-width: 0;
  flex-direction: column;
  padding: 9px;
}

.tag-row,
.detail-tags { display: flex; gap: 5px; overflow: hidden; flex-wrap: wrap; max-height: 23px; }
.tag { max-width: 96px; overflow: hidden; padding: 3px 6px; border-radius: 4px; background: var(--mobile-brand-soft); color: var(--mobile-brand-deep); font-size: 11px; line-height: 17px; text-overflow: ellipsis; white-space: nowrap; }

.product-name-row { display: flex; align-items: flex-start; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
.product-name-row .tag { font-size: 12px; line-height: 1.4; border-radius: 4px; }
.product-name {
  flex: 1;
  min-width: 0;
  display: -webkit-box;
  overflow: hidden;
  color: var(--mobile-text);
  font-size: 14px;
  font-weight: 800;
  line-height: 1.4;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.supplier-name { display: block; min-width: 0; overflow: hidden; margin-top: 3px; color: var(--mobile-muted); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.product-foot { display: flex; min-width: 0; align-items: flex-end; justify-content: space-between; gap: 6px; margin-top: 8px; }
.product-foot > view { min-width: 0; }

.product-price,
.detail-price,
.checkout-total .strong-text,
.sheet-total .strong-text,
.cart-checkout strong,
.commission-row .strong-text { color: var(--mobile-price); font-variant-numeric: tabular-nums; }

.product-price { display: inline; font-size: 18px; font-weight: 900; }
.product-price-box { display: inline-flex; align-items: baseline; gap: 4px; }
.product-original { font-size: 13px; color: var(--mobile-muted); }
.share-income { display: block; overflow: hidden; margin-top: 2px; color: var(--mobile-muted); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }

.product-action {
  min-width: 44px;
  width: 44px;
  min-height: 44px;
  flex: none;
  align-self: flex-end;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: var(--mobile-brand);
  color: #fff;
  font-size: 13px;
  font-weight: 800;
  line-height: 44px;
}

.product-action.share { background: var(--mobile-price); }
.compact-feed { padding-bottom: 14px; }

.category-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 0 16px 16px;
  white-space: nowrap;
  overscroll-behavior-x: contain;
}

.category-row{scrollbar-width:none}
.category-row::-webkit-scrollbar{display:none}
.category-tabs { padding-bottom: 18px; }

.category-item {
  display: inline-flex;
  min-height: var(--mobile-control-compact);
  flex: none;
  align-items: center;
  gap: 7px;
  margin: 0;
  padding: 6px 10px 6px 7px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: var(--mobile-surface-subtle);
  color: var(--mobile-muted);
  font-size: 12px;
  line-height: normal;
}

.category-item::after { border: 0; }
.category-item.active { border-color: #aac8b5; background: var(--mobile-brand-soft); color: var(--mobile-brand-deep); font-weight: 800; }

.category-image {
  width: 26px;
  height: 26px;
  flex: 0 0 26px;
  border-radius: 5px;
  background: var(--mobile-surface-subtle);
}

.category-label { max-width: 104px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.empty-block {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  min-height: 150px;
  padding: 24px;
  color: var(--mobile-muted);
  font-size: 13px;
  line-height: 1.5;
  text-align: center;
}

.empty-block.large { min-height: 250px; flex-direction: column; }
.empty-block.compact { min-height: 96px; flex-direction: column; }
.orders-page,
.me-page { padding-bottom: 14px; }

.order-card {
  margin: 0 16px 12px;
  padding: 14px;
  border: 1px solid #e6ece8;
  border-radius: 8px;
  background: var(--mobile-surface);
  box-shadow: var(--mobile-shadow-card);
}

.order-head,
.sub-head,
.order-bottom,
.fee-row,
.checkout-total,
.sheet-total,
.live-info-row { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 10px; }

.order-head > view,
.sub-head > text:first-child { min-width: 0; }
.order-id-line { display: flex; min-width: 0; align-items: center; gap: 6px; }
.order-id { display: block; min-width: 0; overflow-wrap: anywhere; color: var(--mobile-text); font-size: 12px; font-weight: 800; }
.order-time { display: block; margin-top: 4px; color: var(--mobile-muted); font-size: 12px; }
.order-status { flex: none; color: var(--mobile-price); font-size: 12px; font-weight: 800; }

.demo-badge,
.default-label { flex: none; padding: 2px 6px !important; border-radius: 4px; background: var(--mobile-brand-soft); color: var(--mobile-brand-deep) !important; font-size: 11px !important; font-weight: 700; }

.sub-order { margin-top: 13px; padding-top: 12px; border-top: 1px solid var(--mobile-border); }
.sub-head { font-size: 12px; font-weight: 800; }
.sub-head > text:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sub-head text:last-child { flex: none; color: var(--mobile-muted); font-weight: 400; }

.order-item {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  margin-top: 11px;
}

.order-item .business-image,
.cart-line .business-image { width: 54px; height: 54px; flex: none; border-radius: 6px; background: var(--mobile-surface-subtle); }
.order-item > view:not(.voucher-thumb) { min-width: 0; flex: 1; }

.order-item text,
.order-item .meta-text,
.cart-line-main text,
.cart-line-main .meta-text { display: block; }

.order-item text,
.cart-line-main > text { overflow-wrap: anywhere; color: var(--mobile-text); font-size: 13px; font-weight: 700; line-height: 1.4; }

.order-item .meta-text,
.cart-line-main .meta-text { margin-top: 4px; color: var(--mobile-muted); font-size: 12px; line-height: 1.4; }
.order-item > .strong-text { flex: none; color: var(--mobile-text); font-size: 12px; }

.tracking-row { display: flex; min-width: 0; align-items: center; gap: 6px; margin-top: 11px; padding: 9px 10px; border-radius: 6px; background: #edf4f9; color: var(--mobile-info); font-size: 12px; overflow-wrap: anywhere; }
.order-bottom { margin-top: 13px; padding-top: 12px; border-top: 1px solid var(--mobile-border); color: var(--mobile-muted); font-size: 12px; }
.order-bottom .strong-text { color: var(--mobile-text); font-size: 14px; }

.sub-actions,
.order-actions { display: flex; min-width: 0; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 7px; margin-top: 11px; }
.sub-actions { padding-top: 10px; border-top: 1px solid var(--mobile-border); }
.waiting-copy { min-width: 120px; flex: 1; margin-right: auto; color: var(--mobile-muted); font-size: 12px; overflow-wrap: anywhere; }
.payment-confirmation { margin-top: 10px; color: var(--mobile-warning); font-size: 12px; font-weight: 700; }

.primary-small,
.outline-small,
.outline-btn { min-height: var(--mobile-control-compact); margin: 0; padding: 0 12px; border-radius: 6px; font-size: 13px; line-height: var(--mobile-control-compact); }
.primary-small,
.primary-btn { border: 0; background: var(--mobile-brand); color: #fff; }
.outline-small,
.outline-btn { border: 1px solid #b9ccbf; background: var(--mobile-surface); color: var(--mobile-brand-deep); }

.role-switch {
  display: flex;
  gap: 8px;
  margin: 0 16px 12px;
  padding: 3px;
  border-radius: 8px;
  background: var(--mobile-surface-subtle);
  border: 1px solid var(--mobile-border);
}
.role-switch button {
  flex: 1;
  min-height: 40px;
  padding: 6px 4px;
  border-radius: 6px;
  color: var(--mobile-muted);
  font-size: 13px;
  font-weight: 700;
  text-align: center;
}
.role-switch button.active {
  background: var(--mobile-surface);
  color: var(--mobile-brand);
  font-weight: 800;
  box-shadow: 0 1px 2px rgba(19, 43, 29, .06);
}
.profile-panel {
  display: flex;
  align-items: center;
  gap: 11px;
  margin: 0 16px 12px;
  padding: 16px;
  border-radius: 8px;
  background: var(--mobile-brand-deep);
  color: #fff;
  box-shadow: var(--mobile-shadow-card);
}

.avatar { display: grid; place-items: center; width: 44px; height: 44px; flex: none; border: 1px solid rgba(255,255,255,.35); border-radius: 8px; background: #dceade; color: var(--mobile-brand-deep); font-weight: 900; }
.profile-main { min-width: 0; flex: 1; }
.profile-role,
.profile-id { display: block; }
.profile-role { font-size: 15px; font-weight: 900; }
.profile-id,
.profile-state { color: #cfe0d5; font-size: 12px; }
.profile-id { overflow: hidden; margin-top: 4px; text-overflow: ellipsis; white-space: nowrap; }

.operations-hero,
.operations-grid,
.order-entry,
.normal-summary,
.referral-panel,
.settings-list { margin: 0 16px 12px; border: 1px solid #e6ece8; border-radius: 8px; background: var(--mobile-surface); box-shadow: var(--mobile-shadow-card); }

.operations-hero { padding: 15px; }
.operations-hero > text { display: block; font-size: 15px; font-weight: 900; }
.operations-hero > view { display: grid; grid-template-columns: 1fr 1fr; gap: 0; margin-top: 13px; border-top: 1px solid var(--mobile-border); border-left: 1px solid var(--mobile-border); }
.operations-hero > view > view { min-width: 0; padding: 12px 8px; border-right: 1px solid var(--mobile-border); border-bottom: 1px solid var(--mobile-border); text-align: center; }
.operations-hero strong,
.operations-hero small { display: block; }
.operations-hero strong { overflow: hidden; color: var(--mobile-price); font-size: 17px; font-variant-numeric: tabular-nums; text-overflow: ellipsis; }
.operations-hero small { margin-top: 4px; color: var(--mobile-muted); font-size: 12px; }

.operations-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); padding: 14px 4px; }
.operations-grid > view { display: flex; min-width: 0; min-height: 66px; flex-direction: column; align-items: center; justify-content: center; gap: 7px; }
.operations-grid > view > text { max-width: 100%; overflow: hidden; color: var(--mobile-text); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.operation-icon { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 8px; color: #fff; }
.operation-icon.coral { background: var(--mobile-price); }
.operation-icon.blue { background: var(--mobile-info); }
.operation-icon.green { background: var(--mobile-brand); }
.operation-icon.gold { background: var(--mobile-warning); }

.order-entry,
.normal-summary,
.referral-panel { display: flex; min-height: 64px; align-items: center; gap: 10px; padding: 13px 14px; }
.order-entry { justify-content: space-between; }
.order-entry > view,
.normal-summary > view,
.referral-panel > view { min-width: 0; flex: 1; }

.order-entry text,
.order-entry small,
.normal-summary text,
.normal-summary small,
.referral-panel text,
.referral-panel .meta-text { display: block; }

.order-entry text,
.normal-summary text,
.referral-panel text { font-size: 13px; font-weight: 800; }

.order-entry small,
.normal-summary small,
.referral-panel .meta-text { overflow: hidden; margin-top: 4px; color: var(--mobile-muted); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }

.commission-row { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 12px; margin: 0 16px; padding: 13px 0; border-bottom: 1px solid var(--mobile-border); }
.commission-row > view { min-width: 0; flex: 1; }
.commission-row text,
.commission-row .meta-text { display: block; }
.commission-row text { overflow-wrap: anywhere; font-size: 13px; font-weight: 700; }
.commission-row .meta-text { margin-top: 4px; color: var(--mobile-muted); font-size: 12px; line-height: 1.45; }
.commission-row .strong-text { flex: none; font-size: 14px; }
.commission-row .strong-text.reversed { color: var(--mobile-muted); }

.settings-list { margin-top: 16px; overflow: hidden; }
.settings-list > view { display: flex; min-height: 56px; align-items: center; gap: 10px; padding: 0 14px; border-bottom: 1px solid var(--mobile-border); }
.settings-list > view:last-child { border-bottom: 0; }
.settings-list text { flex: none; font-size: 13px; }
.settings-list .meta-text { min-width: 0; flex: 1; overflow: hidden; color: var(--mobile-muted); font-size: 12px; text-align: right; text-overflow: ellipsis; white-space: nowrap; }

.cart-page-content { padding: 0; }
.cart-line {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) auto;
  grid-template-rows: auto auto;
  gap: 6px 10px;
  min-width: 0;
  margin: 0 16px;
  padding: 14px 0;
  border-bottom: 1px solid var(--mobile-border);
}

.cart-line.unavailable { opacity: .64; }
.cart-line .business-image { grid-column: 1; grid-row: 1 / 3; }
.cart-line-main {
  min-width: 0;
  grid-column: 2;
  grid-row: 1 / 3;
}
.cart-line > .strong-text { grid-column: 3; grid-row: 1; color: var(--mobile-text); font-size: 12px; text-align: right; }
.cart-remove { grid-column: 3; grid-row: 2; align-self: end; }
.stepper { display: flex; align-items: center; gap: 9px; margin-top: 9px; }
.stepper button { display: grid; place-items: center; width: var(--mobile-control-compact); height: var(--mobile-control-compact); margin: 0; padding: 0; border: 1px solid #b9ccbf; border-radius: 6px; background: var(--mobile-surface); color: var(--mobile-brand-deep); line-height: var(--mobile-control-compact); }
.stepper text { min-width: 18px; text-align: center; }

.cart-checkout {
  position: sticky;
  bottom: calc(var(--mobile-tab-height) + env(safe-area-inset-bottom));
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
  padding: 12px 16px;
  border-top: 1px solid var(--mobile-border);
  background: var(--mobile-surface);
  box-shadow: 0 -8px 24px rgba(19,43,29,.08);
}

.cart-bar {
  position: fixed;
  z-index: 8;
  right: 12px;
  bottom: calc(var(--mobile-tab-height) + env(safe-area-inset-bottom) + 10px);
  left: 12px;
  display: flex;
  min-height: 58px;
  align-items: center;
  gap: 10px;
  max-width: 406px;
  margin: 0 auto;
  padding: 8px 10px;
  box-sizing: border-box;
  border: 1px solid var(--mobile-border);
  border-radius: 8px;
  background: rgba(255,255,255,.98);
  box-shadow: var(--mobile-shadow-float);
}
.cart-bar-icon { position: relative; display: grid; width: 38px; height: 38px; flex: none; place-items: center; border-radius: 8px; color: #fff; background: var(--mobile-brand); }
.cart-bar-icon small { position: absolute; top: -6px; right: -6px; display: grid; min-width: 16px; height: 16px; padding: 0 3px; place-items: center; border-radius: 8px; color: #fff; background: var(--mobile-price); font-size: 10px; line-height: 16px; }
.cart-bar-total { min-width: 0; flex: 1; }
.cart-bar-total text, .cart-bar-total strong { display: block; }
.cart-bar-total text { color: var(--mobile-muted); font-size: 12px; }
.cart-bar-total strong { margin-top: 2px; color: var(--mobile-price); font-size: 18px; font-variant-numeric: tabular-nums; }
.cart-bar > button { width: 98px; min-height: 44px; flex: none; margin: 0; border: 0; border-radius: 8px; color: #fff; background: var(--mobile-brand); font-size: 13px; font-weight: 800; }

.cart-checkout text,
.cart-checkout strong { display: block; }
.cart-checkout text { color: var(--mobile-muted); font-size: 12px; }
.cart-checkout strong { margin-top: 2px; font-size: 20px; }

.cart-checkout button {
  width: 112px;
  min-height: 44px;
  margin: 0;
  border: 0;
  border-radius: 8px;
  background: var(--mobile-brand);
  color: #fff;
  font-size: 14px;
  font-weight: 800;
}

.heading-with-back { display: flex; align-items: center; gap: 10px; }
.heading-with-back > button,
.sheet-head button,
.live-room-top button { display: grid; place-items: center; width: 44px; height: 44px; flex: none; margin: 0; padding: 0; border: 0; }
.heading-with-back > button { background: transparent; color: var(--mobile-text); }
.heading-with-back > view { min-width: 0; }

.bottom-tabs {
  position: fixed;
  z-index: 7;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  height: calc(var(--mobile-tab-height) + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  border-top: 1px solid var(--mobile-border);
  box-sizing: border-box;
  background: var(--mobile-surface);
  box-shadow: 0 -4px 16px rgba(19,43,29,.05);
}

.tab-item { display: flex; min-width: 0; flex: 1; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: var(--mobile-muted); font-size: 13px; }
.tab-item.active { color: var(--mobile-brand); font-weight: 800; }
.tab-icon-wrap { position: relative; }
.tab-icon-wrap > small { position: absolute; top: -7px; right: -12px; display: grid; place-items: center; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px; background: var(--mobile-price); color: #fff; font-size: 10px; }

.sheet-mask { position: fixed; z-index: 20; inset: 0; display: flex; align-items: flex-end; background: rgba(13,25,18,.48); }

.sheet {
  width: 100%;
  max-width: 430px;
  max-height: var(--mobile-sheet-max-height);
  overflow-x: hidden;
  overflow-y: auto;
  padding-bottom: calc(20px + env(safe-area-inset-bottom));
  border-radius: 8px 8px 0 0;
  background: var(--mobile-bg);
  box-shadow: var(--mobile-shadow-float);
}

.sheet-head { position: sticky; z-index: 2; top: 0; display: flex; min-height: var(--mobile-sheet-header-height); align-items: center; justify-content: space-between; padding: 6px 12px 6px 16px; border-bottom: 1px solid var(--mobile-border); background: var(--mobile-surface); font-size: 16px; font-weight: 900; }
.sheet-head button { border-radius: 8px; background: transparent; color: var(--mobile-text); }

.detail-content,
.cart-content,
.checkout-content,
.address-content,
.address-form,
.logistics-content,
.after-sale-content,
.live-content { padding: 16px; }

.detail-image,
.live-image { display: block; width: 100%; height: auto; aspect-ratio: 4 / 3; border-radius: 8px; background: var(--mobile-surface-subtle); object-fit: cover; }

.detail-title-row { display: flex; min-width: 0; justify-content: space-between; gap: 14px; margin-top: 14px; }
.detail-title-row > view { min-width: 0; flex: 1; }
.detail-title { display: block; overflow-wrap: anywhere; font-size: 17px; font-weight: 900; line-height: 1.4; }
.detail-title-row .meta-text,
.live-content > .meta-text { display: block; margin-top: 5px; color: var(--mobile-muted); font-size: 12px; }
.detail-price { flex: none; font-size: 21px; font-weight: 900; }
.detail-tags { max-height: none; margin-top: 11px; }
.shipping-note { display: flex; align-items: center; gap: 7px; margin-top: 14px; padding: 10px 11px; border: 1px solid #d4e3d9; border-radius: 6px; background: var(--mobile-brand-soft); color: var(--mobile-brand-deep); font-size: 12px; }
.sku-label { display: block; margin-top: 17px; font-size: 13px; font-weight: 900; }
.sku-list { display: grid; gap: 8px; margin-top: 9px; }

.sku-option { display: flex; min-width: 0; min-height: 58px; flex-direction: column; align-items: flex-start; justify-content: center; padding: 10px 12px; border: 1px solid var(--mobile-border); border-radius: 8px; background: var(--mobile-surface); font-size: 13px; }
.sku-option .meta-text { margin-top: 4px; color: var(--mobile-muted); font-size: 12px; line-height: 1.4; }
.sku-option.active { border-color: var(--mobile-brand); background: var(--mobile-brand-soft); color: var(--mobile-brand-deep); }

.primary-btn {
  width: 100%;
  min-height: 44px;
  margin-top: 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 800;
}

.sheet-total { margin-top: 16px; color: var(--mobile-muted); font-size: 12px; }
.sheet-total .strong-text { font-size: 19px; }

.address-select,
.logistics-summary,
.after-sale-order { padding: 13px; border: 1px solid var(--mobile-border); border-radius: 8px; background: var(--mobile-surface); }

.address-select { display: flex; min-height: 64px; align-items: center; justify-content: space-between; gap: 12px; }
.address-select > view { min-width: 0; flex: 1; }

.address-select text,
.address-select .meta-text,
.logistics-summary text,
.logistics-summary .meta-text,
.after-sale-order text,
.after-sale-order .meta-text { display: block; }

.address-select text,
.logistics-summary text,
.after-sale-order text { overflow-wrap: anywhere; font-size: 13px; font-weight: 800; }

.address-select .meta-text,
.logistics-summary .meta-text,
.after-sale-order .meta-text { margin-top: 5px; color: var(--mobile-muted); font-size: 13px; line-height: 1.45; }

.checkout-items { margin-top: 12px; padding: 10px 0; border-top: 1px solid var(--mobile-border); border-bottom: 1px solid var(--mobile-border); }
.checkout-items view { display: flex; min-width: 0; justify-content: space-between; gap: 12px; margin: 7px 0; color: #46574d; font-size: 12px; }
.checkout-items text { min-width: 0; overflow-wrap: anywhere; }
.checkout-items .strong-text,
.fee-row .strong-text { flex: none; color: var(--mobile-text); }
.fee-row { margin-top: 12px; color: var(--mobile-muted); font-size: 12px; }
.checkout-total { margin-top: 15px; padding-top: 14px; border-top: 1px solid var(--mobile-border); font-size: 13px; font-weight: 800; }
.checkout-total .strong-text { font-size: 20px; }

.address-list { display: grid; gap: 9px; }
.address-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; padding: 12px; border: 1px solid var(--mobile-border); border-radius: 8px; background: var(--mobile-surface); }
.address-row > view:first-child { min-width: 0; }
.address-row text,
.address-row .meta-text { display: block; }
.address-row text { overflow-wrap: anywhere; font-size: 13px; font-weight: 800; }
.address-row .meta-text { margin-top: 5px; color: var(--mobile-muted); font-size: 12px; line-height: 1.45; }
.address-actions { display: flex; max-width: 112px; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 5px; }

.address-form input { display: block; width: 100%; height: 44px; margin-bottom: 10px; padding: 0 12px; border: 1px solid var(--mobile-border); border-radius: 8px; box-sizing: border-box; background: var(--mobile-surface); font-size: 14px; }
.default-line { display: flex; min-height: 44px; align-items: center; justify-content: space-between; color: #46574d; font-size: 13px; }

.toggle { position: relative; width: 42px; height: 24px; flex: none; border-radius: 12px; background: #cdd7d0; transition: background-color .16s ease; }
.toggle > view { position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform .16s ease; }
.toggle.on { background: var(--mobile-brand); }
.toggle.on > view { transform: translateX(18px); }

.logistics-summary { border-left: 3px solid var(--mobile-info); }
.logistics-event {
  display: flex;
  min-width: 0;
  gap: 11px;
  padding: 14px 4px;
  border-bottom: 1px solid var(--mobile-border);
  overflow-wrap: anywhere;
}

.logistics-event > view:last-child { min-width: 0; flex: 1; }
.logistics-event text,
.logistics-event .meta-text { display: block; }
.logistics-event text { font-size: 13px; font-weight: 800; }
.logistics-event .meta-text { margin-top: 4px; color: var(--mobile-muted); font-size: 12px; line-height: 1.45; }
.event-dot { width: 9px; height: 9px; flex: none; margin-top: 4px; border: 2px solid #c7d9e7; border-radius: 50%; background: var(--mobile-info); }

.after-sale-reason,
.after-sale-evidence { margin-top: 16px; }
.after-sale-reason > text,
.after-sale-evidence > text { display: block; font-size: 13px; font-weight: 900; }
.after-sale-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.after-sale-chips button { min-height: var(--mobile-control-compact); margin: 0; padding: 0 12px; border: 1px solid var(--mobile-border); border-radius: 8px; background: var(--mobile-surface); color: var(--mobile-muted); font-size: 13px; }
.after-sale-chips button.active { border-color: var(--mobile-brand); background: var(--mobile-brand-soft); color: var(--mobile-brand-deep); font-weight: 800; }
.after-sale-tip { display: block; margin-top: 12px; color: var(--mobile-muted); font-size: 12px; }
.stock-warning { display: block; margin-top: 4px; color: var(--mobile-danger); font-size: 12px; line-height: 1.4; }

.live-room { position: fixed; z-index: 40; top: 0; height: 100vh; overflow: auto; background: #0b0d0c; }
.live-room-video-wrap { position: relative; width: 100%; height: 44vh; min-height: 300px; background: #000; }
.live-room-video { display: block; width: 100%; height: 100%; object-fit: cover; }
.live-room-top { position: absolute; z-index: 20; top: 0; right: 0; left: 0; display: flex; align-items: center; justify-content: space-between; padding: calc(10px + env(safe-area-inset-top)) 12px 10px; color: #fff; }
.live-room-top button { border-radius: 8px; background: rgba(0,0,0,.48); color: #fff; }
.live-room-meta { position: absolute; right: 14px; bottom: 14px; left: 14px; color: #fff; }
.live-room-title { display: -webkit-box; overflow: hidden; font-size: 17px; font-weight: 900; line-height: 1.4; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.live-room-meta small { display: block; margin-top: 5px; color: #dbe5df; font-size: 12px; }
.live-room-body { min-height: 56vh; padding: 16px; background: var(--mobile-bg); }
.live-package-group { margin-bottom: 18px; }

.live-package-row { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 12px; margin-top: 9px; padding: 13px; border: 1px solid var(--mobile-border); border-radius: 8px; background: var(--mobile-surface); }
.live-package-row > view:first-child { min-width: 0; flex: 1; }
.live-package-row text,
.live-package-row .meta-text { display: block; }
.live-package-row text { overflow-wrap: anywhere; font-size: 13px; font-weight: 800; }
.live-package-row .meta-text { margin-top: 4px; color: var(--mobile-muted); font-size: 12px; line-height: 1.4; }
.live-package-actions { display: flex; flex: none; flex-direction: column; align-items: flex-end; gap: 8px; }
.live-package-actions .strong-text { color: var(--mobile-price); font-size: 15px; }
.live-buy-btn { min-height: var(--mobile-control-compact); margin: 0; padding: 0 11px; }

.voucher-thumb { display: grid; place-items: center; width: 44px; height: 44px; flex: none; border-radius: 8px; background: var(--mobile-brand); color: #fff; }

/* Mobile readability contrast */
.supplier-name,.stock-text,.order-time {
  color:#5f6f66;
}

/* #ifdef H5 */
body,
#app { background: #dfe5e1; }

.app-shell,
.bottom-tabs,
.sheet-mask,
.live-room {
  width: min(430px, 100%);
  max-width: 430px;
}

.app-shell { margin: 0 auto; box-shadow: 0 0 24px rgba(19,43,29,.12); }
.bottom-tabs,
.sheet-mask,
.live-room { right: auto; left: 50%; transform: translateX(-50%); }
.sheet { width: min(430px, 100%); }
/* #endif */

/* #ifdef MP-WEIXIN */
.mall-header,
.page-heading { padding-top: calc(22px + var(--status-bar-height)); }
.app-shell { width: 100vw; max-width: none; }
.live-room { left: 0; width: 100vw; transform: none; }
/* #endif */

@media (max-width: 390px) {
  .product-card { grid-template-columns: 116px minmax(0, 1fr); }
  .product-image { width: 116px; }
  .product-body { padding: 11px; }
  .product-action { min-width: 58px; padding: 0 10px; }
  .operations-grid { padding-right: 2px; padding-left: 2px; }
  .operations-grid > view > text { font-size: 12px; }
}

@media (max-width: 375px) {
  .product-card { grid-template-columns: 110px minmax(0, 1fr); }
  .product-image { width: 110px; }
  .product-price { font-size: 17px; }
  .tag { max-width: 74px; }
  .address-row { grid-template-columns: 1fr; }
  .address-actions { max-width: none; justify-content: flex-start; }
}
</style>
