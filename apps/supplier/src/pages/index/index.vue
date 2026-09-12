<template>
  <!-- 登录 -->
  <view v-if="!store.auth.isLoggedIn" class="login-page">
    <view class="login-card">
      <view class="pc-login-hero">
        <view class="pc-login-mark"><UiIcon name="package" :size="26" /></view>
        <text class="pc-login-brand">中选科技供应商配送工作台</text>
        <text class="pc-login-sub">中选科技供应链 · 供应商与司机双角色配送履约</text>
      </view>
      <view class="login-body">
      <view class="role-tabs" role="tablist">
        <button :class="{ active: loginRole === 'supplier' }" role="tab" :aria-selected="loginRole === 'supplier'" @click="switchLoginRole('supplier')">供应商</button>
        <button :class="{ active: loginRole === 'driver' }" role="tab" :aria-selected="loginRole === 'driver'" @click="switchLoginRole('driver')">司机</button>
      </view>
      <view class="login-fields">
        <label class="form-field"><text>账号</text><input v-model="loginAccount" placeholder="请输入账号" confirm-type="done" @confirm="submitLogin" /></label>
        <label class="form-field"><text>密码</text><input v-model="loginPassword" type="password" placeholder="请输入密码" confirm-type="done" @confirm="submitLogin" /></label>
      </view>
      <text v-if="store.error" class="form-error login-error">{{ store.error }}</text>
      <text v-else-if="store.loginError" class="form-error login-error">{{ store.loginError }}</text>
      <button v-if="store.error" class="outline-button login-button" :class="{ 'is-loading': store.loading }" :disabled="store.loading" @click="refreshSharedState">重新加载</button>
      <button v-else class="primary-button login-button" :class="{ 'is-loading': busy || store.loading }" :disabled="busy || !store.initialized || store.loading" @click="submitLogin">登 录</button>
      <text class="login-hint">{{ loginRole === 'supplier' ? '演示供应商：13787366688 / 13787366688（已自动填充）' : '演示司机：driver01 / 123456（已自动填充）' }}</text>
      </view>
    </view>
  </view>

  <!-- 工作区 -->
  <view v-else class="app-shell">
    <view v-if="store.loading" class="page-state pc-loading"><text>正在准备配送工作台...</text></view>
    <view v-else-if="store.error" class="page-state pc-error"><text>{{ store.error }}</text><button class="primary-button mini-button state-retry" @click="refreshSharedState">重新加载</button></view>

    <template v-else>
      <!-- 司机头部 -->
      <view v-if="store.auth.role === 'driver'" class="hero">
        <view class="hero-top">
          <view class="hero-avatar"><UiIcon name="user-round" :size="22" /></view>
          <view><text class="hero-title">{{ store.auth.name }}</text><view class="hero-sub">司机 · {{ store.auth.account }}</view></view>
          <button class="hero-logout logout-danger" @click="logout">退出</button>
        </view>
        <view class="hero-stats driver-hero-stats">
          <view class="hero-stat"><text class="hero-stat-label">今日任务</text><text class="hero-stat-value">{{ store.myTasks.length }}</text></view>
          <view class="hero-stat"><text class="hero-stat-label">今日完成</text><text class="hero-stat-value">{{ driverDoneToday }}</text></view>
        </view>
      </view>
      <!-- 供应商模块 -->
      <template v-if="store.auth.role === 'supplier'">
        <view v-if="active === 'orders' && !secondaryWorkspace" class="page-pad" data-visual-view="supplier-orders">
          <view class="hero-stats">
            <view class="hero-stat"><text class="hero-stat-label">今日门店</text><text class="hero-stat-value">{{ store.todayFarmhouseQuantities.storeCount }}</text></view>
            <view class="hero-stat"><text class="hero-stat-label">今日件数</text><text class="hero-stat-value">{{ store.todayFarmhouseQuantities.itemCount }}</text></view>
            <view class="hero-stat"><text class="hero-stat-label">待发货件</text><text class="hero-stat-value">{{ store.todayFarmhouseQuantities.pendingShipItemCount }}</text></view>
            <view class="hero-stat"><text class="hero-stat-label">缺货件数</text><text class="hero-stat-value">{{ store.todayFarmhouseQuantities.shortageItemCount }}</text></view>
            <view class="hero-stat"><text class="hero-stat-label">配送中件</text><text class="hero-stat-value">{{ store.todayFarmhouseQuantities.deliveringItemCount }}</text></view>
          </view>
          <scroll-view class="order-filter-scroll" scroll-x>
            <view class="chips scroll-x">
              <button v-for="item in orderFilters" :key="item.key" class="chip" :class="{ active: orderFilter === item.key }" @click="orderFilter = item.key">{{ item.label }}<text class="chip-count" data-typography-compact>{{ item.count }}</text></button>
            </view>
          </scroll-view>
          <view class="search-bar"><UiIcon name="search" :size="16" /><input v-model="orderKeyword" placeholder="搜索单号 / 门店" confirm-type="search" /></view>
          <button v-if="selectedOrderIds.length" class="primary-button section-action" :class="{ 'is-loading': busyAction === 'batch-accept' }" :disabled="busyAction === 'batch-accept'" @click="batchAccept">批量接单（{{ selectedOrderIds.length }}）</button>
          <view v-if="filteredOrders.length" class="content-stack">
            <view v-for="order in filteredOrders" :key="order.id" class="list-card">
              <view class="row" @click="openOrder(order)">
                <view v-if="orderFilter === 'submitted'" class="order-check" @click.stop="toggleSelect(order.id)">
                  <view :class="{ checked: selectedOrderIds.includes(order.id) }"><UiIcon v-if="selectedOrderIds.includes(order.id)" name="check" :size="13" /></view>
                </view>
                <view class="row-main">
                  <view class="row-top">
                    <text class="order-no">{{ order.id }}</text>
                    <span class="badge" :class="orderFulfillment(order).status">{{ statusText(orderFulfillment(order).status, order) }}</span>
                    <span v-if="orderShortage(order).length" class="tag danger">缺货 {{ orderShortage(order).length }}</span>
                  </view>
                  <text class="muted">{{ isCourierOrder(order) ? `${courierSourceLabel(order)} · ${recipientLabel(order)}` : order.customer }} · {{ order.items?.length || 1 }} 项 · 共 {{ order.quantity }} 件</text>
                  <text class="muted">{{ order.createdAt }}{{ orderFulfillment(order).driverName ? ` · 司机 ${orderFulfillment(order).driverName}` : orderFulfillment(order).trackingNo ? ` · 运单 ${orderFulfillment(order).trackingNo}` : '' }}{{ orderFulfillment(order).deliverDate ? ` · 配送 ${orderFulfillment(order).deliverDate}` : '' }}</text>
                  <text v-if="routeStatusText(order)" class="route-status-hint">{{ routeStatusText(order) }}</text>
                  <text class="order-amount">{{ money(order.amount) }}</text>
                </view>
                <UiIcon name="chevron-right" :size="16" />
              </view>
              <view v-if="orderActions(order).length" class="order-actions">
                <button v-for="action in orderActions(order)" :key="action.key" class="outline-button mini-button" :class="{ 'is-loading': busyAction === action.key, 'primary-button': action.primary }" :disabled="busyAction === action.key" @click="runAction(action.key, order)">{{ action.label }}</button>
              </view>
            </view>
          </view>
          <view v-else class="empty-state pc-empty"><view class="pc-state-icon"><UiIcon name="search" :size="26" /></view><text>没有符合条件的配送订单</text></view>
        </view>

        <view v-else-if="active === 'mine' && !secondaryWorkspace" class="page-pad mine-page" data-visual-view="supplier-mine">
          <view class="pc-hero mine-hero">
            <span class="pc-hero-badge"><UiIcon name="store" :size="15" />供应商工作台</span>
            <text class="pc-hero-name">{{ store.currentSupplier?.name || store.auth.name || supplierInfo.name }}</text>
            <small class="pc-hero-uid">{{ store.currentSupplier?.region || supplierInfo.region }} · {{ store.currentSupplier?.category || supplierInfo.category }}</small>
            <view class="pc-hero-data"><view><small>供应商编号</small><strong>{{ store.auth.supplierId || '—' }}</strong></view><view><small>登录账号</small><strong>{{ store.auth.account }}</strong></view></view>
          </view>
          <view class="section-title">业务工作区</view>
        <view class="pc-tile-grid mine-tile-grid">
          <button v-for="(item, index) in supplierWorkItems" :key="item.key" class="work-link pc-tile" :class="'pc-tile--' + ['green','amber','coral','blue','purple'][index % 5]" data-typography-compact @click="openSecondaryWorkspace(item.key)">
            <view class="pc-tile-icon"><UiIcon :name="item.icon" :size="26" /></view><text class="pc-tile-label">{{ item.label }}</text>
          </button>
        </view>
        <view class="mine-actions">
          <button class="outline-button" @click="askResetDemo">重置演示数据</button>
          <button class="hero-logout logout-danger" @click="logout">退出</button>
        </view>
        </view>

        <view v-else-if="secondaryWorkspace === 'drivers'" class="page-pad secondary-workspace" data-visual-view="workspace-drivers">
          <view class="secondary-head"><button class="page-back" aria-label="返回" @click="closeSecondaryWorkspace"><UiIcon name="arrow-left" :size="20" /></button><text>司机管理</text></view>
          <view class="secondary-body">
          <view class="chips">
            <button v-for="item in driverStatusFilters" :key="item" class="chip" :class="{ active: driverStatusFilter === item }" @click="driverStatusFilter = item">{{ item }}</button>
          </view>
          <view class="search-bar"><UiIcon name="search" :size="16" /><input v-model="driverSearch" placeholder="搜索姓名 / 账号 / 手机" confirm-type="search" /></view>
          <view v-if="filteredDrivers.length" class="content-stack">
            <view v-for="driver in filteredDrivers" :key="driver.id" class="list-card">
              <view class="row driver-row">
                <view class="driver-avatar"><UiIcon name="user-round" :size="20" /></view>
                <view class="row-main">
                  <view class="row-top"><text class="driver-name">{{ driver.name }}</text><span class="badge" :class="driver.status">{{ driver.status === 'active' ? '启用' : '停用' }}</span></view>
                  <text class="muted">{{ driver.account }} · {{ driver.phone }}</text>
                  <text class="muted">创建于 {{ driver.createdAt }} · 进行中任务 {{ store.driverTaskCounts[driver.id] || 0 }}</text>
                  <text class="muted">{{ namedRouteLabelForDriver(driver.id) }}</text>
                </view>
              </view>
              <view class="driver-actions">
                <button class="outline-button mini-button" @click="openDriverEdit(driver)">编辑</button>
                <button class="outline-button mini-button" @click="openReset(driver)">重置密码</button>
                <button class="outline-button mini-button" :class="{ danger: driver.status === 'active' }" @click="askToggle(driver)">{{ driver.status === 'active' ? '停用' : '启用' }}</button>
              </view>
            </view>
          </view>
          <view v-else class="empty-state pc-empty"><view class="pc-state-icon"><UiIcon name="users" :size="26" /></view><text>暂无司机账号，点击「新增司机」开通</text></view>
          </view>
          <view class="secondary-foot"><button class="primary-button section-action" @click="openDriverForm">新增司机</button></view>
        </view>

        <view v-else-if="secondaryWorkspace === 'settlements'" class="page-pad secondary-workspace" data-visual-view="workspace-settlements">
          <view class="secondary-head"><button class="page-back" aria-label="返回" @click="closeSecondaryWorkspace"><UiIcon name="arrow-left" :size="20" /></button><text>结算账单</text></view>
          <view class="secondary-body">
          <view v-if="store.mySettlements.length" class="content-stack">
            <view v-for="item in store.mySettlements" :key="item.id" class="list-card">
              <view class="row">
                <view class="row-main">
                  <view class="row-top"><text class="order-no">{{ item.id }}</text><span class="badge">{{ item.status || 'pending' }}</span></view>
                  <text class="muted">周期 {{ item.period }} · 关联订单 {{ item.orderIds.length }} 单</text>
                  <text class="order-amount">{{ money(item.amount) }}</text>
                </view>
              </view>
            </view>
          </view>
          <view v-else class="empty-state pc-empty"><view class="pc-state-icon"><UiIcon name="package-check" :size="26" /></view><text>暂无结算账单</text></view>
          </view>
        </view>

        <view v-else-if="secondaryWorkspace === 'handovers'" class="page-pad secondary-workspace" data-visual-view="workspace-handovers">
          <view class="secondary-head"><button class="page-back" aria-label="返回" @click="closeSecondaryWorkspace"><UiIcon name="arrow-left" :size="20" /></button><text>交接日志</text></view>
          <view class="secondary-body">
          <view class="chips">
            <button v-for="item in handoverTypeFilters" :key="item" class="chip" :class="{ active: handoverFilter === item }" @click="handoverFilter = item">{{ item }}</button>
          </view>
          <view class="chips scroll-x filter-row">
            <button v-for="item in handoverDriverFilters" :key="item" class="chip" :class="{ active: handoverDriverFilter === item }" @click="handoverDriverFilter = item">{{ item }}</button>
          </view>
          <view v-if="filteredHandovers.length" class="content-stack">
            <view v-for="log in filteredHandovers" :key="log.id" class="list-card">
              <view class="row">
                <view class="row-main">
                  <view class="row-top"><text class="order-no">{{ log.orderId }}</text><span class="tag" :class="log.type">{{ log.type === 'out' ? '出库交接' : '到店交接' }}</span></view>
                  <text class="muted">{{ log.customer }} · {{ log.time }}</text>
                  <text class="muted">操作人：{{ log.operatorName }}（{{ log.operatorRole === 'driver' ? '司机' : '供应商' }}）{{ log.shortageCount ? ` · 缺货 ${log.shortageCount} 项` : '' }}{{ log.note ? ` · ${log.note}` : '' }}</text>
                  <text v-if="handoverCheckInText(log.orderId)" class="muted">{{ handoverCheckInText(log.orderId) }}</text>
                </view>
              </view>
            </view>
          </view>
          <view v-else class="empty-state pc-empty"><view class="pc-state-icon"><UiIcon name="list-tree" :size="26" /></view><text>暂无交接日志</text></view>
          </view>
        </view>

        <view v-else-if="secondaryWorkspace === 'routes'" class="page-pad secondary-workspace" data-visual-view="workspace-routes">
          <view class="secondary-head"><button class="page-back" aria-label="返回" @click="closeNamedRouteEditor"><UiIcon name="arrow-left" :size="20" /></button><text>{{ namedRouteDraft ? (namedRouteDraft.id ? '编辑线路' : '新建线路') : '线路规划' }}</text></view>
          <view class="secondary-body">
          <template v-if="!namedRouteDraft">
            <view class="route-controls">
              <view class="route-section-intro"><view><text class="eyebrow">配送配置</text><text class="route-section-title">命名线路</text><text class="muted">先固定门店顺序，再为指定日期发布配送任务</text></view><button class="outline-button" :class="{ 'is-loading': routeBusy }" :disabled="routeBusy" @click="generateTodayRoutes">按今天补生成</button></view>
            </view>
            <view v-if="supplierNamedRoutes.length" class="content-stack">
              <view v-for="route in supplierNamedRoutes" :key="route.id" class="list-card route-template-card">
                <view class="row-top"><view class="route-template-heading"><text class="order-no">{{ route.name }}</text><span class="tag" :class="routePublishedStatus(route.id) === '已发布' ? 'out' : ''">{{ routePublishedStatus(route.id) }}</span></view><button class="outline-button mini-button" @click="openNamedRouteEditor(route)">规划</button></view>
                <text class="route-template-path">{{ route.storeIds.map((id) => storeDirectory[id]?.storeName || id).join(' → ') || '尚未挂农家乐' }}</text>
                <text class="muted">{{ route.storeIds.length }} 家门店 · 线路司机 {{ namedRouteDriverName(route.driverId) }}</text>
              </view>
            </view>
            <view v-else class="empty-state pc-empty"><view class="pc-state-icon"><UiIcon name="navigation" :size="26" /></view><text>还没有命名线路，先新建东线 / 西线</text></view>
          </template>
          <view v-else class="named-route-form">
            <view class="route-plan-editor">
            <view class="route-workbench-status"><view><text class="eyebrow">线路模板编辑</text><text class="route-section-title">{{ namedRouteDraft.name || '未命名线路' }}</text><text class="muted">{{ namedRouteDraft.storeIds.length }} 家门店 · 可拖动顺序后重新预览</text></view><span class="tag" :class="store.routeDraft && store.routeDraft.id === routePreviewId ? 'out' : 'warning-tag'">{{ store.routeDraft && store.routeDraft.id === routePreviewId ? '预览就绪' : '待生成预览' }}</span></view>
            <label class="form-field"><text>线路名称</text><input v-model="namedRouteDraft.name" placeholder="如：东线" /></label>
            <view class="form-field"><text>线路司机</text><picker mode="selector" :range="namedRouteDriverLabels" @change="setRoutePlanDriver($event)"><view class="picker-field">{{ namedRouteDriverName(routePlanDriverId || namedRouteDraft.driverId) }}</view></picker></view>
            <label class="form-field"><text>配送日期</text><input v-model="routePlanDate" class="route-date" type="date" /></label>
            <view class="form-field"><text>添加农家乐</text><view class="chips"><button v-for="destination in storeOptions" :key="destination.storeId" class="chip" :class="{ active: namedRouteDraft.storeIds.includes(destination.storeId) }" @click="toggleNamedRouteStore(destination.storeId)">{{ destination.storeName }}</button></view></view>
            <view v-for="(storeId, index) in namedRouteDraft.storeIds" :key="storeId" class="list-card route-stop">
              <view class="route-number">{{ index + 1 }}</view>
              <view class="row-main"><text>{{ storeDirectory[storeId]?.storeName || storeId }}</text><text class="muted">{{ storeDirectory[storeId]?.address }}</text></view>
              <view class="route-actions"><button class="icon-button route-order-button" aria-label="上移" title="上移" :disabled="index === 0" @click="moveNamedRouteStore(index, -1)"><UiIcon name="chevron-left" :size="16" /></button><button class="icon-button route-order-button" aria-label="下移" title="下移" :disabled="index === namedRouteDraft.storeIds.length - 1" @click="moveNamedRouteStore(index, 1)"><UiIcon name="chevron-right" :size="16" /></button></view>
            </view>
            </view>
            <view class="route-planning-map">
              <view class="route-plan-actions"><button class="outline-button" :class="{ 'is-loading': routePreviewBusy }" :disabled="routePreviewBusy || !namedRouteDraft.id || !routePlanDriverId" @click="previewNamedRoute"><UiIcon name="navigation" :size="16" />生成路线预览</button><text v-if="!namedRouteDraft.id" class="muted">请先保存线路模板，再生成配送预览</text><text v-else-if="!routePreviewId" class="route-status-hint warning-text">修改线路后请重新生成预览</text></view>
              <view v-if="store.routeDraft && store.routeDraft.id === routePreviewId" class="route-preview">
                <view class="stat-grid route-metrics"><view><strong>{{ store.routeDraft.stops.length }}</strong><small>门店</small></view><view><strong>{{ store.routeDraft.totalDistanceKm.toFixed(1) }} km</strong><small>总距离</small></view><view><strong>{{ store.routeDraft.estimatedDurationMinutes }} 分钟</strong><small>预计时长</small></view></view>
                <view class="route-provider"><span class="tag">{{ routeProviderLabel(store.routeDraft.provider) }}</span><text class="muted">{{ store.routeDraft.sourceOrderIds.length }} 单待配送</text></view>
                <view v-if="store.routeDraft.warnings?.length" class="route-warnings"><text v-for="warning in store.routeDraft.warnings" :key="warning">{{ routeOptimizationWarningText(warning) }}</text></view>
                <DeliveryRouteMap :origin="store.routeDraft.origin" :stops="store.routeDraft.stops" :polyline="store.routeDraft.polyline" :selected-stop-id="selectedRouteStopId" :stop-count="store.routeDraft.stops.length" :total-distance-km="store.routeDraft.totalDistanceKm" :estimated-duration-minutes="store.routeDraft.estimatedDurationMinutes" @select-stop="selectRouteStop" />
                <view v-for="(stop, index) in store.routeDraft.stops" :key="stop.storeId" class="list-card route-stop" :class="{ 'route-stop-selected': selectedRouteStopId === stop.storeId }" @click="selectRouteStop(stop.storeId)">
                  <view class="route-number">{{ index + 1 }}</view><view class="row-main"><text>{{ stop.storeName }}</text><text class="muted">{{ stop.address }}</text><text class="muted">{{ stop.orderIds.length }} 单 · {{ stopItemCount(stop) }} 件</text></view>
                  <view class="route-actions"><button class="icon-button route-order-button" aria-label="上移" :disabled="index === 0" @click.stop="movePreviewStop(index, -1)">上移</button><button class="icon-button route-order-button" aria-label="下移" :disabled="index === store.routeDraft.stops.length - 1" @click.stop="movePreviewStop(index, 1)">下移</button></view>
                </view>
                <view v-if="selectedRouteStop" class="route-stop-detail"><text class="order-no">{{ selectedRouteStop.storeName }}</text><text class="muted">{{ selectedRouteStop.address }} · {{ selectedRouteStop.orderIds.length }} 单</text></view>
              </view>
            </view>
          </view>
          </view>
          <view class="secondary-foot route-bottom-actions"><template v-if="namedRouteDraft"><text class="muted route-bottom-hint">发布前请确认司机、日期和门店顺序</text><button class="outline-button route-publish" :class="{ 'is-loading': busyAction === 'save-route' }" :disabled="busyAction === 'save-route'" @click="saveNamedRouteDraft">保存线路模板</button><button class="primary-button route-publish" :class="{ 'is-loading': routePublishing }" :disabled="!store.routeDraft || store.routeDraft.id !== routePreviewId || routePublishing" @click="publishNamedRoute">发布配送线路</button></template><button v-else class="primary-button section-action" @click="openNamedRouteEditor()">新建线路</button></view>
        </view>

        <view v-else-if="secondaryWorkspace === 'warehouse'" class="page-pad secondary-workspace" data-visual-view="workspace-warehouse">
          <view class="secondary-head"><button class="page-back" aria-label="返回" @click="closeSecondaryWorkspace"><UiIcon name="arrow-left" :size="20" /></button><text>仓点设置</text></view>
          <view class="secondary-body">
          <view class="form-fields"><label class="form-field"><text>仓点地址</text><input v-model="warehouseForm.address" placeholder="请输入完整地址" /></label></view>
          </view>
          <view class="secondary-foot"><button class="primary-button route-publish" :class="{ 'is-loading': busyAction === 'warehouse' }" :disabled="busyAction === 'warehouse'" @click="saveWarehouse">保存仓点</button></view>
        </view>
      </template>
      <!-- 司机模块 -->
      <template v-else>
        <view v-if="driverTab === 'today'" class="page-pad" data-visual-view="driver-today">
          <view v-if="store.todayDriverRoutes.length" class="driver-route">
            <view v-if="store.todayDriverRoutes.length > 1" class="driver-route-switcher" aria-label="切换今日线路"><button v-for="route in store.todayDriverRoutes" :key="route.id" class="driver-route-tab" :class="{ active: store.currentDriverRoute?.id === route.id, completed: route.status === 'completed' }" @click="selectDriverRoute(route.id)"><text>{{ driverRouteName(route) }}</text><small>{{ route.stopCount || route.stops.length }} 家 · {{ driverRouteProgress(route) }}</small></button></view>
            <view v-if="store.currentDriverRoute" class="driver-route-active">
            <view class="route-driver-summary"><view><text class="eyebrow">当前执行线路</text><text class="section-title">{{ driverRouteName(store.currentDriverRoute) }}</text><text class="muted">{{ store.currentDriverRoute.status === 'completed' ? '今日配送已完成' : store.currentDriverRoute.status === 'stale' ? '任务或配置有变化，按已发布线路执行并联系供应商更新' : '已发布' }}</text><text class="muted">完成 {{ routeCompletedOrderCount }}/{{ routeOrderCount }} · {{ nextRouteStop ? `下一站 ${nextRouteStop.storeName}` : '全部完成' }} · {{ store.currentDriverRoute.stopCount || store.currentDriverRoute.stops.length }} 家农家乐</text></view><view><text class="order-no">{{ store.currentDriverRoute.totalDistanceKm.toFixed(1) }} km</text><text class="muted">约 {{ store.currentDriverRoute.estimatedDurationMinutes }} 分钟</text></view></view>
            <DeliveryRouteMap :origin="store.currentDriverRoute.origin" :stops="store.currentDriverRoute.stops" :polyline="store.currentDriverRoute.polyline" :stop-count="store.currentDriverRoute.stopCount || store.currentDriverRoute.stops.length" :total-distance-km="store.currentDriverRoute.totalDistanceKm" :estimated-duration-minutes="store.currentDriverRoute.estimatedDurationMinutes" />
            <view v-for="(stop, index) in store.currentDriverRoute.stops" :key="stop.storeId" class="list-card route-stop">
              <view class="route-number">{{ index + 1 }}</view><view class="row-main"><text>{{ stop.storeName }}</text><text class="muted">完成 {{ stop.completedOrderIds?.length || 0 }}/{{ stop.orderIds.length }} 单 · {{ stopItemCount(stop) }} 件 · 预计 {{ stopEstimatedMinutes(store.currentDriverRoute, index) }} 分钟</text><text class="muted">{{ stop.address }}</text><text class="muted">{{ storeInfoOf(stop).contact }} {{ storeInfoOf(stop).phone }}</text><text class="distance-text">分段 {{ stopSegment(store.currentDriverRoute, stop) ?? '待维护' }}{{ stopSegment(store.currentDriverRoute, stop) !== undefined ? ' km' : '' }}</text><text v-if="stop.checkIn" class="muted">已打卡 · {{ stop.checkIn.distanceM }} 米 · {{ stop.checkIn.at.replace('T', ' ').slice(0, 16) }}</text><view class="task-orders"><template v-for="order in stopOrders(stop)" :key="order.id"><button v-if="orderFulfillment(order).status !== 'received'" class="outline-button mini-button" :disabled="orderFulfillment(order).status === 'shipped' || !stop.checkIn" @click="openDriverHandover(order)">{{ order.id }} · {{ orderFulfillment(order).status === 'shipped' ? '待出库' : '到店交接' }}</button></template></view></view><view class="route-actions"><button v-if="!stop.checkIn" class="primary-button mini-button" :class="{ 'is-loading': busyAction === 'checkin' }" :disabled="busyAction === 'checkin'" @click="checkInAtStop(stop)">到店打卡</button><button v-if="!stop.completedAt" class="outline-button mini-button task-nav" @click="navigateToStop(stop)"><UiIcon name="navigation" :size="14" />{{ nextRouteStop?.storeId === stop.storeId ? '下一站' : '导航' }}</button></view>
            </view>
            </view>
          </view>
          <view v-else class="empty-state compact-empty pc-empty"><view class="pc-state-icon"><UiIcon name="navigation" :size="28" /></view><text>供应商尚未发布今日线路</text></view>
          <view class="section-title">待排线路<text class="section-sub">{{ store.pendingRouteTasks.length }} 单</text></view>
          <view v-if="store.pendingRouteTasks.length">
            <view v-for="order in store.pendingRouteTasks" :key="order.id" class="list-card"><view class="row-top"><text class="order-no">{{ order.id }}</text><span class="badge" :class="orderFulfillment(order).status">{{ statusText(orderFulfillment(order).status) }}</span></view><view class="task-store"><UiIcon name="map-pin" :size="16" /><view class="row-main"><text>{{ order.customer }}</text><text class="muted">{{ storeInfoOf(order).address }} · {{ storeInfoOf(order).contact }} {{ storeInfoOf(order).phone }}</text><text class="distance-text">{{ taskDistanceText(order) }}</text></view><button class="outline-button mini-button task-nav" @click="navigateToStore(order)"><UiIcon name="navigation" :size="14" />导航</button></view><button v-if="orderFulfillment(order).status !== 'shipped'" class="primary-button route-publish" @click="openDriverHandover(order)">到店交接</button></view>
          </view>
          <view v-else class="empty-state compact-empty pc-empty"><view class="pc-state-icon"><UiIcon name="package-check" :size="28" /></view><text>没有新增待排任务</text></view>
        </view>

        <view v-else-if="driverTab === 'history'" class="page-pad" data-visual-view="driver-history">
          <view v-if="store.myHistory.length">
            <view v-for="order in store.myHistory" :key="order.id" class="list-card">
              <view class="row-top"><text class="order-no">{{ order.id }}</text><span class="badge received">已收货</span></view>
              <view class="task-store"><UiIcon name="map-pin" :size="16" /><view class="row-main"><text>{{ order.customer }}</text><text class="muted">{{ order.createdAt }}</text><text v-if="handoverCheckInText(order.id)" class="muted">{{ handoverCheckInText(order.id) }}</text></view></view>
              <view class="task-items">
                <view v-for="item in order.items" :key="`${item.productId}-${item.skuId}`" class="task-item"><BusinessImage :src="item.image" mode="aspectFill" /><text>{{ item.name }}</text><text class="muted">×{{ item.quantity }}</text></view>
              </view>
            </view>
          </view>
          <view v-else class="empty-state pc-empty"><view class="pc-state-icon"><UiIcon name="package-check" :size="26" /></view><text>暂无历史任务</text></view>
        </view>

        <view v-else class="page-pad driver-mine" data-visual-view="driver-mine">
          <view class="pc-hero mine-hero">
            <span class="pc-hero-badge"><UiIcon name="user-round" :size="15" />司机工作台</span>
            <text class="pc-hero-name">{{ store.auth.name }}</text>
            <small class="pc-hero-uid">司机账号 {{ store.auth.account }}</small>
            <view class="pc-hero-data"><view><small>所属供应商</small><strong>{{ store.auth.supplierId || '—' }}</strong></view></view>
          </view>
          <view class="section-title">交接记录</view>
          <view v-if="store.myHandovers.length">
            <view v-for="log in store.myHandovers" :key="log.id" class="list-card">
              <view class="row">
                <span class="tag" :class="log.type">{{ log.type === 'out' ? '出库交接' : '到店交接' }}</span>
                <view class="row-main"><text class="order-no">{{ log.orderId }}</text><text class="muted">{{ log.customer }}</text><text class="muted">{{ log.time }}</text></view>
              </view>
            </view>
          </view>
          <view v-else class="empty-state pc-empty"><view class="pc-state-icon"><UiIcon name="list-tree" :size="26" /></view><text>暂无我的交接记录</text></view>
        </view>
      </template>

      <view v-if="store.auth.role === 'supplier' && active === 'products' && productWorkspace && !secondaryWorkspace" class="page-pad product-work-page" data-visual-view="supplier-products">
        <view class="product-work-head"><button v-if="productEditor" class="page-back" aria-label="返回商品管理" @click="cancelProductEditor"><UiIcon name="arrow-left" :size="18" /></button><view><text class="product-work-title">{{ productEditor ? (productEditorFormalId ? '编辑商品' : '发布商品') : '商品管理' }}</text><text class="muted">{{ productEditor ? '资料修改后需重新审核' : `${allSupplierProductRows.length} 条商品记录` }}</text></view><button v-if="!productEditor" class="primary-button mini-button add-product-button" @click="openNewProduct">新增商品</button></view>
        <view class="product-work-body">
        <template v-if="!productEditor">
          <view class="product-summary"><view><strong>{{ productStatusCount('active') }}</strong><small>已上架</small></view><view><strong>{{ productStatusCount('pending') }}</strong><small>待审核</small></view><view><strong>{{ productStatusCount('offline') }}</strong><small>已下架</small></view></view>
          <view class="search-bar product-search"><UiIcon name="search" :size="16" /><input v-model="productKeyword" placeholder="搜索商品名称 / 品类" confirm-type="search" /></view>
          <scroll-view class="product-filter-scroll" scroll-x><view class="product-filter-chips"><button v-for="item in productFilterStats" :key="item.label" :class="{ active: productFilter === item.label }" @click="productFilter = item.label">{{ item.label }}<text>{{ item.count }}</text></button></view></scroll-view>
          <view v-if="supplierProductRows.length" class="supplier-product-list">
            <view v-for="row in supplierProductRows" :key="row.key" class="supplier-product-card">
              <view class="supplier-product-main"><BusinessImage class="supplier-product-image" :src="row.product.image" mode="aspectFill" /><view class="row-main"><view class="row-top"><text class="supplier-product-name">{{ row.product.name }}</text><span class="badge" :class="row.status">{{ row.status === 'pending' ? '待审核' : row.status === 'rejected' ? '已驳回' : row.status === 'offline' ? '已下架' : '已上架' }}</span></view><view class="muted product-category-meta"><BusinessImage class="product-category-image" :src="productCategoryImage(row.product.category, productCategoryState)" :fallback="defaultProductCategoryImage(row.product.category)" :error-fallback="defaultProductCategoryImage()" :show-error="false" mode="aspectFill" /><text :title="row.product.category">{{ row.product.category }}</text><text>· {{ row.product.channel === 'store' ? '门店采购' : row.product.channel === 'live' ? '用户商城' : '全渠道' }}</text></view><view class="supplier-product-price"><strong>¥{{ row.product.skus[0]?.retailPrice.toFixed(2) || '0.00' }}</strong><small>{{ row.product.skus.length }} 个规格 · 库存 {{ row.product.skus.reduce((sum, sku) => sum + sku.stock, 0) }}</small></view></view></view>
              <view class="supplier-product-skus"><text v-for="sku in row.product.skus.filter((item) => item.status !== 'retired')" :key="sku.id">{{ sku.name }}<small>¥{{ sku.retailPrice }} · 库存 {{ sku.stock }} · {{ sku.minimumOrderQuantity === 0 ? '无起订限制' : `起订 ${sku.minimumOrderQuantity || 1}` }}</small></text></view>
              <text v-if="row.submission?.reviewNote" class="product-reject-note">驳回原因：{{ row.submission.reviewNote }}</text>
              <view class="order-actions"><button v-if="row.status === 'rejected'" class="primary-button mini-button" @click="openProductEditor(row.product, row.submission)">重新提交</button><button v-else-if="row.status !== 'pending'" class="outline-button mini-button" @click="openProductEditor(row.product)">编辑</button><button v-if="row.status === 'active' || row.status === 'offline'" class="outline-button mini-button" :class="{ 'is-loading': busyAction === 'toggle-product' }" :disabled="busyAction === 'toggle-product'" @click="toggleSupplierProduct(row.product)">{{ row.status === 'active' ? '下架' : '上架' }}</button></view>
            </view>
          </view>
          <view v-else class="empty-state pc-empty"><view class="pc-state-icon"><UiIcon name="package" :size="26" /></view><text>暂无{{ productFilter }}商品</text></view>
        </template>
        <view v-else class="supplier-product-form">
          <view class="form-section"><text class="form-section-title">商品图片</text><view class="media-field"><text>商品主图</text><ImageUploader v-model="productEditor.image" purpose="supplier-catalog-main" profile="normal" /></view><view class="media-field"><text>商品图集（最多 9 张）</text><ImageUploader v-model="productEditor.images" purpose="supplier-catalog-gallery" profile="normal" multiple :max-count="9" /></view></view>
          <view class="form-section"><text class="form-section-title">基础信息</text><label class="form-field"><text>商品名称</text><input v-model="productEditor.name" placeholder="请输入商品名称" /></label><view class="form-field"><text>商品品类</text><button class="category-picker-trigger" type="button" @click="categoryPickerOpen = true"><view><BusinessImage class="category-picker-trigger-image" :src="productCategoryImage(productEditor.category, productCategoryState)" :fallback="defaultProductCategoryImage(productEditor.category)" :error-fallback="defaultProductCategoryImage()" :show-error="false" mode="aspectFill" /><text :title="productEditor.category">{{ productEditor.category || '请选择商品品类' }}</text></view><UiIcon name="chevron-right" :size="16" /></button></view><label class="form-field"><text>商品标签</text><input v-model="productTagText" placeholder="多个标签用逗号分隔" /></label><label class="form-field"><text>销售渠道</text><picker mode="selector" :range="productChannelLabels" @change="setProductChannel"><view class="picker-field">{{ productChannelLabel(productEditor.channel) }}</view></picker></label><label class="checkbox-field"><checkbox :checked="productEditor.expressDelivery" @click="productEditor.expressDelivery = !productEditor.expressDelivery" /><text>支持快递直发</text></label></view>
          <view class="form-section supplier-sku-form"><view class="sku-section-head"><view><text class="form-section-title">SKU 规格</text><small>价格、库存、起订量和分销金额</small></view><button class="outline-button mini-button" @click="addSupplierSku">添加规格</button></view><view v-for="(sku, index) in productEditor.skus" :key="sku.id" class="supplier-sku-fields" :class="{ retired: sku.status === 'retired' }"><view class="sku-card-head"><text>规格 {{ index + 1 }}</text><button v-if="sku.status === 'retired'" @click="restoreSupplierSku(index)">恢复</button><button v-else @click="removeSupplierSku(index)">删除</button></view><view class="sku-image-field"><text>规格图片</text><ImageUploader v-model="sku.image" :purpose="`supplier-catalog-sku-${sku.id}`" profile="normal" :disabled="sku.status === 'retired'" /></view><view class="sku-input-grid"><label><text>规格名称</text><input v-model="sku.name" :disabled="sku.status === 'retired'" placeholder="如：500g/盒" /></label><label><text>零售价</text><input v-model.number="sku.retailPrice" :disabled="sku.status === 'retired'" type="number" min="0" /></label><label><text>供货价</text><input v-model.number="sku.cost" :disabled="sku.status === 'retired'" type="number" min="0" /></label><label><text>库存</text><input v-model.number="sku.stock" :disabled="sku.status === 'retired'" type="number" min="0" /></label><label><text>起订量</text><input v-model.number="sku.minimumOrderQuantity" :disabled="sku.status === 'retired'" type="number" min="0" step="1" placeholder="0 表示无起订限制" /></label><label><text>一级分销金额</text><input v-model.number="sku.level1Amount" :disabled="sku.status === 'retired'" type="number" min="0" /></label><label><text>二级分销金额</text><input v-model.number="sku.level2Amount" :disabled="sku.status === 'retired'" type="number" min="0" /></label></view></view></view>
          <text v-if="productFormError" class="form-error">{{ productFormError }}</text>
        </view>
        </view>
        <view v-if="productEditor" class="product-form-actions"><button class="outline-button" @click="cancelProductEditor">取消</button><button v-if="productEditorFormalId" class="outline-button" :class="{ 'is-loading': busyAction === 'save-stock' }" :disabled="busyAction === 'save-stock'" @click="saveSupplierProductStock">仅保存库存</button><button class="primary-button" :class="{ 'is-loading': busyAction === 'submit-product' }" :disabled="busyAction === 'submit-product'" @click="submitSupplierProduct">{{ productEditorFormalId ? '提交资料审核' : '提交审核' }}</button></view>
      </view>

      <!-- 底部 tabbar -->
      <view class="tabbar">
        <button v-for="tab in currentTabs" :key="tab.key" class="tab-item bottom-tab" :class="{ active: isTabActive(tab.key) }" @click="switchTab(tab.key)">
          <UiIcon :name="tab.icon" :size="20" />
          <text>{{ tab.label }}</text>
          <span v-if="tab.badge()" class="tab-badge" data-typography-compact>{{ tab.badge() }}</span>
        </button>
      </view>
      <!-- 弹层 -->
      <view v-if="sheet" class="sheet-mask" @click.self="closeSheet">
        <view class="sheet-panel">
          <view class="sheet-handle"></view>
          <view v-if="sheet === 'order' && selectedOrder" class="order-detail" data-visual-sheet="order">
            <view class="sheet-head"><text class="sheet-title">{{ selectedOrder.id }}</text><button class="icon-button" aria-label="关闭" @click="closeSheet"><UiIcon name="x" :size="18" /></button></view>
            <scroll-view class="sheet-scroll" scroll-y>
            <view class="row detail-status-row"><span class="badge" :class="orderFulfillment(selectedOrder).status">{{ statusText(orderFulfillment(selectedOrder).status, selectedOrder) }}</span><text class="muted">{{ selectedOrder.createdAt }}</text></view>
            <view class="steps">
              <view v-for="(step, index) in fulfillmentSteps" :key="step" class="step" :class="{ done: stepIndex(selectedOrder) >= index }"><view class="step-dot">{{ index + 1 }}</view><text class="step-label">{{ stepLabel(step) }}</text></view>
            </view>
            <view class="section-title">商品明细</view>
            <view v-for="item in selectedOrder.items" :key="`${item.productId}-${item.skuId}`" class="order-item-line">
              <BusinessImage :src="item.image" mode="aspectFill" /><view class="row-main"><text>{{ item.name }}</text><text class="muted">{{ item.skuName }} ×{{ item.quantity }}</text></view><text class="order-item-price">{{ money(item.price * item.quantity) }}</text>
            </view>
            <view class="section-title">收货门店</view>
            <view class="store-line"><UiIcon name="map-pin" :size="16" /><view class="row-main"><text>{{ isCourierOrder(selectedOrder) ? '收货地址' : selectedOrder.customer }}</text><text class="muted">{{ addressLabel(selectedOrder) }}</text></view></view>
            <view v-if="orderShortage(selectedOrder).length" class="section-title">缺货清单 <span class="tag danger">缺货 {{ orderShortage(selectedOrder).length }} 项</span></view>
            <view v-if="orderShortage(selectedOrder).length">
              <view v-for="item in orderShortage(selectedOrder)" :key="item.skuId" class="shortage-line">
                <view class="row-main"><text>{{ item.name }}</text><text class="muted">应发 {{ item.ordered }} · 实发 {{ item.actual }}</text></view>
                <span class="tag" :class="item.handled ? 'out' : 'danger'">{{ item.handled ? '已补发' : '缺 ' + item.shortage }}</span>
                <button v-if="store.auth.role === 'supplier' && !item.handled" class="outline-button mini-button" :class="{ 'is-loading': busyAction === 'mark-handled' }" :disabled="busyAction === 'mark-handled'" @click="markHandled(item.skuId)">标记补发</button>
              </view>
            </view>
            <view class="section-title">交接记录</view>
            <view v-if="handoversOf(selectedOrder).length" class="log-list">
              <view v-for="log in handoversOf(selectedOrder)" :key="log.id" class="log-event"><view class="log-dot"></view><view class="row-main"><text>{{ log.type === 'out' ? '出库交接' : '到店交接' }} · {{ log.operatorName }}</text><text class="muted">{{ log.time }} · {{ log.operatorRole === 'driver' ? '司机' : '供应商' }}{{ log.shortageCount ? ` · 缺货 ${log.shortageCount} 项` : '' }}{{ log.note ? ` · ${log.note}` : '' }}</text></view></view>
            </view>
            <view v-else class="empty-state compact-empty pc-empty"><view class="pc-state-icon"><UiIcon name="list-tree" :size="26" /></view><text>暂无交接记录</text></view>
            <view class="section-title">流转记录</view>
            <view class="log-list">
              <view v-for="(event, index) in (selectedOrder.flow || [])" :key="index" class="log-event"><view class="log-dot"></view><view class="row-main"><text>{{ event.action }}</text><text class="muted">{{ event.time }} · {{ event.operator }}</text></view></view>
            </view>
            </scroll-view>
            <view v-if="orderActions(selectedOrder).length" class="sheet-actions sheet-foot">
              <button v-for="action in orderActions(selectedOrder)" :key="action.key" class="outline-button" :class="{ 'is-loading': busyAction === action.key, 'primary-button': action.primary }" :disabled="busyAction === action.key" @click="runAction(action.key, selectedOrder)">{{ action.label }}</button>
            </view>
          </view>

          <view v-else-if="sheet === 'courier' && selectedOrder" class="courier-sheet" data-visual-sheet="courier">
            <view class="sheet-head"><text class="sheet-title">快递直发</text><button class="icon-button" aria-label="关闭" @click="closeSheet"><UiIcon name="x" :size="18" /></button></view>
            <scroll-view class="sheet-scroll" scroll-y>
            <text class="muted">订单 {{ selectedOrder.id }} · {{ recipientLabel(selectedOrder) }}</text>
            </scroll-view>
            <view class="sheet-actions sheet-foot">
              <button class="primary-button" :class="{ 'is-loading': busyAction === 'courier' }" :disabled="busyAction === 'courier'" @click="confirmCourier">确认发货</button>
              <button class="outline-button" @click="closeSheet">取 消</button>
            </view>
          </view>

          <view v-else-if="sheet === 'handover-out' && selectedOrder" class="handover-sheet" data-visual-sheet="handover-out">
            <view class="sheet-head"><text class="sheet-title">出库交接</text><button class="icon-button" aria-label="关闭" @click="closeSheet"><UiIcon name="x" :size="18" /></button></view>
            <scroll-view class="sheet-scroll" scroll-y>
            <text class="muted">订单 {{ selectedOrder.id }} · {{ selectedOrder.customer }}，按明细录入实发数量（缺货自动计算）</text>
            <view v-if="handoverResult" class="handover-result">
              <text>交接完成</text>
              <text class="handover-result-sub" v-if="handoverResult.shortages.length">缺货 {{ handoverResult.shortages.length }} 项：{{ handoverResult.shortages.map((item) => `${item.name} 缺 ${item.shortage}`).join('、') }}</text>
              <text class="handover-result-sub" v-else>全部商品足量出库</text>
            </view>
            <view v-else class="actual-list">
              <view v-for="item in selectedOrder.items" :key="item.skuId" class="actual-line">
                <view class="row-main"><text>{{ item.name }}</text><text class="muted">{{ item.skuName }} · 应发 {{ item.quantity }}</text></view>
                <label class="actual-input"><text>实发</text><input type="number" :min="0" :max="item.quantity" v-model.number="actuals[item.skuId]" /></label>
              </view>
              <label class="form-field note-field"><text>备注（可选）</text><input v-model="handoverNote" placeholder="交接备注" /></label>
            </view>
            </scroll-view>
            <view class="sheet-actions sheet-foot">
              <button v-if="!handoverResult" class="primary-button" :class="{ 'is-loading': busyAction === 'handover-out' }" :disabled="busyAction === 'handover-out'" @click="confirmHandoverOut">确认交接</button>
              <button class="outline-button" @click="closeSheet">{{ handoverResult ? '完 成' : '取 消' }}</button>
            </view>
          </view>
          <view v-else-if="sheet === 'handover-in' && selectedOrder" class="handover-sheet" data-visual-sheet="handover-in">
            <view class="sheet-head"><text class="sheet-title">到店交接</text><button class="icon-button" aria-label="关闭" @click="closeSheet"><UiIcon name="x" :size="18" /></button></view>
            <scroll-view class="sheet-scroll" scroll-y>
            <view class="store-line"><UiIcon name="map-pin" :size="16" /><view class="row-main"><text>{{ selectedOrder.customer }}</text><text class="muted">{{ storeInfoOf(selectedOrder.customer).address }} · {{ storeInfoOf(selectedOrder.customer).contact }} {{ storeInfoOf(selectedOrder.customer).phone }}</text></view></view>
            <view class="section-title">商品明细</view>
            <view v-for="item in selectedOrder.items" :key="`${item.productId}-${item.skuId}`" class="order-item-line"><BusinessImage :src="item.image" mode="aspectFill" /><view class="row-main"><text>{{ item.name }}</text><text class="muted">{{ item.skuName }} ×{{ item.quantity }}</text></view><text class="order-item-price">{{ money(item.price * item.quantity) }}</text></view>
            <view v-if="orderShortage(selectedOrder).length" class="section-title">缺货提示</view>
            <view v-if="orderShortage(selectedOrder).length">
              <view v-for="item in orderShortage(selectedOrder)" :key="item.skuId" class="shortage-line"><text>{{ item.name }}</text><span class="tag danger">缺 {{ item.shortage }}</span></view>
            </view>
            <label class="form-field note-field"><text>备注（可选）</text><input v-model="handoverNote" placeholder="交接备注" /></label>
            </scroll-view>
            <view class="sheet-actions sheet-foot">
              <button class="primary-button" :class="{ 'is-loading': busyAction === 'handover-in' }" :disabled="busyAction === 'handover-in'" @click="confirmHandoverIn">确认已送达门店</button>
              <button class="outline-button" @click="closeSheet">取 消</button>
            </view>
          </view>

          <view v-else-if="sheet === 'driver-form' || sheet === 'driver-edit'" class="driver-form-sheet" data-visual-sheet="driver-form-edit">
            <view class="sheet-head"><text class="sheet-title">{{ sheet === 'driver-form' ? '新增司机' : '编辑司机' }}</text><button class="icon-button" aria-label="关闭" @click="closeSheet"><UiIcon name="x" :size="18" /></button></view>
            <scroll-view class="sheet-scroll" scroll-y>
            <view class="form-fields">
              <label class="form-field"><text>姓名</text><input v-model="driverForm.name" placeholder="司机姓名" /></label>
              <label class="form-field"><text>手机号</text><input v-model="driverForm.phone" type="number" maxlength="11" placeholder="11 位手机号" /></label>
              <label v-if="sheet === 'driver-form'" class="form-field"><text>账号</text><input v-model="driverForm.account" placeholder="4-20 位字母数字，登录用" /></label>
              <label v-if="sheet === 'driver-form'" class="form-field"><text>初始密码</text><input v-model="driverForm.password" placeholder="6-20 位" /></label>
            </view>
            <text v-if="driverFormError" class="form-error">{{ driverFormError }}</text>
            </scroll-view>
            <view class="sheet-actions sheet-foot">
              <button class="primary-button" :class="{ 'is-loading': busyAction === 'save-driver' }" :disabled="busyAction === 'save-driver'" @click="saveDriver">{{ sheet === 'driver-form' ? '创建账号' : '保存' }}</button>
              <button class="outline-button" @click="closeSheet">取 消</button>
            </view>
          </view>

          <view v-else-if="sheet === 'driver-reset' && editingDriver" class="driver-form-sheet" data-visual-sheet="driver-reset">
            <view class="sheet-head"><text class="sheet-title">重置密码 · {{ editingDriver.name }}</text><button class="icon-button" aria-label="关闭" @click="closeSheet"><UiIcon name="x" :size="18" /></button></view>
            <scroll-view class="sheet-scroll" scroll-y>
            <label class="form-field"><text>新密码</text><input v-model="resetPassword" type="password" placeholder="6-20 位" confirm-type="done" @confirm="confirmReset" /></label>
            <text v-if="driverFormError" class="form-error">{{ driverFormError }}</text>
            </scroll-view>
            <view class="sheet-actions sheet-foot">
              <button class="primary-button" :class="{ 'is-loading': busyAction === 'reset-password' }" :disabled="busyAction === 'reset-password'" @click="confirmReset">确认重置</button>
              <button class="outline-button" @click="closeSheet">取 消</button>
            </view>
          </view>

          <view v-else-if="sheet === 'reset-confirm'" class="driver-form-sheet" data-visual-sheet="reset-confirm">
            <view class="sheet-head"><text class="sheet-title">重置演示数据</text><button class="icon-button" aria-label="关闭" @click="closeSheet"><UiIcon name="x" :size="18" /></button></view>
            <scroll-view class="sheet-scroll" scroll-y>
            <text class="muted">将清空本地订单、司机与交接数据并恢复为初始演示数据（同源下其它端共享数据也会重置为演示集）。</text>
            </scroll-view>
            <view class="sheet-actions sheet-foot">
              <button class="primary-button" :class="{ 'is-loading': busyAction === 'reset-demo' }" :disabled="busyAction === 'reset-demo'" @click="confirmResetDemo">确认重置</button>
              <button class="outline-button" @click="closeSheet">取 消</button>
            </view>
          </view>

          <view v-else-if="sheet === 'driver-toggle-confirm' && driverStatusTarget" class="driver-form-sheet" data-visual-sheet="driver-toggle-confirm">
            <view class="sheet-head"><text class="sheet-title">{{ driverStatusTarget.status === 'active' ? '停用司机' : '启用司机' }}</text><button class="icon-button" aria-label="关闭" @click="closeSheet"><UiIcon name="x" :size="18" /></button></view>
            <scroll-view class="sheet-scroll" scroll-y>
            <text class="muted">{{ driverToggleMessage(driverStatusTarget) }}</text>
            </scroll-view>
            <view class="sheet-actions sheet-foot">
              <button :class="driverStatusTarget.status === 'active' ? 'danger-button' : 'primary-button'" @click="confirmToggle">{{ driverStatusTarget.status === 'active' ? '确认停用' : '确认启用' }}</button>
              <button class="outline-button" @click="closeSheet">取 消</button>
            </view>
          </view>
        </view>
      </view>
    </template>
  </view>

  <view v-if="categoryPickerOpen" class="category-picker-mask" @click.self="categoryPickerOpen = false">
    <view class="category-picker-sheet" data-visual-sheet="category-picker">
      <view class="sheet-head"><text class="sheet-title">选择商品品类</text><button class="icon-button" aria-label="关闭" @click="categoryPickerOpen = false"><UiIcon name="x" :size="18" /></button></view>
      <scroll-view class="category-picker-list" scroll-y>
        <button v-for="option in productCategoryOptions" :key="option.label" class="category-picker-option" :class="{ selected: productEditor?.category === option.label }" @click="selectProductCategory(option.label)">
          <view class="category-picker-option-main"><BusinessImage class="category-picker-option-image" :src="option.image" :fallback="defaultProductCategoryImage(option.label)" :error-fallback="defaultProductCategoryImage()" :show-error="false" mode="aspectFill" /><view><text :title="option.label">{{ option.label }}</text><small v-if="option.legacy">历史分类</small></view></view>
          <UiIcon v-if="productEditor?.category === option.label" name="check" :size="18" />
        </button>
      </scroll-view>
    </view>
  </view>
  <view v-if="toastMsg" class="toast">{{ toastMsg }}</view>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { CatalogProduct, CatalogProductSubmission, DailyDeliveryRoute, DriverAccount, Order, PlatformDictionaryState, RouteStop, ShortageItem } from '@agritainment/shared'
