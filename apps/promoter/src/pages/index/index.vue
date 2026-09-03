<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import type { BusinessMediaValue, FarmStore, LiveRoom, Product } from '@agritainment/shared'
import { PLATFORM_BINDINGS_STORAGE_KEY, PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_COMMISSION_LEDGER_STORAGE_KEY, PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_LIVES_STORAGE_KEY, PLATFORM_MEDIA_STORAGE_KEY, PLATFORM_PROMOTER_ACCOUNTS_STORAGE_KEY, PLATFORM_SETTLEMENTS_STORAGE_KEY, PLATFORM_SHARES_STORAGE_KEY, PLATFORM_STORE_CATALOG_SELECTIONS_STORAGE_KEY, buildPortalUrl, createId, createPlatformDictionaryCache, formatNumber, installKeyboardButtonSupport, money, pendingShareAmount, subscribePlatformChanges } from '@agritainment/shared'
import { BusinessImage, ImageUploader, getMediaRuntime } from '@agritainment/ui'
import UiIcon from '../../components/UiIcon.vue'
// #ifdef H5
import qrcode from 'qrcode-generator'
// #endif
import { usePromoterStore } from '../../stores/promoter'
import { userPortalBase } from '../../config/portal'

type SheetKey = 'login' | 'create-live' | 'share' | 'shares' | 'bound-users' | null

let disposePlatformChanges: (() => void) | null = null
let disposeStorageSync: (() => void) | null = null
let disposeVisibilitySync: (() => void) | null = null
let disposeKeyboardButtons: (() => void) | null = null
const store = usePromoterStore()
const platformChangeKeys = [PLATFORM_PROMOTER_ACCOUNTS_STORAGE_KEY, PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_LIVES_STORAGE_KEY, PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_STORE_CATALOG_SELECTIONS_STORAGE_KEY, PLATFORM_COMMISSION_LEDGER_STORAGE_KEY, PLATFORM_SETTLEMENTS_STORAGE_KEY, PLATFORM_SHARES_STORAGE_KEY, PLATFORM_BINDINGS_STORAGE_KEY, PLATFORM_MEDIA_STORAGE_KEY]
const refreshSharedState = () => void store.refreshSharedState()
const sheet = ref<SheetKey>(null)
const loginPhone = ref('13800000000')
const loginPassword = ref('123456')
const selectedLive = ref<LiveRoom | null>(null)
const qrDataUrl = ref('')
const coverOptions = ['/static/images/farmhouse.webp', '/static/images/field.webp', '/static/images/mountain.webp', '/static/images/tea.webp', '/static/images/rice.webp']
const liveForm = reactive<{ id: string; title: string; image: BusinessMediaValue; status: LiveRoom['status']; selectedFarms: string[]; hostRole: string }>({ id: '', title: '', image: '/static/images/farmhouse.webp', status: 'preview', selectedFarms: [], hostRole: '' })
const selectedPackages = reactive<Record<string, string[]>>({})
const dictCache = createPlatformDictionaryCache()
const liveHostRoleOptions = ref(dictCache.getOptions('liveHostRole'))
const promoterTypeLabel = ref(dictCache.label('promoterType', store.promoter?.type || ''))
const promoterLevelLabel = ref(dictCache.label('promoterLevel', store.promoter?.level || ''))
dictCache.subscribe(() => {
  liveHostRoleOptions.value = dictCache.getOptions('liveHostRole')
  promoterTypeLabel.value = dictCache.label('promoterType', store.promoter?.type || '')
  promoterLevelLabel.value = dictCache.label('promoterLevel', store.promoter?.level || '')
})

const myLives = computed(() => store.myLives)
const totalShare = computed(() => store.myShares.reduce((sum, item) => sum + item.amount, 0))
const pendingShare = computed(() => store.pendingLedgerCommission)
const farmName = (id: string) => store.farms.find((item) => item.id === id)?.name || id
const packagesOfFarm = (farmId: string) => store.products.filter((item) => (item.farmIds || []).includes(farmId))
const liveFarmCount = (room: LiveRoom) => room.linkedFarms?.length || 0

function toast(title: string) {
  uni.showToast({ title, icon: 'none' })
}

