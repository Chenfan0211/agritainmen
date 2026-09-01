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
        <view class="login-icon emoji-thumb">🧑‍💼</view>
        <text class="login-title">中选科技推客端</text>
        <text class="login-sub">创建直播 · 推广门店套餐 · 用户消费分成</text>
        <label class="login-field"><text>手机号</text><input v-model="loginPhone" type="number" maxlength="11" placeholder="请输入手机号" /></label>
        <label class="login-field"><text>密码</text><input v-model="loginPassword" type="password" placeholder="请输入密码" confirm-type="done" @confirm="submitLogin" /></label>
        <button class="primary-button" @click="submitLogin">登 录</button>
        <text class="login-hint">演示手机号 13800000000　密码 123456</text>
      </view>
    </view>

    <template v-else>
      <view class="promoter-head"><view class="head-row"><view class="profile"><view class="pav emoji-thumb">🧑‍💼</view><view><text class="pname">推客 · {{ store.promoter?.name }}</text><small class="plv">{{ promoterTypeLabel || '联盟推客' }}<text class="vip">{{ promoterLevelLabel }}</text></small></view></view><button class="head-share-btn" @click="sheet = 'shares'"><UiIcon name="badge-dollar-sign" :size="14" />分成明细</button></view></view>
      <view class="wallet-card">
        <view class="wallet-top"><view><small>消费分成累计（元）</small><strong>{{ money(totalShare) }}</strong></view></view>
        <view class="wallet-stats"><view><text>{{ money(pendingShare) }}</text><small>推广佣金<text v-if="store.promoter?.settled" class="settled-tag">已结算</text></small></view><view><text>{{ store.promoter?.fans ?? 0 }}</text><small>绑定用户</small></view><view><text>{{ store.myBoundUsers.filter((item) => item.status === 'bound').length }}</text><small>正式绑定</small></view></view>
      </view>

      <view class="quick-tools">
        <button @click="openCreateLive()"><UiIcon name="plus" :size="22" /><text>创建直播</text></button>
        <button @click="sheet = 'shares'"><UiIcon name="badge-dollar-sign" :size="22" /><text>我的分成</text></button>
        <button @click="sheet = 'bound-users'"><UiIcon name="users" :size="22" /><text>绑定用户</text></button>
      </view>

      <view class="section-head"><view><span></span><text>我的直播</text></view><small>{{ myLives.length }} 场</small></view>
      <view v-if="!myLives.length" class="empty">还没有直播，点击「创建直播」开始推广门店套餐</view>
      <view class="live-list">
        <view v-for="room in myLives" :key="room.id" class="live-card">
          <BusinessImage class="live-cover" :src="room.image" mode="aspectFit" />
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

      <view v-if="sheet === 'create-live'" class="create-live">
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

      <view v-else-if="sheet === 'share' && selectedLive" class="share-sheet">
        <view class="qr-box"><image v-if="qrDataUrl" :src="qrDataUrl" mode="aspectFit" /><view v-else class="qr-placeholder">二维码（H5 生成）</view></view>
        <text class="share-title">{{ selectedLive.title }}</text>
        <small class="share-sub">用户扫码进入用户端，仅可看到本直播间及其门店套餐</small>
        <view class="share-link">{{ liveLink(selectedLive) }}</view>
        <button class="primary-button" @click="copyLiveLink">📋 复制直播间链接</button>
      </view>

      <view v-else-if="sheet === 'shares'" class="data-list">
        <view v-if="!store.myShares.length" class="empty">暂无消费分成记录</view>
        <view v-for="record in store.myShares" :key="record.id"><view class="data-avatar"><UiIcon name="badge-dollar-sign" :size="18" /></view><view><text>{{ record.userId }} · {{ record.orderId }}</text><small>消费 {{ money(record.orderAmount) }} · 比例 {{ record.rate }}% · {{ record.createdAt }}</small></view><strong class="income">{{ money(record.amount) }}</strong></view>
      </view>

      <view v-else-if="sheet === 'bound-users'" class="data-list">
        <view v-if="!store.myBoundUsers.length" class="empty">暂无绑定用户，分享直播间二维码后用户扫码进入即临时绑定</view>
        <view v-for="item in store.myBoundUsers" :key="item.userId"><view class="data-avatar"><UiIcon name="user-round" :size="18" /></view><view><text>{{ item.userId }}</text><small>{{ item.status === 'bound' ? '已正式绑定（下单锁定）' : '临时绑定（下单后正式锁定）' }} · {{ item.boundAt || '-' }}</small></view><span :class="item.status === 'bound' ? 'bound' : 'pending'">{{ item.status === 'bound' ? '正式' : '临时' }}</span></view>
      </view>
    </view></view>
  </view>