import { PLATFORM_DICTIONARIES_STORAGE_KEY, defaultProductCategoryImage, productCategoryImage, readPlatformDictionaries } from '@agritainment/shared'
import { PLATFORM_AUDIT_LOG_STORAGE_KEY, PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY, PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_C_ORDERS_STORAGE_KEY, PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY, PLATFORM_DRIVERS_STORAGE_KEY, PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY, PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_NAMED_DELIVERY_ROUTES_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY, PLATFORM_SUPPLIER_ACCOUNTS_STORAGE_KEY, PLATFORM_SUPPLIER_SETTLEMENTS_STORAGE_KEY, configurePlatformProviders, createDrivingRouteOptimizationProvider, createGeocodeProviders, createId, geocodeAddress, installKeyboardButtonSupport, money, subscribePlatformChanges, todayString } from '@agritainment/shared'
import { BusinessImage, ImageUploader } from '@agritainment/ui'
import { routeOptimizationWarningText } from '../../delivery-map'
import DeliveryRouteMap from '../../components/DeliveryRouteMap.vue'
import UiIcon from '../../components/UiIcon.vue'
import { buildNavigationUrl, deliveryDistanceKm, resolveOrderStore, seedSupplierDemoRouteOnce, storeDirectory, storeInfoOf, supplierInfo, supplierWarehouseOf } from '../../services/repository'
import { useSupplierStore } from '../../stores/supplier'
import { createSharedRefreshRunner } from './shared-refresh'
import { buildProductCategoryOptions } from './product-categories'

