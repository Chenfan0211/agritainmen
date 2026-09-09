<script setup lang="ts">
import fullscreenIcon from 'lucide-static/icons/maximize.svg?url'
import infoIcon from 'lucide-static/icons/info.svg?url'
import logoutIcon from 'lucide-static/icons/log-out.svg?url'
import refreshIcon from 'lucide-static/icons/refresh-cw.svg?url'
import resetIcon from 'lucide-static/icons/rotate-ccw.svg?url'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { DASHBOARD_REGIONS, dashboardRegion, dashboardRegionChildren, dashboardRegionPath, type DashboardFarmProfile, type DashboardModule, type DashboardRisk, type DashboardRiskLevel, type DashboardSuggestion } from '@agritainment/shared'
import { UI_TYPOGRAPHY } from '@agritainment/ui'
import DashboardChart from '../../components/DashboardChart.vue'
import TencentMap from '../../components/TencentMap.vue'
import type { EChartsOption } from '../../echarts'
import { canSelectDashboardRegion, useDashboardStore, type DashboardRangeKey } from '../../stores/dashboard'

const store = useDashboardStore()
const activeModule = ref<DashboardModule>('overview')
const showDefinitions = ref(false)
const selectedRisk = ref<DashboardRisk | null>(null)
const selectedFarm = ref<DashboardFarmProfile | null>(null)
const pageError = ref('')
const overlayTrigger = ref<HTMLElement | null>(null)
const overlayDialog = ref<HTMLElement | null>(null)
const mapChart = ref<{ reset: () => void } | null>(null)

const moduleLabels: Record<DashboardModule, string> = {
  overview: '综合总览',
  'regional-comparison': '区域对比',
  'regulatory-monitoring': '监管监测',
  'industry-empowerment': '产业赋能'
}
const rangeLabels: Record<DashboardRangeKey, string> = { '7d': '近7天', '30d': '近30天', '90d': '近90天', year: '本年度' }
const snapshot = computed(() => store.snapshot)
const currentRegion = computed(() => dashboardRegion(store.regionCode))
const currentRegionPath = computed(() => dashboardRegionPath(store.regionCode))
const currentRegionChildren = computed(() => dashboardRegionChildren(store.regionCode))
const cityOptions = computed(() => store.principal ? DASHBOARD_REGIONS.filter((region) => region.level === 'city' && canSelectDashboardRegion(store.principal!, region.code)) : [])
const selectedCityCode = computed(() => store.regionCode.length >= 4 ? store.regionCode.slice(0, 4) : '')
const districtOptions = computed(() => selectedCityCode.value ? dashboardRegionChildren(selectedCityCode.value).filter((region) => store.principal && canSelectDashboardRegion(store.principal, region.code)) : [])
const canSelectProvince = computed(() => !!store.principal && canSelectDashboardRegion(store.principal, '43'))
const mapTitle = computed(() => currentRegion.value?.level === 'province' ? '湖南省城市经营分布' : `${currentRegion.value?.name || '当前区域'}门店经营分布`)
const coverageLabel = computed(() => currentRegion.value?.level === 'province' ? '覆盖地市' : currentRegion.value?.level === 'city' ? '覆盖县区' : '当前县区')
const availableModules = computed<DashboardModule[]>(() => snapshot.value?.modules || ['overview'])
const generatedTime = computed(() => snapshot.value ? new Date(snapshot.value.generatedAt).toLocaleString('zh-CN', { hour12: false }) : '--')
const hasBusinessData = computed(() => !!snapshot.value && (snapshot.value.overview.storeCount > 0 || snapshot.value.overview.transactionOrderCount > 0 || snapshot.value.inventory.availableSkuCount > 0))
const staleDomains = computed(() => snapshot.value?.domainFreshness.filter((item) => item.stale) || [])
const unknownDomains = computed(() => snapshot.value?.domainFreshness.filter((item) => !item.updatedAt) || [])
const dataStatus = computed(() => {
  const supplementCount = snapshot.value?.demoSupplement?.datasets.length || 0
  if (supplementCount) return { tone: 'demo', text: `演示补全 ${supplementCount} 类`, title: `补全数据集：${snapshot.value?.demoSupplement?.datasets.join('、')}` }
  if (staleDomains.value.length) return { tone: 'stale', text: `数据过期 ${staleDomains.value.length} 类`, title: staleDomains.value.map((item) => item.domain).join('、') }
  if (unknownDomains.value.length) return { tone: 'unknown', text: `时间未知 ${unknownDomains.value.length} 类`, title: unknownDomains.value.map((item) => item.domain).join('、') }
  return { tone: 'live', text: '真实共享数据', title: '当前指标来自其他业务端共享数据' }
})
const tencentMapKey = import.meta.env.VITE_TENCENT_MAP_JS_KEY || ''
const tencentMapStyleId = import.meta.env.VITE_TENCENT_MAP_STYLE_ID || ''

watch(availableModules, (modules) => {
  if (!modules.includes(activeModule.value)) activeModule.value = 'overview'
})

const kpis = computed(() => {
  const overview = snapshot.value?.overview
  return [
    { key: 'stores', label: '门店总数', value: overview?.storeCount || 0, unit: '家', note: `经营中 ${snapshot.value?.storeStatus.active || 0} 家`, tone: 'cyan' },
    { key: 'suppliers', label: '合作供应商', value: overview?.supplierCount || 0, unit: '家', note: `在售品类 ${snapshot.value?.inventory.categoryCount || 0} 类`, tone: 'blue' },
    { key: 'gmv', label: '消费交易额', value: money(overview?.transactionAmount || 0), unit: '元', note: `${rangeLabels[store.rangeKey]}有效交易`, tone: 'amber' },
    { key: 'orders', label: '消费订单量', value: overview?.transactionOrderCount || 0, unit: '单', note: `待归属 ${snapshot.value?.unattributedDataCount || 0} 单`, tone: 'green' },
    { key: 'staff', label: '在岗店员', value: overview?.activeStaffCount || 0, unit: '人', note: '仅启用店员账号', tone: 'violet' },
    { key: 'risks', label: '监管风险', value: overview?.riskCount || 0, unit: '项', note: `未定位门店 ${snapshot.value?.unlocatedStoreCount || 0} 家`, tone: 'red' }
  ]
})

const storeStatusOption = computed<EChartsOption>(() => ({
  aria: { enabled: true, description: '门店经营状态分布图' },
  tooltip: { trigger: 'item', textStyle: { fontSize: UI_TYPOGRAPHY.chartTooltip } },
  legend: { bottom: 0, textStyle: { color: '#9cb3bd', fontSize: UI_TYPOGRAPHY.chartLabel }, itemWidth: 8, itemHeight: 8 },
  series: [{
    type: 'pie', radius: ['52%', '72%'], center: ['50%', '42%'], label: { show: false },
    itemStyle: { borderColor: '#0c1b28', borderWidth: 2 },
    data: [
      { name: '经营中', value: snapshot.value?.storeStatus.active || 0, itemStyle: { color: '#24d4c4' } },
      { name: '筹备中', value: snapshot.value?.storeStatus.pending || 0, itemStyle: { color: '#f3b33d' } },
      { name: '已停用', value: snapshot.value?.storeStatus.paused || 0, itemStyle: { color: '#667d8d' } }
    ]
  }]
}))

const fulfillmentOption = computed<EChartsOption>(() => ({
  aria: { enabled: true, description: '履约健康指标图' },
  series: [{
    type: 'gauge', startAngle: 205, endAngle: -25, min: 0, max: 100, center: ['50%', '56%'], radius: '90%',
    progress: { show: true, width: 10, itemStyle: { color: '#48a8ff' } }, axisLine: { lineStyle: { width: 10, color: [[1, '#203747']] } },
    pointer: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
    anchor: { show: false }, title: { offsetCenter: [0, '50%'], color: '#9cb3bd', fontSize: UI_TYPOGRAPHY.chartLabel },
    detail: { valueAnimation: true, formatter: () => rateText(snapshot.value?.fulfillment.rate), color: '#eaf7fa', fontSize: 23, offsetCenter: [0, '4%'] },
    data: [{ value: snapshot.value?.fulfillment.rate ?? 0, name: `超时 ${snapshot.value?.fulfillment.overdueCount || 0} · 异常 ${snapshot.value?.fulfillment.abnormalCount || 0}` }]
  }]
}))

const inventoryOption = computed<EChartsOption>(() => ({
  aria: { enabled: true, description: '供给与库存结构图' },
  grid: { left: 64, right: 12, top: 12, bottom: 18 },
  xAxis: { type: 'value', axisLabel: { color: '#a9bec8', fontSize: UI_TYPOGRAPHY.chartLabel, formatter: (value: number) => Math.abs(value) >= 10000 ? `${Math.round(value / 10000)}万` : `${value}` }, splitLine: { lineStyle: { color: '#193040' } } },
  yAxis: { type: 'category', data: ['低库存SKU', '可售SKU', '库存总量'], axisLabel: { color: '#b5c9d1', fontSize: UI_TYPOGRAPHY.chartLabel }, axisTick: { show: false }, axisLine: { show: false } },
  series: [{ type: 'bar', barWidth: 8, data: [
    { value: snapshot.value?.inventory.lowStockSkuCount || 0, itemStyle: { color: '#f26464' } },
    { value: snapshot.value?.inventory.availableSkuCount || 0, itemStyle: { color: '#48a8ff' } },
    { value: snapshot.value?.inventory.totalStock || 0, itemStyle: { color: '#24d4c4' } }
  ], label: { show: true, position: 'right', color: '#d9e8ec', fontSize: UI_TYPOGRAPHY.chartLabel } }]
}))