function submitLogin() {
  if (store.login(loginPhone.value, loginPassword.value)) {
    sheet.value = null
    toast('登录成功')
  } else {
    toast('账号或密码错误')
  }
}

function openCreateLive(room?: LiveRoom) {
  if (room) {
    Object.assign(liveForm, { id: room.id, title: room.title, image: room.image || '/static/images/farmhouse.webp', status: room.status, selectedFarms: (room.linkedFarms || []).map((item) => item.farmId), hostRole: room.hostRole || '' })
    Object.keys(selectedPackages).forEach((key) => delete selectedPackages[key])
    ;(room.linkedFarms || []).forEach((item) => {
      const candidateIds = new Set(packagesOfFarm(item.farmId).map((product) => product.id))
      selectedPackages[item.farmId] = item.packageIds.filter((id) => candidateIds.has(id))
    })
  } else {
    Object.assign(liveForm, { id: '', title: '', image: '/static/images/farmhouse.webp', status: 'preview', selectedFarms: [], hostRole: '' })
    Object.keys(selectedPackages).forEach((key) => delete selectedPackages[key])
  }
  sheet.value = 'create-live'
}

function toggleFarm(farmId: string) {
  const index = liveForm.selectedFarms.indexOf(farmId)
  if (index >= 0) {
    liveForm.selectedFarms.splice(index, 1)
    delete selectedPackages[farmId]
  } else {
    liveForm.selectedFarms.push(farmId)
    selectedPackages[farmId] = []
  }
}

function togglePackage(farmId: string, packageId: string) {
  const list = selectedPackages[farmId] || (selectedPackages[farmId] = [])
  const index = list.indexOf(packageId)
  if (index >= 0) list.splice(index, 1)
  else list.push(packageId)
}

function coverActive(value: BusinessMediaValue, cover: string): boolean {
  return typeof value === 'string' ? value === cover : value?.source === 'builtin' && value.path === cover
}

async function saveLive() {
  const linkedFarms = liveForm.selectedFarms
    .map((farmId) => {
      const candidateIds = new Set(packagesOfFarm(farmId).map((product) => product.id))
      return { farmId, packageIds: (selectedPackages[farmId] || []).filter((id) => candidateIds.has(id)) }
    })
    .filter((item) => item.packageIds.length)
  if (!liveForm.title.trim()) return toast('请填写直播标题')
  if (!linkedFarms.length) return toast('请至少选择一个门店套餐')
  const payload = { title: liveForm.title.trim(), image: liveForm.image, status: liveForm.status, linkedFarms, hostRole: liveForm.hostRole }
  const ok = liveForm.id
    ? await store.updateLive(liveForm.id, payload, getMediaRuntime().storage)
    : await store.createLive(payload, getMediaRuntime().storage)
  if (!ok) return toast('保存失败，请检查所选套餐')
  sheet.value = null
  toast(liveForm.id ? '直播已更新并发布' : '直播已创建并发布')
}

function toggleLive(room: LiveRoom) {
  if (!store.toggleLiveStatus(room.id)) return toast('当前直播没有有效门店套餐，无法开播')
  toast(room.status === 'live' ? '已开播' : '已改为预告')
}

function liveLink(room: LiveRoom) {
  const origin = userPortalBase.replace(/\/user\/?$/, '')
  return buildPortalUrl('user', 'pages/index/index', { promoter: store.promoter?.id, promoterName: store.promoter?.name || '推客', live: room.id }, origin)
}

async function openShare(room: LiveRoom) {
  selectedLive.value = room
  sheet.value = 'share'
  // #ifdef H5
  try {
    const qr = qrcode(0, 'M')
    qr.addData(liveLink(room))
    qr.make()
    const svg = qr.createSvgTag(4, 8)
    qrDataUrl.value = 'data:image/svg+xml;base64,' + btoa(svg)
  } catch (error) {
    console.error('qr generate failed', error)
    qrDataUrl.value = ''
  }
  // #endif
}

function copyLiveLink() {
  if (!selectedLive.value) return
  uni.setClipboardData({ data: liveLink(selectedLive.value), success: () => toast('直播间链接已复制') })
}