const store = useSupplierStore()
let disposeKeyboardButtons: () => void = () => undefined
let disposeStorageSync: (() => void) | null = null
let disposePlatformChanges: (() => void) | null = null
let disposeVisibilitySync: (() => void) | null = null
const platformChangeKeys = [PLATFORM_ORDERS_STORAGE_KEY, PLATFORM_DRIVERS_STORAGE_KEY, PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY, PLATFORM_NAMED_DELIVERY_ROUTES_STORAGE_KEY, PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY, PLATFORM_C_ORDERS_STORAGE_KEY, PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_SUPPLIER_ACCOUNTS_STORAGE_KEY, PLATFORM_SUPPLIER_SETTLEMENTS_STORAGE_KEY, PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY, PLATFORM_DICTIONARIES_STORAGE_KEY]
const refreshSharedState = createSharedRefreshRunner(
  async () => { await store.refreshSharedState(); refreshProductCategoryLabels() },
  (error) => { store.error = error instanceof Error ? error.message : '数据加载失败' }
)
const busy = ref(false)
const busyAction = ref('')
const toastMsg = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined

function toast(text: string) {
  toastMsg.value = text
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastMsg.value = '' }, 2200)
}

async function runBusy<T>(key: string, fn: () => Promise<T>): Promise<T | undefined> {
  if (busyAction.value) return
  busyAction.value = key
  try {
    return await fn()
  } finally {
    busyAction.value = ''
  }
}