const gapOption = computed<EChartsOption>(() => {
  const items = (snapshot.value?.categoryGaps || []).slice(0, 5).reverse()
  return {
    aria: { enabled: true, description: '品类需求占比与库存占比缺口图' },
    grid: { left: 70, right: 30, top: 8, bottom: 20 },
    xAxis: { type: 'value', axisLabel: { color: '#a9bec8', fontSize: UI_TYPOGRAPHY.chartLabel, formatter: '{value}%' }, splitLine: { lineStyle: { color: '#193040' } } },
    yAxis: { type: 'category', data: items.map((item) => item.category), axisLabel: { color: '#b5c9d1', fontSize: UI_TYPOGRAPHY.chartLabel, width: 58, overflow: 'truncate' }, axisTick: { show: false }, axisLine: { show: false } },
    series: [{ type: 'bar', barWidth: 8, data: items.map((item) => ({ value: item.gap, itemStyle: { color: item.gap > 20 ? '#f3b33d' : item.gap < 0 ? '#48a8ff' : '#24d4c4' } })), label: { show: true, position: 'right', formatter: '{c}%', color: '#e3f0f3', fontSize: UI_TYPOGRAPHY.chartLabel } }]
  }
})

const trendOption = computed<EChartsOption>(() => ({
  aria: { enabled: true, description: '消费交易额与订单量趋势图' },
  tooltip: { trigger: 'axis', textStyle: { fontSize: UI_TYPOGRAPHY.chartTooltip } },
  grid: { left: 48, right: 22, top: 20, bottom: 26 },
  xAxis: { type: 'category', boundaryGap: false, data: (snapshot.value?.trend || []).map((item) => item.date.slice(5)), axisLabel: { color: '#a9bec8', fontSize: UI_TYPOGRAPHY.chartLabel }, axisLine: { lineStyle: { color: '#264252' } }, axisTick: { show: false } },
  yAxis: [
    { type: 'value', axisLabel: { color: '#a9bec8', fontSize: UI_TYPOGRAPHY.chartLabel }, splitLine: { lineStyle: { color: '#193040' } } },
    { type: 'value', axisLabel: { color: '#a9bec8', fontSize: UI_TYPOGRAPHY.chartLabel }, splitLine: { show: false } }
  ],
  series: [
    { name: '交易额', type: 'line', smooth: true, symbol: 'circle', symbolSize: 4, lineStyle: { color: '#24d4c4', width: 2 }, itemStyle: { color: '#24d4c4' }, areaStyle: { color: 'rgba(36,212,196,.12)' }, data: (snapshot.value?.trend || []).map((item) => item.amount) },
    { name: '订单量', type: 'bar', yAxisIndex: 1, barWidth: 7, itemStyle: { color: '#3f7fb1' }, data: (snapshot.value?.trend || []).map((item) => item.orderCount) }
  ]
}))

const ranking = computed(() => (snapshot.value?.regionRanking || []).slice(0, 5))
const orderedRisks = computed(() => {
  const levelOrder: Record<DashboardRiskLevel, number> = { critical: 0, warning: 1, notice: 2 }
  return [...(snapshot.value?.risks || [])].sort((a, b) => levelOrder[a.level] - levelOrder[b.level] || b.count - a.count)
})
const topRisks = computed(() => orderedRisks.value.slice(0, 4))
const topSuggestions = computed(() => (snapshot.value?.suggestions || []).slice(0, 3))
const maxRankAmount = computed(() => Math.max(1, ...ranking.value.map((item) => item.transactionAmount)))

const metricDefinitions = [
  ['门店数', '授权区域内运营主数据中的全部门店，按经营中、筹备中和停用细分。'],
  ['在岗店员', '授权门店下角色为 staff 且 enabled=true 的账号，不包含店主和停用账号。'],
  ['消费交易额', '有效 C 端订单、未退款券订单及已确认/完成预约金额，排除取消、退款和 DEMO- 演示订单。'],
  ['预约金额', '已确认或已完成预约只有在门店填写实际金额后才计入交易额；历史缺失金额仍计订单量并进入数据质量风险。'],
  ['退款扣除', 'C 端订单按有效子订单净额统计，已完成退款的子订单金额从交易额扣除，全额退款订单不计有效订单量。'],
  ['待归属数据', '无法关联门店或行政区的数据只在省级汇总中标记为待归属，不进入市县排行。'],
  ['履约率', '已签收或完成履约单数 / 有效履约单数。'],
  ['券核销率', '已核销券数 / 已支付且未退款券数。'],
  ['供需缺口', '统计周期需求数量占比减去当前可售库存占比。'],
  ['空分母', '履约、售后或券核销没有可计算样本时显示 --，不推断为 0% 或 100%。']
]

function money(value: number) {
  return Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

function rateText(value: number | null | undefined) {
  return value === null || value === undefined ? '--' : `${value}%`
}

function growthText(value: number | null | undefined) {
  if (value === null || value === undefined) return '--'
  return `${value > 0 ? '+' : ''}${value}%`
}

function suggestionEvidence(item: DashboardSuggestion) {
  return item.evidence.map((evidence) => `${evidence.metric} ${evidence.value}${evidence.unit || ''}${evidence.threshold === undefined ? '' : ` / 阈值 ${evidence.threshold}${evidence.unit || ''}`}`).join(' · ')
}

function riskLabel(level: DashboardRiskLevel) {
  return level === 'critical' ? '高风险' : level === 'warning' ? '关注' : '提示'
}

function farmStatusLabel(status?: string) {
  return status === 'active' ? '经营中' : status === 'pending' ? '筹备中' : status === 'paused' ? '已停用' : '--'
}

function handleCity(event: Event) {
  const code = (event.target as HTMLSelectElement).value
  if (code) navigateRegion(code)
  else if (canSelectProvince.value) navigateRegion('43')
}
function handleDistrict(event: Event) {
  const code = (event.target as HTMLSelectElement).value
  if (code) navigateRegion(code)
  else if (selectedCityCode.value) navigateRegion(selectedCityCode.value)
}
function navigateRegion(regionCode: string) {
  return store.setRegion(regionCode)
}
function handleRange(event: Event) {
  store.setRange((event.target as HTMLSelectElement).value as DashboardRangeKey)
}
async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen()
    else await document.exitFullscreen()
    pageError.value = ''
  } catch (error) {
    pageError.value = error instanceof Error ? error.message : '全屏切换失败'
  }
}

function handleFarmSelect(farmId: string) {
  const farm = snapshot.value?.farmProfiles.find((item) => item.farmId === farmId)
  if (!farm) return
  selectedFarm.value = farm
  rememberOverlayTrigger()
}

function resetMapView() {
  mapChart.value?.reset()
}

function rememberOverlayTrigger(event?: Event) {
  overlayTrigger.value = (event?.currentTarget as HTMLElement | null) || (document.activeElement as HTMLElement | null)
  nextTick(() => overlayDialog.value?.focus())
}

function openDefinitions(event: Event) {
  showDefinitions.value = true
  rememberOverlayTrigger(event)
}

function openRisk(risk: DashboardRisk, event: Event) {
  selectedRisk.value = risk
  rememberOverlayTrigger(event)
}

function closeOverlay() {
  showDefinitions.value = false
  selectedRisk.value = null
  selectedFarm.value = null
  nextTick(() => overlayTrigger.value?.focus())
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && (showDefinitions.value || selectedRisk.value || selectedFarm.value)) closeOverlay()
}

function handleChartError(message: string) {
  pageError.value = message || '图表加载失败'
}

function logout() {
  store.logout()
  uni.reLaunch({ url: '/pages/login/index' })
}

onMounted(() => {
  if (!store.authenticated && !store.restoreSession()) {
    uni.reLaunch({ url: '/pages/login/index' })
    return
  }
  store.refresh()
  store.startSubscription()
  document.addEventListener('keydown', handleDocumentKeydown)
})
onBeforeUnmount(() => {
  store.stopSubscription()
  document.removeEventListener('keydown', handleDocumentKeydown)
})
</script>