</template>

<style lang="scss">
.app-shell{min-height:100vh;background:#f7f3f2;color:#241b1e;padding-bottom:24px}
.emoji-thumb{display:grid;place-items:center}
.login-page{min-height:100vh;display:grid;place-items:center;padding:24px}
.login-card{width:100%;max-width:340px;background:#fff;border:1px solid #efe6e6;border-radius:18px;padding:26px 22px;display:flex;flex-direction:column;gap:10px}
.login-icon{width:64px;height:64px;border-radius:18px;background:#fdeef1;font-size:32px;margin:0 auto}
.login-title{font-size:18px;font-weight:900;text-align:center;margin-top:6px}
.login-sub{text-align:center;color:#8a7d80;font-size:12px}
.login-field{display:flex;flex-direction:column;gap:6px;margin-top:6px}
.login-field text{font-size:12px;font-weight:700}
.login-field input{height:42px;border:1px solid #eee;border-radius:8px;padding:0 12px;font-size:13px}
.primary-button{height:44px;border-radius:10px;background:#c83245;color:#fff;font-weight:800;font-size:14px;margin-top:8px;display:flex;align-items:center;justify-content:center;text-align:center}
.login-hint{text-align:center;color:#b5a8ab;font-size:12px;margin-top:4px}
.promoter-head{background:linear-gradient(135deg,#3a566f,#243a4f);color:#fff;padding:28px 18px 22px}
.head-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.head-share-btn{display:inline-flex;align-items:center;justify-content:center;gap:4px;min-height:30px;padding:0 12px;border-radius:999px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.35);color:#fff;font-size:13px;font-weight:700;flex:none;transition:background .15s ease,transform .15s ease}
.head-share-btn:active{background:rgba(255,255,255,.26);transform:translateY(-1px)}
.profile{display:flex;align-items:center;gap:12px}
.pav{width:50px;height:50px;border-radius:50%;background:rgba(255,255,255,.16);font-size:26px}
.pname{font-size:17px;font-weight:900;display:block}
.plv{font-size:12px;opacity:.8;display:block;margin-top:4px}
.vip{display:inline-block;margin-left:6px;padding:1px 6px;border-radius:4px;background:#e8b13f;color:#4a2f00;font-size:12px}
.wallet-card{margin:14px 14px 0;padding:14px;background:#fff;border:1px solid #efe6e6;border-radius:14px}
.wallet-top{display:flex;align-items:center;justify-content:space-between}
.wallet-top small,.wallet-top strong{display:block}
.wallet-top strong{font-size:28px;color:#c83245;margin-top:4px}

.wallet-stats{display:grid;grid-template-columns:repeat(3,1fr);margin-top:14px;text-align:center}
.wallet-stats text,.wallet-stats small{display:block}
.wallet-stats text{font-size:15px;font-weight:800}
.wallet-stats small{color:#8a7d80;font-size:12px;margin-top:3px}
.wallet-stats .settled-tag{display:inline-block;margin-left:4px;padding:1px 5px;border-radius:4px;background:#e8f3ec;color:#17633f;font-size:12px;font-weight:700}
.quick-tools{margin:14px 14px 0;display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.quick-tools button{background:#fff;border:1px solid #efe6e6;border-radius:14px;padding:14px 8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;font-size:13px;font-weight:800;color:#3a566f;box-shadow:0 6px 16px -12px rgba(58,86,111,.45);transition:transform .15s ease,box-shadow .15s ease}
.quick-tools button:active{transform:translateY(-1px) scale(.98);box-shadow:0 10px 20px -12px rgba(58,86,111,.55)}
.section-head{display:flex;align-items:center;justify-content:space-between;margin:20px 16px 10px}
.section-head span{width:4px;height:14px;border-radius:2px;background:#c83245;display:inline-block}
.section-head>view{display:flex;align-items:center;gap:7px;font-size:14px;font-weight:900}
.section-head small{color:#8a7d80;font-size:12px}
.empty{min-height:90px;display:grid;place-items:center;color:#8a7d80;font-size:12px;margin:0 16px}
.live-list{display:grid;gap:12px;padding:0 14px}
.live-card{background:#fff;border:1px solid #efe6e6;border-radius:14px;overflow:hidden}
.live-cover{width:100%;height:140px;display:block}
.live-body{padding:11px 12px}
.live-title-row{display:flex;align-items:center;gap:8px}
.live-title{font-size:14px;font-weight:900;flex:1;min-width:0}
.live-title-row span{flex:none;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:700}
.live-title-row span.live{background:#fdeef1;color:#c83245}
.live-title-row span.preview{background:#eef3f8;color:#45658d}
.live-meta{display:block;color:#8a7d80;font-size:12px;margin-top:5px}
.live-actions{display:flex;gap:8px;margin-top:10px}
.live-actions .mini{min-height:34px;padding:0 10px;border-radius:8px;background:#f4f0ee;font-size:13px;font-weight:700;flex:1;display:flex;align-items:center;justify-content:center;text-align:center;line-height:1.35;transition:filter .15s ease}
.live-actions .mini:active{filter:brightness(.94)}
.live-actions .mini::after{border:none}
.live-actions .mini.accent{background:#3a566f;color:#fff}
.live-actions .mini.danger{background:#fdeef1;color:#c83245}
.sheet-mask{position:fixed;inset:0;background:rgba(20,16,18,.45);z-index:30;display:flex;align-items:flex-end}
.sheet{width:100%;max-height:86vh;background:#fff;border-radius:18px 18px 0 0;display:flex;flex-direction:column}
.sheet-head{display:flex;align-items:center;justify-content:space-between;padding:16px 16px 10px;font-size:15px;font-weight:900}
.sheet-head button{width:30px;height:30px;border-radius:50%;background:#f4f0ee;display:grid;place-items:center}
.create-live,.share-sheet,.data-list{padding:4px 16px 22px;overflow-y:auto}
.field{display:flex;flex-direction:column;gap:8px;margin-top:12px}
.field>text{font-size:12px;font-weight:800;color:#4a3f42}
.field input{height:42px;border:1px solid #eee;border-radius:8px;padding:0 12px;font-size:13px}
.cover-row{display:flex;gap:8px;overflow-x:auto}
.cover-row image{width:64px;height:64px;border-radius:10px;border:2px solid transparent;flex:none}
.cover-row image.active{border-color:#c83245}
.cover-row image.uploaded{border-color:#17633f;background:#f0f6f0}.upload-btn{margin-top:8px;min-height:32px;padding:0 12px;border:1px solid #e5d8da;border-radius:8px;background:#fff7f8;color:#c83245;font-size:13px;font-weight:700;align-self:flex-start;display:flex;align-items:center;justify-content:center}
.chips{display:flex;gap:8px}
.chips button{min-height:34px;padding:0 14px;border-radius:17px;background:#f4f0ee;font-size:13px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;text-align:center}
.chips button.active{background:#c83245;color:#fff}
.farm-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.farm-option{border:1px solid #eee;border-radius:10px;overflow:hidden;position:relative;text-align:center}
.farm-option image{width:100%;height:52px;display:block}
.farm-option text{display:block;padding:5px 4px;font-size:12px;font-weight:700}
.farm-option.active{border-color:#c83245;background:#fdeef1}
.pkg-grid{display:grid;gap:8px}
.pkg-option{display:flex;align-items:center;gap:10px;border:1px solid #eee;border-radius:10px;padding:8px}
.pkg-option image{width:44px;height:44px;border-radius:8px;flex:none}
.pkg-option text{font-size:12px;font-weight:800;display:block}
.pkg-option small{color:#c83245;font-size:12px;display:block;margin-top:2px}
.pkg-option.active{border-color:#c83245;background:#fdeef1}
.pkg-empty{color:#8a7d80;font-size:12px;padding:8px 0}
.share-sheet{text-align:center}
.qr-box{width:220px;height:220px;margin:10px auto 14px;border:1px solid #eee;border-radius:16px;overflow:hidden;display:grid;place-items:center}
.qr-box image{width:100%;height:100%}
.share-title{font-size:16px;font-weight:900;display:block}
.share-sub{color:#8a7d80;font-size:12px;display:block;margin-top:6px}
.share-link{margin:14px 0 10px;padding:10px;border-radius:8px;background:#f4f0ee;font-size:12px;word-break:break-all;color:#5a4d50}
.qr-placeholder{width:160px;height:160px;display:grid;place-items:center;background:repeating-linear-gradient(45deg,#fdeef1 0 5px,#fff 5px 10px);color:#c83245;font-size:12px;border-radius:8px}
.data-list{display:grid;gap:8px}
.data-list>view{display:grid;grid-template-columns:36px 1fr auto;gap:10px;align-items:center;background:#f8f4f4;border-radius:10px;padding:10px}
.data-avatar{width:36px;height:36px;border-radius:50%;background:#fdeef1;display:grid;place-items:center;color:#c83245}
.data-list text,.data-list small{display:block}
.data-list text{font-size:12px;font-weight:800}
.data-list small{color:#8a7d80;font-size:12px;margin-top:3px}
.data-list strong{font-size:12px;font-weight:800}
.data-list strong.income{color:#17633f}
.data-list span{padding:3px 7px;border-radius:4px;font-size:12px;font-weight:700}
.data-list span.bound{background:#e8f3ec;color:#17633f}
.data-list span.pending{background:#fff3d6;color:#8a5b12}
@media(min-width:700px){.app-shell{max-width:430px;margin:0 auto;box-shadow:0 0 0 1px #e4dcdc}.sheet-mask{justify-content:center}.sheet{max-width:430px}}

/* ===== uni-button 默认样式修正：关闭按钮图标居中 / 按钮组居左 / 清除默认伪元素 ===== */
.sheet-head uni-button, .sheet-head button, .wallet-top uni-button, .quick-tools uni-button, .live-actions uni-button, .chips uni-button, .upload-btn { margin: 0; }
.sheet-head uni-button, .sheet-head button, .wallet-top uni-button { padding: 0; }
.sheet-head uni-button { display: grid; place-items: center; line-height: 1; }
.chips uni-button { display: inline-flex; align-items: center; justify-content: center; text-align: center; }
.sheet-head uni-button::after, .chips uni-button::after, .quick-tools uni-button::after, .live-actions uni-button::after, .wallet-top uni-button::after, .primary-button::after, .upload-btn::after { border: none; background: none; }
.cover-row .business-image{width:64px;height:64px;border-radius:10px;border:2px solid transparent;flex:none}.cover-row .business-image.active{border-color:#c83245}.cover-row .business-image.uploaded{border-color:#17633f;background:#f0f6f0}.farm-option .business-image{width:100%;height:52px}.pkg-option .business-image{width:44px;height:44px;border-radius:8px;flex:none}
</style>