function copyShareLink(room: LiveRoom) {
  uni.setClipboardData({ data: liveLink(room), success: () => toast('直播间链接已复制') })
}

function confirmRemoveLive(room: LiveRoom) {
  uni.showModal({
    title: '下架直播',
    content: `确认下架「${room.title}」？下架后用户端将不再展示。`,
    success: (res) => {
      if (!res.confirm) return
      if (!store.removeLive(room.id)) return
      toast('直播已下架')
    }
  })
}

onMounted(async () => {
  disposeKeyboardButtons = installKeyboardButtonSupport()
  await store.initialize()
  disposePlatformChanges = subscribePlatformChanges(refreshSharedState, platformChangeKeys)
  if (typeof window !== 'undefined') {
    const keys = new Set(platformChangeKeys)
    const onStorage = (event: StorageEvent) => { if (!event.key || keys.has(event.key)) refreshSharedState() }
    window.addEventListener('storage', onStorage)
    disposeStorageSync = () => window.removeEventListener('storage', onStorage)
  }
  if (typeof document !== 'undefined') {
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') refreshSharedState() }
    document.addEventListener('visibilitychange', onVisibilityChange)
    disposeVisibilitySync = () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }
})

onBeforeUnmount(() => {
  disposeKeyboardButtons?.(); disposeKeyboardButtons = null
  disposePlatformChanges?.(); disposePlatformChanges = null
  disposeStorageSync?.(); disposeStorageSync = null
  disposeVisibilitySync?.(); disposeVisibilitySync = null
  dictCache.dispose()
})
</script>

