<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app'
import type { FarmStore, LiveRoom, Product, TravelRoute } from '@agritainment/shared'
import { createId, formatNumber, installKeyboardButtonSupport, money, readPlatformEntities, validatePhone } from '@agritainment/shared'
import UiIcon from '../../components/UiIcon.vue'
import { getStorefrontTarget } from '../../config/storefronts'
import { useAllianceStore } from '../../stores/alliance'

type TabKey = 'nearby' | 'rank' | 'live' | 'promoter'
type SheetKey = 'login' | 'city' | 'route' | 'withdraw' | 'share' | 'live' | 'booking' | 'materials' | 'fans' | 'commissions' | 'promoter-rank' | 'bookings' | 'farm-shop' | null

const store = useAllianceStore()
let disposeKeyboardButtons: () => void = () => undefined
const activeTab = ref<TabKey>('nearby')
const filter = ref('离我最近')
const filters: Array<{ label: string; icon: string }> = [
  { label: '离我最近', icon: '📍' },
  { label: '好评优先', icon: '⭐' },
  { label: '人气最高', icon: '🔥' },
  { label: '正在直播', icon: '🎤' },
  { label: '可预订', icon: '🍲' }
]
const rankType = ref('人气榜')
const keyword = ref('')
const selectedFarm = ref<FarmStore | null>(null)
const sheet = ref<SheetKey>(null)
const selectedRoute = ref<TravelRoute | null>(null)
const selectedProduct = ref<Product | null>(null)
const selectedLive = ref<LiveRoom | null>(null)
const selectedShopFarm = ref<FarmStore | null>(null)
const selectedBookingFarm = ref<FarmStore | null>(null)
const withdrawMethod = ref('微信')
const withdrawing = ref(false)
const withdrawRequestKey = ref('')

function futureDateLabel(offset: number) {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  const prefix = offset === 1 ? '明天' : date.toLocaleDateString('zh-CN', { weekday: 'short' })
  return `${prefix} ${date.getMonth() + 1}月${date.getDate()}日`
}

const bookingDates = [1, 2, 3].map(futureDateLabel)
const booking = ref({ date: bookingDates[0], session: '晚市 18:00', people: 4 })

const tabs: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'nearby', label: '附近', icon: 'map-pin' },
  { key: 'rank', label: '榜单', icon: 'trophy' },
  { key: 'live', label: '直播', icon: 'radio' },
  { key: 'promoter', label: '推客', icon: 'megaphone' }
]

const nearbyFarms = computed(() => {
  let result = store.farms.filter((item) => `${item.name}${item.region}${item.tags.join('')}`.includes(keyword.value))
  if (filter.value === '可预订') result = result.filter((item) => item.availability === 'bookable')
  if (filter.value === '好评优先') result = [...result].sort((a, b) => b.rating - a.rating)
  if (filter.value === '人气最高') result = [...result].sort((a, b) => b.monthlySales - a.monthlySales)
  if (filter.value === '离我最近') result = [...result].sort((a, b) => a.distance - b.distance)
  return result.slice(0, 3)
})
const cityProducts = computed(() => {
  const farmIds = new Set(store.cityFarms.map((item) => item.id))
  return store.products.filter((item) => item.farmIds.some((id) => farmIds.has(id)))
})
const searchProducts = computed(() => keyword.value ? cityProducts.value.filter((item) => `${item.name}${item.category}${item.tags.join('')}`.includes(keyword.value)) : [])
const searchRoutes = computed(() => keyword.value ? store.cityRoutes.filter((item) => `${item.name}${item.description}`.includes(keyword.value)) : [])

const rankedFarms = computed(() => {
  const farms = store.farms.filter((item) => item.core)
  if (rankType.value === '好评榜') return [...farms].sort((a, b) => b.rating - a.rating)
  return [...farms].sort((a, b) => b.livePopularity - a.livePopularity)
})

const maxVisibleDistance = computed(() => nearbyFarms.value.length ? Math.max(...nearbyFarms.value.map((item) => item.distance)) : 0)

function rankRegion(farm: FarmStore) {
  return `${farm.city.replace(/市$/, '')} · ${farm.tags[0]}`
}

function ruleRate(type: 'farm' | 'product' | 'live') {
  return store.commissionRules.find((item) => item.targetType === type && item.enabled)?.rate || 0
}

const activePolicies = computed(() => Object.values(readPlatformEntities()?.policies || {}).filter((item) => item.enabled))
function commissionFor(product: Product) {
  return Math.round(product.price * ruleRate('product')) / 100
}

function farmProducts(farm: FarmStore | null) {
  return farm ? store.products.filter((item) => item.farmIds.includes(farm.id)) : []
}

function pinStyle(index: number) {
  return { left: `${14 + (index * 31) % 70}%`, top: `${24 + (index * 37) % 72}px` }
}

function rankMedal(index: number) {
  return ['🏆 No.1', '🥈 No.2', '🥉 No.3'][index] || `No.${index + 1}`
}

function toast(title: string) {
  uni.showToast({ title, icon: 'none' })
}

function retryLoad() {
  store.setMockScenario('normal')
  store.initialize(true)
}

function chooseTab(key: TabKey) {
  activeTab.value = key
  uni.pageScrollTo({ scrollTop: 0, duration: 0 })
}

function openFarm(farm: FarmStore) {
  selectedFarm.value = farm
}

function enterFarm(farm: FarmStore) {
  const target = getStorefrontTarget(farm.id)
  if (!target) {
    openFarm(farm)
    toast('该门店暂未配置独立门店端，已打开样板预览')
    return
  }
  // #ifdef H5
  window.location.href = target.h5Url
  // #endif
  // #ifdef MP-WEIXIN
  if (target.miniProgramAppId) {
    uni.navigateToMiniProgram({ appId: target.miniProgramAppId, path: target.miniProgramPath || 'pages/index/index' })
  } else {
    openFarm(farm)
    toast('当前为演示小程序，已打开门店预览')
  }
  // #endif
}

function openRoute(route: TravelRoute) {
  selectedRoute.value = route
  sheet.value = 'route'
}

function joinRoute() {
  if (!requireLogin(() => joinRoute())) return
  if (!selectedRoute.value) return
  if (!store.joinRoute(selectedRoute.value.id)) return toast('该线路已经报名')
  sheet.value = null
  toast('线路报名已提交')
}

async function withdraw() {
  if (!requireLogin(() => withdraw())) return
  if (withdrawing.value) return toast('提现申请处理中')
  withdrawing.value = true
  await new Promise((resolve) => setTimeout(resolve, 180))
  const result = store.withdraw(Number(store.availableCommission.toFixed(2)), withdrawMethod.value, withdrawRequestKey.value)
  withdrawing.value = false
  if (result === 'duplicate') return toast('该提现申请已提交，请勿重复操作')
  if (result === 'invalid') return toast('请输入大于 0 的提现金额')
  if (result === 'insufficient') return toast('可提现佣金不足')
  sheet.value = null
  toast('提现申请已提交')
}

function openWithdraw() {
  if (!requireLogin(() => openWithdraw())) return
  withdrawRequestKey.value = createId('WD')
  sheet.value = 'withdraw'
}

function openShare(product: Product) {
  if (!requireLogin(() => openShare(product))) return
  selectedProduct.value = product
  sheet.value = 'share'
}

function watchLive(room: LiveRoom) {
  store.watchLive(room.id)
  selectedLive.value = room
  sheet.value = 'live'
}

function openBooking() {
  if (!selectedFarm.value) return
  selectedBookingFarm.value = selectedFarm.value
  selectedFarm.value = null
  sheet.value = 'booking'
}

function bookFarm() {
  if (!requireLogin(() => bookFarm())) return
  if (!selectedBookingFarm.value) return
  if (!store.bookFarm(selectedBookingFarm.value, booking.value)) return toast('该门店当前不可预订')
  selectedBookingFarm.value = null
  sheet.value = 'bookings'
  toast('预订申请已提交')
}

function shareFarm() {
  if (!requireLogin(() => shareFarm())) return
  if (!selectedFarm.value) return
  const record = store.shareFarm(selectedFarm.value.id)
  if (record) uni.setClipboardData({ data: record.link, success: () => toast('门店推广链接已生成') })
}

function shareLive() {
  if (!requireLogin(() => shareLive())) return
  if (!selectedLive.value) return
  const record = store.shareLive(selectedLive.value.id)
  if (record) uni.setClipboardData({ data: record.link, success: () => toast('直播推广记录已生成') })
}

function openFarmShop() {
  if (!selectedFarm.value) return
  selectedShopFarm.value = selectedFarm.value
  selectedFarm.value = null
  sheet.value = 'farm-shop'
}