// ---------- 登录（自动填充）----------
const loginRole = ref<'supplier' | 'driver'>('supplier')
const loginAccount = ref('13787366688')
const loginPassword = ref('13787366688')

function switchLoginRole(role: 'supplier' | 'driver') {
  loginRole.value = role
  store.loginError = ''
  loginAccount.value = role === 'supplier' ? '13787366688' : 'driver01'
  loginPassword.value = role === 'supplier' ? '13787366688' : '123456'
}

function submitLogin() {
  if (!loginAccount.value.trim() || !loginPassword.value) {
    store.loginError = '请输入账号和密码'
    return
  }
  busy.value = true
  const ok = loginRole.value === 'supplier'
    ? store.loginSupplier(loginAccount.value, loginPassword.value)
    : store.loginDriver(loginAccount.value, loginPassword.value)
  busy.value = false
  if (ok) {
    toast(loginRole.value === 'supplier' ? '供应商登录成功' : `司机 ${store.auth.name} 登录成功`)
    active.value = 'orders'
    secondaryWorkspace.value = null
    driverTab.value = 'today'
    void store.ensureTodayRoutes()
  }
}

function logout() {
  store.logout()
  closeSheet()
}

// ---------- 底部 tab（按角色）----------
type SupplierTab = 'orders' | 'products' | 'mine'
const active = ref<SupplierTab>('orders')
const supplierTabs = [
  { key: 'orders' as const, label: '订单', icon: 'package', badge: () => store.metrics.toAcceptCount },
  { key: 'products' as const, label: '商品', icon: 'package-check', badge: () => pendingProductCount.value },
  { key: 'mine' as const, label: '我的', icon: 'user-round', badge: () => 0 }
]
type DriverTab = 'today' | 'history' | 'mine'
const driverTab = ref<DriverTab>('today')
const driverTabs = [
  { key: 'today' as const, label: '今日线路', icon: 'navigation', badge: () => store.pendingRouteTasks.length },
  { key: 'history' as const, label: '历史任务', icon: 'calendar-check', badge: () => 0 },
  { key: 'mine' as const, label: '我的', icon: 'user-round', badge: () => 0 }
]
type SecondaryWorkspace = 'drivers' | 'routes' | 'settlements' | 'handovers' | 'warehouse'
const secondaryWorkspace = ref<SecondaryWorkspace | null>(null)
const currentTabs = computed(() => (store.auth.role === 'supplier' ? supplierTabs : driverTabs))
function isTabActive(key: string) {
  return store.auth.role === 'supplier' ? active.value === key : driverTab.value === key
}
function switchTab(key: string) {
  secondaryWorkspace.value = null
  if (store.auth.role === 'supplier') {
    active.value = key as SupplierTab
    if (key === 'products') openProductWorkspace()
  }
  else driverTab.value = key as DriverTab
}
function openSecondaryWorkspace(key: SecondaryWorkspace) {
  active.value = 'mine'
  secondaryWorkspace.value = key
  if (key === 'warehouse') {
    const warehouse = supplierWarehouseOf(store.auth.supplierId, store.suppliers)
    warehouseForm.address = warehouse?.address || ''
  }
}
function closeSecondaryWorkspace() { secondaryWorkspace.value = null }

