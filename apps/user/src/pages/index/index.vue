<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import type { FarmStore, Product } from '@agritainment/shared'
import { installKeyboardButtonSupport, money, readPlatformEntities } from '@agritainment/shared'
import UiIcon from '../../components/UiIcon.vue'
import { getStorefrontTarget } from '../../config/storefronts'
import { useUserStore } from '../../stores/user'

const store = useUserStore()
const loading = ref(true)
const authorizing = ref(false)
const launchQuery: Record<string, string | undefined> = {}

onLoad((options) => {
  Object.assign(launchQuery, options || {})
})

const live = computed(() => store.currentLive)
const activePolicies = computed(() => Object.values(readPlatformEntities()?.policies || {}).filter((item) => item.enabled))
const liveFarms = computed(() => store.liveFarms)

function toast(title: string) {
  uni.showToast({ title, icon: 'none' })
}

function enterFarm(farm: FarmStore) {
  const target = getStorefrontTarget(farm.id)
  const query = `promoter=${store.promoterId}&promoterName=${encodeURIComponent(store.promoterName || '推客')}&live=${store.liveId}&userId=${store.userId}&openid=${store.auth.openid || ''}`
  // #ifdef H5
  if (target?.h5Url) {
    window.location.href = `${target.h5Url}#/pages/index/index?${query}`
  } else {
    toast('该门店暂未配置门店端')
  }
  // #endif
  // #ifdef MP-WEIXIN
  toast('演示小程序：请复制链接到门店端')
  // #endif
}

async function authorize() {
  if (authorizing.value) return
  authorizing.value = true
  try {
    await store.wechatLogin()
    store.applyLaunch(launchQuery)
  } finally {
    authorizing.value = false
  }
}

const sheet = ref<'pkg-detail' | 'live-watch' | null>(null)
const selectedPackage = ref<Product | null>(null)
const selectedPkgFarm = ref<FarmStore | null>(null)

function openPkgDetail(pkg: Product, farm: FarmStore) {
  if (!store.auth.isLoggedIn) {
    authorize()
    toast('请先授权登录后再查看')
    return
  }
  selectedPackage.value = pkg
  selectedPkgFarm.value = farm
  sheet.value = 'pkg-detail'
}

function openLiveWatch() {
  if (!store.auth.isLoggedIn) {
    authorize()
    toast('请先授权登录后再观看')
    return
  }
  sheet.value = 'live-watch'
}

function buyPackage() {
  if (!selectedPackage.value || !selectedPkgFarm.value) return
  if (!store.auth.isLoggedIn) {
    authorize()
    toast('请先授权登录后再购买')
    return
  }
  const target = getStorefrontTarget(selectedPkgFarm.value.id)
  if (!target?.h5Url) return toast('该门店暂未配置门店端')
  const pkg = selectedPackage.value
  const skuId = pkg.skus[0]?.id || ''
  const q = `productId=${pkg.id}&skuId=${skuId}&qty=1&promoter=${store.promoterId}&promoterName=${encodeURIComponent(store.promoterName || '推客')}&live=${store.liveId}&userId=${store.userId}&openid=${store.auth.openid || ''}`
  // #ifdef H5
  window.location.href = `${target.h5Url}#/pages/index/index?${q}`
  // #endif
  // #ifndef H5
  toast('演示小程序：请复制链接到门店端')
  // #endif
}

onMounted(async () => {
  installKeyboardButtonSupport()
  const appQuery = uni.getLaunchOptionsSync().query || {}
  Object.assign(launchQuery, appQuery)
  await store.initialize()
  store.applyLaunch(launchQuery)
  loading.value = false
})
</script>