function shareProduct() {
  if (!requireLogin(() => shareProduct())) return
  if (!selectedProduct.value) return
  const record = store.shareProduct(selectedProduct.value.id)
  if (record) uni.setClipboardData({ data: record.link, success: () => toast('推广链接已生成并复制') })
}

const pendingAction = ref<(() => void) | null>(null)
const loginTab = ref<'password' | 'code'>('password')
const loginPhone = ref('13800000000')
const loginPassword = ref('123456')
const loginCode = ref('123456')
const codeCountdown = ref(0)
let codeTimer: ReturnType<typeof setInterval> | null = null
function requireLogin(action?: () => void) {
  if (store.auth.isLoggedIn) return true
  if (action) pendingAction.value = action
  sheet.value = 'login'
  return false
}
function sendCode() {
  if (!validatePhone(loginPhone.value)) return toast('请输入正确的手机号')
  if (codeCountdown.value > 0) return
  codeCountdown.value = 60
  codeTimer = setInterval(() => {
    codeCountdown.value -= 1
    if (codeCountdown.value <= 0 && codeTimer) clearInterval(codeTimer)
  }, 1000)
  toast('验证码已发送（演示码 123456）')
}
function submitLogin() {
  const ok = loginTab.value === 'password'
    ? store.loginWithPassword(loginPhone.value, loginPassword.value)
    : store.loginWithCode(loginPhone.value, loginCode.value)
  if (!ok) {
    toast(loginTab.value === 'password' ? '手机号或密码错误（演示 13800000000 / 123456）' : '手机号或验证码错误（演示验证码 123456）')
    return
  }
  sheet.value = null
  toast('登录成功')
  const action = pendingAction.value
  pendingAction.value = null
  if (action) action()
}
function logout() {
  store.logout()
  sheet.value = null
  toast('已退出登录')
}

onMounted(() => {
  disposeKeyboardButtons = installKeyboardButtonSupport()
  const scenario = uni.getLaunchOptionsSync().query?.mock
  if (scenario === 'empty' || scenario === 'failure') store.setMockScenario(scenario)
  store.initialize()
})

onBeforeUnmount(() => disposeKeyboardButtons())
onShareAppMessage(() => ({ title: '农家乐联盟好店推荐', path: '/pages/index/index?from=share' }))
onShareTimeline(() => ({ title: '农家乐联盟好店推荐' }))
</script>

<template>
  <view class="app-shell">
    <view v-if="store.loading" class="loading">正在发现附近好店...</view>
    <view v-else-if="store.error" class="state-page"><UiIcon name="radio" :size="28" /><text>{{ store.error }}</text><button class="primary-button" @click="retryLoad">重新加载</button></view>
    <template v-else>
      <view v-if="activeTab === 'nearby'" class="tab-page nearby-page">
        <view class="discovery-head">
          <button class="city-button" @click="sheet = 'city'"><UiIcon name="map-pin" :size="15" />湖南 · {{ store.city }}<UiIcon name="chevron-down" :size="14" /><span class="switch-text">切换</span></button>
          <text class="hero-title">发现身边的好农家乐</text><text class="hero-sub">找农家乐 · 订包厢 · 买特产 · 看直播 · 享优惠</text>
          <label class="search"><UiIcon name="search" :size="18" /><input v-model="keyword" placeholder="搜索农家乐 / 特产 / 乡村线路" /></label>
        </view>
        <view class="filter-scroll"><view class="filter-row"><button v-for="item in filters" :key="item.label" :class="{ active: filter === item.label }" @click="filter = item.label; toast(`已按${item.label}筛选`)"><text>{{ item.icon }}</text>{{ item.label }}</button></view></view>
        <view v-if="keyword" class="search-results"><view class="search-group"><text>农家乐</text><button v-for="farm in nearbyFarms" :key="farm.id" @click="openFarm(farm)">{{ farm.name }}<small>{{ farm.region }}</small></button><small v-if="!nearbyFarms.length">暂无匹配门店</small></view><view class="search-group"><text>特产</text><button v-for="product in searchProducts" :key="product.id" @click="openShare(product)">{{ product.name }}<small>{{ money(product.price) }}</small></button><small v-if="!searchProducts.length">暂无匹配特产</small></view><view class="search-group"><text>乡村线路</text><button v-for="route in searchRoutes" :key="route.id" @click="openRoute(route)">{{ route.name }}<small>{{ route.description }}</small></button><small v-if="!searchRoutes.length">暂无匹配线路</small></view></view>
        <view class="map-box"><view class="grid-bg"></view><view class="road road-a"></view><view class="road road-b"></view><button v-for="(farm,index) in nearbyFarms" :key="farm.id" class="map-pin" :style="pinStyle(index)" :title="farm.name" :aria-label="`查看地图门店${farm.name}`" @click="openFarm(farm)">📍</button><view class="me">🔵</view><text>📡 已定位 · 为您推荐 {{ maxVisibleDistance }}km 内 {{ nearbyFarms.length }} 家农家乐</text></view>
        <view class="section-head"><view><span></span><text>附近农家乐</text></view><small>{{ nearbyFarms.length }} 家</small></view>
        <view v-if="!nearbyFarms.length" class="empty empty-page">当前城市没有符合条件的农家乐</view>
        <view v-else class="farm-list">
          <view v-for="(farm,index) in nearbyFarms" :key="farm.id" class="farm-card"><view class="farm-photo"><image class="farm-emoji" :src="farm.image" mode="aspectFit" /><text class="rank-badge" :class="{ medal: index < 3 }">{{ rankMedal(index) }}</text></view><view class="farm-main"><view class="farm-title"><text>{{ farm.name }}</text><span v-if="store.promotionRecords.some(item => item.targetType === 'farm' && item.targetId === farm.id && item.lockedFans > 0)">✓ 推客已锁粉</span></view><text class="rating">⭐ {{ farm.rating }} · 月售 {{ farm.monthlySales }} · 人均 {{ money(farm.averageSpend) }}</text><view class="tag-row"><text v-for="tag in farm.tags" :key="tag">{{ tag }}</text></view><view class="farm-foot"><small>📍 距您 {{ farm.distance }}km</small><button @click="enterFarm(farm)">进店<UiIcon name="arrow-right" :size="15" /></button></view></view></view>
        </view>
      </view>

      <view v-else-if="activeTab === 'rank'" class="tab-page">
        <view class="color-head rank-head"><text class="hero-title">🏆 农家乐榜单</text><text class="hero-sub">本地好店 · 特色推荐 · 乡村旅游线路</text><view class="rank-tabs"><button v-for="item in ['人气榜','好评榜','直播榜']" :key="item" :class="{ active: rankType === item }" @click="rankType = item">{{ item }}</button></view></view>
        <view class="section-head"><view><span></span><text>本周{{ rankType }}</text></view><small>实时更新</small></view>
        <view class="rank-list"><button v-for="(farm,index) in rankedFarms" :key="farm.id" @click="openFarm(farm)"><text class="rank-number" :class="`rank-medal-${index < 3 ? index + 1 : 'n'}`">{{ index + 1 }}</text><image class="rank-emoji" :src="farm.image" mode="aspectFit" /><view><text>{{ farm.name }}</text><small>{{ rankRegion(farm) }} · {{ rankType === '好评榜' ? `评分 ${farm.rating}` : `月售 ${farm.monthlySales}` }}</small></view><view class="rank-value"><strong>{{ rankType === '好评榜' ? farm.rating : farm.livePopularity }}</strong><small>人气值</small></view></button></view>
        <view class="section-head"><view><span></span><text>乡村旅游线路推荐</text></view></view>
        <view class="route-list"><view v-for="route in store.routes" :key="route.id" class="route-card"><image class="route-emoji" :src="route.image" mode="aspectFit" /><view><text>{{ route.name }}</text><small>{{ route.description }}</small><small v-if="route.meta" class="route-meta">{{ route.meta }}</small><button @click="openRoute(route)">查看线路</button></view></view><view v-if="!store.cityRoutes.length" class="empty">当前城市暂无线路</view></view>
      </view>

      <view v-else-if="activeTab === 'live'" class="tab-page">
        <view class="color-head live-head"><text class="hero-title">🎤 直播带货</text><text class="hero-sub">主播带你逛农家乐 · 套餐 / 农产品 / 伴手礼现货秒杀</text></view>
        <view class="section-head"><view><span></span><text>正在直播</text></view><small>{{ store.liveRooms.filter(item => item.status === 'live').length }} 场进行中</small></view>
        <view v-if="!store.liveRooms.length" class="empty empty-page">当前暂无直播和预告</view>
        <view class="live-list"><view v-for="(room,index) in store.liveRooms" :key="room.id" class="live-card" @click="room.status === 'live' ? watchLive(room) : (store.toggleReminder(room.id), toast(room.reminded ? '已预约开播提醒' : '已取消提醒'))"><view class="live-cover" :class="`live-cover-${(index % 4) + 1}`"><image class="live-emoji" :src="room.image" mode="aspectFit" /><text :class="room.status">{{ room.status === 'live' ? '直播中' : '⏰ 19:30 预告' }}</text><small v-if="room.viewers">👁 {{ room.viewers >= 10000 ? (room.viewers / 10000).toFixed(1) + '万' : room.viewers }}</small></view><view class="live-body"><text>{{ room.title }}</text><small>🎙 {{ room.host }}{{ room.hostRole ? ' · ' + room.hostRole : '' }}</small><view v-if="room.status === 'live'"><span>🛒 在播：{{ room.productName }} {{ money(room.productPrice) }}</span></view><view v-else class="remind-row"><span>{{ room.reminded ? '✓ 已预约' : '🔔 预约提醒' }}</span></view></view></view></view>