// ---------- 订单 ----------
const orderFilter = ref('全部')
const orderKeyword = ref('')
const orderStatusKeys = ['全部', 'submitted', 'accepted', 'shipped', 'delivering', 'received', 'cancelled', '缺货'] as const
const orderFilters = computed(() => orderStatusKeys.map((key) => ({
  key,
  label: key === '全部' ? '全部' : key === '缺货' ? '缺货' : store.statusText(key),
  count: store.supplierOrderCounts[key] ?? 0
})))
const filteredOrders = computed(() => store.supplierOrders.filter((order) => {
  const matchesFilter = orderFilter.value === '全部' || (orderFilter.value === '缺货' ? orderShortage(order).length > 0 : orderFulfillment(order).status === orderFilter.value)
  const keyword = orderKeyword.value.trim().toLowerCase()
  const matchesKeyword = !keyword || `${order.id}${order.customer}`.toLowerCase().includes(keyword)
  return matchesFilter && matchesKeyword
}))
const selectedOrder = ref<Order | null>(null)
const selectedOrderIds = ref<string[]>([])
const sheet = ref<null | 'order' | 'courier' | 'handover-out' | 'handover-in' | 'driver-form' | 'driver-edit' | 'driver-reset' | 'driver-toggle-confirm' | 'reset-confirm'>(null)

function orderFulfillment(order: Order) {
  return order.supplierFulfillment || { status: 'submitted', shortages: [], handovers: [], updatedAt: order.createdAt }
}

// ---------- 商品二级工作页 ----------
const productWorkspace = ref(false)
const productFilter = ref<'全部' | '待审核' | '已驳回' | '已下架' | '已上架'>('全部')
const productFilters = ['全部', '待审核', '已驳回', '已下架', '已上架'] as const
const productChannelOptions: CatalogProduct['channel'][] = ['store', 'live', 'all']
const productChannelLabels = ['门店采购', '用户商城', '全渠道']
const productEditor = ref<CatalogProduct | null>(null)
const productEditorFormalId = ref('')
const productFormError = ref('')
const productKeyword = ref('')
const productTagText = ref('')
const persistedSupplierSkuIds = ref<Set<string>>(new Set())
const categoryPickerOpen = ref(false)
const productCategoryState = ref<PlatformDictionaryState>(readPlatformDictionaries())
const productCategoryOptions = computed(() => buildProductCategoryOptions(productCategoryState.value, productEditor.value?.category))

function refreshProductCategoryLabels() {
  productCategoryState.value = readPlatformDictionaries()
}

function selectProductCategory(label: string) {
  if (productEditor.value) productEditor.value.category = label
  categoryPickerOpen.value = false
}

type SupplierProductRow = { key: string; product: CatalogProduct; status: 'pending' | 'rejected' | 'active' | 'offline'; submission?: CatalogProductSubmission }
const allSupplierProductRows = computed<SupplierProductRow[]>(() => {
  const formal = store.myCatalogProducts.map((product) => ({ key: `formal:${product.id}`, product, status: product.status as 'active' | 'offline' }))
  const submissions = store.myProductSubmissions.filter((item) => item.status !== 'approved').map((submission) => ({ key: `submission:${submission.id}`, product: submission.draft, status: submission.status as 'pending' | 'rejected', submission }))
  const submissionProductIds = new Set(submissions.map((row) => row.product.id))
  return [...submissions, ...formal.filter((row) => !submissionProductIds.has(row.product.id))]
})
const supplierProductRows = computed<SupplierProductRow[]>(() => {
  const keyword = productKeyword.value.trim().toLowerCase()
  return allSupplierProductRows.value.filter((row) => (productFilter.value === '全部'
    || (productFilter.value === '待审核' && row.status === 'pending')
    || (productFilter.value === '已驳回' && row.status === 'rejected')
    || (productFilter.value === '已下架' && row.status === 'offline')
    || (productFilter.value === '已上架' && row.status === 'active'))
    && (!keyword || `${row.product.name}${row.product.category}${row.product.tags.join('')}`.toLowerCase().includes(keyword)))
})
const productStatusCount = (status: SupplierProductRow['status']) => allSupplierProductRows.value.filter((row) => row.status === status).length
const productFilterStats = computed(() => productFilters.map((label) => ({ label, count: label === '全部' ? allSupplierProductRows.value.length : productStatusCount(label === '待审核' ? 'pending' : label === '已驳回' ? 'rejected' : label === '已下架' ? 'offline' : 'active') })))

function openProductWorkspace() {
  active.value = 'products'
  productWorkspace.value = true
  productEditor.value = null
}

function closeProductWorkspace() {
  productWorkspace.value = false
  productEditor.value = null
  productFormError.value = ''
  if (active.value === 'products') active.value = 'orders'
}

function openNewProduct() {
  refreshProductCategoryLabels()
  const supplier = store.currentSupplier
  productEditorFormalId.value = ''
  productEditor.value = {
    id: createId('P'), name: '', category: productCategoryOptions.value[0]?.label || '农产品', supplierId: store.auth.supplierId, supplierName: supplier?.name || store.auth.name,
    source: 'platform', status: 'active', image: '', images: [], tags: [], productType: 'goods', expressDelivery: true,
    channel: 'live', farmIds: [], promoterCommissionRate: 5, storeCommissionRate: 3,
    skus: [{ id: createId('SKU'), name: '默认规格', image: '', retailPrice: 59.9, cost: 30, stock: 0, minimumOrderQuantity: 1, level1Amount: 10, level2Amount: 15, status: 'active' }]
  }
  productTagText.value = ''
  persistedSupplierSkuIds.value = new Set()
  productFormError.value = ''
}

function openProductEditor(product: CatalogProduct, submission?: CatalogProductSubmission) {
  refreshProductCategoryLabels()
  productEditor.value = JSON.parse(JSON.stringify(submission?.draft || product)) as CatalogProduct
  productEditorFormalId.value = store.myCatalogProducts.some((item) => item.id === product.id) ? product.id : ''
  productTagText.value = productEditor.value.tags.join('，')
  persistedSupplierSkuIds.value = new Set(product.skus.map((sku) => sku.id))
  productFormError.value = ''
}

function cancelProductEditor() {
  categoryPickerOpen.value = false
  productEditor.value = null
  productFormError.value = ''
}

function addSupplierSku() {
  if (!productEditor.value) return
  productEditor.value.skus.push({ id: createId('SKU'), name: `规格 ${productEditor.value.skus.length + 1}`, image: productEditor.value.image, retailPrice: 0, cost: 0, stock: 0, minimumOrderQuantity: 1, level1Amount: 0, level2Amount: 0, status: 'active' })
}

function removeSupplierSku(index: number) {
  if (!productEditor.value) return
  const activeSkus = productEditor.value.skus.filter((sku) => sku.status !== 'retired')
  if (activeSkus.length <= 1) { productFormError.value = 'SKU 至少保留一个有效规格'; return }
  const sku = productEditor.value.skus[index]
  if (!sku) return
  if (persistedSupplierSkuIds.value.has(sku.id)) sku.status = 'retired'
  else productEditor.value.skus.splice(index, 1)
}

function restoreSupplierSku(index: number) {
  const sku = productEditor.value?.skus[index]
  if (sku) sku.status = 'active'
}

function setProductChannel(event: { detail: { value: string | number } }) {
  if (productEditor.value) productEditor.value.channel = productChannelOptions[Number(event.detail.value)] || 'store'
}

function productChannelLabel(channel: CatalogProduct['channel']) {
  return channel === 'store' ? '门店采购' : channel === 'live' ? '用户商城' : '全渠道'
}

function setProductFilter(event: { detail: { value: string | number } }) {
  const index = Number(event.detail.value)
  productFilter.value = productFilters[index] || productFilter.value
}

function validateSupplierProduct(product: CatalogProduct) {
  if (!product.image) return '请上传商品主图'
  if (!product.name.trim() || !product.category.trim() || !product.skus.some((sku) => sku.status !== 'retired')) return '请完善商品名称、品类和有效 SKU'
  for (const sku of product.skus.filter((item) => item.status !== 'retired')) {
    if (!sku.name.trim() || [sku.retailPrice, sku.cost, sku.stock, sku.level1Amount, sku.level2Amount].some((value) => !Number.isFinite(Number(value)) || Number(value) < 0)) return 'SKU 金额和库存不能为负数'
    if (!Number.isInteger(Number(sku.minimumOrderQuantity)) || Number(sku.minimumOrderQuantity) < 0) return '起订量必须为大于等于 0 的整数'
    if (Number(sku.retailPrice) < Number(sku.level1Amount) + Number(sku.level2Amount)) return '零售价不能低于分销金额合计'
  }
  return ''
}

async function submitSupplierProduct() {
  if (!productEditor.value) return
  const draft: CatalogProduct = {
    ...productEditor.value,
    name: productEditor.value.name.trim(),
    category: productEditor.value.category.trim(),
    tags: productTagText.value.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean),
    skus: productEditor.value.skus.map((sku) => ({ ...sku, name: sku.name.trim(), image: sku.image || productEditor.value!.image }))
  }
  const error = validateSupplierProduct(draft)
  if (error) { productFormError.value = error; return }
  await runBusy('submit-product', async () => {
    const result = await store.submitCatalogProduct(draft)
    if (!result.ok) { productFormError.value = result.message; return }
    productEditor.value = null
    toast('商品已提交审核')
  })
}

async function saveSupplierProductStock() {
  if (!productEditor.value || !productEditorFormalId.value) return
  const changes = productEditor.value.skus.filter((sku) => persistedSupplierSkuIds.value.has(sku.id)).map((sku) => ({ skuId: sku.id, stock: Number(sku.stock) }))
  await runBusy('save-stock', async () => {
    const result = await store.adjustCatalogProductStock(productEditorFormalId.value, changes)
    if (!result.ok) { productFormError.value = result.message; return }
    productEditor.value = null
    toast('库存已更新')
  })
}

async function toggleSupplierProduct(product: CatalogProduct) {
  await runBusy('toggle-product', async () => {
    const result = await store.toggleCatalogProduct(product.id)
    toast(result.ok ? (product.status === 'active' ? '商品已下架' : '商品已上架') : result.message)
  })
}

// ---------- 命名线路、每日线路与仓点 ----------
const pendingProductCount = computed(() => store.myProductSubmissions.filter((item) => item.status === 'pending').length)
const routeBusy = ref(false)
const warehouseForm = reactive<{ address: string }>({ address: '' })
const supplierWorkItems: Array<{ key: SecondaryWorkspace; label: string; icon: string; detail: string }> = [
  { key: 'drivers', label: '司机管理', icon: 'users', detail: '账号与启用状态' },
  { key: 'routes', label: '线路规划', icon: 'navigation', detail: '命名线路、农家乐顺序与派司机' },
  { key: 'settlements', label: '结算账单', icon: 'package-check', detail: '查看账期和关联订单' },
  { key: 'handovers', label: '交接日志', icon: 'list-tree', detail: '出库和到店交接记录' },
  { key: 'warehouse', label: '仓点设置', icon: 'map-pin', detail: '按地址解析仓点坐标' }
]
const routeOrderCount = computed(() => store.currentDriverRoute?.sourceOrderIds.length || 0)
const routeCompletedOrderCount = computed(() => store.currentDriverRoute?.stops.reduce((count, stop) => count + (stop.completedOrderIds?.length || 0), 0) || 0)
const nextRouteStop = computed(() => store.currentDriverRoute?.stops.find((stop) => (stop.completedOrderIds?.length || 0) < stop.orderIds.length) || null)
const storeOptions = Object.values(storeDirectory)