<template>
  <view class="app-shell">
    <view v-if="loading" class="loading">正在加载直播间...</view>

    <view v-else-if="!store.liveId || !live" class="empty-page">
      <view class="empty-icon emoji-thumb">📱</view>
      <text class="empty-title">未找到直播间</text>
      <small class="empty-sub">请扫描推客直播间二维码进入，即可查看直播与门店套餐</small>
    </view>

    <view v-else-if="!store.auth.isLoggedIn" class="auth-page">
      <view class="auth-icon emoji-thumb">👋</view>
      <text class="auth-title">微信授权登录</text>
      <small class="auth-sub">授权后即可查看「{{ live.title }}」直播间并到店预订</small>
      <button class="auth-btn" :disabled="authorizing" @click="authorize">{{ authorizing ? '授权中...' : '微信一键授权' }}</button>
      <small class="auth-tip">模拟微信授权 · 小程序端走 uni.login 获取 openid</small>
    </view>

    <template v-else>
      <view class="live-hero" @click="openLiveWatch">
        <image :src="live.image" mode="aspectFit" />
        <view class="live-shade"></view>
        <view class="live-state"><span></span>{{ live.status === 'live' ? '直播中' : '预告' }}</view>
        <view class="live-info">
          <text class="live-title">{{ live.title }}</text>
          <small class="live-host">🎙 {{ live.host }}{{ live.hostRole ? ' · ' + live.hostRole : '' }} · {{ live.viewers.toLocaleString('zh-CN') }} 人观看</small>
        </view>
      </view>

      <view class="promoter-tip" v-if="store.promoterName">🎁 推客「{{ store.promoterName }}」推荐 · 到店预订可享专场优惠</view>
      <view class="attribution-row"><text>直播号 {{ store.liveId }}</text><text>推客ID {{ store.promoterId || '—' }}</text><text v-if="store.userId">用户ID {{ store.userId }}</text></view>
      <view v-if="activePolicies.length" class="policy-hint">🎯 中台价格策略：<b>{{ activePolicies.map((p) => p.name).join('、') }}</b> 已生效</view>

      <view class="section-head"><view><span></span><text>本场直播门店</text></view><small>{{ liveFarms.length }} 家</small></view>

      <view v-if="!liveFarms.length" class="empty-page small">
        <text class="empty-title">暂无门店</text>
        <small class="empty-sub">该直播间暂未绑定门店套餐</small>
      </view>

      <view class="farm-list">
        <view v-for="item in liveFarms" :key="item.farm!.id" class="farm-card">
          <image class="farm-cover" :src="item.farm!.image" mode="aspectFit" />
          <view class="farm-body">
            <text class="farm-name">{{ item.farm!.name }}</text>
            <small class="farm-meta">{{ item.farm!.region }} · {{ (item.farm!.tags || []).join(' · ') }}</small>
            <view class="pkg-list">
              <view v-for="pkg in item.packages" :key="pkg.id" class="pkg-row" @click="openPkgDetail(pkg, item.farm!)">
                <image :src="pkg.image" mode="aspectFit" />
                <view class="pkg-main"><text>{{ pkg.name }}</text><small>{{ (pkg.tags || []).join(' · ') }}</small></view>
                <strong>{{ money(pkg.price) }}</strong>
              </view>
              <view v-if="!item.packages.length" class="pkg-empty">该门店暂无套餐</view>
            </view>
            <button class="enter-btn" @click="enterFarm(item.farm!)">进店预订包厢 ›</button>
          </view>
        </view>
      </view>
    </template>

    <view v-if="sheet" class="sheet-mask" @click.self="sheet = null"><view class="sheet">
      <view class="sheet-head"><text>{{ sheet === 'pkg-detail' ? '套餐详情' : '直播观看' }}</text><button aria-label="关闭弹层" @click="sheet = null"><UiIcon name="x" :size="19" /></button></view>

      <view v-if="sheet === 'pkg-detail' && selectedPackage" class="pkg-detail">
        <image :src="selectedPackage.image" mode="aspectFit" />
        <text class="pd-name">{{ selectedPackage.name }}</text>
        <small class="pd-sub">{{ (selectedPackage.tags || []).join(' · ') }}</small>
        <view class="pd-row"><text>规格</text><strong>{{ selectedPackage.spec || '—' }}</strong></view>
        <view class="pd-row"><text>供应商</text><strong>{{ selectedPackage.supplier }}</strong></view>
        <view class="pd-sku"><view v-for="sku in selectedPackage.skus" :key="sku.id" class="pd-sku-item"><text>{{ sku.name }}</text><small>{{ money(sku.price) }} · 库存 {{ sku.stock }}</small></view></view>
        <view class="pd-buy-row"><strong class="pd-price">{{ money(selectedPackage.price) }}</strong><button class="pd-buy-btn" @click="buyPackage">立即购买</button></view>
      </view>

      <view v-else-if="sheet === 'live-watch' && live" class="live-watch">
        <image :src="live.image" mode="aspectFit" />
        <view class="lw-state"><span></span>{{ live.status === 'live' ? '直播中' : '预告' }}</view>
        <text class="lw-title">{{ live.title }}</text>
        <small class="lw-host">🎙 {{ live.host }}{{ live.hostRole ? ' · ' + live.hostRole : '' }} · {{ live.viewers.toLocaleString('zh-CN') }} 人观看</small>
        <view class="lw-section"><view><span></span><text>在播套餐</text></view></view>
        <view class="lw-pkgs">
          <view v-for="item in liveFarms" :key="item.farm!.id">
            <view v-for="pkg in item.packages" :key="pkg.id" class="lw-pkg" @click="openPkgDetail(pkg, item.farm!)">
              <image :src="pkg.image" mode="aspectFit" />
              <view class="lw-pkg-main"><text>{{ pkg.name }}</text><small>{{ (pkg.tags || []).join(' · ') }}</small></view>
              <strong>{{ money(pkg.price) }}</strong>
            </view>
          </view>
          <view v-if="!liveFarms.length" class="pkg-empty">该直播间暂未绑定门店套餐</view>
        </view>
      </view>
    </view></view>
  </view>
