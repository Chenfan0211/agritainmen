<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { FarmStore } from '@agritainment/shared'
import { installKeyboardButtonSupport, money } from '@agritainment/shared'
import UiIcon from '../../components/UiIcon.vue'
import { getStorefrontTarget } from '../../config/storefronts'
import { useUserStore } from '../../stores/user'

const store = useUserStore()
const loading = ref(true)

const live = computed(() => store.currentLive)
const liveFarms = computed(() => store.liveFarms)

function toast(title: string) {
  uni.showToast({ title, icon: 'none' })
}

function enterFarm(farm: FarmStore) {
  const target = getStorefrontTarget(farm.id)
  const query = `promoter=${store.promoterId}&promoterName=${encodeURIComponent(store.promoterName || '推客')}&live=${store.liveId}&userId=${store.userId}`
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

onMounted(async () => {
  installKeyboardButtonSupport()
  const query = uni.getLaunchOptionsSync().query || {}
  await store.initialize()
  store.applyLaunch(query as Record<string, string | undefined>)
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

    <template v-else>
      <view class="live-hero">
        <image :src="live.image" mode="aspectFill" />
        <view class="live-shade"></view>
        <view class="live-state"><span></span>{{ live.status === 'live' ? '直播中' : '预告' }}</view>
        <view class="live-info">
          <text class="live-title">{{ live.title }}</text>
          <small class="live-host">🎙 {{ live.host }}{{ live.hostRole ? ' · ' + live.hostRole : '' }} · {{ live.viewers.toLocaleString('zh-CN') }} 人观看</small>
        </view>
      </view>

      <view class="promoter-tip" v-if="store.promoterName">🎁 推客「{{ store.promoterName }}」推荐 · 到店预订可享专场优惠</view>

      <view class="section-head"><view><span></span><text>本场直播门店</text></view><small>{{ liveFarms.length }} 家</small></view>

      <view v-if="!liveFarms.length" class="empty-page small">
        <text class="empty-title">暂无门店</text>
        <small class="empty-sub">该直播间暂未绑定门店套餐</small>
      </view>

      <view class="farm-list">
        <view v-for="item in liveFarms" :key="item.farm!.id" class="farm-card">
          <image class="farm-cover" :src="item.farm!.image" mode="aspectFill" />
          <view class="farm-body">
            <text class="farm-name">{{ item.farm!.name }}</text>
            <small class="farm-meta">{{ item.farm!.region }} · {{ (item.farm!.tags || []).join(' · ') }}</small>
            <view class="pkg-list">
              <view v-for="pkg in item.packages" :key="pkg.id" class="pkg-row">
                <image :src="pkg.image" mode="aspectFill" />
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
  </view>
</template>

<style lang="scss">
.app-shell{min-height:100vh;background:#f7f3f2;color:#241b1e;padding-bottom:28px}
.emoji-thumb{display:grid;place-items:center}
.loading{min-height:100vh;display:grid;place-items:center;color:#8a7d80;font-size:12px}
.empty-page{min-height:80vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:24px;text-align:center}
.empty-page.small{min-height:160px}
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
.promoter-tip{margin:12px 14px 0;padding:10px 12px;border-radius:10px;background:linear-gradient(135deg,#fff3d6,#ffe9b8);border:1px solid #eadcb8;color:#8a5b12;font-size:12px;font-weight:700}
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
</style>