const namedRouteDraft = ref<{ id?: string; name: string; storeIds: string[]; driverId?: string } | null>(null)
const routePlanId = ref('')
const routePreviewId = ref('')
const routePlanDate = ref(todayString())
const routePlanDriverId = ref('')
const selectedRouteStopId = ref('')
const routePreviewBusy = ref(false)
const routePublishing = ref(false)
const supplierNamedRoutes = computed(() => store.namedRoutes.filter((route) => route.supplierId === store.auth.supplierId))
const namedRouteDriverOptions = computed(() => ['', ...store.activeDrivers.map((driver) => driver.id)])
const namedRouteDriverLabels = computed(() => namedRouteDriverOptions.value.map((id) => namedRouteDriverName(id)))
function namedRouteDriverName(driverId?: string) {
  if (!driverId) return '未指派'
  return store.visibleDrivers.find((driver) => driver.id === driverId)?.name || driverId
}
function namedRouteLabelForDriver(driverId: string) {
  const routes = store.namedRoutes.filter((item) => item.supplierId === store.auth.supplierId && item.driverId === driverId)
  return routes.length ? `${routes.length} 条线路 · ${routes.reduce((sum, route) => sum + route.storeIds.length, 0)} 家门店` : '尚未配置线路'
}
function routePublishedStatus(routeId: string) {
  const published = store.dailyRoutes.find((route) => route.namedRouteId === routeId && route.deliveryDate === routePlanDate.value && ['published', 'stale', 'completed'].includes(route.status))
  return published ? (published.status === 'completed' ? '已完成' : published.status === 'stale' ? '需复核' : '已发布') : '未发布'
}
function invalidateRoutePreview() {
  store.invalidateRoutePreview()
  routePreviewId.value = ''
  selectedRouteStopId.value = ''
}
function openNamedRouteEditor(route?: { id: string; name: string; storeIds: string[]; driverId?: string }) {
  namedRouteDraft.value = route
    ? { id: route.id, name: route.name, storeIds: [...route.storeIds], driverId: route.driverId }
    : { name: '', storeIds: [], driverId: '' }
  routePlanId.value = route?.id || ''
  invalidateRoutePreview()
  routePlanDate.value = todayString()
  routePlanDriverId.value = route?.driverId || ''
  selectedRouteStopId.value = ''
}
function closeNamedRouteEditor() {
  if (namedRouteDraft.value) { namedRouteDraft.value = null; return }
  closeSecondaryWorkspace()
}
function toggleNamedRouteStore(storeId: string) {
  if (!namedRouteDraft.value) return
  namedRouteDraft.value.storeIds = namedRouteDraft.value.storeIds.includes(storeId)
    ? namedRouteDraft.value.storeIds.filter((id) => id !== storeId)
    : [...namedRouteDraft.value.storeIds, storeId]
  invalidateRoutePreview()
}
function moveNamedRouteStore(index: number, direction: -1 | 1) {
  if (!namedRouteDraft.value) return
  const target = index + direction
  const storeIds = [...namedRouteDraft.value.storeIds]
  if (target < 0 || target >= storeIds.length) return
  ;[storeIds[index], storeIds[target]] = [storeIds[target], storeIds[index]]
  namedRouteDraft.value.storeIds = storeIds
  invalidateRoutePreview()
}
async function saveNamedRouteDraft() {
  if (!namedRouteDraft.value) return
  await runBusy('save-route', async () => {
    const result = await store.saveNamedRoute({ ...namedRouteDraft.value!, driverId: routePlanDriverId.value || namedRouteDraft.value!.driverId || undefined })
    if (!result.ok) { toast(result.message); return }
    if (result.value) {
      namedRouteDraft.value = { id: result.value.id, name: result.value.name, storeIds: [...result.value.storeIds], driverId: result.value.driverId }
      routePlanId.value = result.value.id
      routePlanDriverId.value = result.value.driverId || ''
    }
    invalidateRoutePreview()
    toast('线路模板已保存')
  })
}
function setRoutePlanDriver(event: { detail: { value: string | number } }) {
  routePlanDriverId.value = namedRouteDriverOptions.value[Number(event.detail.value)] || ''
  if (namedRouteDraft.value) namedRouteDraft.value.driverId = routePlanDriverId.value || undefined
  invalidateRoutePreview()
}
watch(() => routePlanDate.value, () => invalidateRoutePreview())
watch(() => [namedRouteDraft.value?.name, namedRouteDraft.value?.storeIds.join(',')], () => {
  if (routePreviewId.value) invalidateRoutePreview()
})
async function previewNamedRoute() {
  const namedRouteId = namedRouteDraft.value?.id
  const driverId = routePlanDriverId.value || namedRouteDraft.value?.driverId || ''
  if (!namedRouteId || !driverId) { toast('请先保存线路并选择启用中的司机'); return }
  routePreviewBusy.value = true
  selectedRouteStopId.value = ''
  const result = await store.optimizeNamedRoute({ namedRouteId, driverId, deliveryDate: routePlanDate.value })
  routePreviewBusy.value = false
  if (!result.ok) { toast(result.message); return }
  routePlanId.value = namedRouteId
  routePreviewId.value = result.value?.id || ''
  toast('路线预览已生成')
}
const selectedRouteStop = computed(() => store.routeDraft?.id === routePreviewId.value
  ? store.routeDraft.stops.find((stop) => stop.storeId === selectedRouteStopId.value) || null
  : null)
function selectRouteStop(storeId: string) {
  selectedRouteStopId.value = storeId
}
function movePreviewStop(index: number, direction: -1 | 1) {
  if (!store.moveRouteStop(index, direction)) return
  selectedRouteStopId.value = store.routeDraft?.stops[index + direction]?.storeId || selectedRouteStopId.value
  toast('已调整门店顺序，距离已重新估算')
}
function routeProviderLabel(provider: string) {
  return provider === 'tencent-direction' ? '腾讯驾车距离' : provider === 'manual' ? '人工顺序 · 直线估算' : '直线估算'
}
async function publishNamedRoute() {
  if (!store.routeDraft || store.routeDraft.id !== routePreviewId.value) return
  routePublishing.value = true
  const result = await store.publishRoute()
  routePublishing.value = false
  toast(result.ok ? '配送线路已发布，订单已批量关联司机' : result.message)
}
function selectDriverRoute(routeId: string) {
  if (!store.selectDriverRoute(routeId)) return
  selectedRouteStopId.value = ''
}
function driverRouteName(route: { namedRouteId?: string; id: string }) {
  return store.namedRoutes.find((item) => item.id === route.namedRouteId)?.name || `线路 ${route.id.split('-').at(-1) || ''}`
}
function driverRouteProgress(route: DailyDeliveryRoute) {
  const total = route.sourceOrderIds.length
  const completed = route.stops.reduce((sum, stop) => sum + (stop.completedOrderIds?.length || 0), 0)
  return `${completed}/${total} 单`
}
function routeStatusText(order: Order) {
  if (isCourierOrder(order)) return ''
  const storeId = resolveOrderStore(order)?.storeId
  if (!storeId) return '门店资料待维护'
  const route = supplierNamedRoutes.value.find((item) => item.storeIds.includes(storeId))
  return route ? `已在线路中 · ${route.name}` : '待加入线路'
}
function handoverCheckInText(orderId: string) {
  const checkIn = store.dailyRoutes.flatMap((route) => route.stops).find((stop) => stop.orderIds.includes(orderId))?.checkIn
  return checkIn ? `打卡 ${checkIn.distanceM} 米 · ${checkIn.at.replace('T', ' ').slice(0, 16)}` : ''
}
async function checkInAtStop(stop: RouteStop) {
  await runBusy('checkin', async () => {
    const locate = () => new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
      uni.getLocation({ type: 'gcj02', success: (res) => resolve({ latitude: res.latitude, longitude: res.longitude }), fail: reject })
    })
    try {
      const location = await locate()
      const result = await store.checkInStop(stop.storeId, location)
      toast(result.ok ? `打卡成功，距门店 ${result.value?.distanceM} 米` : result.message)
    } catch {
      toast('无法获取定位，请开启定位权限')
    }
  })
}
async function generateTodayRoutes() {
  routeBusy.value = true
  const result = await store.ensureTodayRoutes()
  routeBusy.value = false
  toast(result.ok ? (result.value?.generated ? `已补生成 ${result.value.generated} 条今日线路` : '今日线路已是最新') : result.message)
}
async function saveWarehouse() {
  const address = warehouseForm.address.trim()
  if (!address) { toast('请输入仓点地址'); return }
  await runBusy('warehouse', async () => {
    const located = await geocodeAddress({ address }, createGeocodeProviders({
      tencentProxy: String(import.meta.env.VITE_TENCENT_MAP_GATEWAY || '/api/tencent-map/geocode').trim()
    }))
    if (located.status !== 'resolved') {
      toast(located.reason === 'NOT_CONFIGURED' ? '地址解析未配置' : located.reason === 'TIMEOUT' ? '地址解析超时' : located.reason === 'INVALID_COORDINATE' ? '地址解析坐标无效' : '无法解析该地址')
      return
    }
    const result = await store.updateWarehouse({ address, longitude: located.coordinate.longitude, latitude: located.coordinate.latitude })
    toast(result.ok ? '仓点已保存' : result.message)
  })
}
function stopItemCount(stop: RouteStop) {
  return store.orders.filter((order) => stop.orderIds.includes(order.id)).reduce((sum, order) => sum + (order.items || []).reduce((count, item) => count + item.quantity, 0), 0)
}
function stopOrders(stop: RouteStop) { return store.orders.filter((order) => stop.orderIds.includes(order.id)) }
function stopSegment(route: DailyDeliveryRoute, stop: RouteStop) {
  return route.segments?.find((segment) => segment.toStoreId === stop.storeId)?.distanceKm
}
function stopEstimatedMinutes(route: DailyDeliveryRoute, index: number) {
  return Math.ceil(route.estimatedDurationMinutes * (index + 1) / Math.max(1, route.stops.length))
}
function navigateToDestination(name: string, destination: { address: string; longitude?: number; latitude?: number }) {
  const url = buildNavigationUrl(name, { ...destination, contact: '', phone: '' })
  // #ifdef H5
  window.open(url, '_blank', 'noopener,noreferrer')
  // #endif
  // #ifndef H5
  if (destination.longitude !== undefined && destination.latitude !== undefined) {
    uni.openLocation({ longitude: destination.longitude, latitude: destination.latitude, name, address: destination.address })
  } else {
    uni.showToast({ title: '坐标待维护，请按地址搜索导航', icon: 'none' })
  }
  // #endif
}

function navigateToStop(stop: RouteStop) { navigateToDestination(stop.storeName, stop) }

function taskDistanceText(order: Order) {
  const distance = deliveryDistanceKm(supplierWarehouseOf(store.auth.supplierId, store.suppliers) || {}, storeInfoOf(order))
  return distance === null ? '距离待补充' : `约 ${distance.toFixed(1)} km`
}

function navigateToStore(order: Order) {
  navigateToDestination(order.storeName || order.customer, storeInfoOf(order))
}
function orderShortage(order: Order): ShortageItem[] {
  return order.supplierFulfillment?.shortages || []
}
function handoversOf(order: Order) {
  return order.supplierFulfillment?.handovers || []
}
function isCourierOrder(order: Order) {
  const source = order.supplierOrderLink?.source
  return source === 'c-mall' || source === 'farmhouse-courier'
}
function courierSourceLabel(order: Order) {
  return order.supplierOrderLink?.source === 'farmhouse-courier' ? '门店快递' : 'C端商城'
}
function recipientLabel(order: Order) {
  return isCourierOrder(order) ? order.supplierOrderLink?.deliveryAddress?.receiver || order.customer.replace(/ · C端商城$/, '') : order.customer
}
function addressLabel(order: Order) {
  const address = order.supplierOrderLink?.deliveryAddress
  return address ? `${address.region} ${address.detail} · ${address.receiver} ${address.phone}` : `${storeInfoOf(order).address} · ${storeInfoOf(order).contact} ${storeInfoOf(order).phone}`
}
function statusText(status: string, order?: Order) {
  if (order && isCourierOrder(order) && status === 'cancelled' && order.status === 'after-sale') return '售后处理中'
  return store.statusText(status)
}
const fulfillmentSteps = ['submitted', 'accepted', 'shipped', 'delivering', 'received']
function stepIndex(order: Order) {
  return fulfillmentSteps.indexOf(orderFulfillment(order).status)
}
function stepLabel(step: string) {
  return store.statusText(step)
}

function orderActions(order: Order): Array<{ key: string; label: string; primary?: boolean }> {
  const status = orderFulfillment(order).status
  const shipType = order.supplierFulfillment?.shipType
  if (status === 'submitted') return [{ key: 'accept', label: '接单', primary: true }]
  if (status === 'accepted') return [
    ...(isCourierOrder(order) ? [{ key: 'courier', label: '快递直发' }] : [])
  ]
  if (status === 'shipped') return [{ key: 'handover-out', label: '出库交接', primary: true }]
  if (status === 'delivering' && shipType === 'courier') return [{ key: 'courier-delivered', label: '确认快递签收', primary: true }]
  return []
}

async function runAction(key: string, order: Order) {
  if (key === 'accept') {
    await runBusy('accept', async () => {
      if (await store.acceptOrder(order.id)) toast('已接单')
      closeSheet()
    })
    return
  }
  if (key === 'courier') { openCourier(order); return }
  if (key === 'handover-out') { openHandoverOut(order); return }
  if (key === 'courier-delivered') {
    await runBusy('courier-delivered', async () => {
      if (await store.markCourierDelivered(order.id)) toast('已确认快递签收')
      closeSheet()
    })
  }
}

function toggleSelect(id: string) {
  const index = selectedOrderIds.value.indexOf(id)
  if (index >= 0) selectedOrderIds.value.splice(index, 1)
  else selectedOrderIds.value.push(id)
}
async function batchAccept() {
  await runBusy('batch-accept', async () => {
    const count = await store.batchAcceptOrders([...selectedOrderIds.value])
    selectedOrderIds.value = []
    toast(`已批量接单 ${count} 单`)
  })
}
function openOrder(order: Order) {
  selectedOrder.value = order
  sheet.value = 'order'
}
function hasUnhandledShortage(order: Order) {
  return orderShortage(order).some((item) => !item.handled)
}
async function markHandled(skuId: string) {
  const orderId = selectedOrder.value?.id
  if (!orderId) return
  await runBusy('mark-handled', async () => {
    if (await store.markShortageHandled(orderId, skuId)) {
      selectedOrder.value = store.orders.find((order) => order.id === orderId) || selectedOrder.value
      toast('已标记补发')
    }
  })
}
function askResetDemo() {
  sheet.value = 'reset-confirm'
}
async function confirmResetDemo() {
  await runBusy('reset-demo', async () => {
    await store.resetDemoData()
    closeSheet()
    active.value = 'orders'
    toast('演示数据已重置')
  })
}
function closeSheet() {
  sheet.value = null
  selectedOrder.value = null
  courierTracking.value = ''
  handoverNote.value = ''
  handoverResult.value = null
  driverFormError.value = ''
  editingDriver.value = null
  resetPassword.value = ''
  driverStatusTarget.value = null
  resetActuals()
}

const courierTracking = ref('')
function openCourier(order: Order) {
  selectedOrder.value = order
  courierTracking.value = ''
  sheet.value = 'courier'
}
async function confirmCourier() {
  if (!selectedOrder.value) return
  await runBusy('courier', async () => {
    if (await store.shipCourier(selectedOrder.value!.id)) {
      toast('已快递直发')
      closeSheet()
    }
  })
}

const actuals = reactive<Record<string, number>>({})
const handoverNote = ref('')
const handoverResult = ref<{ shortages: ShortageItem[] } | null>(null)
function resetActuals() {
  Object.keys(actuals).forEach((key) => { delete actuals[key] })
}
function openHandoverOut(order: Order) {
  selectedOrder.value = order
  handoverResult.value = null
  resetActuals()
  order.items?.forEach((item) => { actuals[item.skuId] = item.quantity })
  handoverNote.value = ''
  sheet.value = 'handover-out'
}
async function confirmHandoverOut() {
  if (!selectedOrder.value) return
  await runBusy('handover-out', async () => {
    const result = await store.handoverOut(selectedOrder.value!.id, { ...actuals }, handoverNote.value.trim() || undefined)
    if (result.ok) {
      handoverResult.value = { shortages: result.shortages }
      toast(result.shortages.length ? `交接完成，缺货 ${result.shortages.length} 项` : '出库交接完成')
    }
  })
}
async function confirmHandoverIn() {
  if (!selectedOrder.value) return
  await runBusy('handover-in', async () => {
    if (await store.handoverIn(selectedOrder.value!.id, handoverNote.value.trim() || undefined)) {
      toast('到店交接完成')
      closeSheet()
    }
  })
}
function openDriverHandover(order: Order) {
  selectedOrder.value = order
  handoverNote.value = ''
  sheet.value = 'handover-in'
}