<template>
  <view class="dashboard-shell" :class="{ 'has-data-error': snapshot && (store.lastError || pageError) }">
    <header class="topbar">
      <view class="brand-block">
        <view class="brand-mark"><span></span><span></span><span></span></view>
        <view>
          <h1>产业数据监管与赋能驾驶舱</h1>
          <p>农业产业协同数据中心</p>
        </view>
      </view>

      <nav class="module-nav" aria-label="驾驶舱模块">
        <button v-for="module in availableModules" :key="module" role="button" tabindex="0" :class="{ active: activeModule === module }" @click="activeModule = module">
          {{ moduleLabels[module] }}
        </button>
      </nav>

      <view class="toolbar">
        <select :value="selectedCityCode" aria-label="市州范围" @change="handleCity">
          <option v-if="canSelectProvince" value="">湖南全省</option>
          <option v-for="region in cityOptions" :key="region.code" :value="region.code">{{ region.name }}</option>
        </select>
        <select :value="store.regionCode.length === 6 ? store.regionCode : ''" aria-label="县区范围" :disabled="!selectedCityCode" @change="handleDistrict">
          <option value="">全部县区</option>
          <option v-for="region in districtOptions" :key="region.code" :value="region.code">{{ region.name }}</option>
        </select>
        <select :value="store.rangeKey" aria-label="时间范围" @change="handleRange">
          <option v-for="(label, key) in rangeLabels" :key="key" :value="key">{{ label }}</option>
        </select>
        <view class="data-status" :class="`data-${dataStatus.tone}`" role="status" :title="dataStatus.title">{{ dataStatus.text }}</view>
        <button class="icon-button" role="button" aria-label="指标口径" title="指标口径" @click="openDefinitions"><img :src="infoIcon" alt="" /></button>
        <button class="icon-button" role="button" aria-label="刷新数据" title="刷新数据" :class="{ spinning: store.refreshing }" @click="store.refresh"><img :src="refreshIcon" alt="" /></button>
        <button class="icon-button" role="button" aria-label="切换全屏" title="切换全屏" @click="toggleFullscreen"><img :src="fullscreenIcon" alt="" /></button>
        <view class="principal-badge"><small>{{ store.principal?.role === 'leader' ? '领导' : store.principal?.role === 'regulator' ? '监管' : '产业服务' }}</small><strong :title="store.principal?.name">{{ store.principal?.name }}</strong></view>
        <button class="icon-button logout-danger" role="button" aria-label="退出登录" title="退出登录" @click="logout"><img :src="logoutIcon" alt="" /></button>
      </view>
    </header>

    <view v-if="store.refreshing && !snapshot" class="page-state" role="status">正在汇总授权区域数据...</view>
    <view v-else-if="!snapshot && (store.lastError || pageError)" class="page-state page-state-error" role="alert">{{ store.lastError || pageError }}</view>
    <view v-if="snapshot && (store.lastError || pageError)" class="data-error-strip" role="alert" data-visual-state="data-error">
      <strong>数据更新提示</strong>
      <span>当前展示缓存数据 · {{ store.lastError || pageError }}</span>
      <small v-if="store.lastSuccessfulAt">最后成功 {{ new Date(store.lastSuccessfulAt).toLocaleString('zh-CN', { hour12: false }) }}</small>
    </view>

    <section class="kpi-grid" aria-label="核心指标">
      <article v-for="kpi in kpis" :key="kpi.key" class="kpi" :class="`tone-${kpi.tone}`">
        <view class="kpi-heading"><span>{{ kpi.label }}</span><i></i></view>
        <view class="kpi-value"><strong>{{ kpi.value }}</strong><small>{{ kpi.unit }}</small></view>
        <view class="kpi-note">{{ kpi.note }}</view>
      </article>
    </section>

    <template v-if="activeModule === 'overview'">
    <main class="main-grid" data-module-view="overview">
      <section class="side-column left-column">
        <article class="panel">
          <header class="panel-header"><h2>主体经营状态</h2><span>{{ snapshot?.overview.storeCount || 0 }} 家门店</span></header>
          <view class="panel-body chart-body"><DashboardChart id="store-status-chart" :option="storeStatusOption" aria-label="门店经营状态" @error="handleChartError" /></view>
        </article>
        <article class="panel">
          <header class="panel-header"><h2>履约健康</h2><span>{{ snapshot?.fulfillment.completed || 0 }}/{{ snapshot?.fulfillment.total || 0 }} 完成</span></header>
          <view class="panel-body chart-body"><DashboardChart id="fulfillment-chart" :option="fulfillmentOption" aria-label="履约健康" @error="handleChartError" /></view>
        </article>
        <article class="panel">
          <header class="panel-header"><h2>供给与库存结构</h2><span>预警线 ≤ 10</span></header>
          <view class="panel-body chart-body"><DashboardChart id="inventory-chart" :option="inventoryOption" aria-label="供给与库存结构" @error="handleChartError" /></view>
        </article>
      </section>

      <article class="panel map-panel">
        <header class="panel-header map-header">
          <view class="map-heading"><view><h2>{{ mapTitle }}</h2><span>当前模块 · {{ moduleLabels[activeModule] }}</span></view><nav class="region-breadcrumb" aria-label="当前区域"><button v-if="currentRegion?.parentCode" aria-label="返回上级区域" title="返回上级区域" @click="store.goToParentRegion()">‹</button><button v-for="region in currentRegionPath" :key="region.code" :disabled="region.code === store.regionCode" @click="navigateRegion(region.code)">{{ region.name }}</button></nav></view>
          <view class="map-actions">
            <view class="map-legend"><span v-if="currentRegion?.level === 'province'"><i class="dot city"></i>城市聚合 {{ snapshot?.cityMapPoints.length || 0 }}</span><template v-else><span><i class="dot active"></i>经营中</span><span><i class="dot pending"></i>筹备中</span><span><i class="dot paused"></i>停用</span></template><span><i class="dot missing"></i>未定位 {{ snapshot?.unlocatedStoreCount || 0 }}</span></view>
            <button class="map-reset" aria-label="恢复地图视图" title="恢复地图视图" @click="resetMapView"><img :src="resetIcon" alt="" /></button>
          </view>
        </header>
        <view class="map-summary">
          <view><small>{{ coverageLabel }}</small><strong>{{ currentRegion?.level === 'district' ? (snapshot?.overview.storeCount || 0) : (snapshot?.regionRanking.length || currentRegionChildren.length) }}</strong></view>
          <view><small>有效券核销率</small><strong>{{ rateText(snapshot?.service.voucherRedemptionRate) }}</strong></view>
          <view><small>售后率</small><strong>{{ rateText(snapshot?.service.afterSaleRate) }}</strong></view>
        </view>
        <view class="map-chart"><TencentMap ref="mapChart" :api-key="tencentMapKey" :style-id="tencentMapStyleId" :region-level="currentRegion?.level || 'province'" :city-points="snapshot?.cityMapPoints || []" :farm-points="snapshot?.mapPoints || []" :label="mapTitle" @city-select="navigateRegion" @farm-select="handleFarmSelect" /></view>
        <footer class="map-footer"><span>地图点位来自运营后台门店地址解析结果</span><span>数据更新时间 {{ generatedTime }}</span></footer>
      </article>

      <section class="side-column right-column">
        <article class="panel risk-panel">
          <header class="panel-header"><h2>监管风险</h2><span class="danger-text">{{ snapshot?.overview.riskCount || 0 }} 项</span></header>
          <view class="panel-body list-body">
            <view v-if="!topRisks.length" class="empty-state">当前范围未发现风险</view>
            <button v-for="risk in topRisks" :key="risk.id" class="risk-row" :class="`risk-${risk.level}`" data-typography-compact @click="openRisk(risk, $event)">
              <span class="risk-level">{{ riskLabel(risk.level) }}</span>
              <view><strong>{{ risk.title }}</strong><small>{{ risk.description }}</small></view>
              <b>{{ risk.count }}</b>
            </button>
          </view>
        </article>
        <article class="panel ranking-panel">
          <header class="panel-header"><h2>区域交易排行</h2><span>交易额 / 活跃度</span></header>
          <view class="panel-body rank-list">
            <view v-for="(item, index) in ranking" :key="item.regionCode" class="rank-row">
              <b>{{ index + 1 }}</b><span>{{ item.regionName }}</span>
              <view class="rank-track"><i :style="{ width: `${Math.max(4, item.transactionAmount / maxRankAmount * 100)}%` }"></i></view>
              <strong>¥{{ money(item.transactionAmount) }}</strong><small>{{ item.activity }}%</small>
            </view>
          </view>
        </article>
        <article class="panel">
          <header class="panel-header"><h2>品类供需缺口</h2><span>需求占比 - 库存占比</span></header>
          <view class="panel-body chart-body"><DashboardChart id="gap-chart" :option="gapOption" aria-label="品类供需缺口" @error="handleChartError" /></view>
        </article>
      </section>
    </main>

    <section class="bottom-grid">
      <article class="panel trend-panel">
        <header class="panel-header"><h2>消费交易趋势</h2><span>交易额与订单量</span></header>
        <view class="panel-body chart-body"><DashboardChart id="trend-chart" :option="trendOption" aria-label="消费交易趋势" @error="handleChartError" /></view>
      </article>
      <article class="panel chain-panel">
        <header class="panel-header"><h2>产业链协同</h2><span>供给到消费转化</span></header>
        <view class="chain-flow">
          <view><small>合作供应商</small><strong>{{ snapshot?.chain.supplierCount || 0 }}</strong><span>供给组织</span></view><i></i>
          <view><small>在售商品</small><strong>{{ snapshot?.chain.listedProductCount || 0 }}</strong><span>商品中台</span></view><i></i>
          <view><small>经营门店</small><strong>{{ snapshot?.chain.activeStoreCount || 0 }}</strong><span>消费场景</span></view><i></i>
          <view><small>推客/主播</small><strong>{{ snapshot?.chain.activePromoterHostCount || 0 }}</strong><span>流量协同</span></view>
        </view>
        <view class="chain-metrics"><span>低库存SKU <b>{{ snapshot?.overview.lowStockSkuCount || 0 }}</b></span><span>履约率 <b>{{ rateText(snapshot?.fulfillment.rate) }}</b></span><span>券核销率 <b>{{ rateText(snapshot?.service.voucherRedemptionRate) }}</b></span></view>
      </article>
      <article class="panel suggestion-panel">
        <header class="panel-header"><h2>产业赋能建议</h2><span>规则自动生成</span></header>
        <view class="suggestion-list">
          <view v-if="!topSuggestions.length" class="empty-state">当前经营指标稳定，暂无专项建议</view>
          <view v-for="(item, index) in topSuggestions" :key="item.id" class="suggestion-row">
            <b>{{ String(index + 1).padStart(2, '0') }}</b>
            <view><strong>{{ item.title }}</strong><small>{{ item.description }}</small></view>
            <span>{{ item.action }}</span>
          </view>
        </view>
      </article>
    </section>
    </template>

    <main v-else class="module-workspace" :data-module-view="activeModule">
      <template v-if="activeModule === 'regional-comparison'">
        <section class="module-panel region-table-panel">
          <header class="module-heading"><view><small>REGIONAL PERFORMANCE</small><h2>区域经营对比</h2></view><span>{{ rangeLabels[store.rangeKey] }}</span></header>
          <view class="region-table table-head"><span>城市</span><span>门店</span><span>店员</span><span>交易额</span><span>订单</span><span>预约</span><span>风险</span><span>活跃</span><span>环比</span></view>
          <view class="region-table-scroll">
            <button v-for="item in snapshot?.cityProfiles || []" :key="item.cityCode" class="region-table" @click="navigateRegion(item.cityCode)">
              <strong>{{ item.cityName }}</strong><span>{{ item.storeCount }}</span><span>{{ item.activeStaffCount }}</span><span>¥{{ money(item.transactionAmount) }}</span><span>{{ item.orderCount }}</span><span>¥{{ money(item.bookingAmount) }}</span><span>{{ item.riskCount }}</span><span>{{ item.storeCount ? Math.round(item.activeStoreCount / item.storeCount * 100) : 0 }}%</span><b :class="{ negative: item.growthRate !== null && item.growthRate < 0 }">{{ growthText(item.growthRate) }}</b>
            </button>
          </view>
        </section>
        <section class="module-panel module-map-panel">
          <header class="module-heading"><view><small>STORE DISTRIBUTION</small><h2>授权区域门店分布</h2></view><span>点击地市下钻</span></header>
          <TencentMap ref="mapChart" :api-key="tencentMapKey" :style-id="tencentMapStyleId" :region-level="currentRegion?.level || 'province'" :city-points="snapshot?.cityMapPoints || []" :farm-points="snapshot?.mapPoints || []" :label="mapTitle" @city-select="navigateRegion" @farm-select="handleFarmSelect" />
        </section>
        <section class="module-panel module-trend-panel">
          <header class="module-heading"><view><small>TRANSACTION TREND</small><h2>区域交易趋势</h2></view><span>{{ snapshot?.overview.transactionOrderCount || 0 }} 单</span></header>
          <DashboardChart id="regional-trend-chart" :option="trendOption" aria-label="区域交易趋势" @error="handleChartError" />
        </section>
      </template>

      <template v-else-if="activeModule === 'regulatory-monitoring'">
        <section class="module-panel regulatory-list-panel">
          <header class="module-heading"><view><small>RISK REGISTER</small><h2>监管风险台账</h2></view><span class="danger-text">{{ snapshot?.overview.riskCount || 0 }} 项</span></header>
          <view class="risk-table table-head"><span>等级</span><span>风险事项</span><span>规则</span><span>数量</span></view>
          <view class="regulatory-scroll">
            <view v-if="!snapshot?.risks.length" class="empty-state">当前授权范围未发现风险</view>
            <button v-for="risk in orderedRisks" :key="risk.id" class="risk-table risk-table-button" data-typography-compact @click="openRisk(risk, $event)">
              <b :class="`level-${risk.level}`">{{ riskLabel(risk.level) }}</b><view><strong>{{ risk.title }}</strong><small>{{ risk.description }}</small></view><code>{{ risk.rule }}</code><span>{{ risk.count }}</span>
            </button>
          </view>
        </section>
        <section class="module-panel regulatory-metrics-panel">
          <header class="module-heading"><view><small>CONTROL METRICS</small><h2>监管控制指标</h2></view><span>只读监测</span></header>
          <view class="control-grid">
            <view><small>未定位门店</small><strong>{{ snapshot?.unlocatedStoreCount || 0 }}</strong><span>不生成地图点位</span></view>
            <view><small>超时未发货</small><strong>{{ snapshot?.fulfillment.overdueCount || 0 }}</strong><span>超过 48 小时</span></view>
            <view><small>履约异常</small><strong>{{ snapshot?.fulfillment.abnormalCount || 0 }}</strong><span>缺货或物流异常</span></view>
            <view><small>低库存 SKU</small><strong>{{ snapshot?.inventory.lowStockSkuCount || 0 }}</strong><span>库存不高于 10</span></view>
            <view><small>售后率</small><strong>{{ rateText(snapshot?.service.afterSaleRate) }}</strong><span>{{ snapshot?.service.afterSaleCount || 0 }} 笔有效售后</span></view>
            <view><small>结算异常</small><strong>{{ snapshot?.settlement.failedSupplierSettlementCount || 0 }}</strong><span>供应商结算失败</span></view>
          </view>
        </section>
        <section class="module-panel settlement-panel">
          <header class="module-heading"><view><small>SETTLEMENT EXPOSURE</small><h2>结算敞口</h2></view><span>授权主体口径</span></header>
          <view class="settlement-metrics"><view><small>供应商待结算</small><strong>¥{{ money(snapshot?.settlement.pendingSupplierAmount || 0) }}</strong></view><view><small>佣金待结算</small><strong>¥{{ money(snapshot?.settlement.pendingCommissionAmount || 0) }}</strong></view></view>
          <view class="settlement-note">失败结算 {{ snapshot?.settlement.failedSupplierSettlementCount || 0 }} 笔 · 数据变化后 300ms 内刷新</view>
        </section>
      </template>

      <template v-else>
        <section class="module-panel empowerment-gap-panel">
          <header class="module-heading"><view><small>SUPPLY DEMAND GAP</small><h2>品类供需机会</h2></view><span>需求占比 - 库存占比</span></header>
          <DashboardChart id="empowerment-gap-chart" :option="gapOption" aria-label="品类供需机会" @error="handleChartError" />
        </section>
        <section class="module-panel empowerment-list-panel">
          <header class="module-heading"><view><small>ACTION PLAYBOOK</small><h2>产业赋能建议</h2></view><span>规则自动生成</span></header>
          <view class="empowerment-scroll">
            <view v-if="!snapshot?.suggestions.length" class="empty-state">当前经营指标稳定，暂无专项建议</view>
            <article v-for="(item, index) in snapshot?.suggestions || []" :key="item.id" class="empowerment-row">
              <b>{{ String(index + 1).padStart(2, '0') }}</b><view><small>{{ item.rule }} · 影响主体 {{ item.subjects.length }}</small><strong>{{ item.title }}</strong><p>{{ item.description }} · {{ suggestionEvidence(item) }}</p></view><span>{{ item.action }}</span>
            </article>
          </view>
        </section>
        <section class="module-panel empowerment-chain-panel">
          <header class="module-heading"><view><small>CHAIN COLLABORATION</small><h2>产业链协同能力</h2></view><span>供给至消费</span></header>
          <view class="empowerment-chain"><view><small>合作供应商</small><strong>{{ snapshot?.chain.supplierCount || 0 }}</strong></view><i></i><view><small>在售商品</small><strong>{{ snapshot?.chain.listedProductCount || 0 }}</strong></view><i></i><view><small>经营门店</small><strong>{{ snapshot?.chain.activeStoreCount || 0 }}</strong></view><i></i><view><small>推客/主播</small><strong>{{ snapshot?.chain.activePromoterHostCount || 0 }}</strong></view></view>
          <view class="opportunity-strip"><span>履约率 <b>{{ rateText(snapshot?.fulfillment.rate) }}</b></span><span>券核销率 <b>{{ rateText(snapshot?.service.voucherRedemptionRate) }}</b></span><span>待结佣金 <b>¥{{ money(snapshot?.settlement.pendingCommissionAmount || 0) }}</b></span></view>
        </section>
      </template>
    </main>

    <view v-if="snapshot && !hasBusinessData" class="empty-business" role="status">当前授权范围暂无业务数据</view>

    <view v-if="showDefinitions" class="modal-mask" data-visual-view="metric-definitions" @click="closeOverlay">
      <section ref="overlayDialog" class="definition-dialog" role="dialog" aria-modal="true" aria-label="指标口径" tabindex="-1" @click.stop>
        <header><view><h2>指标口径说明</h2><p>所有区域权限均在指标聚合前生效</p></view><button role="button" aria-label="关闭" title="关闭" @click="closeOverlay">×</button></header>
        <dl><template v-for="item in metricDefinitions" :key="item[0]"><dt>{{ item[0] }}</dt><dd>{{ item[1] }}</dd></template></dl>
      </section>
    </view>

    <view v-if="selectedRisk" class="drawer-mask" data-visual-view="risk-drawer" @click="closeOverlay">
      <aside ref="overlayDialog" class="risk-drawer" role="dialog" aria-modal="true" aria-label="监管风险明细" tabindex="-1" @click.stop>
        <header><view><small>{{ selectedRisk.rule }}</small><h2>{{ selectedRisk.title }}</h2><p>{{ selectedRisk.description }}</p></view><button aria-label="关闭监管风险明细" @click="closeOverlay">×</button></header>
        <view class="risk-drawer-summary"><span :class="`level-${selectedRisk.level}`">{{ riskLabel(selectedRisk.level) }}</span><strong>{{ selectedRisk.count }}</strong><small>个关联主体</small></view>
        <view class="risk-subject-list">
          <view v-if="!selectedRisk.subjects?.length" class="empty-state">暂无可展示的主体明细</view>
          <article v-for="subject in selectedRisk.subjects || []" :key="`${subject.type}:${subject.id}`"><view><strong>{{ subject.name || subject.id }}<em v-if="subject.dataOrigin === 'dashboard_demo'">演示</em></strong><span>{{ subject.type }} · {{ subject.id }}</span></view><p>{{ subject.detail || selectedRisk.description }}</p><small v-if="subject.occurredAt">发生时间 {{ new Date(subject.occurredAt).toLocaleString('zh-CN', { hour12: false }) }}</small></article>
        </view>
      </aside>
    </view>

    <view v-if="selectedFarm" class="drawer-mask" data-visual-view="farm-drawer" @click="closeOverlay">
      <aside ref="overlayDialog" class="risk-drawer farm-drawer" role="dialog" aria-modal="true" aria-label="门店经营详情" tabindex="-1" @click.stop>
        <header><view><small>{{ selectedFarm.cityName }} · {{ selectedFarm.districtName }}</small><h2>{{ selectedFarm.name }}</h2><p>{{ selectedFarm.address || '地址待完善' }}</p></view><button aria-label="关闭门店详情" @click="closeOverlay">×</button></header>
        <view class="farm-drawer-body">
        <view class="farm-status-strip"><span :class="`farm-status-${selectedFarm.status}`">{{ farmStatusLabel(selectedFarm.status) }}</span><small v-if="snapshot?.demoSupplement">当前空缺业务数据含演示补全</small><small v-else>真实共享业务数据</small></view>
        <view class="farm-detail-grid">
          <view><small>交易额</small><strong>¥{{ money(selectedFarm.transactionAmount) }}</strong></view>
          <view><small>订单量</small><strong>{{ selectedFarm.orderCount }} 单</strong></view>
          <view><small>在岗店员</small><strong>{{ selectedFarm.activeStaffCount }} 人</strong></view>
          <view><small>预约</small><strong>{{ selectedFarm.bookingCount }} 笔</strong><span>¥{{ money(selectedFarm.bookingAmount) }}</span></view>
          <view><small>券订单</small><strong>{{ selectedFarm.voucherCount }} 张</strong><span>已核销 {{ selectedFarm.redeemedVoucherCount }}</span></view>
          <view><small>风险</small><strong class="danger-text">{{ selectedFarm.riskCount }} 项</strong></view>
        </view>
        <dl class="farm-location-detail"><dt>行政区归属</dt><dd>{{ selectedFarm.cityName }} / {{ selectedFarm.districtName }}（{{ selectedFarm.districtCode || '待归属' }}）</dd><dt>地图坐标</dt><dd v-if="selectedFarm.longitude !== undefined && selectedFarm.latitude !== undefined">{{ selectedFarm.longitude.toFixed(6) }}, {{ selectedFarm.latitude.toFixed(6) }}（GCJ-02）</dd><dd v-else>未定位，不生成地图点位</dd></dl>
        </view>
      </aside>
    </view>
  </view>
