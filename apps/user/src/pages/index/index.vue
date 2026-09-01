<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import type { BusinessMediaValue, CAddress, COrder, CProduct, CProductSku, CSubOrder, PaymentAttempt, Product } from '@agritainment/shared'
import { PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_COMMISSION_LEDGER_STORAGE_KEY, PLATFORM_PAYMENT_ATTEMPTS_STORAGE_KEY, PLATFORM_VOUCHERS_STORAGE_KEY, PLATFORM_WITHDRAWALS_STORAGE_KEY, displayProductTags, installKeyboardButtonSupport, money, normalizeMinimumOrderQuantity, resolveProductChannels, subscribePlatformChanges, validateCatalogSkuOrderQuantity } from '@agritainment/shared'
import { BusinessImage, ImageUploader } from '@agritainment/ui'
import UiIcon from '../../components/UiIcon.vue'
import { LIVE_VIDEO_POSTER, LIVE_VIDEO_URL } from '../../config/live'
import { isDemoOrderId } from '../../data/demo-orders'
import { useUserStore } from '../../stores/user'

const store = useUserStore()
const loading = ref(true)
const authorizing = ref(false)
const activeTab = ref<'mall' | 'orders' | 'me'>('mall')
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
const selectedSku = computed(() => selectedProduct.value?.skus.find((sku) => sku.id === selectedSkuId.value) || selectedProduct.value?.skus[0] || null)
const selectedPrice = computed(() => selectedSku.value ? store.priceForSku(selectedSku.value) : 0)
const roleLabel = computed(() => ({ normal: '普通用户', level1: '一级分销商', level2: '二级分销商' }[store.level]))
const featuredLive = computed(() => store.availableLives.find((item) => item.id === store.liveId) || store.availableLives[0] || null)
const withdrawalRequests = computed(() => Array.isArray(store.withdrawalRequests) ? store.withdrawalRequests : [])
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
  activeTab.value = 'orders'
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
  activeTab.value = 'mall'
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
  Object.assign(launchQuery, uni.getLaunchOptionsSync().query || {})
  store.applyLaunch(launchQuery)
  store.seedDemoData()
  await store.initialize()
  if (typeof window !== 'undefined') {
    const keys = new Set([PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_COMMISSION_LEDGER_STORAGE_KEY, PLATFORM_PAYMENT_ATTEMPTS_STORAGE_KEY, PLATFORM_VOUCHERS_STORAGE_KEY, PLATFORM_WITHDRAWALS_STORAGE_KEY, 'agritainment-platform-c-orders', 'agritainment-platform-c-addresses', 'agritainment-platform-c-commissions', 'agritainment-platform-orders'])
    const onStorage = (event: StorageEvent) => { if (!event.key || keys.has(event.key)) void store.refreshSharedState() }
    window.addEventListener('storage', onStorage)
    const unsubscribePlatformChanges = subscribePlatformChanges(() => { void store.refreshSharedState() }, [...keys])
    disposeStorageSync = () => { window.removeEventListener('storage', onStorage); unsubscribePlatformChanges() }
  }
  loading.value = false
})

onBeforeUnmount(() => { disposeStorageSync?.(); disposeStorageSync = null })
</script>