// ---------- 司机管理 ----------
const driverSearch = ref('')
const driverStatusFilter = ref('全部')
const driverStatusFilters = ['全部', '启用', '停用']
const filteredDrivers = computed(() => store.visibleDrivers.filter((driver) => {
  const matchesStatus = driverStatusFilter.value === '全部' || (driverStatusFilter.value === '启用' ? driver.status === 'active' : driver.status === 'disabled')
  const keyword = driverSearch.value.trim().toLowerCase()
  const matchesKeyword = !keyword || `${driver.name}${driver.account}${driver.phone || ''}`.toLowerCase().includes(keyword)
  return matchesStatus && matchesKeyword
}))
const driverForm = reactive({ name: '', phone: '', account: '', password: '' })
const driverFormError = ref('')
const editingDriver = ref<DriverAccount | null>(null)
const resetPassword = ref('')
const driverStatusTarget = ref<DriverAccount | null>(null)

function openDriverForm() {
  editingDriver.value = null
  Object.assign(driverForm, { name: '', phone: '', account: '', password: '' })
  driverFormError.value = ''
  sheet.value = 'driver-form'
}
function openDriverEdit(driver: DriverAccount) {
  editingDriver.value = driver
  Object.assign(driverForm, { name: driver.name, phone: driver.phone || '', account: driver.account, password: '' })
  driverFormError.value = ''
  sheet.value = 'driver-edit'
}
async function saveDriver() {
  await runBusy('save-driver', async () => {
    if (sheet.value === 'driver-form') {
      const result = await store.addDriver({ name: driverForm.name, phone: driverForm.phone, account: driverForm.account, password: driverForm.password })
      if (!result.ok) { driverFormError.value = result.error || '保存失败'; return }
      toast(`司机账号已创建：${driverForm.account}`)
    } else if (editingDriver.value) {
      if (!store.updateDriver(editingDriver.value.id, { name: driverForm.name, phone: driverForm.phone })) {
        driverFormError.value = '姓名或手机号格式不正确'
        return
      }
      toast('司机信息已保存')
    }
    closeSheet()
  })
}
function openReset(driver: DriverAccount) {
  editingDriver.value = driver
  resetPassword.value = ''
  driverFormError.value = ''
  sheet.value = 'driver-reset'
}
function confirmReset() {
  if (!editingDriver.value) return
  if (resetPassword.value.length < 6 || resetPassword.value.length > 20) {
    driverFormError.value = '密码需 6-20 位'
    return
  }
  void runBusy('reset-password', async () => {
    store.resetDriverPassword(editingDriver.value!.id, resetPassword.value)
    toast('密码已重置')
    closeSheet()
  })
}
function askToggle(driver: DriverAccount) {
  driverStatusTarget.value = driver
  sheet.value = 'driver-toggle-confirm'
}
function driverToggleMessage(driver: DriverAccount) {
  if (driver.status !== 'active') return `启用后「${driver.name}」可重新登录。`
  const taskCount = store.driverTaskCounts[driver.id] || 0
  return taskCount > 0
    ? `停用后「${driver.name}」将无法登录，已派任务不受影响。该司机当前有 ${taskCount} 个进行中任务，建议先改派。`
    : `停用后「${driver.name}」将无法登录，已派任务不受影响。`
}
function confirmToggle() {
  if (!driverStatusTarget.value) return
  if (!store.toggleDriverStatus(driverStatusTarget.value.id)) return
  toast(driverStatusTarget.value.status === 'active' ? '已停用司机' : '已启用司机')
  closeSheet()
}

// ---------- 交接日志 ----------
const handoverFilter = ref('全部')
const handoverDriverFilter = ref('全部')
const handoverTypeFilters = ['全部', '出库交接', '到店交接']
const handoverDriverFilters = computed(() => ['全部', ...store.visibleDrivers.map((driver) => driver.name)])
const filteredHandovers = computed(() => store.allHandovers.filter((log) => {
  const matchesType = handoverFilter.value === '全部' || (handoverFilter.value === '出库交接' ? log.type === 'out' : log.type === 'in')
  const matchesDriver = handoverDriverFilter.value === '全部' || log.operatorName === handoverDriverFilter.value
  return matchesType && matchesDriver
}))
const recentHandovers = computed(() => store.allHandovers.slice(0, 5))

// ---------- 司机工作区 ----------
const driverDoneToday = computed(() => {
  const today = new Date().toLocaleDateString('zh-CN')
  return store.myHistory.filter((order) => order.supplierFulfillment?.handovers.some((log) => log.type === 'in' && log.time.includes(today))).length
})

onMounted(() => {
  refreshProductCategoryLabels()
  if (import.meta.env.VITE_E2E === '1') {
    const e2eWindow = window as typeof window & { __agritainmentE2E?: { setRouteProviderFailure: (enabled: boolean) => void } }
    e2eWindow.__agritainmentE2E = {
      setRouteProviderFailure(enabled) {
        configurePlatformProviders(enabled
          ? { routeOptimization: { async optimize() { return { ok: false, code: 'e2e_route_provider_failed', message: 'E2E route provider failure' } } } }
          : {})
      }
    }
  }
  if (import.meta.env.VITE_E2E !== '1') configurePlatformProviders({ routeOptimization: createDrivingRouteOptimizationProvider() })
  void store.initialize().then(async () => {
    seedSupplierDemoRouteOnce()
    if (store.auth.isLoggedIn) await store.ensureTodayRoutes()
  })
  disposeKeyboardButtons = installKeyboardButtonSupport()
  disposePlatformChanges = subscribePlatformChanges(refreshSharedState, platformChangeKeys)
  if (typeof window !== 'undefined') {
    const keys = new Set([...platformChangeKeys, ...platformChangeKeys.map((key) => `${key}:revision`)])
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
  disposePlatformChanges?.()
  disposePlatformChanges = null
  disposeStorageSync?.()
  disposeStorageSync = null
  disposeVisibilitySync?.()
  disposeVisibilitySync = null
  disposeKeyboardButtons()
})
</script>
<style scoped lang="scss">
$green: var(--color-brand-primary);
$green-deep: var(--color-brand-primary-dark);
$green-soft: var(--color-brand-primary-soft);
$blue: var(--color-info);
$amber: var(--color-warning-dark);
$red: var(--color-danger);
$bg: var(--color-bg);
$panel: var(--color-card);
$ink: var(--color-ink);
$muted: var(--color-ink-2);
$line: var(--color-line);
$on-brand: var(--color-on-brand);
$price: var(--color-price);
$purple: var(--color-purple);
$info-soft: var(--color-info-soft);
$warning-soft: var(--color-warning-soft);
$danger-soft: var(--color-danger-soft);
$line-light: var(--color-line-light);
$overlay: var(--color-overlay);
$radius-card: var(--radius-card);
$radius-button: var(--radius-button);
$shadow-card: var(--shadow-card);
$space-page: var(--space-page);
$control: var(--control-size);

// ===== 登录页 =====
.login-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: $space-page; background: $bg; }
/* #ifdef MP-WEIXIN */
.login-page { padding-top: calc(24px + var(--status-bar-height)); padding-right: 96px; }
/* #endif */
/* #ifndef MP-WEIXIN */
.login-page { padding-top: calc(24px + env(safe-area-inset-top)); }
/* #endif */
.login-card { width: 100%; max-width: 340px; background: $panel; border: 1px solid $line; border-radius: $radius-card; overflow: hidden; box-shadow: $shadow-card; }
.login-card .pc-login-hero { border-radius: 0; }
.login-body { padding: $space-page; }
.role-tabs { display: flex; gap: 4px; margin: 0 0 16px; padding: 4px; border-radius: $radius-card; background: $green-soft; }
.role-tabs button { flex: 1; min-height: $control; padding: 8px 0; border: 0; border-radius: $radius-button; background: transparent; color: $muted; font-size: 14px; }
.role-tabs button.active { background: $green; color: $on-brand; font-weight: 700; }
.login-fields { display: flex; flex-direction: column; gap: 12px; }
.login-button { margin-top: 18px; width: 100%; }
.login-hint { display: block; margin-top: 12px; text-align: center; font-size: 12px; line-height: 1.55; color: $muted; word-break: keep-all; }
.state-retry { margin-top: 12px; }
.section-action { width: 100%; margin-top: var(--space-gap); }
.route-bottom-actions > .section-action { grid-column: 1 / -1; margin-top: 0; }
.content-stack { margin-top: var(--space-gap); }
.filter-row { margin-top: 8px; }
.detail-status-row { margin-bottom: 12px; }
.note-field { margin-top: 12px; }

// ===== 订单 =====
.order-check { display: flex; align-items: center; flex: none; }
.order-check > view { width: 20px; height: 20px; border: 1.5px solid $line; border-radius: $radius-button; display: flex; align-items: center; justify-content: center; background: $panel; }
.order-check > view.checked { background: $green; border-color: $green; }
.order-actions { display: flex; gap: 8px; margin-top: 9px; padding-top: 9px; border-top: 1px solid $line; flex-wrap: wrap; justify-content: flex-end; }
.outline-button.danger { color: $red; border-color: $red; }
.mine-actions { display: grid; gap: var(--space-gap); margin-top: var(--space-section); }
.mine-actions button { width: 100%; margin: 0; }
.page-pad[data-visual-view="supplier-orders"],
.mine-page { padding-top: max($space-page, env(safe-area-inset-top)); }

// ===== 司机 =====
.driver-avatar { width: 40px; height: 40px; border-radius: var(--radius-icon); background: $green-soft; display: flex; align-items: center; justify-content: center; color: $green; flex: none; }
.driver-row { align-items: flex-start; }
.driver-row .row-main { flex: 1; }
.driver-actions { display: flex; gap: 8px; margin-top: var(--space-gap); flex-wrap: wrap; }
.driver-name { font-size: var(--text-subtitle); font-weight: 600; }