<template>
  <view class="app-shell">
    <view v-if="!store.auth.isLoggedIn" class="login-page">
      <view class="login-card">
        <view class="pc-login-hero">
          <view class="pc-login-mark"><UiIcon name="crown" :size="26" /></view>
          <text class="pc-login-brand">中选科技推客端</text>
          <text class="pc-login-sub">创建直播 · 推广门店套餐 · 用户消费分成</text>
        </view>
        <view class="login-body">
          <label class="login-field"><text>手机号</text><input v-model="loginPhone" type="number" maxlength="11" placeholder="请输入手机号" /></label>
          <label class="login-field"><text>密码</text><input v-model="loginPassword" type="password" placeholder="请输入密码" confirm-type="done" @confirm="submitLogin" /></label>
          <button class="primary-button" @click="submitLogin">登 录</button>
          <text class="login-hint">演示手机号 13800000000　密码 123456</text>
        </view>
      </view>
    </view>

    <template v-else>
      <view class="promoter-head"><view class="head-row"><view class="profile"><view class="pav"><UiIcon name="user-round" :size="24" /></view><view><text class="pname">推客 · {{ store.promoter?.name }}</text><small class="plv">{{ promoterTypeLabel || '推客' }}<text class="vip">{{ promoterLevelLabel }}</text></small></view></view><button class="head-share-btn" @click="sheet = 'shares'"><UiIcon name="badge-dollar-sign" :size="14" />分成明细</button></view></view>
      <view class="wallet-card">
        <view class="wallet-top"><view><small>消费分成累计（元）</small><strong>{{ money(totalShare) }}</strong></view></view>
        <view class="wallet-stats"><view><text>{{ money(pendingShare) }}</text><small>推广佣金<text v-if="store.promoter?.settled" class="settled-tag">已结算</text></small></view><view><text>{{ store.promoter?.fans ?? 0 }}</text><small>绑定用户</small></view><view><text>{{ store.myBoundUsers.filter((item) => item.status === 'bound').length }}</text><small>正式绑定</small></view></view>
      </view>

      <view class="quick-tools">
        <button @click="openCreateLive()"><UiIcon name="plus" :size="22" /><text>创建直播</text></button>
        <button @click="sheet = 'shares'"><UiIcon name="badge-dollar-sign" :size="22" /><text>我的分成</text></button>
        <button @click="sheet = 'bound-users'"><UiIcon name="users" :size="22" /><text>绑定用户</text></button>
      </view>

      <view class="section-head"><view class="section-title"><span></span><text class="section-title-label">我的直播</text></view><small>{{ myLives.length }} 场</small></view>
      <view v-if="!myLives.length" class="empty pc-empty">还没有直播，点击「创建直播」开始推广门店套餐</view>
      <view class="live-list">
        <view v-for="room in myLives" :key="room.id" class="live-card">
          <BusinessImage class="live-cover" :src="room.image" mode="aspectFill" />
          <view class="live-body">
            <view class="live-title-row"><text class="live-title">{{ room.title }}</text><span :class="room.status">{{ room.status === 'live' ? '直播中' : '预告' }}</span></view>
            <small class="live-meta">绑定 {{ liveFarmCount(room) }} 家门店 · {{ room.viewers.toLocaleString('zh-CN') }} 人观看</small>
            <view class="live-actions">
              <button class="mini" @click="toggleLive(room)">{{ room.status === 'live' ? '转为预告' : '开播' }}</button>
              <button class="mini" @click="openCreateLive(room)">编辑</button>
              <button class="mini accent" @click="openShare(room)">分享/二维码</button>
              <button class="mini danger" @click="confirmRemoveLive(room)">下架</button>
            </view>
          </view>
        </view>
      </view>
    </template>

    <view v-if="sheet" class="sheet-mask" @click.self="sheet = null"><view class="sheet">
      <view class="sheet-head"><text>{{ sheet === 'create-live' ? (liveForm.id ? '编辑直播' : '创建直播') : sheet === 'share' ? '分享直播间' : sheet === 'shares' ? '消费分成明细' : sheet === 'bound-users' ? '绑定用户' : '登录' }}</text><button aria-label="关闭弹层" @click="sheet = null"><UiIcon name="x" :size="19" /></button></view>

      <view v-if="sheet === 'create-live'" class="create-live" data-visual-state="promoter-create-live">
        <label class="field"><text>直播标题</text><input v-model="liveForm.title" placeholder="如 石板溪土鸡宴专场" /></label>
        <view class="field"><text>封面</text><view class="cover-row"><BusinessImage v-for="cover in coverOptions" :key="cover" :src="cover" mode="aspectFit" :class="{ active: coverActive(liveForm.image, cover) }" @click="liveForm.image = cover" /></view><ImageUploader v-model="liveForm.image" purpose="live-cover" profile="normal" /></view>
        <view class="field"><text>开播状态</text><view class="chips"><button :class="{ active: liveForm.status === 'preview' }" @click="liveForm.status = 'preview'">预告</button><button :class="{ active: liveForm.status === 'live' }" @click="liveForm.status = 'live'">直播中</button></view></view>
        <view v-if="liveHostRoleOptions.length" class="field"><text>主播身份</text><view class="chips"><button v-for="role in liveHostRoleOptions" :key="role.code" :class="{ active: liveForm.hostRole === role.code }" @click="liveForm.hostRole = role.code">{{ role.label }}</button></view></view>
        <view class="field"><text>选择门店（可多选）</text><view class="farm-grid"><view v-for="farm in store.farms" :key="farm.id" class="farm-option" :class="{ active: liveForm.selectedFarms.includes(farm.id) }" @click="toggleFarm(farm.id)"><BusinessImage :src="farm.image" mode="aspectFit" /><text>{{ farm.name }}</text></view></view></view>
        <template v-for="farmId in liveForm.selectedFarms" :key="farmId">
          <view class="field"><text>{{ farmName(farmId) }} · 选择套餐（可多选）</text><view class="pkg-grid"><view v-for="pkg in packagesOfFarm(farmId)" :key="pkg.id" class="pkg-option" :class="{ active: (selectedPackages[farmId] || []).includes(pkg.id) }" @click="togglePackage(farmId, pkg.id)"><BusinessImage :src="pkg.image" mode="aspectFit" /><view><text>{{ pkg.name }}</text><small>{{ money(pkg.price) }}</small></view></view><view v-if="!packagesOfFarm(farmId).length" class="pkg-empty">该门店暂无套餐券商品</view></view></view>
        </template>
        <button class="primary-button" @click="saveLive">{{ liveForm.id ? '保存修改并发布' : '创建并发布直播' }}</button>
      </view>

      <view v-else-if="sheet === 'share' && selectedLive" class="share-sheet" data-visual-state="promoter-share">
        <view class="qr-box"><image v-if="qrDataUrl" :src="qrDataUrl" mode="aspectFit" /><view v-else class="qr-placeholder">二维码（H5 生成）</view></view>
        <text class="share-title">{{ selectedLive.title }}</text>
        <small class="share-sub">用户扫码进入用户端，仅可看到本直播间及其门店套餐</small>
        <view class="share-link">{{ liveLink(selectedLive) }}</view>
        <button class="primary-button" @click="copyLiveLink"><UiIcon name="link" :size="18" />复制直播间链接</button>
      </view>

      <view v-else-if="sheet === 'shares'" class="data-list" data-visual-state="promoter-shares">
        <view v-if="!store.myShares.length" class="empty pc-empty">暂无消费分成记录</view>
        <view v-for="record in store.myShares" :key="record.id"><view class="data-avatar"><UiIcon name="badge-dollar-sign" :size="18" /></view><view><text>{{ record.userId }} · {{ record.orderId }}</text><small>消费 {{ money(record.orderAmount) }} · 比例 {{ record.rate }}% · {{ record.createdAt }}</small></view><strong class="income">{{ money(record.amount) }}</strong></view>
      </view>

      <view v-else-if="sheet === 'bound-users'" class="data-list" data-visual-state="promoter-bound-users">
        <view v-if="!store.myBoundUsers.length" class="empty pc-empty">暂无绑定用户，分享直播间二维码后用户扫码进入即临时绑定</view>
        <view v-for="item in store.myBoundUsers" :key="item.userId"><view class="data-avatar"><UiIcon name="user-round" :size="18" /></view><view><text>{{ item.userId }}</text><small>{{ item.status === 'bound' ? '已正式绑定（下单锁定）' : '临时绑定（下单后正式锁定）' }} · {{ item.boundAt || '-' }}</small></view><span :class="item.status === 'bound' ? 'bound' : 'pending'">{{ item.status === 'bound' ? '正式' : '临时' }}</span></view>
      </view>
    </view></view>
  </view>