</template>

<style lang="scss">
.app-shell{min-height:100vh;background:#f7f3f2;color:#241b1e;padding-bottom:28px}
.emoji-thumb{display:grid;place-items:center}
.loading{min-height:100vh;display:grid;place-items:center;color:#8a7d80;font-size:12px}
.empty-page{min-height:80vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:24px;text-align:center}
.auth-page{min-height:80vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:24px;text-align:center}.auth-icon{width:72px;height:72px;border-radius:20px;background:#fdeef1;font-size:36px;color:#c83245}.auth-title{font-size:16px;font-weight:900}.auth-sub{color:#8a7d80;font-size:11px;line-height:1.6}.auth-btn{width:200px;min-height:44px;border-radius:22px;background:#c83245;color:#fff;font-size:14px;font-weight:800;margin-top:6px}.auth-tip{color:#b5a8ab;font-size:10px}.empty-page.small{min-height:160px}
.policy-hint{margin:10px 16px 0;padding:9px 12px;border-radius:7px;background:#fff3d6;border:1px solid #f0dfae;color:#8a5b12;font-size:11px;font-weight:700}.policy-hint b{color:#8a5b12}
.empty-icon{width:72px;height:72px;border-radius:20px;background:#fdeef1;font-size:36px;color:#c83245}
.empty-title{font-size:16px;font-weight:900}
.empty-sub{color:#8a7d80;font-size:11px;line-height:1.6}
.live-hero{position:relative;height:260px}
.live-hero>image{width:100%;height:100%;display:block}
.live-shade{position:absolute;inset:0;background:linear-gradient(to bottom,rgba(20,16,18,.08),rgba(20,16,18,.72))}
.live-state{position:absolute;top:16px;left:14px;padding:5px 10px;border-radius:999px;background:rgba(20,16,18,.6);color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;gap:5px}
.live-state span{width:7px;height:7px;border-radius:50%;background:#ff425b}
.live-info{position:absolute;left:14px;right:14px;bottom:14px;color:#fff}
.live-title{font-size:18px;font-weight:900;display:block;text-shadow:0 1px 8px rgba(0,0,0,.4)}
.live-host{display:block;margin-top:6px;font-size:11px;opacity:.92}
.attribution-row{margin:8px 14px 0;display:flex;gap:10px;flex-wrap:wrap;padding:6px 10px;border-radius:8px;background:#f4f0ee;color:#8a7d80;font-size:10px}.attribution-row text{font-weight:700}.promoter-tip{margin:12px 14px 0;padding:10px 12px;border-radius:10px;background:linear-gradient(135deg,#fff3d6,#ffe9b8);border:1px solid #eadcb8;color:#8a5b12;font-size:12px;font-weight:700}
.section-head{display:flex;align-items:center;justify-content:space-between;margin:20px 16px 10px}
.section-head span{width:4px;height:14px;border-radius:2px;background:#c83245;display:inline-block}
.section-head>view{display:flex;align-items:center;gap:7px;font-size:14px;font-weight:900}
.section-head small{color:#8a7d80;font-size:10px}
.farm-list{display:grid;gap:12px;padding:0 14px}
.farm-card{background:#fff;border:1px solid #efe6e6;border-radius:14px;overflow:hidden}
.farm-cover{width:100%;height:130px;display:block}
.farm-body{padding:12px}
.farm-name{font-size:15px;font-weight:900;display:block}
.farm-meta{display:block;color:#8a7d80;font-size:10px;margin-top:4px}
.pkg-list{display:grid;gap:8px;margin-top:10px}
.pkg-row{display:flex;align-items:center;gap:10px;background:#f8f4f4;border-radius:10px;padding:8px}
.pkg-row image{width:46px;height:46px;border-radius:8px;flex:none}
.pkg-main{flex:1;min-width:0}
.pkg-main text{font-size:12px;font-weight:800;display:block}
.pkg-main small{color:#8a7d80;font-size:9px;display:block;margin-top:2px}
.pkg-row strong{color:#c83245;font-size:13px;font-weight:800;flex:none}
.pkg-empty{color:#8a7d80;font-size:10px;padding:8px 0}
.enter-btn{width:100%;min-height:42px;margin-top:12px;border-radius:10px;background:#c83245;color:#fff;font-size:13px;font-weight:800}
@media(min-width:700px){.app-shell{max-width:430px;margin:0 auto;box-shadow:0 0 0 1px #e4dcdc}}

/* ===== 按钮文字水平垂直居中（uni-button 默认 display:block 文字顶对齐） ===== */
.auth-btn, .enter-btn { display: inline-flex; align-items: center; justify-content: center; text-align: center; margin-left: 0; margin-right: 0; }
.auth-btn::after, .enter-btn::after { border: none; background: none; }

/* ===== 弹层（套餐详情 / 直播观看） ===== */
.sheet-mask{position:fixed;inset:0;background:rgba(20,16,18,.45);z-index:30;display:flex;align-items:flex-end}
.sheet{width:100%;max-height:86vh;background:#fff;border-radius:18px 18px 0 0;display:flex;flex-direction:column;overflow:hidden}
.sheet-head{display:flex;align-items:center;justify-content:space-between;padding:16px 16px 10px;font-size:15px;font-weight:900;flex:none}
.sheet-head button{width:30px;height:30px;border-radius:50%;background:#f4f0ee;display:grid;place-items:center;padding:0;margin:0}
.sheet-head button::after{border:none;background:none}
.pkg-detail,.live-watch{padding:0 16px 24px;overflow-y:auto}
.pkg-detail>image{width:100%;height:200px;border-radius:12px;display:block}
.pd-name{display:block;font-size:17px;font-weight:900;margin-top:12px}
.pd-sub{display:block;color:#8a7d80;font-size:11px;margin-top:5px}
.pd-row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f2eeec;font-size:12px}
.pd-row text{color:#8a7d80}
.pd-row strong{font-weight:800;text-align:right}
.pd-sku{display:grid;gap:8px;margin-top:12px}
.pd-sku-item{display:flex;justify-content:space-between;align-items:center;background:#f8f4f4;border-radius:10px;padding:10px 12px}
.pd-sku-item text{font-size:13px;font-weight:800}
.pd-sku-item small{color:#c83245;font-size:11px}
.pd-buy-row{display:flex;align-items:center;justify-content:space-between;margin-top:16px}
.pd-price{color:#c83245;font-size:22px;font-weight:900}
.pd-buy-btn{min-height:44px;padding:0 26px;border-radius:22px;background:#c83245;color:#fff;font-size:14px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;margin:0}
.pd-buy-btn::after{border:none;background:none}
.live-watch>image{width:100%;height:220px;border-radius:12px;display:block}
.lw-state{position:relative;width:max-content;margin:-34px 0 0 10px;padding:5px 10px;border-radius:999px;background:rgba(20,16,18,.72);color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;gap:5px}
.lw-state span{width:7px;height:7px;border-radius:50%;background:#ff425b}
.lw-title{display:block;font-size:17px;font-weight:900;margin-top:12px}
.lw-host{display:block;color:#8a7d80;font-size:11px;margin-top:5px}
.lw-section{display:flex;align-items:center;gap:7px;margin:18px 0 10px;font-size:14px;font-weight:900}
.lw-section span{width:4px;height:14px;border-radius:2px;background:#c83245}
.lw-pkgs{display:grid;gap:8px}
.lw-pkg{display:flex;align-items:center;gap:10px;background:#f8f4f4;border-radius:10px;padding:8px}
.lw-pkg image{width:46px;height:46px;border-radius:8px;flex:none}
.lw-pkg-main{flex:1;min-width:0}
.lw-pkg-main text{font-size:12px;font-weight:800;display:block}
.lw-pkg-main small{color:#8a7d80;font-size:9px;display:block;margin-top:2px}
.lw-pkg strong{color:#c83245;font-size:13px;font-weight:800;flex:none}
@media(min-width:700px){.sheet-mask{justify-content:center}.sheet{max-width:430px;border-radius:18px}}
</style>