// ===== 任务（司机端）=====
.task-store { display: flex; align-items: flex-start; gap: 8px; background: $green-soft; border: 1px solid $line; border-radius: $radius-card; padding: 10px 11px; margin-top: 9px; }
.distance-text { color: $green; font-size: 12px; margin-top: 4px; }
.task-nav { display: inline-flex; align-items: center; gap: 4px; flex: none; margin: 0; }
.task-items { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.task-item { display: flex; align-items: center; gap: 8px; }
.task-item image { width: 30px; height: 30px; border-radius: var(--radius-icon); background: $bg; flex: none; }
.task-item text { font-size: var(--text-body); flex: 1; }
.task-shortage { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 8px; }

// ===== 订单详情 =====
.steps { display: flex; gap: 6px; margin-bottom: 14px; overflow-x: auto; }
.step { display: flex; align-items: center; gap: 5px; flex: none; }
.step-dot { width: 20px; height: 20px; border-radius: 50%; background: $bg; color: $muted; font-size: 12px; display: flex; align-items: center; justify-content: center; }
.step.done .step-dot { background: $green; color: $on-brand; }
.step-label { font-size: 12px; color: $muted; white-space: nowrap; flex: none; }
.order-item-line { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px dashed $line; }
.order-item-line image { width: 36px; height: 36px; border-radius: var(--radius-icon); background: $bg; flex: none; }
.order-item-price { font-size: var(--text-body); font-weight: 700; flex: none; }
.store-line { display: flex; align-items: flex-start; gap: 8px; background: $green-soft; border: 1px solid $line; border-radius: $radius-card; padding: 10px 11px; }
.shortage-line { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 0; border-bottom: 1px dashed $line; }
.log-list { display: flex; flex-direction: column; gap: 8px; }
.log-event { display: flex; gap: 10px; align-items: flex-start; }
.log-dot { width: 8px; height: 8px; border-radius: 50%; background: $green; margin-top: 5px; flex: none; }

// ===== 出库交接 =====
.actual-list { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
.actual-line { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px dashed $line; }
.actual-input { display: flex; align-items: center; gap: 6px; flex: none; }
.actual-input text { font-size: var(--text-body); color: $muted; }
.actual-input input { width: 76px; height: $control; border: 1px solid $line; border-radius: $radius-button; padding: 0 8px; font-size: var(--text-body); text-align: center; }
.handover-result { display: flex; flex-direction: column; gap: 6px; background: $green-soft; border: 1px solid $line; border-radius: $radius-card; padding: 12px; margin-top: 12px; }
.handover-result text { font-size: 14px; font-weight: 700; color: $green; }
.handover-result-sub { font-size: 12px; color: $green; }
.order-amount { margin-left: auto; font-size: var(--text-subtitle); font-weight: 700; flex: none; }
/* Cross-device fulfillment layout guards. */
.c-mall-tag { background: $info-soft; color: $blue; }
.order-no, .muted, .row-main, .store-line, .task-store, .courier-sheet { min-width: 0; word-break: break-all; }
.row-top { min-width: 0; }
.row-top > text, .row-top > .order-no { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.order-actions, .sheet-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.order-actions button, .sheet-actions button { flex: 0 0 auto; min-width: 88px; min-height: 44px; }
.order-actions .primary-button, .sheet-actions .primary-button { min-width: 104px; }
.sheet-actions { z-index: 2; }
.store-line .row-main, .task-store .row-main { flex: 1; }
.task-item .business-image { width:30px;height:30px;border-radius:var(--radius-icon);flex:none; }.order-item-line .business-image { width:36px;height:36px;border-radius:var(--radius-icon);flex:none; }
.task-item > text:first-of-type { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.task-item > .muted { flex: none; white-space: nowrap; }
.product-work-page { display: flex; flex-direction: column; height: 100vh; overflow: hidden; padding-bottom: calc(var(--mobile-tab-height) + 12px + env(safe-area-inset-bottom)); box-sizing: border-box; background: $bg; color: $ink; }
.product-work-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; flex: none; padding: 2px 0 12px; border-bottom: 1px solid $line; }
.product-work-body { flex: 1; min-height: 0; overflow-x: hidden; overflow-y: auto; }
.product-work-head button { margin: 0; }
.product-work-title { display: block; font-size: 20px; font-weight: 750; }
.add-product-button { display:flex;align-items:center;gap:4px;white-space:nowrap; }
.product-summary { display:grid;grid-template-columns:repeat(3,1fr);margin:var(--space-section) 0 var(--space-gap);overflow:hidden;border:1px solid $line;border-radius:$radius-card;background:$green-soft; }
.product-summary view { padding:14px 6px;text-align:center; }
.product-summary view+view { border-left:1px solid $line; }
.product-summary strong,.product-summary small { display:block; }
.product-summary strong { color:$green-deep;font-size:20px;font-variant-numeric:tabular-nums; }.product-summary small{margin-top:4px;color:$muted;font-size:12px}
.product-search { margin-top:0; }
.product-filter-scroll { width:100%;margin:10px 0 12px;white-space:nowrap; }
.product-filter-scroll,.product-filter-scroll *{scrollbar-width:none}.product-filter-scroll::-webkit-scrollbar,.product-filter-scroll *::-webkit-scrollbar{display:none;width:0;height:0}
.product-filter-chips { display:inline-flex;gap:4px;padding-right:10px; }
.product-filter-chips button { position:relative;display:inline-flex;align-items:center;gap:5px;min-height:44px;margin:0;padding:0 10px 8px;border:0;border-radius:0;background:transparent;color:$muted;font-size:var(--text-body); }
.product-filter-chips button.active { border:0;background:transparent;color:$green;font-weight:800; }
.product-filter-chips button.active::after { content:'';position:absolute;left:50%;bottom:2px;width:20px;height:3px;border:none;border-radius:var(--mobile-radius-pill);background:currentColor;transform:translateX(-50%); }
.product-filter-chips button text{font-size:var(--text-body);opacity:.8}
.supplier-product-list { display: grid; gap: var(--space-gap); }
.supplier-product-card { min-width:0;padding:var(--space-card);border:1px solid $line;border-radius:$radius-card;background:$panel;box-shadow:$shadow-card; }
.supplier-product-main{display:flex;align-items:flex-start;gap:11px;min-width:0}.supplier-product-image { width: 78px; height: 78px; flex: none; border-radius: $radius-button; background: $line-light; }
.supplier-product-name{display:-webkit-box;min-width:0;overflow:hidden;font-size:14px;font-weight:700;line-height:1.35;-webkit-box-orient:vertical;-webkit-line-clamp:2}.supplier-product-price{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;margin-top:9px}.supplier-product-price strong{color:$price;font-size:17px;font-variant-numeric:tabular-nums}.supplier-product-price small{min-width:0;color:$muted;font-size:12px;text-align:right;word-break:break-all}
.supplier-product-skus { display: grid; gap: 5px; margin-top: 10px;padding-top:9px;border-top:1px solid $line; color: $ink; font-size: 12px; }
.supplier-product-skus text{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;min-width:0}.supplier-product-skus small{color:$muted;font-size:12px;text-align:right;white-space:nowrap}
.product-reject-note { display: block; margin-top: 10px; padding: 9px 10px; border-left: 3px solid $red; background: $danger-soft; color: $red; font-size: 12px; }
.supplier-product-form { display: grid; gap: 12px; margin-top: 14px; }
.form-section{display:grid;gap:12px;padding:var(--space-card);border:1px solid $line;border-radius:$radius-card;background:$panel;box-shadow:$shadow-card}.form-section-title{display:block;font-size:15px;font-weight:750}.media-field{display:grid;gap:7px}.media-field>text,.sku-image-field>text{color:$muted;font-size:12px}
.picker-field { display: flex; align-items: center; min-height: $control; padding: 0 12px; border: 1px solid $line; border-radius: $radius-button; background: $panel; transition: border-color .16s ease; }
.picker-field:active { border-color: $green; }
.checkbox-field { display: flex; align-items: center; gap: 8px; min-height: $control; font-size: 13px; }
.supplier-sku-form { overflow:visible; }
.sku-section-head,.sku-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.sku-section-head>view>small{display:block;margin-top:3px;color:$muted;font-size:12px}.sku-section-head button{display:flex;align-items:center;gap:4px;margin:0}.supplier-sku-fields { display:grid;gap:10px;padding:12px;border:1px solid $line;border-radius:$radius-card;background:$green-soft; }
.supplier-sku-fields.retired{opacity:.6}.sku-card-head{font-size:13px;font-weight:700}.sku-card-head button{min-height:$control;margin:0;padding:0 8px;border:0;border-radius:$radius-button;background:transparent;color:$red;font-size:13px}.supplier-sku-fields.retired .sku-card-head button{color:$green}.sku-image-field{display:grid;gap:6px}.sku-input-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.sku-input-grid label { display: grid; gap: 5px; color: $muted; font-size: 13px; }.sku-input-grid label:first-child{grid-column:1/-1}
.sku-input-grid input { width: 100%; height: $control; box-sizing: border-box; padding: 0 9px; border: 1px solid $line; border-radius: $radius-button; color: $ink;background:$panel;transition:border-color .16s ease }
.sku-input-grid input:focus { border-color: $green; }
.product-form-actions { display: flex; justify-content: flex-end; gap: 8px; flex: none; flex-wrap: wrap; padding: 12px 0 calc(12px + env(safe-area-inset-bottom)); border-top: 1px solid $line; background: $bg; }
.product-form-actions button { margin: 0; }
.app-shell { overflow-x: hidden; }
.bottom-tab { min-height: 44px; min-width: 0; }
.bottom-tab text { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mine-page { display: grid; gap: var(--space-gap); }
.mine-hero .pc-hero-badge { display: inline-flex; }
.mine-hero .pc-hero-name,
.mine-hero .pc-hero-uid { display: block; }
.mine-tile-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-gap); }
.mine-tile-grid .pc-tile-icon { color: $green; }
.mine-tile-grid .pc-tile--amber .pc-tile-icon { color: $amber; }
.mine-tile-grid .pc-tile--coral .pc-tile-icon { color: $red; }
.mine-tile-grid .pc-tile--blue .pc-tile-icon { color: $blue; }
.mine-tile-grid .pc-tile--purple .pc-tile-icon { color: $purple; }
.mine-tile-grid .pc-tile--teal .pc-tile-icon { color: $green-deep; }
.work-link { width: 100%; min-height: 60px; display: flex; align-items: center; gap: 12px; padding: 9px 11px; border: 1px solid $line; border-radius: $radius-card; background: $panel; color: $ink; text-align: left; box-shadow: $shadow-card; }
.mine-tile-grid .work-link { flex-direction: column; align-items: center; text-align: center; min-height: 88px; padding: 14px 10px; width: auto; }
.work-link .row-main { min-width: 0; }
.work-link .row-main > text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.driver-mine { display: grid; gap: 8px; }
.secondary-workspace { position: relative; display: flex; flex-direction: column; overflow: hidden; min-height: calc(100vh - var(--mobile-tab-height)); background: $bg; padding-top: 14px; padding-bottom: 0; }
.secondary-head { position: relative; top: auto; z-index: 2; flex: none; display: flex; align-items: center; gap: 10px; min-height: 56px; margin: 0 calc(var(--space-page) * -1); padding: 6px $space-page; border-bottom: 1px solid $line; background: $panel; font-size: var(--text-subtitle); font-weight: 700; }
.secondary-body { flex: 1; min-height: 0; overflow-x: hidden; overflow-y: auto; padding-top: var(--space-gap); }
.secondary-foot { flex: none; padding: 10px 0 calc(12px + env(safe-area-inset-bottom)); background: $bg; }
.secondary-head > text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.route-controls { display: grid; gap: 10px; }
.named-route-form { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-section); align-items: start; }
.route-plan-editor { display: grid; gap: 10px; min-width: 0; }
.route-planning-map { display: grid; gap: 10px; min-width: 0; }
.route-plan-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.route-plan-actions button { margin: 0; }
.route-preview { display: grid; gap: 10px; }
.route-metrics { margin: 0; }
.route-provider { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.route-warnings { display: grid; gap: 4px; padding: 9px 10px; border-left: 3px solid $amber; background: $warning-soft; color: $amber; font-size: 12px; line-height: 18px; }
.route-section-intro,.route-workbench-status { display:flex; align-items:center; justify-content:space-between; gap:14px; min-width:0; }
.route-section-intro > view,.route-workbench-status > view { display:grid; gap:3px; min-width:0; }
.route-section-intro button { flex:none; }
.eyebrow { display:block; color:$muted; font-size:12px; font-weight:700; letter-spacing:0; text-transform:uppercase; }
.route-section-title { display:block; color:$green-deep; font-size:18px; font-weight:800; line-height:24px; }
.route-template-card { display:grid; gap:7px; padding:13px 14px; }
.route-template-heading { display:flex; align-items:center; gap:8px; min-width:0; }
.route-template-path { display:block; color:$green-deep; font-size:13px; line-height:20px; word-break:break-all; }
.route-workbench-status { padding:12px; border:1px solid $line; border-radius:$radius-card; background:$green-soft; }
.warning-tag { background:$warning-soft; color:$amber; }
.warning-text { color:$amber; }
.route-plan-actions button { gap:5px; }
.route-bottom-actions { position:sticky; bottom:0; z-index:3; display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); align-items:center; gap:10px; margin:0; padding:10px 0 calc(10px + env(safe-area-inset-bottom)); border-top:1px solid $line; background:$bg; }
.route-bottom-actions .route-publish { width:100%; margin:0; }
.route-bottom-hint { min-width:0; grid-column:1 / -1; }
.route-stop-selected { border-color: $green; background: $green-soft; }
.route-stop-detail { display: grid; gap: 4px; padding: 10px; border: 1px solid $line; border-radius: $radius-card; background: $green-soft; }
.route-status-hint { display: block; margin-top: 3px; color: $green; font-size: 12px; }
.route-date { width: 100%; height: $control; padding: 0 12px; border: 1px solid $line; border-radius: $radius-card; background: $panel; }
.route-stop { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.route-number { width: 28px; height: 28px; flex: none; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: $green; color: $on-brand; font-weight: 700; }
.route-actions { display: flex; flex-direction: column; gap: 6px; flex: none; }
.route-actions .icon-button { width: $control; height: $control; padding: 0; line-height: 1; }
.route-order-button { font-size: 13px; }
.route-publish { width: 100%; margin-top: 6px; }
.route-driver-summary { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.route-driver-summary > view { display: grid; gap: 3px; min-width: 0; }
.route-driver-summary .section-title { margin: 0; }
.delivery-route-map { margin-bottom: 10px; }
.route-stop .row-main > text:first-child { overflow: hidden; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.driver-hero-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.driver-hero-stats .hero-stat:nth-child(2) .hero-stat-value { color: $green; }
.task-orders { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.compact-empty { min-height: 96px; padding: 16px 0; }
.driver-route-switcher { display:flex; gap:8px; overflow-x:auto; padding:2px 0 10px; margin-bottom:10px; scrollbar-width:none; }
.driver-route-switcher::-webkit-scrollbar { display:none; width:0; height:0; }
.driver-route-tab { display:grid; gap:3px; flex:0 0 148px; min-height:58px; padding:9px 11px; border:1px solid $line; border-radius:$radius-card; background:$panel; color:$green-deep; text-align:left; }
.driver-route-tab text { overflow:hidden; font-size:var(--text-body); font-weight:750; text-overflow:ellipsis; white-space:nowrap; }
.driver-route-tab small { color:$muted; font-size:12px; }
.driver-route-tab.active { border-color:$green; background:$green-soft; color:$green-deep; box-shadow:inset 0 -2px 0 $green; }
.driver-route-tab.completed { color:$muted; }
.driver-route-active { min-width:0; }
@media (max-width: 375px) {
  .page-pad { padding-left: $space-page; padding-right: $space-page; }
  .task-store { flex-wrap: wrap; }
  .task-store .task-nav { margin-left: 24px; }
  .route-stop { align-items: flex-start; flex-wrap: wrap; }
  .route-stop .row-main { flex: 1 1 calc(100% - 38px); }
  .route-actions { flex-direction: row; width: 100%; padding-left: 38px; }
  .bottom-tab { padding-left: 2px; padding-right: 2px; }
  .route-plan-actions { align-items: stretch; flex-direction: column; }
  .route-plan-actions button { width: 100%; }
  .route-section-intro { align-items:stretch; flex-direction:column; }
  .route-section-intro button { width:100%; }
}
@media (max-width: 390px) {
  .driver-route-tab { flex-basis: 136px; }
  .route-driver-summary { gap: 8px; }
}
.route-workbench-status { align-items:flex-start; }
/* #ifdef MP-WEIXIN */
.app-shell { padding-bottom: var(--safe-area-inset-bottom, 0px); }
.product-work-page { padding-top: 16px; }
.product-work-head,
.secondary-head {
  padding-top: calc(6px + var(--status-bar-height));
  padding-right: 96px;
}
.secondary-workspace { padding-top: 14px; min-height: calc(100vh - var(--mobile-tab-height)); overflow: hidden; }
.page-pad[data-visual-view="supplier-orders"],
.mine-page { padding-top: calc(var(--space-page) + var(--status-bar-height)); padding-right: 96px; }
/* #endif */
/* #ifndef MP-WEIXIN */
 .product-work-page { padding-top: 16px; }
.secondary-workspace { padding-top: max(14px, env(safe-area-inset-top)); }
/* #endif */
.product-category-meta { display:flex;align-items:center;gap:5px;min-width:0;overflow:hidden; }
.product-category-meta text { min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.product-category-meta text:last-child { flex:none; }
.product-category-image { width: 22px; height: 22px; flex:none;border-radius:4px;background:$line-light; }
.category-picker-trigger { width:100%;min-height:$control;margin:0;padding:0 12px;border:1px solid $line;border-radius:$radius-button;background:$panel;color:$ink;display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:var(--text-body);text-align:left; transition: border-color .16s ease; }
.category-picker-trigger:active { border-color: $green; }
.category-picker-trigger>view { min-width:0;display:flex;align-items:center;gap:8px; }
.category-picker-trigger>view text { overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.category-picker-trigger-image { width: 28px; height: 28px; flex:none;border-radius:5px;background:$line-light; }
.category-picker-mask { position:fixed;z-index:80;inset:0;display:flex;align-items:flex-end;background:$overlay; }
.category-picker-sheet { width:100%;max-height:80vh;display:flex;flex-direction:column;padding-bottom:0;border-radius:$radius-card $radius-card 0 0;background:$panel;overflow:hidden; }
.category-picker-sheet > .sheet-head { padding: 6px 12px; flex: none; }
.category-picker-list { flex: 1 1 auto; min-height: 0; height: auto; max-height: calc(80vh - 56px); padding-bottom: calc(24px + env(safe-area-inset-bottom)); box-sizing: border-box; }
.category-picker-option { width:100%;min-height:54px;margin:0;padding:8px 18px;border:0;border-bottom:1px solid $line;border-radius:0;background:$panel;color:$ink;display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left; }
.category-picker-option.selected { color:$green;background:$green-soft; }
.category-picker-option-main { min-width:0;display:flex;align-items:center;gap:11px; }
.category-picker-option-image { width: 40px; height: 40px; flex:none;border-radius:$radius-button;background:$line-light; }
.category-picker-option-main>view { min-width:0; }
.category-picker-option-main>view text,.category-picker-option-main>view small { display:block; }
.category-picker-option-main>view text { overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:700; }
.category-picker-option-main>view small { margin-top:3px;color:$muted;font-size:12px; }
.category-picker-trigger::after,.category-picker-option::after { display:none; }
@media (hover: hover) {
  .role-tabs button:not(.active):hover { background: var(--color-hover-bg); }
  .category-picker-option:hover { background: var(--color-hover-bg); }
  .work-link:hover { background: var(--color-hover-bg); }
}
</style>
<style lang="scss">
/* #ifdef MP-WEIXIN */
.app-shell,
.sheet-panel,
.category-picker-sheet {
  max-width: 100% !important;
}
.tabbar {
  left: 0 !important;
  right: 0 !important;
  width: 100% !important;
  transform: none !important;
}
/* #endif */
</style>