</template>

<style scoped lang="scss">
.dashboard-shell {
  --bg: #07111c; --panel: #0c1b28; --line: #1e3c4d; --muted: #8aa4b1; --text: #e9f4f6; --dashboard-business-text: 12px;
  --dashboard-chrome-top: calc(10px + 56px + 9px + 100px + 9px);
  width: 100vw; height: 100vh; min-width: 1180px; min-height: 680px; overflow: hidden; padding: 10px 12px;
  display: grid; grid-template-rows: minmax(56px, auto) 100px minmax(0, 1fr) 208px; gap: 9px;
  color: var(--text); background-color: var(--bg); background-image: none;
}
.dashboard-shell.has-data-error { --dashboard-chrome-top: calc(10px + 56px + 9px + 30px + 9px + 100px + 9px); grid-template-rows: minmax(56px, auto) 30px 100px minmax(0, 1fr) 208px; }
.topbar { display: grid; grid-template-columns: minmax(310px, 1fr) auto minmax(470px, 1fr); align-items: center; min-height: 56px; overflow: visible; border-bottom: 1px solid #1d4051; }
.brand-block { display: flex; align-items: center; gap: 11px; min-width: 0; }
.brand-mark { width: 32px; height: 32px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; align-items: end; border: 1px solid #2e6c78; border-radius: 4px; padding: 6px; }
.brand-mark span { background: #24d4c4; height: 55%; }.brand-mark span:nth-child(2) { height: 100%; background: #48a8ff; }.brand-mark span:nth-child(3) { height: 75%; background: #f3b33d; }
.brand-block h1 { font-size: 20px; line-height: 1.2; margin: 0; font-weight: 700; white-space: nowrap; }.brand-block p { color: var(--muted); font-size: 12px; margin: 4px 0 0; }
.module-nav { display: flex; align-items: stretch; height: 38px; border: 1px solid #1d4051; border-radius: 6px; overflow: hidden; }
.module-nav button { min-width: 86px; padding: 0 14px; margin: 0; border: 0; color: #8fa8b4; background: #0b1824; font-size: 13px; line-height: 36px; cursor: pointer; }
.module-nav button + button { border-left: 1px solid #1d4051; }.module-nav button.active { color: #07111c; background: #24d4c4; font-weight: 700; }
.toolbar { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 6px; }
.toolbar select { max-width: 120px; height: 32px; color: #bdd0d7; background: #0b1b28; border: 1px solid #264757; border-radius: 4px; padding: 0 25px 0 9px; font-size: 13px; outline: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.data-stale,.data-unknown { height: 32px; padding: 0 8px; display: flex; align-items: center; border-radius: 4px; font-size: 12px; white-space: nowrap; }.data-stale { border: 1px solid #8d6230; color: #f3b33d; background: #241d18; }.data-unknown { border: 1px solid #456879; color: #9fc4d2; background: #10212c; }
.principal-badge { min-width: 118px; max-width: 132px; height: 32px; display: flex; flex-direction: column; justify-content: center; padding: 0 9px; border-left: 2px solid #24d4c4; border-radius: 4px; background: #0b1b28; }.principal-badge small { color: #24d4c4; font-size: 12px; }.principal-badge strong { color: #dcecef; font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.icon-button { width: 32px; height: 32px; padding: 7px; margin: 0; border-radius: 4px; border: 1px solid #264757; background: #0b1b28; cursor: pointer; display: grid; place-items: center; }
.icon-button img { width: 16px; height: 16px; filter: invert(86%) sepia(9%) saturate(478%) hue-rotate(151deg); }.icon-button:hover { border-color: #24d4c4; background: #102a36; }
.icon-button.logout-danger { background: #b83532; border-color: #b83532; }
.icon-button.logout-danger:hover { background: #9b2b29; border-color: #9b2b29; }
.icon-button.logout-danger img { filter: invert(1); }
.spinning img { animation: spin .7s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
.kpi-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 9px; }
.kpi { --tone: #24d4c4; position: relative; overflow: hidden; border: 1px solid #1c3949; border-top: 2px solid var(--tone); border-radius: 4px; background: #0c1b28; padding: 10px 14px 8px; }
.tone-cyan { --tone: #24d4c4; }.tone-blue { --tone: #48a8ff; }.tone-amber { --tone: #f3b33d; }.tone-green { --tone: #6fce83; }.tone-violet { --tone: #a993f5; }.tone-red { --tone: #f26464; }
.kpi-heading { display: flex; justify-content: space-between; align-items: center; color: #8da7b5; font-size: 12px; }.kpi-heading i { width: 6px; height: 6px; background: var(--tone); }
.kpi-value { display: flex; align-items: baseline; gap: 5px; margin-top: 5px; color: var(--tone); white-space: nowrap; }.kpi-value strong { font-family: var(--font-numeric); font-size: 27px; font-weight: 600; }.kpi-value small { color: #9fb4be; font-size: 12px; }
.kpi-note { color: #66818f; font-size: 12px; margin-top: 2px; }
.main-grid { min-height: 0; display: grid; grid-template-columns: minmax(240px, 20%) minmax(520px, 1fr) minmax(280px, 22%); gap: 9px; }
.side-column { min-height: 0; display: grid; grid-template-rows: repeat(3, minmax(0, 1fr)); gap: 9px; }
.panel { min-width: 0; min-height: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 4px; background: var(--panel); position: relative; }
.panel-header { height: 32px; display: flex; align-items: center; justify-content: space-between; padding: 0 10px; border-bottom: 1px solid #193647; background: #0d202d; }
.panel-header h2 { margin: 0; color: #d8e8ec; font-size: 12px; font-weight: 600; }.panel-header span { color: #668492; font-size: 12px; }.panel-body { height: calc(100% - 32px); min-height: 0; }.chart-body { padding: 2px 4px 4px; }
.map-panel { display: grid; grid-template-rows: 40px 48px minmax(0, 1fr) 24px; }
.map-header { min-height: 40px; height: auto; padding: 0 14px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }.map-header > view:first-child { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; }.map-header h2 { font-size: 14px; }.map-heading { min-width: 0; flex: 1; justify-content: space-between; }.map-heading > view { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
.region-breadcrumb { display: flex; align-items: center; gap: 3px; }.region-breadcrumb button { min-width: 0; height: 22px; margin: 0; padding: 0 5px; border: 0; border-radius: 0; color: #7ea0ae; background: transparent; font-size: 13px; cursor: pointer; }.region-breadcrumb button + button::before { content: '/'; margin-right: 6px; color: #3d6170; }.region-breadcrumb button:disabled { color: #dcebed; cursor: default; }
.map-legend { display: flex; gap: 12px; }.map-legend span { color: #829ba8; font-size: 12px; }.dot { display: inline-block; width: 6px; height: 6px; margin-right: 4px; }.dot.located { background: #ffd166; box-shadow: none; }.dot.missing { background: transparent; border: 1px solid #f26464; }
.map-summary { position: relative; z-index: 3; display: flex; justify-content: center; gap: 8px; padding-top: 7px; }
.map-summary view { min-width: 112px; height: 36px; padding: 5px 9px; border-left: 2px solid #2b8090; border-radius: 4px; background: #102432; }.map-summary small { color: #7793a1; font-size: 12px; }.map-summary strong { float: right; color: #dff7f6; font: 600 17px var(--font-numeric); }
.map-chart { min-height: 0; padding: 0 6px; }.map-footer { display: flex; justify-content: space-between; padding: 0 12px; color: #5c7785; font-size: 12px; line-height: 22px; border-top: 1px solid #162e3d; }
.list-body { padding: 4px 8px; overflow: auto; }.risk-row { width: 100%; min-height: 30px; margin: 0; padding: 0; display: grid; grid-template-columns: 44px minmax(0, 1fr) 20px; gap: 6px; align-items: center; border: 0; border-bottom: 1px solid #17303f; border-radius: 0; color: inherit; background: transparent; text-align: left; cursor: pointer; }.risk-row:last-child { border-bottom: 0; }.risk-row:hover { background: #102735; }
.risk-level { width: 40px; padding: 2px 0; text-align: center; font-size: 12px; white-space: nowrap; border: 1px solid #c38a30; border-radius: 4px; color: #f3b33d; }.risk-critical .risk-level { border-color: #b94b53; color: #ff7b7b; }.risk-notice .risk-level { border-color: #3a7189; color: #62bde3; }
.risk-row view { min-width: 0; }.risk-row strong, .risk-row small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.risk-row strong { color: #cfe0e5; font-size: 12px; }.risk-row small { color: #6e8997; font-size: 12px; margin-top: 2px; }.risk-row b { color: #f26464; font: 600 14px var(--font-numeric); text-align: right; }.danger-text { color: #f26464 !important; }
.rank-list { padding: 5px 9px; }.rank-row { height: 25px; display: grid; grid-template-columns: 16px 55px 1fr 66px 30px; align-items: center; gap: 5px; font-size: 12px; }.rank-row > b { color: #f3b33d; font: 600 12px var(--font-numeric); }.rank-row > span { color: #a9bdc5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rank-track { height: 4px; background: #1b3443; }.rank-track i { display: block; height: 100%; background: #24d4c4; }.rank-row > strong { color: #d7e7eb; font-size: 12px; text-align: right; }.rank-row > small { color: #668492; font-size: 12px; text-align: right; }
.bottom-grid { min-height: 0; display: grid; grid-template-columns: 36% 31% 1fr; gap: 9px; }
.chain-flow { height: 105px; display: flex; align-items: center; justify-content: center; padding: 8px; }.chain-flow > view { width: 76px; height: 68px; display: flex; flex-direction: column; justify-content: center; text-align: center; border: 1px solid #2b596b; border-radius: 4px; background: #0f2633; }.chain-flow small { color: #7f9aa7; font-size: 12px; }.chain-flow strong { color: #24d4c4; font: 600 21px var(--font-numeric); margin: 3px 0; }.chain-flow span { color: #587583; font-size: 12px; }.chain-flow > i { width: 22px; height: 1px; background: #3b7181; position: relative; }.chain-flow > i::after { content: ''; position: absolute; right: 0; top: -3px; border-left: 5px solid #3b7181; border-top: 3px solid transparent; border-bottom: 3px solid transparent; }
.chain-metrics { height: 52px; margin: 0 10px; border-top: 1px solid #193647; display: flex; align-items: center; justify-content: space-around; color: #718c99; font-size: 12px; }.chain-metrics b { color: #d8e8ec; margin-left: 4px; font: 600 12px var(--font-numeric); }
.suggestion-list { padding: 5px 8px; height: calc(100% - 32px); overflow: auto; }.suggestion-row { min-height: 49px; display: grid; grid-template-columns: 25px 1fr 105px; align-items: center; gap: 7px; border-bottom: 1px solid #17303f; }.suggestion-row:last-child { border-bottom: 0; }.suggestion-row > b { color: #24d4c4; font: 600 15px var(--font-numeric); }.suggestion-row view { min-width: 0; }.suggestion-row strong, .suggestion-row small { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }.suggestion-row strong { color: #d5e5e9; font-size: 12px; }.suggestion-row small { color: #6a8593; font-size: 12px; margin-top: 3px; }.suggestion-row > span { color: #f3b33d; font-size: 12px; line-height: 1.35; text-align: right; }
.empty-state { height: 100%; display: grid; place-items: center; color: #67818e; font-size: 12px; }
.data-error-strip { min-width: 0; height: 30px; padding: 0 12px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; overflow: hidden; border: 1px solid #7f454d; border-left: 3px solid #f26464; border-radius: 4px; color: #efc7ca; background: #281a23; font-size: 12px; }
.data-error-strip strong { color: #ff8585; font-weight: 600; white-space: nowrap; }.data-error-strip span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.data-error-strip small { color: #aa8990; font-size: 12px; white-space: nowrap; }
.page-state,.empty-business { position: fixed; inset: 0; z-index: 28; display: grid; place-items: center; color: #9fbbc5; background: rgba(7,17,28,.88); font-size: 13px; }.page-state-error { color: #ff9b9b; }.empty-business { inset: var(--dashboard-chrome-top) 12px 10px; z-index: 5; background: rgba(7,17,28,.72); pointer-events: none; }
.has-data-error .empty-business { inset: var(--dashboard-chrome-top) 12px 10px; }
.module-workspace { grid-row: 3 / 5; min-height: 0; display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(0, 1fr)); gap: 9px; }
.has-data-error .module-workspace { grid-row: 4 / 6; }
.module-panel { min-width: 0; min-height: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 4px; background: var(--panel); position: relative; }
.module-heading { height: 54px; padding: 0 16px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #193647; background: #0d202d; }.module-heading small { display: block; color: #527582; font-size: 12px; }.module-heading h2 { margin: 3px 0 0; color: #dcebed; font-size: 14px; letter-spacing: 0; }.module-heading > span { color: #7795a2; font-size: 12px; }
.region-table-panel { grid-column: span 4; grid-row: span 2; }.module-map-panel { grid-column: span 8; }.module-trend-panel { grid-column: span 8; }.module-map-panel .dashboard-chart, .module-trend-panel .dashboard-chart, .empowerment-gap-panel .dashboard-chart { height: calc(100% - 54px); }
.region-table { min-height: 38px; display: grid; grid-template-columns: 1.15fr .42fr .42fr 1.1fr .48fr .9fr .42fr .55fr .65fr; align-items: center; gap: 8px; padding: 0 14px; border: 0; border-bottom: 1px solid #17303f; border-radius: 0; color: #9cb2bc; background: transparent; font-size: 12px; text-align: left; }.region-table.table-head { min-height: 34px; color: #5f7d8a; background: #091722; }.region-table-scroll { height: calc(100% - 88px); overflow: auto; }.region-table-scroll button { width: 100%; margin: 0; cursor: pointer; }.region-table-scroll button:hover { background: #102836; }.region-table strong { color: #d1e2e6; }.region-table b { color: #6fce83; text-align: right; }.region-table b.negative { color: #f26464; }
.regulatory-list-panel { grid-column: span 8; grid-row: span 2; }.regulatory-metrics-panel, .settlement-panel { grid-column: span 4; }.risk-table { width: 100%; min-height: 48px; margin: 0; display: grid; grid-template-columns: 64px minmax(0, 1fr) 150px 48px; align-items: center; gap: 10px; padding: 0 15px; border: 0; border-bottom: 1px solid #17303f; border-radius: 0; color: #8ea6b1; background: transparent; font-size: 12px; text-align: left; }.risk-table.table-head { min-height: 34px; color: #5f7d8a; background: #091722; }.risk-table-button { cursor: pointer; }.risk-table-button:hover { background: #102735; }.regulatory-scroll { height: calc(100% - 88px); overflow: auto; }.risk-table > b { width: 48px; padding: 3px 0; border: 1px solid #ad7f36; border-radius: 4px; color: #f3b33d; text-align: center; font-size: 12px; }.risk-table > b.level-critical { border-color: #a9474f; color: #ff7777; }.risk-table > b.level-notice { border-color: #39738b; color: #62bde3; }.risk-table view { min-width: 0; }.risk-table strong, .risk-table small { display: block; }.risk-table strong { color: #d3e3e7; }.risk-table small { margin-top: 4px; color: #6d8996; }.risk-table code { overflow: hidden; color: #638998; text-overflow: ellipsis; white-space: nowrap; }.risk-table > span { color: #f26464; font: 600 16px var(--font-numeric); text-align: right; }
.risk-table.table-head > span { overflow: hidden; color: #718d99; font: 500 12px/1.2 var(--font-ui); text-align: left; text-overflow: ellipsis; white-space: nowrap; }.risk-table.table-head > span:last-child { text-align: right; }
.module-workspace[data-module-view="regulatory-monitoring"] { grid-template-rows: minmax(0, 1.15fr) minmax(0, .85fr); }
.control-grid { height: calc(100% - 54px); display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: repeat(3, minmax(0, 1fr)); }.control-grid > view { min-width: 0; min-height: 0; overflow: hidden; display: flex; flex-direction: column; justify-content: center; padding: 8px 16px; border-right: 1px solid #17303f; border-bottom: 1px solid #17303f; border-radius: 4px; }.control-grid small { color: #74909d; font-size: 12px; }.control-grid strong { margin: 3px 0 2px; color: #f3b33d; font: 600 22px var(--font-numeric); }.control-grid span { color: #526f7c; font-size: 12px; }.settlement-metrics { height: calc(100% - 94px); display: grid; grid-template-columns: repeat(2, 1fr); }.settlement-metrics > view { display: flex; flex-direction: column; justify-content: center; padding: 16px; border-right: 1px solid #17303f; border-radius: 4px; }.settlement-metrics small { color: #74909d; font-size: 12px; }.settlement-metrics strong { margin-top: 8px; color: #24d4c4; font: 600 22px var(--font-numeric); }.settlement-note { height: 40px; padding: 0 16px; border-top: 1px solid #17303f; color: #6e8996; font-size: 12px; line-height: 40px; }
.empowerment-gap-panel { grid-column: span 4; grid-row: span 2; }.empowerment-list-panel, .empowerment-chain-panel { grid-column: span 8; }.empowerment-scroll { height: calc(100% - 54px); overflow: auto; }.empowerment-row { min-height: 70px; display: grid; grid-template-columns: 38px minmax(0, 1fr) 180px; align-items: center; gap: 12px; padding: 8px 16px; border-bottom: 1px solid #17303f; }.empowerment-row > b { color: #24d4c4; font: 600 18px var(--font-numeric); }.empowerment-row view { min-width: 0; }.empowerment-row small { color: #527582; font-size: 12px; }.empowerment-row strong { display: block; margin-top: 3px; color: #d3e4e8; font-size: 12px; }.empowerment-row p { margin: 4px 0 0; overflow: hidden; color: #7894a0; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }.empowerment-row > span { color: #f3b33d; font-size: 12px; line-height: 1.5; text-align: right; }.empowerment-chain { height: calc(100% - 104px); display: flex; align-items: center; justify-content: center; }.empowerment-chain > view { width: 126px; height: 82px; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 1px solid #2b596b; border-radius: 4px; background: #0f2633; }.empowerment-chain small { color: #7894a0; font-size: 12px; }.empowerment-chain strong { margin-top: 7px; color: #24d4c4; font: 600 25px var(--font-numeric); }.empowerment-chain > i { width: 42px; height: 1px; background: #3b7181; }.opportunity-strip { height: 50px; display: flex; align-items: center; justify-content: space-around; border-top: 1px solid #193647; color: #718c99; font-size: 12px; }.opportunity-strip b { margin-left: 6px; color: #d8e8ec; font: 600 13px var(--font-numeric); }
.modal-mask { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; background: rgba(2, 8, 13, .78); }.definition-dialog { width: min(620px, 80vw); max-height: 76vh; display: flex; flex-direction: column; overflow: hidden; border: 1px solid #356579; border-radius: 6px; background: #0b1b28; box-shadow: 0 18px 70px rgba(0,0,0,.45); }.definition-dialog header { height: 64px; flex: none; padding: 0 18px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #234353; }.definition-dialog h2 { margin: 0; font-size: 17px; }.definition-dialog p { margin: 5px 0 0; color: #7893a2; font-size: 12px; }.definition-dialog button { width: 32px; height: 32px; margin: 0; padding: 0; border-radius: 4px; border: 1px solid #325467; color: #bdd0d7; background: transparent; line-height: 30px; cursor: pointer; }.definition-dialog dl { min-height: 0; margin: 0; padding: 8px 18px 18px; overflow-y: auto; }.definition-dialog dt { margin-top: 12px; color: #24d4c4; font-size: 12px; }.definition-dialog dd { margin: 5px 0 0; color: #9fb5bf; font-size: 12px; line-height: 1.7; }
.drawer-mask { position: fixed; inset: 0; z-index: 42; background: rgba(2,8,13,.72); }.risk-drawer { position: absolute; top: 0; right: 0; width: min(520px, 90vw); height: 100%; display: flex; flex-direction: column; overflow: hidden; outline: 0; border-left: 1px solid #356579; border-radius: 6px 0 0 6px; background: #0b1b28; box-shadow: -18px 0 70px rgba(0,0,0,.45); }.risk-drawer > header { min-height: 116px; flex: none; padding: 22px 24px; display: flex; justify-content: space-between; gap: 18px; border-bottom: 1px solid #234353; }.risk-drawer > header > view { min-width: 0; }.risk-drawer header small { color: #5f8291; font-size: 12px; }.risk-drawer h2 { margin: 6px 0; font-size: 20px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.risk-drawer header p { margin: 0; color: #8ba3ad; font-size: 12px; line-height: 1.6; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }.risk-drawer header button { width: 32px; height: 32px; flex: 0 0 32px; border: 1px solid #325467; border-radius: 4px; color: #bdd0d7; background: transparent; cursor: pointer; }.risk-drawer-summary { height: 74px; flex: none; display: flex; align-items: baseline; gap: 10px; padding: 18px 24px; border-bottom: 1px solid #193647; }.risk-drawer-summary span { padding: 3px 7px; border: 1px solid #ad7f36; border-radius: 4px; color: #f3b33d; font-size: 12px; }.risk-drawer-summary span.level-critical { border-color: #a9474f; color: #ff7777; }.risk-drawer-summary span.level-notice { border-color: #39738b; color: #62bde3; }.risk-drawer-summary strong { color: #f26464; font: 600 28px var(--font-numeric); }.risk-drawer-summary small { color: #718d99; }.risk-subject-list { flex: 1; min-height: 0; overflow: auto; padding: 8px 24px 24px; }.risk-subject-list article { padding: 15px 0; border-bottom: 1px solid #193647; }.risk-subject-list article > view { display: flex; justify-content: space-between; gap: 12px; }.risk-subject-list strong { color: #d8e8ec; font-size: 12px; }.risk-subject-list span,.risk-subject-list small { color: #5f7f8d; font-size: 12px; }.risk-subject-list p { margin: 8px 0; color: #8fa7b1; font-size: 12px; line-height: 1.6; }.farm-drawer-body { flex: 1; min-height: 0; overflow-y: auto; }
@media (max-height: 820px) {
  .side-column { overflow-y: auto; grid-template-rows: repeat(3, minmax(120px, 1fr)); }
  .dashboard-shell { --dashboard-chrome-top: calc(7px + 50px + 7px + 88px + 7px); grid-template-rows: minmax(50px, auto) 88px minmax(0, 1fr) 174px; gap: 7px; padding: 7px 9px; }
  .dashboard-shell.has-data-error { --dashboard-chrome-top: calc(7px + 50px + 7px + 28px + 7px + 88px + 7px); grid-template-rows: minmax(50px, auto) 28px 88px minmax(0, 1fr) 174px; }
  .topbar { grid-template-columns: minmax(280px, 1fr) auto minmax(430px, 1fr); }.brand-block h1 { font-size: 17px; }.brand-block p { display: none; }
  .module-nav { height: 34px; }.module-nav button { min-width: 78px; line-height: 32px; padding: 0 10px; }
  .kpi { padding: 7px 11px 5px; }.kpi-value { margin-top: 2px; }.kpi-value strong { font-size: 23px; }.kpi-note { margin-top: 0; }
  .panel-header { height: 28px; }.panel-body, .suggestion-list { height: calc(100% - 28px); }.map-panel { grid-template-rows: 34px 38px minmax(0, 1fr) 20px; }.map-header { height: 34px; }.map-summary { padding-top: 3px; }.map-summary view { height: 30px; }.map-summary strong { font-size: 14px; }.map-footer { line-height: 18px; }
  .risk-row { min-height: 25px; }.rank-row { height: 21px; }.chain-flow { height: 83px; padding: 5px; }.chain-flow > view { height: 56px; }.chain-flow strong { font-size: 17px; }.chain-metrics { height: 42px; }.suggestion-row { min-height: 39px; }
}
@media (max-width: 1450px) {
  .dashboard-shell { min-width: 1120px; }.topbar { grid-template-columns: minmax(260px, 1fr) auto minmax(420px, 1fr); }.brand-block h1 { font-size: 17px; }.module-nav button { min-width: 75px; padding: 0 9px; }.toolbar select { max-width: 92px; }.main-grid { grid-template-columns: 250px minmax(460px, 1fr) 290px; }.kpi-value strong { font-size: 23px; }.map-heading > view > span { display: none; }.region-breadcrumb button { padding: 0 3px; }
}

/* Readability floor: compact spacing preserves the single-screen layout; text never drops below 11px. */
.dashboard-shell { font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", system-ui, sans-serif; font-size: var(--dashboard-business-text); }
.topbar { grid-template-columns: 310px auto minmax(0, 1fr); }
.brand-block h1 { font-size: 21px; }.brand-block p { color: #a3bac4; font-size: 12px; }
.toolbar { min-width: 0; flex-wrap: wrap; }.toolbar select { max-width: 120px; font-size: 13px; }.toolbar select:disabled { color: #718b97; }
.data-status { height: 32px; max-width: 120px; padding: 0 8px; display: flex; align-items: center; overflow: hidden; text-overflow: ellipsis; border: 1px solid #3d6577; border-radius: 4px; color: #c6dce3; background: #10212c; font-size: 12px; white-space: nowrap; }
.data-demo { border-color: #84652e; color: #ffd77b; background: #282116; }.data-stale { border-color: #9b6330; color: #ffc763; background: #2b1f17; }.data-live { border-color: #287268; color: #77e1d5; background: #0d2928; }
.principal-badge small,.principal-badge strong { font-size: 12px; }
.kpi-heading,.kpi-note,.kpi-value small { color: #a9bec7; font-size: 12px; }.kpi-value strong { font-size: 30px; font-variant-numeric: tabular-nums; }
.panel-header h2 { font-size: 14px; }.panel-header span,.region-breadcrumb button,.map-legend span,.map-summary small,.map-footer { color: #96adb7; font-size: 13px; }
.map-actions { display: flex; align-items: center; gap: 8px; }.map-legend { display: flex; gap: 9px; align-items: center; }.dot { width: 8px; height: 8px; border-radius: 50%; }.dot.city { background: #ffd166; box-shadow: none; }.dot.active { background: #52d681; }.dot.pending { background: #f6c653; }.dot.paused { background: #8a9ba6; }.dot.missing { background: transparent; border: 1px solid #ff7b7b; }
.map-reset { width: 28px; height: 28px; flex: 0 0 28px; margin: 0; padding: 6px; display: grid; place-items: center; border: 1px solid #365b6c; border-radius: 4px; background: #102432; cursor: pointer; }.map-reset img { width: 15px; height: 15px; filter: invert(91%) sepia(12%) saturate(301%) hue-rotate(147deg); }
.map-footer { color: #8ea7b2; }
.risk-level,.risk-row strong,.risk-row small,.rank-row,.rank-row > strong,.rank-row > small,.chain-flow small,.chain-flow span,.chain-metrics,.suggestion-row strong,.suggestion-row small,.suggestion-row > span,.empty-state { font-size: 12px; }
.risk-row small,.suggestion-row small { color: #91a9b3; }.rank-row > small { color: #96acb5; }.chain-flow small,.chain-flow span,.chain-metrics { color: #94aab4; }
.module-heading small,.module-heading > span,.region-table,.risk-table,.risk-table > b,.control-grid small,.control-grid span,.settlement-metrics small,.settlement-note,.empowerment-row small,.empowerment-row p,.empowerment-row > span,.empowerment-chain small,.opportunity-strip { font-size: 12px; }
.module-heading small,.module-heading > span,.risk-table small,.risk-table code,.control-grid small,.control-grid span,.settlement-metrics small,.settlement-note,.empowerment-row small,.empowerment-row p,.empowerment-chain small,.opportunity-strip { color: #8fa8b3; }
.definition-dialog p,.risk-drawer header small,.risk-drawer-summary span,.risk-subject-list span,.risk-subject-list small,.risk-subject-list p { font-size: 12px; }.risk-subject-list span,.risk-subject-list small { color: #8da8b4; }.risk-subject-list strong em { margin-left: 7px; padding: 2px 5px; color: #ffd77b; border: 1px solid #84652e; border-radius: 4px; font-size: 12px; font-style: normal; }
.region-table-panel { grid-column: span 5; }.module-map-panel,.module-trend-panel { grid-column: span 7; }
.region-table { grid-template-columns: 1.15fr .42fr .42fr 1.1fr .48fr .9fr .42fr .55fr .65fr; gap: 4px; padding: 0 10px; font-variant-numeric: tabular-nums; }.region-table > span,.region-table > b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.farm-status-strip { height: 54px; padding: 0 24px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #234353; }.farm-status-strip span { padding: 4px 8px; border: 1px solid #3a7564; border-radius: 4px; color: #79dfa5; }.farm-status-strip .farm-status-pending { border-color: #8d6d30; color: #f6c653; }.farm-status-strip .farm-status-paused { border-color: #61737d; color: #aab9c0; }.farm-status-strip small { color: #ffd77b; font-size: 12px; }
.farm-detail-grid { display: grid; grid-template-columns: repeat(2, 1fr); border-bottom: 1px solid #234353; }.farm-detail-grid > view { min-height: 96px; padding: 18px 24px; display: flex; flex-direction: column; justify-content: center; border-right: 1px solid #193647; border-bottom: 1px solid #193647; border-radius: 4px; }.farm-detail-grid small,.farm-detail-grid span { color: #93aab5; font-size: 12px; }.farm-detail-grid strong { margin: 6px 0 3px; color: #e3f0f3; font: 600 22px var(--font-numeric); }
.farm-location-detail { margin: 0; padding: 18px 24px; }.farm-location-detail dt { margin-top: 12px; color: #24d4c4; font-size: 12px; }.farm-location-detail dd { margin: 6px 0 0; color: #b0c3ca; font-size: 12px; line-height: 1.6; }
@media (max-height: 820px) {
  .topbar { grid-template-columns: 260px auto minmax(0, 1fr); }.brand-block h1 { font-size: 20px; }.kpi-value strong { font-size: 28px; }
  .toolbar { gap: 4px; }.toolbar select { max-width: 120px; padding-left: 6px; }.principal-badge { min-width: 100px; }.map-legend { gap: 6px; }
}
@media (max-height: 700px) {
  .dashboard-shell { min-height: 0; padding: 7px 9px; --dashboard-chrome-top: calc(7px + 50px + 6px + 88px + 6px); grid-template-rows: minmax(50px, auto) 88px minmax(0, 1fr) 168px; gap: 6px; }
  .dashboard-shell.has-data-error { --dashboard-chrome-top: calc(7px + 50px + 6px + 26px + 6px + 88px + 6px); grid-template-rows: minmax(50px, auto) 26px 88px minmax(0, 1fr) 168px; }
  .data-error-strip { height: 26px; padding-inline: 9px; }
  .kpi { padding: 7px 10px 6px; }.kpi-value strong { font-size: 24px; }
  .panel-body,.list-body { min-height: 0; overflow: auto; }
  .side-column { overflow-y: auto; grid-template-rows: repeat(3, minmax(120px, 1fr)); }
  .farm-detail-grid > view { min-height: 72px; }
  .module-heading { height: 46px; padding-inline: 12px; }.module-heading h2 { margin-top: 1px; }
  .module-map-panel .dashboard-chart,.module-trend-panel .dashboard-chart,.empowerment-gap-panel .dashboard-chart,.module-map-panel > .tencent-map-shell { height: calc(100% - 46px); }
  .region-table-scroll,.regulatory-scroll { height: calc(100% - 80px); }.control-grid { height: calc(100% - 46px); }.control-grid > view { padding: 3px 12px; }.control-grid small,.control-grid span { font-size: 12px; line-height: 1.2; }.control-grid strong { margin: 1px 0; font-size: 19px; line-height: 1.1; }
  .settlement-metrics { height: calc(100% - 86px); }.empowerment-scroll { height: calc(100% - 46px); }.empowerment-chain { height: calc(100% - 96px); }
}
@media (max-width: 1450px) {
  .topbar { grid-template-columns: 360px auto minmax(0, 1fr); }.brand-block h1 { font-size: 18px; }.kpi-value strong { font-size: 28px; }
  .toolbar { gap: 4px; }.toolbar select { max-width: 120px; padding-left: 6px; }.principal-badge { min-width: 100px; }.module-nav button { min-width: 72px; padding: 0 8px; }
  .region-table-panel,.module-map-panel,.module-trend-panel { grid-column: span 6; }
  .region-table { grid-template-columns: 1.15fr .4fr .4fr 1.05fr .4fr .85fr .4fr .5fr .8fr; }
}
</style>