</template>

<style lang="scss">
.app-shell{min-height:100vh;width:100%;max-width:100%;overflow-x:hidden;background:var(--mobile-bg);color:var(--mobile-text);padding-bottom:0}
.login-page{min-height:100vh;display:grid;place-items:center;padding:24px 20px;background:var(--mobile-bg)}
.login-card{width:100%;max-width:340px;background:var(--mobile-surface);border:1px solid var(--mobile-border);border-radius:8px;padding:0;overflow:hidden;display:flex;flex-direction:column;gap:0;box-shadow:var(--mobile-shadow-card)}
.login-icon{width:58px;height:58px;border-radius:8px;background:var(--mobile-brand-soft);display:grid;place-items:center;margin:0 auto}
.login-title{font-size:20px;line-height:1.35;font-weight:800;text-align:center;margin-top:6px}
.login-body{display:flex;flex-direction:column;gap:10px;padding:20px 22px 24px}
.login-sub{text-align:center;color:var(--mobile-muted);font-size:12px;line-height:1.6;margin-bottom:4px}
.login-field{display:flex;flex-direction:column;gap:6px;margin-top:6px;min-width:0}
.login-field text{font-size:12px;font-weight:700;color:var(--mobile-text)}
.login-field input{height:var(--mobile-touch-target);width:100%;border:1px solid var(--mobile-border);border-radius:8px;padding:0 12px;font-size:14px;background:var(--mobile-surface);color:var(--mobile-text)}
.login-field input:focus{border-color:var(--mobile-brand)}
.primary-button{min-height:var(--mobile-touch-target);width:100%;border-radius:8px;background:var(--mobile-brand);color:#fff;font-weight:800;font-size:14px;margin-top:10px;display:flex;align-items:center;justify-content:center;gap:7px;text-align:center}
.primary-button:active{background:var(--mobile-brand-deep)}
.primary-button .ui-icon{filter:brightness(0) invert(1)}
.login-hint{text-align:center;color:var(--mobile-muted);font-size:12px;line-height:1.55;margin-top:4px}

.promoter-head{background:var(--mobile-brand-deep);color:#fff;padding:20px 16px 30px}
.head-row{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0}
.head-share-btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:var(--mobile-control-compact);padding:0 10px;border-radius:8px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.3);color:#fff;font-size:13px;font-weight:700;flex:none}
.head-share-btn:active{background:rgba(255,255,255,.2)}
.head-share-btn .ui-icon{filter:brightness(0) invert(1)}
.profile{display:flex;align-items:center;gap:10px;min-width:0;flex:1}
.profile>view:last-child{min-width:0}
.pav{width:46px;height:46px;border-radius:8px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.24);display:grid;place-items:center;flex:none}
.pav .ui-icon{filter:brightness(0) invert(1)}
.pname{font-size:16px;line-height:1.35;font-weight:800;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.plv{font-size:12px;opacity:.84;display:block;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vip{display:inline-block;margin-left:6px;padding:1px 6px;border-radius:4px;background:var(--mobile-warning);color:#fff;font-size:12px}

.wallet-card{margin:-14px 16px 0;padding:16px;background:var(--mobile-surface);border:1px solid var(--mobile-border);border-radius:8px;box-shadow:var(--mobile-shadow-float);position:relative}
.wallet-top{display:flex;align-items:center;justify-content:space-between}
.wallet-top small,.wallet-top strong{display:block}
.wallet-top small{font-size:12px;color:var(--mobile-muted)}
.wallet-top strong{font-size:28px;line-height:1.2;color:var(--mobile-price);margin-top:5px;font-variant-numeric:tabular-nums}
.wallet-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin-top:16px;padding-top:14px;border-top:1px solid var(--mobile-border);text-align:center}
.wallet-stats>view{min-width:0;padding:0 5px}
.wallet-stats>view+view{border-left:1px solid var(--mobile-border)}
.wallet-stats text,.wallet-stats small{display:block}
.wallet-stats text{font-size:15px;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wallet-stats small{color:var(--mobile-muted);font-size:12px;line-height:1.4;margin-top:4px}
.wallet-stats .settled-tag{display:inline-block;margin-left:3px;padding:1px 4px;border-radius:4px;background:var(--mobile-brand-soft);color:var(--mobile-brand);font-size:12px;font-weight:700}

.quick-tools{margin:12px 16px 0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.quick-tools button{min-width:0;min-height:76px;background:var(--mobile-surface);border:1px solid var(--mobile-border);border-radius:8px;padding:12px 6px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;font-size:13px;font-weight:800;color:var(--mobile-brand);box-shadow:var(--mobile-shadow-card)}
.quick-tools button:active{background:var(--mobile-brand-soft)}
.section-head{display:flex;align-items:center;justify-content:space-between;margin:22px 16px 10px}
.section-head span{width:3px;height:16px;border-radius:2px;background:var(--mobile-brand);display:inline-block}
.section-title{display:flex;align-items:center;gap:7px;min-width:0;flex:1;font-size:16px;font-weight:800}
.section-title-label{display:block;min-width:4em;white-space:nowrap;flex:none}
.section-head small{color:var(--mobile-muted);font-size:12px}
.empty{min-height:96px;display:grid;place-items:center;color:var(--mobile-muted);font-size:12px;line-height:1.6;text-align:center;margin:0 16px;padding:16px}

.live-list{display:grid;gap:12px;padding:0 16px calc(24px + var(--mobile-bottom-safe))}
.live-card{min-width:0;background:var(--mobile-surface);border:1px solid var(--mobile-border);border-radius:8px;overflow:hidden;box-shadow:var(--mobile-shadow-card)}
.live-cover{width:100%;height:auto;aspect-ratio:16/9;display:block;background:var(--mobile-surface-subtle);object-fit:cover}
.live-body{padding:12px}
.live-title-row{display:flex;align-items:flex-start;gap:8px;min-width:0}
.live-title{font-size:15px;line-height:1.45;font-weight:800;flex:1;min-width:0;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;word-break:break-word}
.live-title-row span{flex:none;padding:3px 7px;border-radius:4px;font-size:12px;line-height:1.4;font-weight:700}
.live-title-row span.live{background:var(--mobile-brand-soft);color:var(--mobile-brand)}
.live-title-row span.preview{background:rgba(47,110,167,.1);color:var(--mobile-info)}
.live-meta{display:block;color:var(--mobile-muted);font-size:12px;line-height:1.5;margin-top:6px;word-break:break-word}
.live-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}
.live-actions .mini{min-width:0;min-height:var(--mobile-control-compact);padding:0 8px;border-radius:8px;background:var(--mobile-surface-subtle);border:1px solid var(--mobile-border);color:var(--mobile-text);font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;text-align:center;line-height:1.35}
.live-actions .mini:active{background:var(--mobile-brand-soft)}
.live-actions .mini::after{border:none}
.live-actions .mini.accent{background:var(--mobile-brand);border-color:var(--mobile-brand);color:#fff}
.live-actions .mini.danger{background:rgba(184,53,50,.08);border-color:rgba(184,53,50,.18);color:var(--mobile-danger)}

.sheet-mask{position:fixed;inset:0;background:rgba(10,24,16,.46);z-index:30;display:flex;align-items:flex-end;justify-content:center;padding-top:24px}
.sheet{width:100%;max-width:430px;max-height:var(--mobile-sheet-max-height);background:var(--mobile-surface);border-radius:8px 8px 0 0;display:flex;flex-direction:column;overflow-x:hidden;overflow-y:hidden;box-shadow:var(--mobile-shadow-float)}
.sheet-head{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:var(--mobile-sheet-header-height);padding:6px 16px;border-bottom:1px solid var(--mobile-border);font-size:16px;font-weight:800;flex:none}
.sheet-head>text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sheet-head button{width:var(--mobile-touch-target);height:var(--mobile-touch-target);border-radius:8px;background:var(--mobile-surface-subtle);display:grid;place-items:center;flex:none}
.create-live,.share-sheet,.data-list{min-width:0;padding:6px 16px calc(22px + var(--mobile-bottom-safe));overflow-y:auto;overflow-x:hidden}
.field{display:flex;flex-direction:column;gap:8px;margin-top:14px;min-width:0}
.field>text{font-size:12px;font-weight:800;color:var(--mobile-text);line-height:1.5}
.field input{height:var(--mobile-touch-target);width:100%;border:1px solid var(--mobile-border);border-radius:8px;padding:0 12px;font-size:14px;background:var(--mobile-surface);color:var(--mobile-text)}
.field input:focus{border-color:var(--mobile-brand)}
.cover-row{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px}
.cover-row image{width:64px;height:64px;border-radius:8px;border:2px solid transparent;flex:none}
.cover-row image.active{border-color:var(--mobile-brand)}
.cover-row image.uploaded{border-color:var(--mobile-brand);background:var(--mobile-brand-soft)}
.upload-btn{margin-top:8px;min-height:var(--mobile-control-compact);padding:0 12px;border:1px solid var(--mobile-border);border-radius:8px;background:var(--mobile-surface);color:var(--mobile-brand);font-size:13px;font-weight:700;align-self:flex-start;display:flex;align-items:center;justify-content:center}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chips button{min-height:var(--mobile-control-compact);padding:0 14px;border-radius:8px;background:var(--mobile-surface-subtle);border:1px solid var(--mobile-border);color:var(--mobile-text);font-size:13px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;text-align:center}
.chips button.active{background:var(--mobile-brand);border-color:var(--mobile-brand);color:#fff}
.farm-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.farm-option{min-width:0;border:1px solid var(--mobile-border);border-radius:8px;overflow:hidden;position:relative;text-align:center;background:var(--mobile-surface)}
.farm-option image{width:100%;height:70px;display:block}
.farm-option text{display:block;padding:7px 6px;font-size:12px;line-height:1.4;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.farm-option.active{border-color:var(--mobile-brand);background:var(--mobile-brand-soft)}
.pkg-grid{display:grid;gap:8px}
.pkg-option{min-width:0;display:flex;align-items:center;gap:10px;border:1px solid var(--mobile-border);border-radius:8px;padding:8px;background:var(--mobile-surface)}
.pkg-option>view{min-width:0}
.pkg-option image{width:48px;height:48px;border-radius:8px;flex:none}
.pkg-option text{font-size:13px;font-weight:800;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pkg-option small{color:var(--mobile-price);font-size:12px;display:block;margin-top:3px}
.pkg-option.active{border-color:var(--mobile-brand);background:var(--mobile-brand-soft)}
.pkg-empty{color:var(--mobile-muted);font-size:12px;padding:8px 0}

.share-sheet{text-align:center}
.qr-box{width:min(220px,100%);aspect-ratio:1;margin:14px auto;border:1px solid var(--mobile-border);border-radius:8px;overflow:hidden;display:grid;place-items:center;background:var(--mobile-surface)}
.qr-box image{width:100%;height:100%}
.share-title{font-size:16px;line-height:1.45;font-weight:800;display:block;word-break:break-word}
.share-sub{color:var(--mobile-muted);font-size:12px;line-height:1.6;display:block;margin-top:6px}
.share-link{margin:14px 0 10px;padding:10px;border-radius:8px;background:var(--mobile-surface-subtle);border:1px solid var(--mobile-border);font-size:12px;line-height:1.5;word-break:break-all;color:var(--mobile-muted);text-align:left}
.qr-placeholder{width:160px;height:160px;display:grid;place-items:center;background:var(--mobile-surface-subtle);border:1px dashed var(--mobile-border);color:var(--mobile-muted);font-size:12px;border-radius:8px}

.data-list{display:grid;gap:8px}
.data-list>view{min-width:0;display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:10px;align-items:center;background:var(--mobile-surface-subtle);border:1px solid var(--mobile-border);border-radius:8px;padding:10px}
.data-list>view>view:nth-child(2){min-width:0}
.data-avatar{width:40px;height:40px;border-radius:8px;background:var(--mobile-brand-soft);display:grid;place-items:center;color:var(--mobile-brand)}
.data-list text,.data-list small{display:block}
.data-list text{font-size:12px;line-height:1.45;font-weight:800;word-break:break-all}
.data-list small{color:var(--mobile-muted);font-size:12px;line-height:1.5;margin-top:3px;word-break:break-word}
.data-list strong{max-width:88px;overflow:hidden;font-size:13px;font-weight:800;text-overflow:ellipsis;white-space:nowrap;font-variant-numeric:tabular-nums}
.data-list strong.income{color:var(--mobile-price)}
.data-list span{padding:3px 7px;border-radius:4px;font-size:12px;font-weight:700;white-space:nowrap}
.data-list span.bound{background:var(--mobile-brand-soft);color:var(--mobile-brand)}
.data-list span.pending{background:rgba(169,111,24,.12);color:var(--mobile-warning)}

/* uni-button defaults need explicit resets for stable H5 and mini-program layout. */
.sheet-head uni-button,.sheet-head button,.wallet-top uni-button,.quick-tools uni-button,.live-actions uni-button,.chips uni-button,.upload-btn{margin:0}
.sheet-head uni-button,.sheet-head button,.wallet-top uni-button{padding:0}
.sheet-head uni-button{display:grid;place-items:center;line-height:1}
.chips uni-button{display:inline-flex;align-items:center;justify-content:center;text-align:center}
.sheet-head uni-button::after,.chips uni-button::after,.quick-tools uni-button::after,.live-actions uni-button::after,.wallet-top uni-button::after,.primary-button::after,.upload-btn::after{border:none;background:none}
.cover-row .business-image{width:64px;height:64px;border-radius:8px;border:2px solid transparent;flex:none}
.cover-row .business-image.active{border-color:var(--mobile-brand)}
.cover-row .business-image.uploaded{border-color:var(--mobile-brand);background:var(--mobile-brand-soft)}
.farm-option .business-image{width:100%;height:70px}
.pkg-option .business-image{width:48px;height:48px;border-radius:8px;flex:none}

@media(min-width:700px){.app-shell{max-width:430px;margin:0 auto;box-shadow:0 0 0 1px var(--mobile-border)}.sheet-mask{justify-content:center}}
</style>