<view class="live-note"><view><text>直播说明</text><small>🛒 主播可销售农家乐套餐、农产品、伴手礼及供应链商品。</small><small>🏬 直播成交后，由供应链中台统一承接发货、售后与结算，减少农家乐履约压力。</small><small>💰 成交订单自动追踪推客 / 主播佣金，按规则结算。</small></view></view>
      </view>

      <view v-else class="tab-page promoter-page">
        <template v-if="store.auth.isLoggedIn">
        <view class="promoter-head"><view class="profile"><view class="pav"><text>🧑‍💼</text></view><view><text class="pname">推客 · {{ store.promoter?.name }}</text><small class="plv">联盟推客<text class="vip">{{ store.promoter?.level }}</text></small></view></view></view><view class="wallet-card"><view class="wallet-top"><view><small>可提现佣金（元）<text v-if="store.commissionSettled" class="settled-tag">已结算</text></small><strong>{{ store.availableCommission.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</strong></view><button @click="openWithdraw">提现</button></view><view class="wallet-stats"><view><text>{{ money(store.cumulativeCommission) }}</text><small>累计佣金</small></view><view><text>{{ store.promoter?.fans }}</text><small>锁定粉丝</small></view><view><text>{{ store.promoter?.orders }}</text><small>本月订单</small></view></view></view>
        <view class="promoter-tools"><button @click="sheet = 'materials'"><text class="tool-emoji">🔗</text><text>推广素材</text></button><button @click="sheet = 'fans'"><text class="tool-emoji">👥</text><text>我的粉丝</text></button><button @click="sheet = 'commissions'"><text class="tool-emoji">📊</text><text>佣金明细</text></button><button @click="sheet = 'promoter-rank'"><text class="tool-emoji">🏆</text><text>推客排行</text></button></view>
        <button class="booking-record-link" @click="sheet = 'bookings'"><UiIcon name="calendar-check" :size="18" />联盟预订记录（{{ store.bookings.length }}）<UiIcon name="chevron-right" :size="17" /></button>
        <view class="section-head"><view><span></span><text>热推好物 · 一键分享赚佣金</text></view></view>
        <view v-if="activePolicies.length" class="policy-hint">🎯 中台价格策略：<b>{{ activePolicies.map((p) => p.name).join('、') }}</b> 已生效</view>
        <view class="material-list"><view v-for="product in store.hotPromoProducts" :key="product.id" class="material-row"><image class="mat-emoji" :src="product.image" mode="aspectFit" /><view><text>{{ product.promoName || product.name }}</text><small>佣金比例 {{ product.commissionRate }}% · 已售 {{ product.commissionSold }} 单</small></view><strong>赚¥{{ formatNumber(product.commissionEarn ?? 0) }}</strong><button :class="{ shared: store.sharedProductIds.includes(product.id) }" @click="openShare(product)">{{ store.sharedProductIds.includes(product.id) ? '已分享' : '分享' }}</button></view><view v-if="!store.hotPromoProducts.length" class="empty">暂无推广商品</view></view>
        <view class="lock-note"><UiIcon name="user-round-check" :size="20" /><view><text>推客锁粉机制</text><small>用户通过你的分享链接进入农家乐小程序后自动锁粉，其后续在该店的下单、复购、直播购买均归因于你，持续产生佣金。</small></view></view>
        <button class="logout-button" @click="logout">退出登录</button>
        </template>
        <view v-else class="promoter-login">
          <view class="promoter-login-card">
            <view class="promoter-login-icon emoji-thumb">🧑‍💼</view>
            <text class="promoter-login-title">登录推客中心</text>
            <text class="promoter-login-sub">手机号登录后查看佣金、粉丝与推广素材，分享赚佣金</text>
            <button class="primary-button" @click="requireLogin()">手机号登录</button>
          </view>
        </view>
      </view>

      <view class="tabbar"><button v-for="tab in tabs" :key="tab.key" :class="{ active: activeTab === tab.key }" @click="chooseTab(tab.key)"><UiIcon :name="tab.icon" :size="21" /><text>{{ tab.label }}</text></button></view>

      <view v-if="selectedFarm" class="preview-mask" @click.self="selectedFarm = null"><view class="preview"><button class="preview-close" aria-label="关闭门店预览" @click="selectedFarm = null"><UiIcon name="x" :size="19" /></button><image :src="selectedFarm.image" mode="aspectFit" /><view class="preview-body"><text>{{ selectedFarm.name }}</text><small>{{ selectedFarm.region }} · 距你 {{ selectedFarm.distance }}km</small><view class="tag-row"><text v-for="tag in selectedFarm.tags" :key="tag">{{ tag }}</text></view><view class="preview-actions"><button :disabled="selectedFarm.availability !== 'bookable'" @click="openBooking"><UiIcon name="calendar-days" :size="17" />{{ selectedFarm.availability === 'bookable' ? '立即预订' : '暂不可订' }}</button><button @click="openFarmShop"><UiIcon name="shopping-bag" :size="17" />逛特产</button><button @click="shareFarm"><UiIcon name="link" :size="17" />分享</button></view><view class="preview-products"><view v-for="product in farmProducts(selectedFarm).slice(0, 2)" :key="product.id"><image :src="product.image" mode="aspectFit" /><text>{{ product.name }}</text><strong>{{ money(product.price) }}</strong></view><view v-if="!farmProducts(selectedFarm).length" class="empty">该门店暂无特产</view></view></view></view></view>

      <view v-if="sheet" class="sheet-mask" @click.self="sheet = null"><view class="sheet"><view class="sheet-handle"></view><view class="sheet-head"><text>{{ sheet === 'login' ? '手机号登录' : sheet === 'city' ? '切换城市/区域' : sheet === 'route' ? (selectedRoute?.name || '查看线路') : sheet === 'withdraw' ? '佣金提现' : sheet === 'live' ? '直播详情' : sheet === 'booking' ? '确认联盟预订' : sheet === 'materials' ? '推广素材' : sheet === 'fans' ? '我的粉丝' : sheet === 'commissions' ? '佣金明细' : sheet === 'promoter-rank' ? '推客排行榜' : sheet === 'bookings' ? '联盟预订记录' : sheet === 'farm-shop' ? `${selectedShopFarm?.name}特产` : '分享赚佣金' }}</text><button aria-label="关闭弹层" @click="sheet = null"><UiIcon name="x" :size="19" /></button></view>
<view v-if="sheet === 'login'" class="login-sheet">
          <view class="login-tabs">
            <button :class="{ active: loginTab === 'password' }" @click="loginTab = 'password'">密码登录</button>
            <button :class="{ active: loginTab === 'code' }" @click="loginTab = 'code'">验证码登录</button>
          </view>
          <view class="login-fields">
            <label class="login-field"><text>手机号</text><input v-model="loginPhone" type="number" maxlength="11" placeholder="请输入手机号" /></label>
            <label v-if="loginTab === 'password'" class="login-field"><text>密码</text><input v-model="loginPassword" type="password" placeholder="请输入密码" confirm-type="done" @confirm="submitLogin" /></label>
            <label v-else class="login-field"><text>验证码</text><view class="code-input"><input v-model="loginCode" type="number" maxlength="6" placeholder="请输入验证码" confirm-type="done" @confirm="submitLogin" /><button class="code-button" :disabled="codeCountdown > 0" @click="sendCode">{{ codeCountdown > 0 ? codeCountdown + 's' : '发送验证码' }}</button></view></label>
          </view>
          <button class="primary-button login-submit" @click="submitLogin">登 录</button>
          <text class="login-hint">演示手机号 13800000000　密码 123456　验证码 123456</text>
        </view>
        <view v-else-if="sheet === 'city'" class="city-sheet"><text class="city-sub">选择您所在的城市或区域，为您推荐附近农家乐</text><view class="city-chips"><button v-for="city in store.cityOptions" :key="city" :class="{ sel: store.city === city }" @click="store.changeCity(city); sheet = null; toast('已切换定位，正在为您推荐附近农家乐')">{{ city }}</button></view><button class="primary-button" @click="sheet = null">确认</button></view>
        <view v-else-if="sheet === 'route' && selectedRoute" class="route-detail"><small class="route-sub">🚌 {{ selectedRoute.description }}<br />{{ selectedRoute.meta }}</small><button class="primary-button" :disabled="store.joinedRoutes.includes(selectedRoute.id)" @click="joinRoute">{{ store.joinedRoutes.includes(selectedRoute.id) ? '已报名' : '🚌 报名参加' }}</button></view>
        <view v-else-if="sheet === 'withdraw'" class="withdraw-form"><text class="withdraw-sub">可提现佣金 {{ '¥' + store.availableCommission.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</text><view class="withdraw-chips"><button v-for="item in ['微信','支付宝','银行卡']" :key="item" :class="{ sel: withdrawMethod === item }" @click="withdrawMethod = item">{{ item }}</button></view><button class="primary-button" :disabled="withdrawing" @click="withdraw">{{ withdrawing ? '提交中...' : '确认提现' }}</button></view>
        <view v-else-if="sheet === 'booking' && selectedBookingFarm" class="booking-form"><text>{{ selectedBookingFarm.name }}</text><small>{{ selectedBookingFarm.region }} · 提交后由门店确认</small><view><span>选择日期</span><view class="choice-row"><button v-for="item in bookingDates" :key="item" :class="{ active: booking.date === item }" @click="booking.date = item">{{ item }}</button></view></view><view><span>选择场次</span><view class="choice-row"><button v-for="item in ['午市 11:30','晚市 18:00']" :key="item" :class="{ active: booking.session === item }" @click="booking.session = item">{{ item }}</button></view></view><view><span>用餐人数</span><view class="choice-row"><button v-for="item in [2,4,6,8]" :key="item" :class="{ active: booking.people === item }" @click="booking.people = item">{{ item }} 人</button></view></view><button class="primary-button" @click="bookFarm">提交预订</button></view>
        <view v-else-if="sheet === 'live' && selectedLive" class="live-detail"><image :src="selectedLive.image" mode="aspectFit" /><view class="live-state"><span></span>前端模拟直播间</view><text>{{ selectedLive.title }}</text><small>{{ selectedLive.host }} · {{ selectedLive.viewers.toLocaleString('zh-CN') }} 人观看</small><view><strong>{{ selectedLive.productName }}</strong><b>{{ money(selectedLive.productPrice) }}</b></view><button class="primary-button" @click="shareLive">分享直播赚佣金</button></view>
        <view v-else-if="sheet === 'materials'" class="sheet-materials"><view v-if="!cityProducts.length" class="empty">当前城市暂无推广素材</view><view v-for="product in cityProducts" :key="product.id"><image :src="product.image" mode="aspectFit" /><view><text>{{ product.name }}</text><small>预计佣金 {{ money(commissionFor(product)) }}</small></view><button @click="openShare(product)">{{ store.sharedProductIds.includes(product.id) ? '再次分享' : '生成链接' }}</button></view></view>
        <view v-else-if="sheet === 'fans'" class="data-list"><view v-if="!store.allFans.length" class="empty">暂无锁粉记录</view><view v-for="fan in store.allFans" :key="fan.id"><view class="data-avatar"><UiIcon name="user-round" :size="18" /></view><view><text>{{ fan.name }}</text><small>{{ fan.source }} · {{ fan.lockedAt }}</small></view><span>已锁粉</span></view></view>
        <view v-else-if="sheet === 'commissions'" class="data-list"><view v-if="!store.commissionEntries.length" class="empty">暂无佣金流水</view><view v-for="entry in store.commissionEntries" :key="entry.id"><view class="data-avatar"><UiIcon name="badge-dollar-sign" :size="18" /></view><view><text>{{ entry.description }}</text><small>{{ entry.createdAt }} · {{ entry.status === 'pending' ? '待结算' : entry.type === 'withdrawal' ? '已提现' : '可提现' }}</small></view><strong :class="entry.type">{{ entry.amount > 0 ? '+' : '' }}{{ money(entry.amount) }}</strong></view></view>
        <view v-else-if="sheet === 'promoter-rank'" class="promoter-rank-list"><view v-if="!store.promoterRanking.length" class="empty">暂无推客排行</view><view v-for="(item, index) in store.promoterRanking" :key="item.id"><b>{{ index + 1 }}</b><view><text>{{ item.name }}</text><small>{{ item.level }} · {{ item.fans }} 粉丝</small></view><strong>{{ money(item.gmv) }}</strong></view></view>
        <view v-else-if="sheet === 'bookings'" class="data-list"><view v-if="!store.bookings.length" class="empty">暂无联盟预订记录</view><view v-for="bookingItem in store.bookings" :key="bookingItem.id"><view class="data-avatar"><UiIcon name="calendar-days" :size="18" /></view><view><text>{{ bookingItem.farmName }}</text><small>{{ bookingItem.date }} · {{ bookingItem.session }} · {{ bookingItem.people }} 人 · {{ bookingItem.createdAt }}</small></view><span>待确认</span></view></view>
        <view v-else-if="sheet === 'farm-shop'" class="sheet-materials"><view v-if="!farmProducts(selectedShopFarm).length" class="empty">该门店暂无特产</view><view v-for="product in farmProducts(selectedShopFarm)" :key="product.id"><image :src="product.image" mode="aspectFit" /><view><text>{{ product.name }}</text><small>{{ product.tags.join(' · ') }} · {{ money(product.price) }}</small></view><button @click="openShare(product)">分享赚佣金</button></view></view>
        <view v-else class="share-sheet"><small class="share-sub">{{ selectedProduct?.promoName || selectedProduct?.name }}<br />预估佣金 赚¥{{ formatNumber(selectedProduct?.commissionEarn ?? (selectedProduct ? commissionFor(selectedProduct) : 0)) }}</small><button class="primary-button" @click="shareProduct">📋 复制专属推广链接</button><view v-if="selectedProduct && store.promotionRecords.find(item => item.targetId === selectedProduct?.id)" class="share-record"><text>已分享 {{ store.promotionRecords.find(item => item.targetId === selectedProduct?.id)?.shareCount }} 次 · 锁粉 {{ store.promotionRecords.find(item => item.targetId === selectedProduct?.id)?.lockedFans }} 人</text><small>{{ store.promotionRecords.find(item => item.targetId === selectedProduct?.id)?.link }}</small></view></view>
      </view></view>
    </template>
  </view>
</template>

<style scoped lang="scss">
.app-shell { width:100%;min-height:100vh;background:var(--union-bg);padding-bottom:calc(68px + env(safe-area-inset-bottom)); }.loading { min-height:100vh;display:grid;place-items:center;color:var(--union-muted); }.tab-page { min-height:100vh;padding-bottom:24px; }
.discovery-head,.color-head { padding:calc(20px + env(safe-area-inset-top)) 16px 18px;background:var(--union-red);color:#fff; }.city-button { height:30px;padding:0 8px;border-radius:5px;background:rgba(255,255,255,.14);color:#fff;display:flex;align-items:center;gap:5px;font-size:9px; }.city-button .ui-icon,.color-head .ui-icon { filter:brightness(0) invert(1); }.hero-title,.hero-sub { display:block; }.hero-title { margin-top:18px;font-size:24px;font-weight:900; }.hero-sub { margin-top:5px;font-size:10px;opacity:.82; }.search { height:43px;margin-top:14px;padding:0 12px;border-radius:7px;background:#fff;display:flex;align-items:center;gap:8px;color:var(--union-ink); }.search input { flex:1;height:100%;font-size:11px; }
.filter-scroll { width:100%;white-space:nowrap;overflow-x:auto;overflow-y:hidden;background:#fff;border-bottom:1px solid var(--union-line); }.filter-row { width:max-content;padding:10px 14px;display:flex;gap:7px; }.filter-row button { height:auto;min-height:34px;padding:6px 14px;border-radius:999px;background:#fff;border:1px solid var(--union-line);color:#556655;font-size:12.5px!important;font-weight:600; }.filter-row button.active { background:#ffe4e9;border-color:#fbd3d9;color:#b0324c;font-weight:700; }
.map-box { height:140px;margin:12px 16px 0;border:1px solid #d6e6d4;border-radius:16px;position:relative;overflow:hidden;background:linear-gradient(135deg,#e8f1e6,#dbeede); }.grid-bg { position:absolute;inset:0;background-image:linear-gradient(#c9ddc7 1px,transparent 1px),linear-gradient(90deg,#c9ddc7 1px,transparent 1px);background-size:26px 26px;opacity:.6; }.road { position:absolute;background:#fff;border:1px solid #dde7dc; }.road-a { width:130%;height:14px;left:-40px;top:58px;transform:rotate(-8deg);opacity:.9; }.road-b { width:12px;height:140%;left:54%;top:-24px;transform:rotate(6deg);opacity:.85; }.map-pin { position:absolute;width:24px;height:24px;background:transparent;border:none;font-size:24px;line-height:24px;display:grid;place-items:center;filter:drop-shadow(0 4px 4px rgba(0,0,0,.2)); }.me { position:absolute;width:18px;height:18px;font-size:18px;line-height:18px;display:grid;place-items:center;filter:drop-shadow(0 3px 3px rgba(0,0,0,.2)); }.map-box>text { position:absolute;left:10px;bottom:8px;padding:4px 10px;background:rgba(255,255,255,.92);border-radius:8px;font-size:11px;font-weight:700;color:#3f5145; }
.section-head { padding:19px 16px 10px;display:flex;align-items:center;justify-content:space-between; }.section-head>view { display:flex;align-items:center;gap:7px; }.section-head span { width:3px;height:16px;border-radius:2px;background:var(--union-red); }.section-head text { font-size:15px;font-weight:900; }.section-head small { color:var(--union-muted);font-size:9px; }
.farm-list { padding:0 16px;display:grid;gap:10px; }.farm-card { background:#fff;border:1px solid var(--union-line);border-radius:8px;overflow:hidden; }.farm-photo { height:136px;position:relative; }.farm-photo image { width:100%;height:100%; }.farm-photo text { position:absolute;left:8px;top:8px;padding:5px 7px;border-radius:4px;background:#d59b28;color:#fff;font-size:9px;font-weight:900; }.farm-main { padding:12px; }.farm-title { display:flex;align-items:center;justify-content:space-between;gap:8px; }.farm-title>text { font-size:14px;font-weight:900; }.farm-title span { padding:4px 6px;border-radius:4px;background:#eaf5ee;color:var(--union-green);font-size:8px; }.rating { display:block;margin-top:6px;color:#8f6720;font-size:9px; }.tag-row { display:flex;gap:5px;flex-wrap:wrap;margin-top:7px; }.tag-row text { padding:4px 6px;border-radius:3px;background:#fff1e9;color:#9e5136;font-size:8px; }.farm-foot { margin-top:10px;padding-top:9px;border-top:1px solid #f0eaea;display:flex;align-items:center;justify-content:space-between; }.farm-foot small { color:var(--union-muted);font-size:9px; }.farm-foot button { height:32px;padding:0 11px;border-radius:5px;background:var(--union-red);color:#fff;display:flex;align-items:center;gap:4px;font-size:10px;font-weight:800; }.farm-foot .ui-icon { filter:brightness(0) invert(1); }
.color-head .hero-title { margin-top:8px; }.rank-tabs { margin-top:18px;padding:3px;display:grid;grid-template-columns:repeat(3,1fr);background:rgba(255,255,255,.13);border-radius:6px; }.rank-tabs button { height:35px;border-radius:4px;background:transparent;color:rgba(255,255,255,.7);font-size:10px; }.rank-tabs button.active { background:#fff;color:var(--union-red);font-weight:800; }.rank-list { margin:0 16px;display:grid;gap:10px;background:transparent;border:0;border-radius:0; }.rank-list button { width:100%;min-height:76px;padding:11px 13px;background:#fff;border:1px solid var(--union-line);border-radius:14px;display:grid;grid-template-columns:30px 46px 1fr auto;gap:12px;align-items:center;text-align:left;color:var(--union-ink); }.rank-list button:last-child { border:0; }.rank-number { width:30px;height:30px;border-radius:9px;display:grid;place-items:center;font-weight:800;font-size:15px;color:#fff; }
  .rank-number.rank-medal-1 { background:linear-gradient(135deg,#fbbf24,#f59e0b); }
  .rank-number.rank-medal-2 { background:linear-gradient(135deg,#cbd5e1,#94a3b8); }
  .rank-number.rank-medal-3 { background:linear-gradient(135deg,#fb923c,#ea580c); }
  .rank-number.rank-medal-n { background:#e5e9e3;color:#94a3b8; }.rank-list image { width:46px;height:46px;border-radius:6px; }.rank-list view text,.rank-list view small { display:block; }.rank-list view text { font-size:11px;font-weight:800; }.rank-list view small { margin-top:4px;color:var(--union-muted);font-size:8px; }.rank-list strong { color:var(--union-red);font-size:12px; }
.route-list { padding:0 16px;display:grid;gap:12px; }.route-card { background:#fff;border:1px solid var(--union-line);border-radius:16px;overflow:hidden;color:var(--union-ink); }.route-card>image { width:100%;height:96px; }.route-card>view { padding:10px 12px; }.route-card text,.route-card small,.route-card span { display:block; }.route-card text { font-size:14px;font-weight:900; }.route-card small { margin-top:5px;color:var(--union-muted);font-size:9px; }.route-card span { margin-top:8px;color:#8b6730;font-size:9px; }.route-card button { width:auto;height:auto;min-height:32px;margin-top:10px;padding:6px 12px;border-radius:9px;background:#fff1f2;border:1px solid #fbcad5;color:#e11d48;font-size:11.5px;font-weight:700; }
.live-list { padding:0 16px;display:grid;grid-template-columns:repeat(2,1fr);gap:10px; }.live-card { min-width:0;background:#fff;border:1px solid var(--union-line);border-radius:8px;overflow:hidden; }.live-cover { height:170px;position:relative; }.live-cover image { width:100%;height:100%; }.live-cover>text { position:absolute;left:7px;top:7px;padding:4px 6px;border-radius:4px;background:var(--union-red);color:#fff;font-size:8px;font-weight:800; }.live-cover>text.preview { background:#3c4145; }.live-cover small { position:absolute;right:7px;bottom:7px;padding:4px 6px;border-radius:4px;background:rgba(0,0,0,.55);color:#fff;font-size:8px; }.live-body { padding:10px; }.live-body>text,.live-body>small { display:block; }.live-body>text { min-height:34px;font-size:11px;font-weight:800;line-height:1.5; }.live-body>small { color:var(--union-muted);font-size:8px;margin-top:4px; }.live-body>view { margin-top:9px;display:flex;align-items:center;justify-content:space-between;gap:6px; }.live-body span { min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--union-red);font-size:8px;font-weight:700; }.live-body button { min-width:65px;height:29px;padding:0 7px;border-radius:4px;background:var(--union-red);color:#fff;display:flex;align-items:center;justify-content:center;gap:4px;font-size:8px;font-weight:800; }.live-body button.reminded { background:var(--union-green); }.live-body .ui-icon { filter:brightness(0) invert(1); }.live-note,.lock-note { margin:15px 16px;padding:13px;background:#fff;border:1px solid var(--union-line);border-radius:8px;display:flex;align-items:flex-start;gap:9px; }.live-note text,.live-note small,.lock-note text,.lock-note small { display:block; }.live-note text,.lock-note text { font-size:11px;font-weight:800; }.live-note small,.lock-note small { margin-top:4px;color:var(--union-muted);font-size:9px;line-height:1.55; }
.promoter-page { background:#f3eeee; }.promoter-head { padding:calc(54px) 16px 18px;background:linear-gradient(135deg,#1f2937,#0f172a);color:#fff; }.profile { display:flex;align-items:center;gap:12px; }.pav { width:60px;height:60px;border-radius:16px;background:#c41e44;display:grid;place-items:center;font-size:30px; }.pname { display:block;font-size:17px!important;font-weight:800; }.plv { display:block;margin-top:2px;font-size:11.5px!important;opacity:.85; }.plv .vip { margin-left:4px;background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#3a2a00;border-radius:5px;padding:1px 7px;font-weight:800;font-size:10px; }.wallet-card { margin:14px 16px 0;background:#fff;border:1px solid var(--union-line);border-radius:18px;padding:16px;box-shadow:0 16px 36px -28px rgba(120,20,40,.5); }.wallet-top { display:flex;justify-content:space-between;align-items:flex-end; }.wallet-top small,.wallet-top strong { display:block; }.wallet-top small { font-size:12px!important;color:var(--union-muted); }
.wallet-top .settled-tag{display:inline-block;margin-left:4px;padding:1px 5px;border-radius:4px;background:#e8f3ec;color:#17633f;font-size:9px;font-weight:700}.wallet-top strong { margin-top:4px;font-size:30px!important;font-weight:800;color:#c41e44;line-height:1.1; }.wallet-top button { height:auto;min-height:36px;padding:9px 16px;border-radius:10px;background:#c41e44;color:#fff;font-size:13px!important;font-weight:800; }.wallet-stats { margin-top:14px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;border-top:1px dashed #e4dcdc;padding-top:12px; }.wallet-stats view { text-align:center; }.wallet-stats text,.wallet-stats small { display:block; }.wallet-stats text { font-size:14px!important;font-weight:800;color:var(--union-ink); }.wallet-stats small { margin-top:3px;font-size:10px!important;color:var(--union-muted); }.promoter-tools { margin:12px 16px 0;display:grid;grid-template-columns:repeat(4,1fr);background:#fff;border:1px solid var(--union-line);border-radius:8px; }
.promoter-tools .tool-emoji{font-size:21px;line-height:1}.promoter-tools button { height:79px;background:transparent;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;color:var(--union-ink);font-size:9px;border-right:1px solid #f0eaea; }.promoter-tools button:last-child { border:0; }.material-list { margin:0 16px;display:grid;gap:10px; }.material-row { display:flex;align-items:center;gap:12px;background:#fff;border:1px solid var(--union-line);border-radius:14px;padding:11px 13px; }.mat-emoji { width:42px;height:42px;border-radius:11px;flex-shrink:0;display:block; }.material-row>view:nth-child(2) { flex:1;min-width:0; }.material-row text,.material-row small { display:block; }.material-row text { font-size:13.5px!important;font-weight:700;line-height:1.4; }.material-row small { margin-top:2px;color:var(--union-muted);font-size:11px!important; }.material-row strong { color:#e11d48;font-size:12px!important;font-weight:800;white-space:nowrap;flex-shrink:0;margin-right:8px; }.material-row button { height:auto;min-height:34px;padding:6px 12px;border-radius:9px;background:#fff1f2;border:1px solid #fbcad5;color:var(--union-red);font-size:11.5px!important;font-weight:700;flex-shrink:0; }.material-row button.shared { background:#17633f;border-color:#17633f;color:#fff; }
.tabbar { position:fixed;left:0;right:0;bottom:0;height:calc(64px + env(safe-area-inset-bottom));padding-bottom:env(safe-area-inset-bottom);background:#fff;border-top:1px solid var(--union-line);display:grid;grid-template-columns:repeat(4,1fr);z-index:20; }.tabbar button { background:transparent;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:#918585;font-size:9px; }.tabbar button.active { color:var(--union-red);font-weight:800; }.tabbar button.active .ui-icon { filter:invert(29%) sepia(70%) saturate(1838%) hue-rotate(324deg); }
.preview-mask,.sheet-mask { position:fixed;inset:0;background:rgba(38,24,27,.52);z-index:40;display:flex;align-items:flex-end; }.preview,.sheet { width:100%;max-height:86vh;overflow-y:auto;background:#fff;border-radius:14px 14px 0 0;padding-bottom:calc(20px + env(safe-area-inset-bottom));position:relative; }.preview-close { position:absolute;right:12px;top:12px;width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.92);display:grid;place-items:center;z-index:2; }.preview>image { width:100%;height:220px; }.preview-body { padding:15px; }.preview-body>text,.preview-body>small { display:block; }.preview-body>text { font-size:21px;font-weight:900; }.preview-body>small { margin-top:6px;color:var(--union-muted);font-size:9px; }.preview-actions { display:grid;grid-template-columns:repeat(2,1fr);gap:9px;margin-top:14px; }.preview-actions button { height:41px;border-radius:6px;background:var(--union-red);color:#fff;display:flex;align-items:center;justify-content:center;gap:7px;font-size:11px;font-weight:800; }.preview-actions button:last-child { background:var(--union-green); }.preview-actions .ui-icon { filter:brightness(0) invert(1); }.preview-products { display:grid;grid-template-columns:repeat(2,1fr);gap:9px;margin-top:14px; }.preview-products view { border:1px solid var(--union-line);border-radius:7px;overflow:hidden;padding-bottom:9px; }.preview-products image { width:100%;height:105px; }.preview-products text,.preview-products strong { display:block;padding:0 8px; }.preview-products text { margin-top:7px;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }.preview-products strong { margin-top:5px;color:var(--union-red);font-size:11px; }
.sheet { padding:8px 16px calc(22px + env(safe-area-inset-bottom)); }.sheet-handle { width:38px;height:4px;border-radius:2px;background:#ddd5d5;margin:0 auto 8px; }.sheet-head { height:47px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #f0eaea; }.sheet-head>text { font-size:16px;font-weight:900; }.sheet-head button { width:34px;height:34px;border-radius:50%;background:#f5f0f0;display:grid;place-items:center; }.choice-list { padding-top:10px;display:grid;gap:7px; }.choice-list button { height:47px;padding:0 12px;border-radius:6px;background:#f8f4f4;color:var(--union-ink);display:flex;align-items:center;gap:9px;text-align:left;font-size:11px; }.choice-list button .ui-icon:last-child { margin-left:auto; }.choice-list button.active { background:var(--union-red-soft);color:var(--union-red);font-weight:800; }.route-detail image,.share-sheet image { width:100%;height:210px;border-radius:8px;margin-top:12px; }.route-detail text,.route-detail small,.share-sheet text,.share-sheet small { display:block; }.route-detail text,.share-sheet text { margin-top:12px;font-size:14px;font-weight:800; }.route-detail small,.share-sheet small { margin-top:7px;color:var(--union-muted);font-size:9px;line-height:1.6; }.primary-button { width:100%;height:43px;margin-top:15px;border-radius:6px;background:var(--union-red);color:#fff;font-size:11px;font-weight:800; }.primary-button:disabled { opacity:.5; }.withdraw-form { padding-top:14px; }.withdraw-form>text { display:block;color:var(--union-muted);font-size:10px;margin-bottom:12px; }.withdraw-form label span { display:block;font-size:10px;font-weight:800;margin-bottom:6px; }.withdraw-form input { width:100%;height:43px;padding:0 11px;border:1px solid var(--union-line);border-radius:6px;font-size:14px; }.choice-row { display:flex;gap:7px;margin-top:12px; }.choice-row button { flex:1;height:35px;border-radius:5px;background:#f5f0f0;color:var(--union-muted);font-size:9px; }.choice-row button.active { background:var(--union-red-soft);color:var(--union-red);font-weight:800; }
.filter-scroll{scrollbar-width:none}.filter-scroll::-webkit-scrollbar{display:none}.city-button{height:36px}.filter-row button{height:38px}.farm-foot button{height:38px}.route-card button{height:41px}.live-body button{min-width:68px;height:36px}.wallet button{height:40px}.material-row button{min-height:36px}.tabbar button{min-height:48px}.preview,.sheet{overscroll-behavior:contain}.live-detail{padding-top:12px}.live-detail>image{width:100%;height:220px;border-radius:8px}.live-state{width:max-content;margin-top:-38px;margin-left:10px;position:relative;padding:6px 9px;border-radius:4px;background:rgba(24,20,21,.72);color:#fff;font-size:9px}.live-state span{display:inline-block;width:7px;height:7px;margin-right:5px;border-radius:50%;background:#ff425b}.live-detail>text,.live-detail>small{display:block}.live-detail>text{margin-top:24px;font-size:16px;font-weight:900}.live-detail>small{margin-top:6px;color:var(--union-muted);font-size:9px}.live-detail>view:not(.live-state){margin-top:14px;padding:12px;background:#f8f4f4;border-radius:7px;display:flex;justify-content:space-between}.live-detail b{color:var(--union-red)}.sheet-materials,.data-list,.promoter-rank-list{display:grid;gap:8px;padding-top:12px}.sheet-materials>view{min-height:72px;padding:8px;background:#f8f4f4;border:1px solid var(--union-line);border-radius:7px;display:grid;grid-template-columns:56px 1fr auto;gap:9px;align-items:center}.sheet-materials image{width:56px;height:54px;border-radius:6px}.sheet-materials text,.sheet-materials small{display:block}.sheet-materials text{font-size:10px;font-weight:800;line-height:1.4}.sheet-materials small{margin-top:4px;color:var(--union-muted);font-size:8px}.sheet-materials button{min-height:38px;padding:0 10px;border-radius:5px;background:var(--union-red);color:#fff;font-size:9px;font-weight:800}.data-list>view{min-height:64px;padding:10px;background:#f8f4f4;border:1px solid var(--union-line);border-radius:7px;display:grid;grid-template-columns:36px 1fr auto;gap:9px;align-items:center}.data-avatar{width:36px;height:36px;border-radius:50%;background:var(--union-red-soft);display:grid;place-items:center}.data-list text,.data-list small{display:block}.data-list text{font-size:10px;font-weight:800}.data-list small{margin-top:5px;color:var(--union-muted);font-size:8px;line-height:1.4}.data-list span{padding:4px 6px;border-radius:4px;background:#e8f3ec;color:var(--union-green);font-size:8px}.data-list strong{font-size:10px}.data-list strong.income{color:var(--union-green)}.data-list strong.withdrawal{color:var(--union-red)}.promoter-rank-list>view{min-height:60px;padding:10px;background:#f8f4f4;border:1px solid var(--union-line);border-radius:7px;display:grid;grid-template-columns:28px 1fr auto;align-items:center;gap:8px}.promoter-rank-list b{color:var(--union-gold);font-size:17px}.promoter-rank-list text,.promoter-rank-list small{display:block}.promoter-rank-list text{font-size:11px;font-weight:800}.promoter-rank-list small{margin-top:4px;color:var(--union-muted);font-size:8px}.promoter-rank-list strong{color:var(--union-red);font-size:10px}.share-record{margin-top:12px;padding:11px;background:#f8f4f4;border:1px solid var(--union-line);border-radius:6px}
.policy-hint{margin:10px 16px 0;padding:9px 12px;border-radius:7px;background:var(--union-red-soft);border:1px solid #f6d2d8;color:var(--union-red);font-size:11px;font-weight:700}.policy-hint b{color:var(--union-red)}.share-record text,.share-record small{margin:0!important}.share-record small{margin-top:6px!important;word-break:break-all;line-height:1.5}
@media(min-width:700px){.app-shell{max-width:430px;margin:0 auto;box-shadow:0 0 0 1px #e4dcdc}.tabbar{left:50%;right:auto;width:430px;transform:translateX(-50%)}.preview-mask,.sheet-mask{justify-content:center}.preview,.sheet{max-width:430px}}
.city-button,.filter-row button,.farm-foot button,.route-card button,.live-body button,.wallet button,.material-row button,.sheet-materials button,.choice-row button{min-height:40px}.live-card:last-child:nth-child(odd){grid-column:auto}.preview-actions{grid-template-columns:repeat(3,1fr)}.preview-actions button:last-child{background:#7d4a22}.preview-actions button:disabled{opacity:.45}.booking-record-link{width:calc(100% - 32px);min-height:44px;margin:10px 16px 0;padding:0 12px;border-radius:7px;background:#fff;border:1px solid var(--union-line);display:flex;align-items:center;gap:8px;color:var(--union-ink);font-size:10px;font-weight:800}.booking-record-link .ui-icon:last-child{margin-left:auto}.state-page{min-height:100vh;padding:24px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:var(--union-muted);text-align:center}.state-page .primary-button{max-width:240px}.empty{min-height:100px;display:grid;place-items:center;color:var(--union-muted);font-size:10px}
.search-results{margin:12px 16px 0;padding:12px;background:#fff;border:1px solid var(--union-line);border-radius:8px;display:grid;gap:12px}.search-group>text{display:block;margin-bottom:7px;font-size:14px;font-weight:900;color:var(--union-red)}.search-group>button{width:100%;min-height:44px;padding:7px 10px;border-top:1px solid #f0eaea;background:transparent;display:flex;align-items:center;justify-content:space-between;text-align:left}.search-group>button small,.search-group>small{color:var(--union-muted)}.booking-form{padding-top:14px}.booking-form>text,.booking-form>small{display:block}.booking-form>text{font-size:17px;font-weight:900}.booking-form>small{margin-top:6px;color:var(--union-muted)}.booking-form>view{margin-top:16px}.booking-form>view>span{display:block;margin-bottom:7px;font-weight:800}.booking-form .choice-row{margin-top:0;flex-wrap:wrap}.booking-form .choice-row button{flex:1 1 30%}.app-shell small{font-size:12px!important}.app-shell button,.app-shell input{font-size:13px!important}.app-shell .hero-sub,.app-shell .rating,.app-shell .tag-row text,.app-shell .farm-photo text,.app-shell .farm-title span,.app-shell .map-box>text,.app-shell .live-state,.app-shell .data-list span{font-size:12px!important}.app-shell button:focus-visible,.app-shell input:focus-visible{outline:3px solid rgba(165,48,65,.28);outline-offset:2px}

/* ===== 原型 1:1 补充样式 ===== */
.switch-text{margin-left:4px;font-size:10px;color:rgba(255,255,255,.92);border:1px solid rgba(255,255,255,.4);border-radius:5px;padding:1px 6px}
.filter-row button{display:inline-flex;align-items:center;gap:4px}.filter-row button text{font-size:11px}
.rank-badge{position:absolute;left:8px;top:8px;z-index:2;padding:2px 8px;border-radius:6px;background:rgba(0,0,0,.55);color:#fff;font-size:10px;font-weight:800}.rank-badge.medal{background:#f7d9a0;color:#7a4b12}
.rank-value{display:flex;flex-direction:column;align-items:flex-end;gap:2px}.rank-value strong{font-size:15px;color:#c2562e;font-weight:800}.rank-value small{font-size:9px;color:var(--alliance-muted,#a08a8a)}
.route-meta{margin-top:3px;color:#c2562e!important}

.live-body view{flex-wrap:wrap;row-gap:6px}.live-body view span{flex:1 1 auto;min-width:0;font-size:11px;line-height:1.4}
.promoter-footer{margin:16px 16px 4px;padding-top:12px;border-top:1px dashed #e4dcdc;color:#a08a8a;font-size:10px;text-align:center;line-height:1.7}

/* 按钮文字居中：操作类按钮 */
.city-button,.filter-row button,.farm-foot button{justify-content:center}


/* ===== P1 样式调整（对照原型） ===== */
.discovery-head,.color-head{padding:calc(26px + env(safe-area-inset-top)) 16px 20px}
.discovery-head{background:linear-gradient(135deg,#d6304f,#a8183a 65%,#7e1230)}
.rank-head{background:linear-gradient(135deg,#fb923c,#ea580c)}
.live-head{background:linear-gradient(135deg,#e11d48,#831843)}
.discovery-head .hero-title{font-size:22px}
.rank-head .hero-title,.live-head .hero-title{font-size:21px}
.rank-tabs{margin-top:16px;display:flex;gap:8px;background:transparent;padding:0}
.rank-tabs button{height:auto;padding:7px 15px;border-radius:999px;background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.35);color:#fff;font-size:12.5px!important;font-weight:700}
.rank-tabs button.active{background:#fff;color:#ea580c;border-color:#fff;font-weight:800}
.search{border-radius:6px}
.filter-row button{background:#fbf9f8;border-color:#efe6e6}
.farm-card{box-shadow:0 6px 16px rgba(80,50,50,.06)}
.map-box{border-radius:16px}



/* ===== 按钮靠左 + 文字居中（统一） ===== */
button, uni-button { text-align: center; }
.state-page { align-items: flex-start; }
.wallet { justify-content: flex-start; gap: 14px; }
.rank-list button, .choice-list button, .search-group button, .booking-record-link { justify-content: flex-start; text-align: left; }
.choice-list button .ui-icon:last-child, .booking-record-link .ui-icon:last-child { margin-left: auto; }




/* ===== emoji 占位（按截图） ===== */
.emoji-thumb{display:grid;place-items:center;background:#f2efe9;border-radius:8px;font-size:36px;line-height:1}
.farm-emoji{width:100%;height:136px;display:block}
.rank-emoji{width:44px;height:44px;flex:none;display:block}
.live-emoji{width:100%;height:150px;display:block}



/* ===== 直播卡按截图还原 ===== */
.live-list{padding:14px 16px 0;gap:12px}
.live-card{border-radius:16px;border-color:#e5e1d6}
.live-cover{height:128px;background:linear-gradient(135deg,#ffe4e9,#fecdd3)}
.live-cover .live-emoji{background:transparent;font-size:50px;width:100%;height:100%}
.live-cover>text{position:absolute;top:8px;left:8px;background:var(--union-red);color:#fff;font-size:10px;font-weight:800;border-radius:6px;padding:2px 8px;line-height:1.4}
.live-cover>text.preview{background:rgba(0,0,0,.5)}
.live-cover>small{position:absolute;top:8px;right:8px;background:rgba(0,0,0,.45);color:#fff;font-size:10px;border-radius:6px;padding:2px 7px}
.live-body{padding:9px 10px}


/* ===== rank 按截图 ===== */
.route-card{display:block}
.route-emoji{width:100%;height:96px;border-radius:0;display:block}


/* ===== nearby 横向卡（按截图） ===== */
.farm-card{display:flex;align-items:stretch}
.farm-photo{width:104px;height:auto;flex:none}
.farm-photo .farm-emoji{width:104px;height:104px}
.farm-main{padding:10px 12px;flex:1;min-width:0;display:flex;flex-direction:column}
.farm-title text{display:block;font-size:14px;font-weight:800;line-height:1.35;white-space:normal;word-break:break-all}
.map-box .road{box-shadow:0 1px 2px rgba(120,140,110,.12)}
.map-box .grid-bg{opacity:.7}
.farm-foot{margin-top:auto;padding-top:8px}


/* ===== 联盟密度对齐截图 ===== */
.filter-row{padding:8px 12px;gap:6px}
.farm-main{padding:10px 12px}
.farm-foot{margin-top:6px;padding-top:6px;border-top:none}
.me{width:12px;height:12px;border:3px solid #fff;box-shadow:none;top:60px}
.map-pin{width:18px;height:18px}
.rank-list button{text-align:left}
.route-card text{color:var(--union-ink)}
.route-card small{color:var(--union-muted)}
.route-card .route-meta{color:#e11d48!important}
.route-emoji{background:linear-gradient(120deg,#34a853,#0f5132)}
.route-card button{background:#fff1f2;color:#e11d48;border:1px solid #fbcad5}
.live-head{padding-top:calc(40px + env(safe-area-inset-top))}
.live-body text{font-size:12.5px!important;font-weight:700;line-height:1.35;min-height:34px}
.live-body small{display:block;font-size:11px!important;color:#6f7570;margin-top:4px}
.live-body span{font-size:11px!important}


/* ===== 弹层按截图 ===== */
.withdraw-form .choice-row button.active{background:var(--union-red-soft);color:var(--union-red);border-color:var(--union-red-soft);font-weight:800}
.share-sheet .share-title{display:block;font-size:16px;font-weight:900;color:var(--union-ink)}
.share-sheet{padding-top:6px}


/* ===== 弹层 1:1（切换城市/查看线路） ===== */
.city-sheet{padding:4px 2px 6px}
.city-sub{display:block;font-size:12.5px!important;color:#8a8a82;margin:4px 0 14px;line-height:1.6}
.city-chips{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:16px}
.city-chips button{min-height:40px;padding:0 15px;border-radius:10px;background:#fff;border:1px solid #e6dede;font-size:13px!important;font-weight:700;color:#7a7171}
.city-chips button.sel{border-color:var(--union-red);background:var(--union-red-soft);color:var(--union-red);font-weight:800}
.city-sheet .primary-button{width:100%;min-height:46px;border-radius:13px;font-size:14.5px!important;font-weight:800}
.route-detail{padding:4px 2px 6px}
.route-sub{display:block;font-size:12.5px!important;color:#8a8a82;margin:4px 0 16px;line-height:1.7}
.route-detail .primary-button{width:100%;min-height:46px;border-radius:13px;font-size:14.5px!important;font-weight:800}
.city-button{max-width:88%}
.withdraw-sub{display:block;font-size:12.5px!important;color:#8a8a82;margin:4px 0 14px}
.withdraw-chips{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:16px}
.withdraw-chips button{min-height:40px;padding:0 15px;border-radius:10px;background:#fff;border:1px solid #e6dede;font-size:13px!important;font-weight:700;color:#7a7171}
.withdraw-chips button.sel{border-color:var(--union-red);background:var(--union-red-soft);color:var(--union-red);font-weight:800}
.withdraw-form .primary-button{width:100%;min-height:46px;border-radius:13px;font-size:14.5px!important;font-weight:800}
.share-sheet{padding:4px 2px 6px}
.share-sub{display:block;font-size:12.5px!important;color:#8a8a82;margin:4px 0 14px;line-height:1.7}
.share-sheet .primary-button{width:100%;min-height:46px;border-radius:13px;font-size:14.5px!important;font-weight:800}
.remind-row span{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;background:#f3f0ee;color:#8a5a4a;font-size:11px!important;font-weight:700}


/* ===== 1:1 复核调整（对照原型） ===== */
.live-cover-1{background:linear-gradient(135deg,#ffe4e9,#fecdd3)}
.live-cover-2{background:linear-gradient(135deg,#fef3c7,#fde68a)}
.live-cover-3{background:linear-gradient(135deg,#dbeafe,#bfdbfe)}
.live-cover-4{background:linear-gradient(135deg,#dcfce7,#bbf7d0)}


/* ===== 按钮组靠左修复（uni-button 默认 margin:0 auto 会摊开） ===== */
.rank-tabs uni-button, .city-chips uni-button, .withdraw-chips uni-button, .filter-row uni-button,
.choice-row uni-button, .promoter-tools uni-button, .login-tabs uni-button, .tabbar uni-button,
.route-card uni-button, .live-body uni-button, .material-row uni-button, .sheet-materials uni-button,
.logout-button, .booking-record-link { margin: 0; }


.farm-foot uni-button, .wallet-top uni-button { margin: 0; }
.city-button { margin: 0; display: inline-flex; width: auto; }


.sheet-head uni-button { margin: 0; }

/* ===== 文字水平居中兜底 ===== */

.rank-tabs uni-button, .city-chips uni-button, .withdraw-chips uni-button, .filter-row uni-button { text-align: center; }



/* ===== 按钮文字水平垂直居中（uni-button 默认 display:block 文字顶对齐） ===== */
.rank-tabs uni-button, .city-chips uni-button, .withdraw-chips uni-button, .filter-row uni-button,
.wallet-top uni-button, .route-card uni-button, .live-body uni-button,
.material-row uni-button, .sheet-materials uni-button,
.primary-button, .outline-button {
  display: inline-flex; align-items: center; justify-content: center;
}

/* ===== 按钮默认边框清除 + 轻量交互反馈 ===== */
.rank-tabs uni-button::after, .city-chips uni-button::after, .withdraw-chips uni-button::after,
.filter-row uni-button::after, .wallet-top uni-button::after, .route-card uni-button::after,
.live-body uni-button::after, .material-row uni-button::after, .sheet-materials uni-button::after,
.farm-foot uni-button::after, .city-button::after, .promoter-tools uni-button::after,
.tabbar uni-button::after, .login-tabs uni-button::after, .choice-row uni-button::after,
.sheet-head uni-button::after, .primary-button::after, .outline-button::after,
.booking-record-link::after, .logout-button::after { border: none; }
.wallet-top uni-button:active, .material-row uni-button:active, .route-card uni-button:active,
.live-body uni-button:active, .promoter-tools uni-button:active, .farm-foot uni-button:active { opacity: .85; }


/* ===== 弹层/图标按钮水平垂直居中（uni-button 默认 padding 14px 导致 grid 图标右偏） ===== */
.sheet-head uni-button, .preview-close { padding: 0; }
/* ===== 登录 ===== */
.login-sheet{padding:8px 4px 12px}
.login-tabs{display:flex;background:#f4ecec;border-radius:11px;padding:4px;margin-bottom:16px}
.login-tabs button{flex:1;min-height:38px;border-radius:8px;font-size:13px;font-weight:700;color:#8a7278;display:flex;align-items:center;justify-content:center}
.login-tabs button.active{background:#fff;color:#c41e44;box-shadow:0 2px 8px rgba(196,30,68,.12)}
.login-fields{display:flex;flex-direction:column;gap:13px;margin-bottom:18px}
.login-field{display:flex;flex-direction:column;gap:6px}
.login-field text{font-size:12px;color:#6b5a5e;font-weight:700}
.login-field input{height:46px;border:1px solid #eadcdd;border-radius:10px;padding:0 14px;font-size:14px;background:#fbf8f8}
.code-input{display:flex;gap:10px}
.code-input input{flex:1;min-width:0}
.code-button{min-height:46px;padding:0 14px;border-radius:10px;background:#c41e44;color:#fff;font-size:13px;font-weight:700;white-space:nowrap;display:inline-flex;align-items:center;justify-content:center}
.code-button[disabled]{opacity:.55}
.login-submit{width:100%;min-height:46px}
.login-hint{display:block;text-align:center;margin-top:14px;font-size:11px;color:#a99a9e}
.promoter-login{padding:70px 22px 30px}
.promoter-login-card{background:#fff;border:1px solid var(--union-line);border-radius:20px;padding:36px 24px 30px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;box-shadow:0 18px 40px -28px rgba(120,20,40,.45)}
.promoter-login-icon{width:64px;height:64px;border-radius:18px;background:#fdeef1;display:grid;place-items:center;font-size:32px}
.promoter-login-title{font-size:18px;font-weight:800;color:var(--union-ink)}
.promoter-login-sub{font-size:12px;color:var(--union-muted);line-height:1.7}
.promoter-login .primary-button{width:100%;min-height:46px;margin-top:12px}
.logout-button{width:calc(100% - 32px);min-height:42px;margin:14px 16px 0;border-radius:12px;background:#f4ecec;color:#8a5a64;font-size:13.5px;font-weight:700;border:1px solid #eadcdd;display:flex;align-items:center;justify-content:center}

</style>