<template>
  <view class="app-shell">
    <view v-if="loading" class="loading-state">正在准备商城...</view>

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
      <view v-if="activeTab === 'mall'" class="c-mall">
        <view class="mall-header">
          <view>
            <text class="eyebrow">ZHONGXUAN TECH</text>
            <text class="mall-title">产地好物，安心到家</text>
          </view>
          <view class="role-chip" @click="activeTab = 'me'"><UiIcon name="user-round" :size="15" />{{ roleLabel }}</view>
        </view>

        <view class="search-box"><UiIcon name="search" :size="17" /><input v-model="searchText" class="search-input" placeholder="搜索商品、供应商或标签" /></view>
        <view class="category-row"><text v-for="category in categories" :key="category" class="category-item" :class="{ active: activeCategory === category }" @click="activeCategory = category">{{ category }}</text></view>

        <view v-if="featuredLive" class="live-card" @click="openLive">
          <BusinessImage class="live-card-video" :src="featuredLive.image" :fallback="LIVE_VIDEO_POSTER" mode="aspectFill" />
          <view class="live-card-overlay">
            <view class="live-card-main"><text class="live-card-status"><text></text>{{ featuredLive.status === 'live' ? '直播中' : '预告' }}</text><text class="live-card-title">{{ featuredLive.title }}</text><text class="live-card-sub">{{ featuredLive.host }} · {{ featuredLive.viewers.toLocaleString('zh-CN') }} 人关注</text></view>
            <view class="live-card-enter"><UiIcon name="play" :size="16" />进入直播间</view>
          </view>
        </view>
        <view v-else class="mall-banner"><view><text class="banner-kicker">产地直播</text><text class="banner-title">暂无有效直播</text><text class="banner-sub">新鲜好物持续上新</text></view><view class="banner-play"><UiIcon name="play" :size="18" /></view></view>

        <view class="section-line"><text>精选商品</text><small class="meta-text">{{ visibleProducts.length }} 件</small></view>
        <view class="product-grid">
          <view v-for="product in visibleProducts" :key="product.id" class="product-card" @click="openProduct(product)">
            <BusinessImage class="product-image" :src="product.image" mode="aspectFill" />
            <view class="product-body"><view class="tag-row"><text v-for="tag in displayProductTags(product, 'live').slice(0, 3)" :key="tag" class="tag">{{ tag }}</text></view><text class="product-name">{{ product.name }}</text><text class="supplier-name">{{ product.supplierName }}</text><view class="product-foot"><text class="product-price">¥{{ store.priceForSku(product.skus[0]).toFixed(2) }}</text><view class="product-order-meta"><text class="stock-text">起订 {{ minimumOrderQuantity(product.skus[0]) }} 件</text><text class="stock-text">{{ canStartOrder(product.skus[0]) ? `库存 ${product.skus[0].stock}` : '库存不足起订量' }}</text></view></view></view>
          </view>
        </view>
        <view v-if="!visibleProducts.length" class="empty-block">没有找到匹配的商品</view>
      </view>

      <view v-else-if="activeTab === 'orders'" class="page-content orders-page">
        <view class="page-heading"><text class="page-title">我的订单</text><text class="page-sub">每个供应商独立发货</text></view>
        <view v-if="!store.orders.length" class="empty-block large"><UiIcon name="package" :size="30" /><text>还没有订单</text><button class="outline-btn" @click="activeTab = 'mall'">去逛逛</button></view>
        <view v-for="order in store.orders" :key="order.id" class="order-card">
          <view class="order-head"><view><view class="order-id-line"><text class="order-id">{{ order.id }}</text><text v-if="isDemoOrderId(order.id)" class="demo-badge">演示订单</text></view><text class="order-time">{{ formatDate(order.createdAt) }}</text></view><text class="order-status">{{ orderStatusLabel(order.status) }}</text></view>
          <view v-for="sub in order.subOrders" :key="sub.id" class="sub-order"><view class="sub-head"><text>{{ sub.supplierName }}</text><text>{{ subStatusLabel(sub.status) }}</text></view><view v-for="item in sub.items" :key="item.skuId" class="order-item"><BusinessImage :src="item.image" mode="aspectFill" /><view><text>{{ item.name }}</text><small class="meta-text">{{ item.skuName }} × {{ item.quantity }} · 起订 {{ normalizeMinimumOrderQuantity(item.minimumOrderQuantity) }} 件</small></view><strong class="strong-text">¥{{ (item.unitPrice * item.quantity).toFixed(2) }}</strong></view><view v-if="sub.trackingNo" class="tracking-row"><UiIcon name="truck" :size="14" />{{ sub.courier }} {{ sub.trackingNo }}</view><view class="sub-actions"><text v-if="sub.status === 'paid'" class="waiting-copy">{{ isDemoOrderId(order.id) ? '演示订单不参与真实履约' : '等待供应商发货' }}</text><button v-if="!isDemoOrderId(order.id) && sub.status === 'shipped'" class="primary-small" @click="receive(order, sub)">确认收货</button><button v-if="sub.status === 'after_sale'" class="outline-small" disabled>售后处理中</button><button v-if="!isDemoOrderId(order.id) && (sub.status === 'paid' || sub.status === 'shipped' || sub.status === 'received')" class="outline-small" @click="afterSale(order, sub)">申请售后</button><button v-if="sub.status !== 'cancelled'" class="outline-small" @click="openLogistics(sub)">查看物流</button></view></view>
          <view class="order-bottom"><text>共 {{ order.items.reduce((sum, item) => sum + item.quantity, 0) }} 件</text><strong class="strong-text">实付 ¥{{ order.amount.toFixed(2) }}</strong></view>
          <view v-if="!isDemoOrderId(order.id) && order.status === 'pending_payment' && paymentConfirmationPending(order)" class="payment-confirmation">支付结果确认中</view>
          <view v-if="!isDemoOrderId(order.id)" class="order-actions"><button v-if="order.status === 'pending_payment' && !paymentConfirmationPending(order)" class="primary-small" @click="pay(order)">模拟支付</button><button v-if="order.status === 'pending_payment' && paymentConfirmationQueryable(order)" class="primary-small" @click="pay(order)">查询支付结果</button><button v-if="order.status === 'pending_payment' && !paymentConfirmationPending(order)" class="outline-small" @click="cancelPendingOrder(order)">取消订单</button></view>
        </view>
        <view v-if="store.vouchers.length" class="order-card voucher-card"><view class="order-head"><view><text class="order-id">券订单</text><text class="order-time">直播 / 门店套餐</text></view><text class="order-status">共 {{ store.vouchers.length }} 张</text></view><view v-for="voucher in store.vouchers" :key="voucher.id" class="order-item"><view class="voucher-thumb">券</view><view><text>{{ voucher.id }}</text><small class="meta-text">数量 {{ voucher.quantity }} · ¥{{ voucher.amount.toFixed(2) }} · {{ voucher.status === 'paid' ? '待核销' : voucher.status === 'redeemed' ? '已核销' : '已退款' }}</small></view><strong class="strong-text">¥{{ voucher.amount.toFixed(2) }}</strong></view></view>
      </view>

      <view v-else class="page-content me-page">
        <view class="page-heading"><text class="page-title">我的</text><text class="page-sub">分销与订单都在这里管理</text></view>
        <view class="profile-panel"><view class="avatar">{{ roleLabel.slice(0, 1) }}</view><view class="profile-main"><text class="profile-role">{{ roleLabel }}</text><text class="profile-id">用户 {{ store.userId || '演示用户' }}</text></view><text class="profile-state">已登录</text></view>
        <view class="commission-summary"><view><small class="meta-text">待结算佣金</small><strong class="strong-text">¥{{ store.pendingCommission.toFixed(2) }}</strong></view><view><small class="meta-text">可用佣金</small><strong class="strong-text">¥{{ store.availableCommission.toFixed(2) }}</strong><button v-if="store.availableCommission > 0" class="withdraw-btn" @click="withdrawCommission">模拟提现</button></view></view>
        <view class="referral-panel"><view><text>{{ store.level === 'normal' ? '推荐关系' : '我的上级' }}</text><small class="meta-text">{{ store.level === 'normal' ? (store.referralPromoterId ? `已绑定推荐人 ${store.referralPromoterId}` : '暂无有效推荐关系') : (store.currentDistributor?.parentPromoterId ? `一级分销商 ${store.currentDistributor.parentPromoterId}` : '平台直营分销商') }}</small></view><UiIcon name="chevron-right" :size="16" /></view>
         <view class="section-line"><text>佣金明细</text><small class="meta-text">{{ store.myCommissionRecords.length }} 笔</small></view>
         <view v-if="!store.myCommissionRecords.length" class="empty-block compact">确认收货后，分销佣金会在这里显示</view>
         <view v-for="record in store.myCommissionRecords" :key="record.id" class="commission-row"><view><text>{{ record.beneficiaryLevel === 'level1' ? '一级分佣' : '二级分佣' }}</text><small class="meta-text">{{ formatDate(record.createdAt) }} · {{ record.status === 'available' ? '可用' : record.status === 'pending' ? '待结算' : record.status === 'withdrawn' ? '已提现' : '已冲正' }}</small></view><strong class="strong-text" :class="{ reversed: record.status === 'reversed' }">{{ record.amount < 0 ? '' : '+' }}¥{{ record.amount.toFixed(2) }}</strong></view>
         <view v-if="withdrawalRequests.length" class="withdrawal-history"><view class="section-line"><text>提现申请</text><small class="meta-text">{{ withdrawalRequests.length }} 笔</small></view><view v-for="request in withdrawalRequests" :key="request.id" class="commission-row"><view><text>{{ request.method }} · {{ withdrawalStatusLabel(request.status) }}</text><small class="meta-text">{{ formatDate(request.createdAt) }}<text v-if="request.reviewedNote"> · {{ request.reviewedNote }}</text></small></view><strong class="strong-text">¥{{ request.amount.toFixed(2) }}</strong></view></view>
        <view class="settings-list"><view @click="openAddressManager(false)"><UiIcon name="map-pin" :size="17" /><text>收货地址</text><small class="meta-text">{{ store.defaultAddress ? store.defaultAddress.region : '未设置' }}</small><UiIcon name="chevron-right" :size="15" /></view><view class="live-entry" @click="openLive"><UiIcon name="play" :size="17" /><text>直播/推客活动</text><small class="meta-text">进入活动专区</small><UiIcon name="chevron-right" :size="15" /></view><view @click="logout"><UiIcon name="door-open" :size="17" /><text>退出登录</text><small class="meta-text"></small><UiIcon name="chevron-right" :size="15" /></view></view>
      </view>

      <view v-if="activeTab === 'mall' && store.cartCount" class="cart-bar" @click="sheet = 'cart'"><view class="cart-count">{{ store.cartCount }}</view><text>购物车</text><strong class="strong-text">¥{{ store.cartTotal.toFixed(2) }}</strong><text class="cart-action">去结算</text></view>
      <view class="bottom-tabs"><view class="tab-item" :class="{ active: activeTab === 'mall' }" @click="activeTab = 'mall'"><UiIcon name="shopping-bag" :size="19" /><text>商城</text></view><view class="tab-item" :class="{ active: activeTab === 'orders' }" @click="activeTab = 'orders'"><UiIcon name="package-check" :size="19" /><text>我的订单</text></view><view class="tab-item" :class="{ active: activeTab === 'me' }" @click="activeTab = 'me'"><UiIcon name="user-round" :size="19" /><text>我的</text></view></view>
    </template>

    <view v-if="liveRoomOpen && featuredLive" class="live-room">
      <view class="live-room-video-wrap"><video class="live-room-video" :src="LIVE_VIDEO_URL" :poster="LIVE_VIDEO_POSTER" autoplay controls object-fit="cover" /><view class="live-room-top"><text class="live-card-status"><text></text>直播中</text><button aria-label="关闭直播间" @click="closeLiveRoom"><UiIcon name="x" :size="20" /></button></view><view class="live-room-meta"><text class="live-room-title">{{ featuredLive.title }}</text><small>{{ featuredLive.host }} · {{ featuredLive.viewers.toLocaleString('zh-CN') }} 人关注</small></view></view>
      <view class="live-room-body"><view v-if="!store.liveFarms.length" class="empty-block compact">当前直播暂无有效套餐</view><view v-for="group in store.liveFarms" :key="group.farm!.id" class="live-package-group"><text class="sku-label">{{ group.farm!.name }}</text><view v-for="item in group.packages" :key="item.id" class="live-package-row"><view><text>{{ item.name }}</text><small class="meta-text">起订 {{ minimumOrderQuantity(item.skus[0]) }} 件 · {{ item.skus.filter((sku) => canStartOrder(sku)).length }} 个可售规格</small><small v-if="!item.skus.some((sku) => canStartOrder(sku))" class="stock-warning">库存不足起订量</small></view><view class="live-package-actions"><strong class="strong-text">¥{{ item.price.toFixed(2) }}</strong><button class="outline-btn live-buy-btn" :disabled="!item.skus.some((sku) => canStartOrder(sku))" @click="buyPackage(item)">立即购买</button></view></view></view></view>
    </view>

    <view v-if="sheet" class="sheet-mask" @click.self="sheet = null"><view class="sheet">
      <view class="sheet-head"><text>{{ sheet === 'detail' ? '商品详情' : sheet === 'cart' ? '购物车' : sheet === 'checkout' ? '确认订单' : sheet === 'address' ? '收货地址' : sheet === 'logistics' ? '物流详情' : sheet === 'after-sale' ? '申请售后' : '直播活动' }}</text><button aria-label="关闭" @click="sheet = null"><UiIcon name="x" :size="18" /></button></view>
      <view v-if="sheet === 'detail' && selectedProduct && selectedSku" class="detail-content"><BusinessImage class="detail-image" :src="selectedProduct.image" mode="aspectFill" /><view class="detail-title-row"><view><text class="detail-title">{{ selectedProduct.name }}</text><small class="meta-text">{{ selectedProduct.supplierName }}</small></view><strong class="strong-text detail-price">¥{{ selectedPrice.toFixed(2) }}</strong></view><view class="detail-tags"><text v-for="tag in displayProductTags(selectedProduct, 'live')" :key="tag" class="tag">{{ tag }}</text></view><text class="shipping-note"><UiIcon name="truck" :size="14" />快递配送 · 运费 ¥0 · 产地直发</text><text class="sku-label">选择规格</text><view class="sku-list"><view v-for="sku in selectedProduct.skus" :key="sku.id" class="sku-option" :class="{ active: selectedSkuId === sku.id }" @click="selectedSkuId = sku.id"><text>{{ sku.name }}</text><small class="meta-text">库存 {{ sku.stock }} · 起订 {{ minimumOrderQuantity(sku) }} 件 · ¥{{ store.priceForSku(sku).toFixed(2) }}</small><small v-if="!canStartOrder(sku)" class="stock-warning">库存不足起订量</small></view></view><button class="primary-btn" :disabled="!canStartOrder(selectedSku)" @click="addSelectedToCart">加入购物车</button></view>
      <view v-else-if="sheet === 'cart'" class="cart-content"><view v-if="!store.cart.length" class="empty-block compact">购物车为空</view><view v-for="line in store.cart" :key="line.productId + line.skuId" class="cart-line" :class="{ unavailable: line.unavailable }"><BusinessImage :src="line.image" mode="aspectFill" /><view class="cart-line-main"><text>{{ line.name }}</text><small class="meta-text">{{ line.skuName }} · 起订 {{ normalizeMinimumOrderQuantity(line.minimumOrderQuantity) }} 件 · ¥{{ line.unitPrice.toFixed(2) }}</small><small v-if="line.unavailable" class="stock-warning">低于起订量或库存不足，不可结算</small><view class="stepper"><button @click="changeLine(line.productId, line.skuId, -1)">−</button><text>{{ line.quantity }}</text><button @click="changeLine(line.productId, line.skuId, 1)">+</button></view></view><strong class="strong-text">¥{{ (line.unitPrice * line.quantity).toFixed(2) }}</strong><button class="outline-small cart-remove" @click="store.removeFromCart(line.productId, line.skuId)">删除</button></view><view v-if="store.cart.length" class="sheet-total"><text>身份价格已锁定</text><strong class="strong-text">¥{{ store.cartTotal.toFixed(2) }}</strong></view><button v-if="store.cart.length" class="primary-btn" :disabled="store.cartHasUnavailable" @click="openCheckout">去结算</button></view>
      <view v-else-if="sheet === 'checkout'" class="checkout-content"><view class="address-select" @click="openAddressManager(true)"><view><text>{{ store.defaultAddress ? store.defaultAddress.receiver + ' ' + store.defaultAddress.phone : '请选择收货地址' }}</text><small class="meta-text">{{ store.defaultAddress ? store.defaultAddress.region + ' ' + store.defaultAddress.detail : '至少设置一条地址才能提交订单' }}</small></view><UiIcon name="chevron-right" :size="17" /></view><view class="checkout-items"><view v-for="line in store.cart" :key="line.productId + line.skuId"><text>{{ line.name }} · {{ line.skuName }} × {{ line.quantity }}</text><strong class="strong-text">¥{{ (line.unitPrice * line.quantity).toFixed(2) }}</strong></view></view><view class="fee-row"><text>商品金额</text><strong class="strong-text">¥{{ store.cartTotal.toFixed(2) }}</strong></view><view class="fee-row"><text>快递配送</text><strong class="strong-text">¥0.00</strong></view><view class="checkout-total"><text>应付金额</text><strong class="strong-text">¥{{ store.cartTotal.toFixed(2) }}</strong></view><button class="primary-btn" :disabled="store.cartHasUnavailable" @click="submitOrder">提交订单</button></view>
      <view v-else-if="sheet === 'address'" class="address-content"><view v-if="!addressEditing" class="address-list"><view v-if="!store.addresses.length" class="empty-block compact">还没有收货地址</view><view v-for="address in store.addresses" :key="address.id" class="address-row" @click="chooseAddress(address.id)"><view><text>{{ address.receiver }} {{ address.phone }}</text><small class="meta-text">{{ address.region }} {{ address.detail }}</small></view><view class="address-actions"><text v-if="address.isDefault" class="default-label">默认</text><button class="outline-small" @click.stop="editAddressFromContext(address)">编辑</button><button class="outline-small" @click.stop="removeAddress(address.id)">删除</button></view></view><button class="primary-btn" @click="editAddressFromContext()">新增地址</button></view><view v-else class="address-form"><input v-model="addressDraft.receiver" placeholder="收货人姓名" /><input v-model="addressDraft.phone" type="number" placeholder="手机号码" /><input v-model="addressDraft.region" placeholder="所在地区" /><input v-model="addressDraft.detail" placeholder="详细地址" /><view class="default-line" @click="toggleDefault"><text>设为默认地址</text><view class="toggle" :class="{ on: addressDraft.isDefault }"><view></view></view></view><button class="primary-btn" @click="saveAddress">保存地址</button></view></view>
      <view v-else-if="sheet === 'logistics' && selectedSubOrder" class="logistics-content"><view class="logistics-summary"><text>{{ selectedSubOrder.supplierName }}</text><small class="meta-text">{{ selectedSubOrder.courier || '快递配送' }} · {{ selectedSubOrder.trackingNo || '暂无运单号' }}</small></view><view v-if="!selectedSubOrder.logistics.length" class="empty-block compact">暂无物流信息</view><view v-for="event in selectedSubOrder.logistics" :key="event.time + event.title" class="logistics-event"><view class="event-dot"></view><view><text>{{ event.title }}</text><small class="meta-text">{{ formatDate(event.time) }} · {{ event.detail }}</small></view></view></view>
      <view v-else-if="sheet === 'after-sale' && afterSaleTarget" class="after-sale-content">
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
/* Cross-device layout guards. */
.app-shell { padding-bottom: calc(84px + env(safe-area-inset-bottom)) !important; box-sizing: border-box; }
.mall-header, .page-heading { padding-top: calc(24px + env(safe-area-inset-top)) !important; }
.cart-bar { bottom: calc(62px + env(safe-area-inset-bottom)) !important; }
.bottom-tabs { height: calc(58px + env(safe-area-inset-bottom)) !important; padding-bottom: env(safe-area-inset-bottom) !important; box-sizing: border-box; }
.sub-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 7px; min-width: 0; }
.waiting-copy { margin-right: auto; color: #7c8e83; font-size: 12px; overflow-wrap: anywhere; }
.payment-confirmation { margin-top: 10px; color: #9b6b3a; font-size: 12px; font-weight: 700; }
.order-id, .tracking-row, .logistics-summary, .logistics-event, .supplier-name { min-width: 0; overflow-wrap: anywhere; word-break: break-word; }
.logistics-event > view { min-width: 0; }
/* #ifdef MP-WEIXIN */
.mall-header, .page-heading { padding-top: calc(24px + var(--status-bar-height)) !important; }
/* #endif */
.app-shell{min-height:100vh;background:#f7f8f5;color:#202522;padding-bottom:84px}.loading-state{min-height:100vh;display:grid;place-items:center;color:#728078;font-size:13px}.auth-page{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:24px;background:#f7f8f5}.auth-mark{display:grid;place-items:center;width:72px;height:72px;border-radius:22px;background:#1e5b48;color:#fff;font-size:30px;font-weight:900}.auth-title{font-size:20px;font-weight:900;margin-top:6px}.auth-sub,.auth-tip{font-size:12px;color:#78857d}.auth-btn{width:220px;margin-top:18px;border:0;border-radius:7px;background:#1e5b48;color:#fff;font-size:14px;font-weight:800}.mall-header,.page-heading{display:flex;align-items:flex-end;justify-content:space-between;padding:24px 16px 14px}.eyebrow{display:block;color:#9b6b3a;font-size:12px;font-weight:800;letter-spacing:1.5px}.mall-title,.page-title{display:block;margin-top:5px;font-size:21px;font-weight:900}.role-chip{display:flex;align-items:center;gap:5px;padding:7px 9px;border:1px solid #dce4de;border-radius:7px;color:#1e5b48;background:#fff;font-size:12px}.search-box{display:flex;align-items:center;gap:8px;margin:0 16px 12px;padding:0 12px;height:42px;border:1px solid #dde4df;border-radius:7px;background:#fff}.search-input{flex:1;height:100%;font-size:13px}.category-row{display:flex;gap:8px;overflow-x:auto;padding:0 16px 14px;white-space:nowrap}.category-item{padding:7px 12px;border-radius:6px;background:#e9eeea;color:#617068;font-size:12px}.category-item.active{background:#1e5b48;color:#fff}.mall-banner{display:flex;align-items:center;justify-content:space-between;margin:0 16px 18px;padding:16px 17px;border-radius:8px;background:#244f42;color:#fff}.banner-kicker,.banner-title,.banner-sub{display:block}.banner-kicker{color:#d5e5ce;font-size:12px}.banner-title{max-width:260px;margin:5px 0;font-size:15px;font-weight:900}.banner-sub{color:#c9dbd1;font-size:12px}.banner-play{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:#d2e4bd;color:#244f42}.section-line{display:flex;align-items:center;justify-content:space-between;padding:0 16px 10px;font-size:15px;font-weight:900}.section-line .meta-text,.page-sub{font-size:12px;font-weight:400;color:#829087}.product-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:0 16px}.product-card{overflow:hidden;border-radius:8px;background:#fff;box-shadow:0 2px 10px rgba(31,61,45,.06)}.product-image{display:block;width:100%;height:154px;background:#edf1ed}.product-body{padding:10px}.tag-row,.detail-tags{display:flex;gap:5px;flex-wrap:wrap}.tag{padding:3px 5px;border-radius:3px;background:#edf4eb;color:#52715d;font-size:12px}.product-name{display:block;margin-top:7px;font-size:13px;font-weight:800;line-height:1.35}.supplier-name{display:block;margin-top:4px;overflow:hidden;color:#8a978e;font-size:12px;white-space:nowrap;text-overflow:ellipsis}.product-foot{display:flex;align-items:end;justify-content:space-between;margin-top:9px}.product-price{color:#c06232;font-size:17px;font-weight:900}.stock-text{color:#9ba59f;font-size:12px}.empty-block{display:flex;align-items:center;justify-content:center;gap:8px;min-height:150px;padding:20px;color:#8b9790;font-size:12px;text-align:center}.empty-block.large{flex-direction:column;min-height:250px}.empty-block.compact{min-height:90px}.page-heading{display:block;padding-bottom:18px}.page-sub{display:block;margin-top:5px}.orders-page,.me-page{padding-bottom:14px}.order-card{margin:0 16px 14px;padding:13px;border-radius:8px;background:#fff;box-shadow:0 2px 10px rgba(31,61,45,.05)}.order-head,.sub-head,.order-bottom,.fee-row,.checkout-total,.sheet-total,.live-info-row{display:flex;align-items:center;justify-content:space-between}.order-id{display:block;font-size:12px;font-weight:800}.order-time{display:block;margin-top:4px;color:#9aa49e;font-size:12px}.order-status{color:#c06232;font-size:12px;font-weight:800}.sub-order{margin-top:13px;padding-top:11px;border-top:1px solid #eef1ee}.sub-head{font-size:12px;font-weight:800}.sub-head text:last-child{color:#7c8e83;font-weight:400}.order-item,.cart-line{display:flex;align-items:center;gap:9px;margin-top:10px}.order-item image,.cart-line image{flex:none;width:48px;height:48px;border-radius:5px;background:#eef2ee}.order-item view,.cart-line-main{min-width:0;flex:1}.order-item text,.order-item .meta-text,.cart-line-main text,.cart-line-main .meta-text{display:block}.order-item text,.cart-line-main text{font-size:12px;font-weight:700}.order-item .meta-text,.cart-line-main .meta-text{margin-top:4px;color:#8d9991;font-size:12px}.order-item .strong-text,.cart-line>.strong-text{font-size:12px;color:#35443b}.tracking-row{display:flex;align-items:center;gap:5px;margin-top:10px;padding:7px 8px;background:#f3f6f3;color:#64746b;font-size:12px}.order-bottom{margin-top:13px;padding-top:11px;border-top:1px solid #eef1ee;color:#87938b;font-size:12px}.order-bottom .strong-text{color:#222f27;font-size:13px}.order-actions{display:flex;justify-content:flex-end;gap:7px;margin-top:11px}.primary-small,.outline-small,.outline-btn{min-height:30px;padding:0 11px;border-radius:5px;font-size:13px}.primary-small,.primary-btn{border:0;background:#1e5b48;color:#fff}.outline-small,.outline-btn{border:1px solid #ccd9d0;background:#fff;color:#315d4d}.profile-panel{display:flex;align-items:center;margin:0 16px 13px;padding:16px;border-radius:8px;background:#1e5b48;color:#fff}.avatar{display:grid;place-items:center;width:42px;height:42px;border-radius:50%;background:#d2e4bd;color:#1e5b48;font-weight:900}.profile-main{flex:1;margin-left:10px}.profile-role,.profile-id{display:block}.profile-role{font-size:15px;font-weight:900}.profile-id{margin-top:4px;color:#c9dcd0;font-size:12px}.profile-state{font-size:12px;color:#c9dcd0}.role-switch,.referral-panel,.commission-summary,.settings-list{margin:0 16px 13px;border-radius:8px;background:#fff}.role-switch{padding:13px}.switch-title{font-size:12px;font-weight:800}.switch-row{display:flex;gap:7px;margin-top:10px}.switch-option{flex:1;min-height:32px;border:1px solid #dce5de;border-radius:5px;background:#fff;color:#6f7d74;font-size:12px}.switch-option.active{border-color:#1e5b48;background:#e9f2e9;color:#1e5b48;font-weight:800}.commission-summary{display:grid;grid-template-columns:1fr 1fr;padding:15px}.commission-summary view+view{border-left:1px solid #edf0ed;padding-left:16px}.commission-summary .meta-text,.commission-summary .strong-text{display:block}.commission-summary .meta-text{color:#87938a;font-size:12px}.commission-summary .strong-text{margin-top:5px;color:#1e5b48;font-size:20px}.withdraw-btn{display:block;margin-top:6px;padding:0;border:0;background:transparent;color:#1e5b48;font-size:13px}.referral-panel{display:flex;align-items:center;justify-content:space-between;padding:13px}.referral-panel text,.referral-panel .meta-text{display:block}.referral-panel text{font-size:12px;font-weight:800}.referral-panel .meta-text{margin-top:4px;color:#8b978f;font-size:12px}.commission-row{display:flex;align-items:center;justify-content:space-between;margin:0 16px;padding:12px 0;border-bottom:1px solid #e9eeea}.commission-row text,.commission-row .meta-text{display:block}.commission-row text{font-size:12px;font-weight:700}.commission-row .meta-text{margin-top:4px;color:#8b978f;font-size:12px}.commission-row .strong-text{color:#c06232;font-size:13px}.commission-row .strong-text.reversed{color:#89938d}.settings-list{margin-top:16px}.settings-list>view{display:flex;align-items:center;gap:9px;padding:14px;border-bottom:1px solid #eef1ee}.settings-list>view:last-child{border-bottom:0}.settings-list text{font-size:12px}.settings-list .meta-text{flex:1;color:#8c9890;font-size:12px;text-align:right}.cart-bar{position:fixed;z-index:8;right:12px;bottom:62px;left:12px;display:flex;align-items:center;gap:9px;min-height:48px;padding:0 13px;border-radius:8px;background:#202f28;color:#fff;box-shadow:0 5px 18px rgba(22,44,33,.2)}.cart-count{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#d4743f;font-size:12px}.cart-bar .strong-text{margin-left:auto;font-size:14px}.cart-action{padding-left:9px;border-left:1px solid #617267;color:#d6e8d5;font-size:13px}.bottom-tabs{position:fixed;z-index:7;right:0;bottom:0;left:0;display:flex;height:58px;border-top:1px solid #e1e8e2;background:rgba(255,255,255,.97)}.tab-item{display:flex;flex:1;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:#87948c;font-size:13px}.tab-item.active{color:#1e5b48;font-weight:800}.sheet-mask{position:fixed;z-index:20;inset:0;display:flex;align-items:flex-end;background:rgba(20,31,25,.42)}.sheet{width:100%;max-height:88vh;overflow:auto;border-radius:14px 14px 0 0;background:#f7f8f5;padding-bottom:24px}.sheet-head{display:flex;align-items:center;justify-content:space-between;padding:16px;border-bottom:1px solid #e8ede9;font-size:15px;font-weight:900}.sheet-head button{display:grid;place-items:center;width:28px;height:28px;border:0;background:transparent}.detail-content,.cart-content,.checkout-content,.address-form,.live-content{padding:15px 16px}.detail-image,.live-image{display:block;width:100%;height:210px;border-radius:8px;background:#e9eeea}.detail-title-row{display:flex;justify-content:space-between;gap:12px;margin-top:13px}.detail-title{display:block;font-size:17px;font-weight:900;line-height:1.35}.detail-title-row .meta-text,.live-content>.meta-text{display:block;margin-top:5px;color:#89968e;font-size:12px}.detail-price{flex:none;color:#c06232;font-size:20px}.detail-tags{margin-top:10px}.shipping-note{display:flex;align-items:center;gap:5px;margin-top:14px;padding:9px;background:#edf4eb;color:#52715d;font-size:12px}.sku-label{display:block;margin-top:16px;font-size:12px;font-weight:800}.sku-list{display:grid;gap:8px;margin-top:9px}.sku-option{display:flex;align-items:center;justify-content:space-between;padding:10px;border:1px solid #dce5de;border-radius:6px;background:#fff;font-size:12px}.sku-option .meta-text{color:#8d9991;font-size:12px}.sku-option.active{border-color:#1e5b48;background:#edf4eb;color:#1e5b48}.primary-btn{width:100%;min-height:43px;margin-top:16px;border-radius:6px;font-size:13px;font-weight:800}.cart-line{padding-bottom:12px;border-bottom:1px solid #e9eeea}.stepper{display:flex;align-items:center;gap:10px;margin-top:7px}.stepper button{width:24px;height:24px;padding:0;border:1px solid #d6e0d8;border-radius:4px;background:#fff;color:#1e5b48;line-height:20px}.stepper text{min-width:12px;text-align:center}.sheet-total{margin-top:15px;color:#7f8d84;font-size:12px}.sheet-total .strong-text{color:#c06232;font-size:17px}.address-select{display:flex;align-items:center;justify-content:space-between;padding:13px;border-radius:7px;background:#fff}.address-select text,.address-select .meta-text{display:block}.address-select text{font-size:13px;font-weight:800}.address-select .meta-text{margin-top:5px;color:#89968e;font-size:13px}.checkout-items{margin-top:12px;padding:11px 0;border-top:1px solid #e7ece8;border-bottom:1px solid #e7ece8}.checkout-items view{display:flex;justify-content:space-between;gap:10px;margin:6px 0;color:#526158;font-size:12px}.checkout-items .strong-text,.fee-row .strong-text{color:#33453a}.fee-row{margin-top:11px;color:#7e8b83;font-size:12px}.checkout-total{margin-top:15px;padding-top:14px;border-top:1px solid #e1e9e2;font-size:12px;font-weight:800}.checkout-total .strong-text{color:#c06232;font-size:19px}.address-form input{display:block;width:100%;box-sizing:border-box;height:43px;margin-bottom:10px;padding:0 12px;border:1px solid #dbe4de;border-radius:6px;background:#fff;font-size:13px}.default-line{display:flex;align-items:center;justify-content:space-between;margin-top:3px;color:#68776e;font-size:12px}.live-status{display:flex;align-items:center;gap:5px;margin:12px 0 7px;color:#c06232;font-size:12px;font-weight:800}.live-status text{width:7px;height:7px;border-radius:50%;background:#c06232}.live-info-row{margin-top:18px;padding-top:14px;border-top:1px solid #e7ece8;color:#708078;font-size:12px}
.sub-actions{display:flex;justify-content:flex-end;gap:7px;margin-top:11px;padding-top:9px;border-top:1px solid #eef1ee}.address-list{display:grid;gap:9px}.address-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px;border-radius:7px;background:#fff}.address-row>view:first-child{min-width:0;flex:1}.address-row text,.address-row .meta-text{display:block}.address-row text{font-size:12px;font-weight:800}.address-row .meta-text{margin-top:5px;color:#89968e;font-size:12px}.address-actions{display:flex;align-items:center;gap:5px}.default-label{padding:3px 5px!important;border-radius:3px;background:#edf4eb;color:#52715d!important;font-size:12px!important}.logistics-summary{padding:12px;border-radius:7px;background:#fff}.logistics-summary text,.logistics-summary .meta-text{display:block}.logistics-summary text{font-size:13px;font-weight:800}.logistics-summary .meta-text{margin-top:5px;color:#89968e;font-size:12px}.logistics-event{display:flex;gap:10px;padding:14px 4px;border-bottom:1px solid #e9eeea}.event-dot{flex:none;width:8px;height:8px;margin-top:4px;border-radius:50%;background:#1e5b48}.logistics-event text,.logistics-event .meta-text{display:block}.logistics-event text{font-size:12px;font-weight:800}.logistics-event .meta-text{margin-top:4px;color:#89968e;font-size:12px}.stock-warning{display:block;margin-top:4px;color:#c06232;font-size:12px}.cart-remove{flex:none;padding:0 7px}
/* Phone frame + live room. */
/* #ifdef H5 */
body, #app { background:#d9dcd8; }
.app-shell { width:min(375px,100vw); min-height:812px; margin:0 auto; box-shadow:0 0 24px rgba(31,45,35,.14); }
.bottom-tabs, .cart-bar { right:auto; left:50%; transform:translateX(-50%); width:min(375px,100vw); max-width:375px; }
.sheet-mask { right:auto; left:50%; transform:translateX(-50%); width:min(375px,100vw); }
.sheet { width:min(375px,100vw); }
.live-room { left:50%; transform:translateX(-50%); width:min(375px,100vw); }
@media (min-width:700px) { .product-image { height:154px; } }
/* #endif */
/* #ifdef MP-WEIXIN */
.app-shell { width:100vw; min-height:100vh; padding-bottom:calc(84px + env(safe-area-inset-bottom)); }
.bottom-tabs { padding-bottom:env(safe-area-inset-bottom); }
.cart-bar { bottom:calc(62px + env(safe-area-inset-bottom)); }
.live-room { left:0; transform:none; width:100vw; }
/* #endif */
.live-card { position:relative; margin:0 16px 18px; height:190px; border-radius:8px; overflow:hidden; background:#244f42; color:#fff; }
.live-card-video { display:block; width:100%; height:100%; object-fit:cover; pointer-events:none; }
.live-card-overlay { position:absolute; inset:0; display:flex; flex-direction:column; justify-content:space-between; padding:12px; background:linear-gradient(180deg,rgba(0,0,0,.04),rgba(0,0,0,.58)); }
.live-card-main { min-width:0; }
.live-card-status { display:flex; align-items:center; gap:5px; color:#ffe2b8; font-size:12px; font-weight:800; }
.live-card-status>text { width:7px; height:7px; border-radius:50%; background:#ff5a5a; }
.live-card-title { display:block; margin-top:6px; font-size:16px; font-weight:900; text-shadow:0 1px 6px rgba(0,0,0,.35); }
.live-card-sub { display:block; margin-top:4px; color:#e7efe8; font-size:12px; }
.live-card-enter { align-self:flex-start; display:flex; align-items:center; gap:5px; padding:7px 10px; border-radius:6px; background:rgba(255,255,255,.18); color:#fff; font-size:12px; font-weight:800; }
.live-room { position:fixed; z-index:40; top:0; height:100vh; background:#000; overflow:auto; }
.live-room-video-wrap { position:relative; width:100%; height:45vh; background:#000; }
.live-room-video { display:block; width:100%; height:100%; object-fit:cover; }
.live-room-top { position:absolute; z-index:20; top:0; right:0; left:0; display:flex; align-items:center; justify-content:space-between; padding:14px; color:#fff; }
.live-room-top button { display:grid; place-items:center; width:32px; height:32px; border-radius:50%; background:rgba(0,0,0,.35); color:#fff; }
.live-room-meta { position:absolute; right:14px; bottom:12px; left:14px; color:#fff; }
.live-room-title { display:block; font-size:17px; font-weight:900; }
.live-room-meta small { display:block; margin-top:4px; color:#e7efe8; font-size:12px; }
.live-room-body { min-height:55vh; padding:16px; background:#f7f8f5; }
.live-package-group { margin-bottom:16px; }
.live-package-row { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:12px; border-radius:8px; background:#fff; margin-top:8px; }
.live-package-actions { display:flex; flex-direction:column; align-items:flex-end; gap:8px; }
.live-buy-btn { margin:0; padding:7px 11px; font-size:13px; }

.order-id-line { display:flex; align-items:center; gap:6px; min-width:0; }
.demo-badge { flex:none; padding:2px 5px; border-radius:3px; background:#eef3ef; color:#567064; font-size:12px; font-weight:700; }
.voucher-thumb { display:grid; place-items:center; width:44px; height:44px; border-radius:8px; background:#1e5b48; color:#fff; font-size:14px; font-weight:800; flex:none; }
.order-item .business-image,.cart-line .business-image { flex:none;width:48px;height:48px;border-radius:5px;background:#eef2ee; }

/* Mobile readability contrast */
.supplier-name,.stock-text,.order-time,.auth-sub,.auth-tip,.loading-state,.page-sub,.section-line .meta-text,.empty-block,.sub-head text:last-child,.order-item .meta-text,.cart-line-main .meta-text,.order-bottom,.commission-summary .meta-text,.referral-panel .meta-text,.commission-row .meta-text,.settings-list .meta-text,.detail-title-row .meta-text,.live-content>.meta-text,.sku-option .meta-text,.sheet-total,.address-select .meta-text,.fee-row,.address-row .meta-text,.logistics-summary .meta-text,.logistics-event .meta-text,.waiting-copy,.tab-item { color:#5f6f66; }
.tab-item.active { color:#1e5b48; }
</style>
