<template>
  <!-- 登录 -->
  <view v-if="!store.auth.isLoggedIn" class="login-page">
    <view class="login-card">
      <image class="login-banner" src="/static/images/farmhouse.webp" mode="aspectFill" />
      <view class="login-body">
      <text class="login-title">中选科技供应商配送工作台</text>
      <text class="login-sub">中选科技供应链 · 供应商与司机双角色配送履约</text>
      <view class="role-tabs">
        <button :class="{ active: loginRole === 'supplier' }" @click="switchLoginRole('supplier')">供应商</button>
        <button :class="{ active: loginRole === 'driver' }" @click="switchLoginRole('driver')">司机</button>
      </view>
      <view class="login-fields">
        <label class="form-field"><text>账号</text><input v-model="loginAccount" placeholder="请输入账号" confirm-type="done" @confirm="submitLogin" /></label>
        <label class="form-field"><text>密码</text><input v-model="loginPassword" type="password" placeholder="请输入密码" confirm-type="done" @confirm="submitLogin" /></label>
      </view>
      <text v-if="store.error" class="form-error login-error">{{ store.error }}</text>
      <text v-else-if="store.loginError" class="form-error login-error">{{ store.loginError }}</text>
      <button v-if="store.error" class="secondary-button login-button" :disabled="store.loading" @click="refreshSharedState">重新加载</button>
      <button v-else class="primary-button login-button" :disabled="busy || !store.initialized || store.loading" @click="submitLogin">登 录</button>
      <text class="login-hint">{{ loginRole === 'supplier' ? '演示供应商：13787366688 / 13787366688（已自动填充）' : '演示司机：driver01 / 123456（已自动填充）' }}</text>
      </view>
    </view>
  </view>

  <!-- 工作区 -->
  <view v-else class="app-shell">
    <view v-if="store.loading" class="page-state"><text>正在准备配送工作台...</text></view>
    <view v-else-if="store.error" class="page-state"><text>{{ store.error }}</text><button class="primary-button mini-button" style="margin-top:12px" @click="refreshSharedState">重新加载</button></view>

    <template v-else>
      <!-- 供应商头部 -->
      <view v-if="store.auth.role === 'supplier'" class="hero">
        <view class="hero-top">
          <image class="hero-avatar" src="/static/images/bacon.webp" mode="aspectFill" />
          <view><text class="hero-title">{{ store.currentSupplier?.name || store.auth.name || supplierInfo.name }}</text><view class="hero-sub">{{ store.currentSupplier?.region || supplierInfo.region }} · {{ store.currentSupplier?.category || supplierInfo.category }}</view></view>
          <button class="hero-logout" @click="logout">退出</button>
        </view>
        <view class="hero-stats">
          <view class="hero-stat"><text class="hero-stat-label">待接单</text><text class="hero-stat-value">{{ store.metrics.toAcceptCount }}</text></view>
          <view class="hero-stat"><text class="hero-stat-label">待发货</text><text class="hero-stat-value">{{ store.metrics.toDispatchCount }}</text></view>
          <view class="hero-stat"><text class="hero-stat-label">配送中</text><text class="hero-stat-value">{{ store.metrics.deliveringCount }}</text></view>
          <view class="hero-stat"><text class="hero-stat-label">今日缺货</text><text class="hero-stat-value">{{ store.metrics.shortageOrderCount }}</text></view>
          <view class="hero-stat"><text class="hero-stat-label">司机</text><text class="hero-stat-value">{{ store.activeDrivers.length }}</text></view>
        </view>
      </view>

      <!-- 司机头部 -->
      <view v-else class="hero">
        <view class="hero-top">
          <view class="hero-avatar"><UiIcon name="user-round" :size="22" /></view>
          <view><text class="hero-title">{{ store.auth.name }}</text><view class="hero-sub">司机 · {{ store.auth.account }}</view></view>
          <button class="hero-logout" @click="logout">退出</button>
        </view>
        <view class="hero-stats">
          <view class="hero-stat"><text class="hero-stat-label">今日任务</text><text class="hero-stat-value">{{ store.myTasks.length }}</text></view>
          <view class="hero-stat"><text class="hero-stat-label">今日完成</text><text class="hero-stat-value">{{ driverDoneToday }}</text></view>
        </view>
      </view>
      <!-- 供应商模块 -->
      <template v-if="store.auth.role === 'supplier'">
        <view v-if="active === 'dashboard'" class="page-pad">
          <view class="section-title">配送订单<text class="section-sub">今日配送 {{ store.todayDeliveryOrders.length }} 单</text></view>
          <view v-if="store.todayDeliveryOrders.length">
            <view v-for="order in store.todayDeliveryOrders" :key="order.id" class="list-card" @click="openOrder(order)">
              <view class="row">
                <view class="row-main">
                  <view class="row-top"><text class="order-no">{{ order.id }}</text><span v-if="isCourierOrder(order)" class="tag c-mall-tag">{{ courierSourceLabel(order) }}</span><span class="badge" :class="orderFulfillment(order).status">{{ statusText(orderFulfillment(order).status, order) }}</span></view>
                  <text class="muted">{{ recipientLabel(order) }} · {{ order.createdAt }}</text>
                </view>
                <span v-if="orderShortage(order).length" class="tag danger">缺货 {{ orderShortage(order).length }}</span>
              </view>
            </view>
          </view>
          <view v-else class="empty-state"><UiIcon name="package" :size="28" /><text>今日暂无配送订单</text></view>

          <view class="section-title">最近交接日志</view>
          <view v-if="recentHandovers.length">
            <view v-for="log in recentHandovers" :key="log.id" class="list-card">
              <view class="row">
                <view class="row-main">
                  <view class="row-top"><text class="order-no">{{ log.orderId }}</text><span class="tag" :class="log.type">{{ log.type === 'out' ? '出库交接' : '到店交接' }}</span></view>
                  <text class="muted">{{ log.operatorName }} · {{ log.operatorRole === 'driver' ? '司机' : '供应商' }}{{ log.shortageCount ? ` · 缺货 ${log.shortageCount} 项` : '' }}</text>
                </view>
              </view>
            </view>
          </view>
          <view v-else class="empty-state"><UiIcon name="list-tree" :size="28" /><text>暂无交接日志</text></view>
          <view class="dashboard-foot">
            <button class="primary-button mini-button" @click="openProductWorkspace">商品管理</button>
            <button class="outline-button mini-button" @click="openSecondaryWorkspace('routes')">今日线路</button>
            <button class="outline-button mini-button" @click="openSecondaryWorkspace('drivers')">司机管理</button>
            <button class="outline-button mini-button" @click="openSecondaryWorkspace('settlements')">待结算</button>
            <button class="outline-button mini-button" @click="askResetDemo">重置演示数据</button>
            <text class="muted">待审核商品 {{ pendingProductCount }} 条</text>
          </view>
        </view>

        <view v-else-if="active === 'orders'" class="page-pad">
          <view class="chips">
            <button v-for="item in orderFilters" :key="item.key" class="chip" :class="{ active: orderFilter === item.key }" @click="orderFilter = item.key">{{ item.label }}<text class="chip-count">{{ item.count }}</text></button>
          </view>
          <view class="search-bar"><UiIcon name="search" :size="16" /><input v-model="orderKeyword" placeholder="搜索单号 / 门店" confirm-type="search" /></view>
          <button v-if="selectedOrderIds.length" class="primary-button" style="margin-top:10px" @click="batchAccept">批量接单（{{ selectedOrderIds.length }}）</button>
          <view v-if="filteredOrders.length" style="margin-top:12px">
            <view v-for="order in filteredOrders" :key="order.id" class="list-card">
              <view class="row" @click="openOrder(order)">
                <view v-if="orderFulfillment(order).status === 'submitted'" class="order-check" @click.stop="toggleSelect(order.id)">
                  <view :class="{ checked: selectedOrderIds.includes(order.id) }"><UiIcon v-if="selectedOrderIds.includes(order.id)" name="check" :size="13" /></view>
                </view>
                <view class="row-main">
                  <view class="row-top">
                    <text class="order-no">{{ order.id }}</text>
                    <span class="badge" :class="orderFulfillment(order).status">{{ statusText(orderFulfillment(order).status, order) }}</span>
                  </view>
                    <text class="muted">{{ isCourierOrder(order) ? `${courierSourceLabel(order)} · ${recipientLabel(order)}` : order.customer }} · {{ order.items?.length || 1 }} 项 · 共 {{ order.quantity }} 件</text>
                  <view class="row">
                    <text class="muted">{{ order.createdAt }} · {{ orderFulfillment(order).driverName ? `司机 ${orderFulfillment(order).driverName}` : orderFulfillment(order).trackingNo ? `运单 ${orderFulfillment(order).trackingNo}` : '' }}</text>
                    <span v-if="orderShortage(order).length" class="tag danger">缺货 {{ orderShortage(order).length }}</span>
                    <text class="order-amount">{{ money(order.amount) }}</text>
                  </view>
                </view>
                <UiIcon name="chevron-right" :size="16" />
              </view>
              <view v-if="orderActions(order).length" class="order-actions">
                <button v-for="action in orderActions(order)" :key="action.key" class="outline-button mini-button" :class="{ 'primary-button': action.primary }" @click="runAction(action.key, order)">{{ action.label }}</button>
              </view>
            </view>
          </view>
          <view v-else class="empty-state"><UiIcon name="search" :size="28" /><text>没有符合条件的配送订单</text></view>
        </view>

        <view v-else-if="active === 'mine' && !secondaryWorkspace" class="page-pad mine-page">
          <view class="section-title">业务工作区</view>
          <button v-for="item in supplierWorkItems" :key="item.key" class="work-link" @click="openSecondaryWorkspace(item.key)">
            <UiIcon :name="item.icon" :size="20" /><view class="row-main"><text>{{ item.label }}</text><text class="muted">{{ item.detail }}</text></view><UiIcon name="chevron-right" :size="16" />
          </button>
        </view>

        <view v-else-if="secondaryWorkspace === 'drivers'" class="page-pad secondary-workspace">
          <view class="secondary-head"><button class="icon-button" aria-label="返回" @click="closeSecondaryWorkspace"><UiIcon name="chevron-left" :size="20" /></button><text>司机管理</text></view>
          <view class="chips">
            <button v-for="item in driverStatusFilters" :key="item" class="chip" :class="{ active: driverStatusFilter === item }" @click="driverStatusFilter = item">{{ item }}</button>
          </view>
          <view class="search-bar"><UiIcon name="search" :size="16" /><input v-model="driverSearch" placeholder="搜索姓名 / 账号 / 手机" confirm-type="search" /></view>
          <button class="primary-button" style="margin-top:10px" @click="openDriverForm">＋ 新增司机</button>
          <view v-if="filteredDrivers.length" style="margin-top:12px">
            <view v-for="driver in filteredDrivers" :key="driver.id" class="list-card">
              <view class="row driver-row">
                <view class="driver-avatar"><UiIcon name="user-round" :size="20" /></view>
                <view class="row-main">
                  <view class="row-top"><text style="font-size:15px;font-weight:600">{{ driver.name }}</text><span class="badge" :class="driver.status">{{ driver.status === 'active' ? '启用' : '停用' }}</span></view>
                  <text class="muted">{{ driver.account }} · {{ driver.phone }}</text>
                  <text class="muted">创建于 {{ driver.createdAt }} · 进行中任务 {{ store.driverTaskCounts[driver.id] || 0 }}</text>
                </view>
                <button class="outline-button mini-button" :class="{ danger: driver.status === 'active' }" @click="askToggle(driver)">{{ driver.status === 'active' ? '停用' : '启用' }}</button>
              </view>
              <view class="driver-actions">
                <button class="outline-button mini-button" @click="openDriverEdit(driver)">编辑</button>
                <button class="outline-button mini-button" @click="openReset(driver)">重置密码</button>
              </view>
              <view class="scope-editor"><text class="muted">配送范围</text><view class="chips"><button v-for="destination in storeOptions" :key="destination.storeId" class="chip" :class="{ active: driverScopeIds(driver.id).includes(destination.storeId) }" @click="toggleDriverStore(driver, destination.storeId)">{{ destination.storeName }}</button></view></view>
            </view>
          </view>
          <view v-else class="empty-state"><UiIcon name="users" :size="28" /><text>暂无司机账号，点击「新增司机」开通</text></view>
        </view>

        <view v-else-if="secondaryWorkspace === 'settlements'" class="page-pad secondary-workspace">
          <view class="secondary-head"><button class="icon-button" aria-label="返回" @click="closeSecondaryWorkspace"><UiIcon name="chevron-left" :size="20" /></button><text>结算账单</text></view>
          <view class="chips"><text class="section-title">结算账单</text></view>
          <view v-if="store.mySettlements.length" style="margin-top:12px">
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
          <view v-else class="empty-state"><UiIcon name="package-check" :size="28" /><text>暂无结算账单</text></view>
        </view>

        <view v-else-if="secondaryWorkspace === 'handovers'" class="page-pad secondary-workspace">
          <view class="secondary-head"><button class="icon-button" aria-label="返回" @click="closeSecondaryWorkspace"><UiIcon name="chevron-left" :size="20" /></button><text>交接日志</text></view>
          <view class="chips">
            <button v-for="item in handoverTypeFilters" :key="item" class="chip" :class="{ active: handoverFilter === item }" @click="handoverFilter = item">{{ item }}</button>
          </view>
          <view class="chips scroll-x" style="margin-top:8px">
            <button v-for="item in handoverDriverFilters" :key="item" class="chip" :class="{ active: handoverDriverFilter === item }" @click="handoverDriverFilter = item">{{ item }}</button>
          </view>
          <view v-if="filteredHandovers.length" style="margin-top:12px">
            <view v-for="log in filteredHandovers" :key="log.id" class="list-card">
              <view class="row">
                <view class="row-main">
                  <view class="row-top"><text class="order-no">{{ log.orderId }}</text><span class="tag" :class="log.type">{{ log.type === 'out' ? '出库交接' : '到店交接' }}</span></view>
                  <text class="muted">{{ log.customer }} · {{ log.time }}</text>
                  <text class="muted">操作人：{{ log.operatorName }}（{{ log.operatorRole === 'driver' ? '司机' : '供应商' }}）{{ log.shortageCount ? ` · 缺货 ${log.shortageCount} 项` : '' }}{{ log.note ? ` · ${log.note}` : '' }}</text>
                </view>
              </view>
            </view>
          </view>
          <view v-else class="empty-state"><UiIcon name="list-tree" :size="28" /><text>暂无交接日志</text></view>
        </view>

        <view v-else-if="secondaryWorkspace === 'routes'" class="page-pad secondary-workspace">
          <view class="secondary-head"><button class="icon-button" aria-label="返回" @click="closeSecondaryWorkspace"><UiIcon name="chevron-left" :size="20" /></button><text>线路规划</text></view>
          <view class="route-controls">
            <picker mode="selector" :range="store.activeDrivers.map((driver) => driver.name)" @change="routeDriverId = store.activeDrivers[Number($event.detail.value)]?.id || ''"><view class="picker-field">{{ routeDriver?.name || '选择司机' }}</view></picker>
            <picker mode="date" :value="routeDate" @change="routeDate = String($event.detail.value)"><view class="picker-field">{{ routeDate }}</view></picker>
            <button class="primary-button" :disabled="routeBusy || !routeDriverId" @click="optimizeRoute">智能排序</button>
          </view>
          <view v-if="store.routeDraft" class="route-summary">
            <view class="stat-grid"><view class="stat-card"><text class="stat-card-label">总距离</text><text class="stat-card-value">{{ store.routeDraft.totalDistanceKm.toFixed(1) }} km</text></view><view class="stat-card"><text class="stat-card-label">预计用时</text><text class="stat-card-value">{{ store.routeDraft.estimatedDurationMinutes }} 分钟</text></view></view>
            <text v-for="warning in store.routeDraft.warnings" :key="warning" class="form-error">{{ warning.startsWith('missing_coordinates:') ? '有门店缺少坐标，已排在末尾，请维护坐标' : warning }}</text>
            <view v-for="(stop, index) in store.routeDraft.stops" :key="stop.storeId" class="list-card route-stop">
              <view class="route-number">{{ index + 1 }}</view><view class="row-main"><text>{{ stop.storeName }}</text><text class="muted">{{ stop.orderIds.length }} 单 · {{ stopItemCount(stop) }} 件 · {{ stopSegment(store.routeDraft, stop) ?? '距离待维护' }}{{ stopSegment(store.routeDraft, stop) !== undefined ? ' km' : '' }} · 预计 {{ stopEstimatedMinutes(store.routeDraft, index) }} 分钟</text><text class="muted">{{ stop.address }}</text></view>
              <view class="route-actions"><button class="icon-button" aria-label="上移" :disabled="index === 0" @click="moveStop(index, -1)">↑</button><button class="icon-button" aria-label="下移" :disabled="index === store.routeDraft.stops.length - 1" @click="moveStop(index, 1)">↓</button><button class="icon-button" aria-label="导航" @click="navigateToStop(stop)"><UiIcon name="navigation" :size="17" /></button></view>
            </view>
            <button class="primary-button route-publish" :disabled="routeBusy" @click="publishRoute">采用并发布</button>
          </view>
          <view v-else class="empty-state"><UiIcon name="navigation" :size="28" /><text>选择司机和日期后生成线路</text></view>
        </view>

        <view v-else-if="secondaryWorkspace === 'warehouse'" class="page-pad secondary-workspace">
          <view class="secondary-head"><button class="icon-button" aria-label="返回" @click="closeSecondaryWorkspace"><UiIcon name="chevron-left" :size="20" /></button><text>仓点设置</text></view>
          <view class="form-fields"><label class="form-field"><text>仓点地址</text><input v-model="warehouseForm.address" placeholder="请输入完整地址" /></label><label class="form-field"><text>经度（GCJ-02）</text><input v-model.number="warehouseForm.longitude" type="number" /></label><label class="form-field"><text>纬度（GCJ-02）</text><input v-model.number="warehouseForm.latitude" type="number" /></label></view>
          <button class="primary-button route-publish" @click="saveWarehouse">保存仓点</button>
        </view>

        <view v-else-if="secondaryWorkspace === 'account'" class="page-pad secondary-workspace">
          <view class="secondary-head"><button class="icon-button" aria-label="返回" @click="closeSecondaryWorkspace"><UiIcon name="chevron-left" :size="20" /></button><text>账号信息</text></view>
          <view class="list-card"><text class="order-no">{{ store.currentSupplier?.name }}</text><text class="muted">供应商编号 {{ store.auth.supplierId }}</text><text class="muted">登录账号 {{ store.auth.account }}</text><text class="muted">{{ store.currentSupplier?.region }} · {{ store.currentSupplier?.category }}</text></view>
        </view>
      </template>
      <!-- 司机模块 -->
      <template v-else>
        <view v-if="driverTab === 'today'" class="page-pad">
          <view v-if="store.currentDriverRoute" class="driver-route">
            <view class="route-driver-summary"><view><text class="section-title">今日线路</text><text class="muted">{{ store.currentDriverRoute.status === 'completed' ? '今日配送已完成' : store.currentDriverRoute.status === 'stale' ? '任务或配置有变化，按已发布线路执行并联系供应商更新' : '已发布' }}</text><text class="muted">完成 {{ routeCompletedOrderCount }}/{{ routeOrderCount }} · {{ nextRouteStop ? `下一站 ${nextRouteStop.storeName}` : '全部完成' }}</text></view><view><text class="order-no">{{ store.currentDriverRoute.totalDistanceKm.toFixed(1) }} km</text><text class="muted">约 {{ store.currentDriverRoute.estimatedDurationMinutes }} 分钟</text></view></view>
            <view v-for="(stop, index) in store.currentDriverRoute.stops" :key="stop.storeId" class="list-card route-stop">
              <view class="route-number">{{ index + 1 }}</view><view class="row-main"><text>{{ stop.storeName }}</text><text class="muted">完成 {{ stop.completedOrderIds?.length || 0 }}/{{ stop.orderIds.length }} 单 · {{ stopItemCount(stop) }} 件 · 预计 {{ stopEstimatedMinutes(store.currentDriverRoute, index) }} 分钟</text><text class="muted">{{ stop.address }}</text><text class="muted">{{ storeInfoOf(stop).contact }} {{ storeInfoOf(stop).phone }}</text><text class="distance-text">分段 {{ stopSegment(store.currentDriverRoute, stop) ?? '待维护' }}{{ stopSegment(store.currentDriverRoute, stop) !== undefined ? ' km' : '' }}</text><view class="task-orders"><template v-for="order in stopOrders(stop)" :key="order.id"><button v-if="orderFulfillment(order).status !== 'received'" class="outline-button mini-button" :disabled="orderFulfillment(order).status === 'shipped'" @click="openDriverHandover(order)">{{ order.id }} · {{ orderFulfillment(order).status === 'shipped' ? '待出库' : '到店交接' }}</button></template></view></view><button v-if="!stop.completedAt" class="outline-button mini-button task-nav" @click="navigateToStop(stop)"><UiIcon name="navigation" :size="14" />{{ nextRouteStop?.storeId === stop.storeId ? '下一站' : '导航' }}</button>
            </view>
          </view>
          <view v-else class="empty-state compact-empty"><UiIcon name="navigation" :size="28" /><text>供应商尚未发布今日线路</text></view>
          <view class="section-title">待排线路<text class="section-sub">{{ store.pendingRouteTasks.length }} 单</text></view>
          <view v-if="store.pendingRouteTasks.length">
            <view v-for="order in store.pendingRouteTasks" :key="order.id" class="list-card"><view class="row-top"><text class="order-no">{{ order.id }}</text><span class="badge" :class="orderFulfillment(order).status">{{ statusText(orderFulfillment(order).status) }}</span></view><view class="task-store"><UiIcon name="map-pin" :size="16" /><view class="row-main"><text>{{ order.customer }}</text><text class="muted">{{ storeInfoOf(order).address }} · {{ storeInfoOf(order).contact }} {{ storeInfoOf(order).phone }}</text><text class="distance-text">{{ taskDistanceText(order) }}</text></view><button class="outline-button mini-button task-nav" @click="navigateToStore(order)"><UiIcon name="navigation" :size="14" />导航</button></view><button v-if="orderFulfillment(order).status !== 'shipped'" class="primary-button route-publish" @click="openDriverHandover(order)">到店交接</button></view>
          </view>
          <view v-else class="empty-state compact-empty"><UiIcon name="package-check" :size="28" /><text>没有新增待排任务</text></view>
        </view>

        <view v-else-if="driverTab === 'history'" class="page-pad">
          <view v-if="store.myHistory.length">
            <view v-for="order in store.myHistory" :key="order.id" class="list-card">
              <view class="row-top"><text class="order-no">{{ order.id }}</text><span class="badge received">已收货</span></view>
              <view class="task-store"><UiIcon name="map-pin" :size="16" /><view class="row-main"><text>{{ order.customer }}</text><text class="muted">{{ order.createdAt }}</text></view></view>
              <view class="task-items">
                <view v-for="item in order.items" :key="`${item.productId}-${item.skuId}`" class="task-item"><BusinessImage :src="item.image" mode="aspectFit" /><text>{{ item.name }}</text><text class="muted">×{{ item.quantity }}</text></view>
              </view>
            </view>
          </view>
          <view v-else class="empty-state"><UiIcon name="package-check" :size="28" /><text>暂无历史任务</text></view>
        </view>

        <view v-else class="page-pad driver-mine">
          <view class="list-card"><text class="order-no">{{ store.auth.name }}</text><text class="muted">司机账号 {{ store.auth.account }}</text><text class="muted">所属供应商 {{ store.auth.supplierId }}</text></view>
          <view class="section-title">交接记录</view>
          <view v-if="store.myHandovers.length">
            <view v-for="log in store.myHandovers" :key="log.id" class="list-card">
              <view class="row">
                <span class="tag" :class="log.type">{{ log.type === 'out' ? '出库交接' : '到店交接' }}</span>
                <view class="row-main"><text class="order-no">{{ log.orderId }}</text><text class="muted">{{ log.customer }}</text><text class="muted">{{ log.time }}</text></view>
              </view>
            </view>
          </view>
          <view v-else class="empty-state"><UiIcon name="list-tree" :size="28" /><text>暂无我的交接记录</text></view>
        </view>
      </template>

      <view v-if="store.auth.role === 'supplier' && productWorkspace" class="product-work-page">
        <view class="product-work-head"><button class="icon-button" aria-label="返回" @click="closeProductWorkspace"><UiIcon name="chevron-left" :size="20" /></button><view><text class="product-work-title">商品管理</text><text class="muted">{{ productEditor ? '编辑商品资料' : `${supplierProductRows.length} 条商品记录` }}</text></view><button v-if="!productEditor" class="primary-button mini-button" @click="openNewProduct">新增商品</button></view>
        <template v-if="!productEditor">
          <view class="chips product-filter-chips"><button v-for="item in productFilters" :key="item" class="chip" :class="{ active: productFilter === item }" @click="productFilter = item">{{ item }}</button></view>
          <view v-if="supplierProductRows.length" class="supplier-product-list">
            <view v-for="row in supplierProductRows" :key="row.key" class="supplier-product-card">
              <view class="row"><BusinessImage class="supplier-product-image" :src="row.product.image" mode="aspectFit" /><view class="row-main"><view class="row-top"><text class="order-no">{{ row.product.name }}</text><span class="badge" :class="row.status">{{ row.status === 'pending' ? '待审核' : row.status === 'rejected' ? '已驳回' : row.status === 'offline' ? '已下架' : '已上架' }}</span></view><text class="muted">{{ row.product.category }} · {{ row.product.channel === 'store' ? '门店' : row.product.channel === 'live' ? '直播' : '全渠道' }}</text></view></view>
              <view class="supplier-product-skus"><text v-for="sku in row.product.skus" :key="sku.id">{{ sku.name }} · ¥{{ sku.retailPrice }} · 库存 {{ sku.stock }} · 起订量 {{ sku.minimumOrderQuantity || 1 }}</text></view>
              <text v-if="row.submission?.reviewNote" class="product-reject-note">驳回原因：{{ row.submission.reviewNote }}</text>
              <view class="order-actions"><button v-if="row.status === 'rejected'" class="primary-button mini-button" @click="openProductEditor(row.product, row.submission)">重新提交</button><button v-else-if="row.status !== 'pending'" class="outline-button mini-button" @click="openProductEditor(row.product)">编辑</button><button v-if="row.status === 'active' || row.status === 'offline'" class="outline-button mini-button" @click="toggleSupplierProduct(row.product)">{{ row.status === 'active' ? '下架' : '上架' }}</button></view>
            </view>
          </view>
          <view v-else class="empty-state"><UiIcon name="package" :size="28" /><text>暂无{{ productFilter }}商品</text></view>
        </template>
        <view v-else class="supplier-product-form">
          <label class="form-field"><text>商品名称</text><input v-model="productEditor.name" placeholder="请输入商品名称" /></label>
          <label class="form-field"><text>商品品类</text><input v-model="productEditor.category" placeholder="请输入商品品类" /></label>
          <label class="form-field"><text>商品渠道</text><picker mode="selector" :range="productChannelOptions" @change="setProductChannel"><view class="picker-field">{{ productEditor.channel }}</view></picker></label>
          <label class="checkbox-field"><checkbox :checked="productEditor.expressDelivery" @click="productEditor.expressDelivery = !productEditor.expressDelivery" /><text>支持快递直发</text></label>
          <view class="supplier-sku-form"><text class="section-title">SKU 价格、库存与起订量</text><view v-for="sku in productEditor.skus" :key="sku.id" class="supplier-sku-fields"><label><text>规格</text><input v-model="sku.name" /></label><label><text>零售价</text><input v-model.number="sku.retailPrice" type="number" min="0" /></label><label><text>供货价</text><input v-model.number="sku.cost" type="number" min="0" /></label><label><text>库存</text><input v-model.number="sku.stock" type="number" min="0" /></label><label><text>起订量</text><input v-model.number="sku.minimumOrderQuantity" type="number" min="1" step="1" /></label><label><text>一级金额</text><input v-model.number="sku.level1Amount" type="number" min="0" /></label><label><text>二级金额</text><input v-model.number="sku.level2Amount" type="number" min="0" /></label></view></view>
          <text v-if="productFormError" class="form-error">{{ productFormError }}</text>
          <view class="product-form-actions"><button class="outline-button" @click="productEditor = null">取消</button><button v-if="productEditorFormalId" class="outline-button" @click="saveSupplierProductStock">仅保存库存</button><button class="primary-button" @click="submitSupplierProduct">{{ productEditorFormalId ? '提交资料审核' : '提交审核' }}</button></view>
        </view>
      </view>

      <!-- 底部 tabbar -->
      <view class="tabbar">
        <button v-for="tab in currentTabs" :key="tab.key" class="tab-item bottom-tab" :class="{ active: isTabActive(tab.key) }" @click="switchTab(tab.key)">
          <UiIcon :name="tab.icon" :size="20" />
          <text>{{ tab.label }}</text>
          <span v-if="tab.badge()" class="tab-badge">{{ tab.badge() }}</span>
        </button>
      </view>
      <!-- 弹层 -->
      <view v-if="sheet" class="sheet-mask" @click.self="closeSheet">
        <view class="sheet-panel">
          <view v-if="sheet === 'order' && selectedOrder" class="order-detail">
            <view class="sheet-head"><text class="sheet-title">{{ selectedOrder.id }}</text><button class="icon-button" aria-label="关闭" @click="closeSheet"><UiIcon name="x" :size="18" /></button></view>
            <view class="row" style="margin-bottom:12px"><span class="badge" :class="orderFulfillment(selectedOrder).status">{{ statusText(orderFulfillment(selectedOrder).status, selectedOrder) }}</span><text class="muted">{{ selectedOrder.createdAt }}</text></view>
            <view class="steps">
              <view v-for="(step, index) in fulfillmentSteps" :key="step" class="step" :class="{ done: stepIndex(selectedOrder) >= index }"><view class="step-dot">{{ index + 1 }}</view><text class="step-label">{{ stepLabel(step) }}</text></view>
            </view>
            <view class="section-title">商品明细</view>
            <view v-for="item in selectedOrder.items" :key="`${item.productId}-${item.skuId}`" class="order-item-line">
              <BusinessImage :src="item.image" mode="aspectFit" /><view class="row-main"><text>{{ item.name }}</text><text class="muted">{{ item.skuName }} ×{{ item.quantity }}</text></view><text class="order-item-price">{{ money(item.price * item.quantity) }}</text>
            </view>
            <view class="section-title">收货门店</view>
            <view class="store-line"><UiIcon name="map-pin" :size="16" /><view class="row-main"><text>{{ isCourierOrder(selectedOrder) ? '收货地址' : selectedOrder.customer }}</text><text class="muted">{{ addressLabel(selectedOrder) }}</text></view></view>
            <view v-if="orderShortage(selectedOrder).length" class="section-title">缺货清单 <span class="tag danger">缺货 {{ orderShortage(selectedOrder).length }} 项</span></view>
            <view v-if="orderShortage(selectedOrder).length">
              <view v-for="item in orderShortage(selectedOrder)" :key="item.skuId" class="shortage-line">
                <view class="row-main"><text>{{ item.name }}</text><text class="muted">应发 {{ item.ordered }} · 实发 {{ item.actual }}</text></view>
                <span class="tag" :class="item.handled ? 'out' : 'danger'">{{ item.handled ? '已补发' : '缺 ' + item.shortage }}</span>
                <button v-if="store.auth.role === 'supplier' && !item.handled" class="outline-button mini-button" @click="markHandled(item.skuId)">标记补发</button>
              </view>
            </view>
            <view class="section-title">交接记录</view>
            <view v-if="handoversOf(selectedOrder).length" class="log-list">
              <view v-for="log in handoversOf(selectedOrder)" :key="log.id" class="log-event"><view class="log-dot"></view><view class="row-main"><text>{{ log.type === 'out' ? '出库交接' : '到店交接' }} · {{ log.operatorName }}</text><text class="muted">{{ log.time }} · {{ log.operatorRole === 'driver' ? '司机' : '供应商' }}{{ log.shortageCount ? ` · 缺货 ${log.shortageCount} 项` : '' }}{{ log.note ? ` · ${log.note}` : '' }}</text></view></view>
            </view>
            <text v-else class="muted">暂无交接记录</text>
            <view class="section-title">流转记录</view>
            <view class="log-list">
              <view v-for="(event, index) in (selectedOrder.flow || [])" :key="index" class="log-event"><view class="log-dot"></view><view class="row-main"><text>{{ event.action }}</text><text class="muted">{{ event.time }} · {{ event.operator }}</text></view></view>
            </view>
            <view v-if="orderActions(selectedOrder).length" class="sheet-actions">
              <button v-for="action in orderActions(selectedOrder)" :key="action.key" class="outline-button" :class="{ 'primary-button': action.primary }" @click="runAction(action.key, selectedOrder)">{{ action.label }}</button>
            </view>
          </view>

          <view v-else-if="(sheet === 'assign' || sheet === 'reassign') && assignTarget" class="driver-picker">
            <view class="sheet-head"><text class="sheet-title">{{ sheet === 'assign' ? '指派司机' : '改派司机' }}</text><button class="icon-button" aria-label="关闭" @click="closeSheet"><UiIcon name="x" :size="18" /></button></view>
            <text class="muted">订单 {{ assignTarget.id }} · {{ assignTarget.customer }}</text>
            <view v-if="assignableDrivers.length" class="driver-options">
              <button v-for="driver in assignableDrivers" :key="driver.id" class="driver-option" :class="{ active: assignDriverId === driver.id }" @click="assignDriverId = driver.id">
                <view class="driver-avatar"><UiIcon name="user-round" :size="18" /></view>
                <text class="driver-option-name">{{ driver.name }}</text>
                <text class="muted">{{ driver.phone }}</text>
                <view v-if="assignDriverId === driver.id" class="radio-dot"></view>
              </button>
            </view>
            <view v-else class="empty-state"><UiIcon name="users" :size="28" /><text>暂无可用的司机，请先到司机管理开通</text></view>
            <view class="sheet-actions">
              <button class="primary-button" :disabled="!assignDriverId" @click="confirmAssign">{{ sheet === 'assign' ? '确认指派' : '确认改派' }}</button>
              <button class="outline-button" @click="closeSheet">取 消</button>
            </view>
          </view>

          <view v-else-if="sheet === 'courier' && selectedOrder" class="courier-sheet">
            <view class="sheet-head"><text class="sheet-title">快递直发</text><button class="icon-button" aria-label="关闭" @click="closeSheet"><UiIcon name="x" :size="18" /></button></view>
            <text class="muted">订单 {{ selectedOrder.id }} · {{ recipientLabel(selectedOrder) }}</text>
            <view class="sheet-actions">
              <button class="primary-button" @click="confirmCourier">确认发货</button>
              <button class="outline-button" @click="closeSheet">取 消</button>
            </view>
          </view>

          <view v-else-if="sheet === 'handover-out' && selectedOrder" class="handover-sheet">
            <view class="sheet-head"><text class="sheet-title">出库交接</text><button class="icon-button" aria-label="关闭" @click="closeSheet"><UiIcon name="x" :size="18" /></button></view>
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
              <label class="form-field" style="margin-top:10px"><text>备注（可选）</text><input v-model="handoverNote" placeholder="交接备注" /></label>
            </view>
            <view class="sheet-actions">
              <button v-if="!handoverResult" class="primary-button" @click="confirmHandoverOut">确认交接</button>
              <button class="outline-button" @click="closeSheet">{{ handoverResult ? '完 成' : '取 消' }}</button>
            </view>
          </view>
          <view v-else-if="sheet === 'handover-in' && selectedOrder" class="handover-sheet">
            <view class="sheet-head"><text class="sheet-title">到店交接</text><button class="icon-button" aria-label="关闭" @click="closeSheet"><UiIcon name="x" :size="18" /></button></view>
            <view class="store-line"><UiIcon name="map-pin" :size="16" /><view class="row-main"><text>{{ selectedOrder.customer }}</text><text class="muted">{{ storeInfoOf(selectedOrder.customer).address }} · {{ storeInfoOf(selectedOrder.customer).contact }} {{ storeInfoOf(selectedOrder.customer).phone }}</text></view></view>
            <view class="section-title">商品明细</view>
            <view v-for="item in selectedOrder.items" :key="`${item.productId}-${item.skuId}`" class="order-item-line"><BusinessImage :src="item.image" mode="aspectFit" /><view class="row-main"><text>{{ item.name }}</text><text class="muted">{{ item.skuName }} ×{{ item.quantity }}</text></view><text class="order-item-price">{{ money(item.price * item.quantity) }}</text></view>
            <view v-if="orderShortage(selectedOrder).length" class="section-title">缺货提示</view>
            <view v-if="orderShortage(selectedOrder).length">
              <view v-for="item in orderShortage(selectedOrder)" :key="item.skuId" class="shortage-line"><text>{{ item.name }}</text><span class="tag danger">缺 {{ item.shortage }}</span></view>
            </view>
            <label class="form-field" style="margin-top:12px"><text>备注（可选）</text><input v-model="handoverNote" placeholder="交接备注" /></label>
            <view class="sheet-actions">
              <button class="primary-button" @click="confirmHandoverIn">确认已送达门店</button>
              <button class="outline-button" @click="closeSheet">取 消</button>
            </view>
          </view>

          <view v-else-if="sheet === 'driver-form' || sheet === 'driver-edit'" class="driver-form-sheet">
            <view class="sheet-head"><text class="sheet-title">{{ sheet === 'driver-form' ? '新增司机' : '编辑司机' }}</text><button class="icon-button" aria-label="关闭" @click="closeSheet"><UiIcon name="x" :size="18" /></button></view>
            <view class="form-fields">
              <label class="form-field"><text>姓名</text><input v-model="driverForm.name" placeholder="司机姓名" /></label>
              <label class="form-field"><text>手机号</text><input v-model="driverForm.phone" type="number" maxlength="11" placeholder="11 位手机号" /></label>
              <label v-if="sheet === 'driver-form'" class="form-field"><text>账号</text><input v-model="driverForm.account" placeholder="4-20 位字母数字，登录用" /></label>
              <label v-if="sheet === 'driver-form'" class="form-field"><text>初始密码</text><input v-model="driverForm.password" placeholder="6-20 位" /></label>
            </view>
            <text v-if="driverFormError" class="form-error">{{ driverFormError }}</text>
            <view class="sheet-actions">
              <button class="primary-button" @click="saveDriver">{{ sheet === 'driver-form' ? '创建账号' : '保存' }}</button>
              <button class="outline-button" @click="closeSheet">取 消</button>
            </view>
          </view>

          <view v-else-if="sheet === 'driver-reset' && editingDriver" class="driver-form-sheet">
            <view class="sheet-head"><text class="sheet-title">重置密码 · {{ editingDriver.name }}</text><button class="icon-button" aria-label="关闭" @click="closeSheet"><UiIcon name="x" :size="18" /></button></view>
            <label class="form-field"><text>新密码</text><input v-model="resetPassword" type="password" placeholder="6-20 位" confirm-type="done" @confirm="confirmReset" /></label>
            <text v-if="driverFormError" class="form-error">{{ driverFormError }}</text>
            <view class="sheet-actions">
              <button class="primary-button" @click="confirmReset">确认重置</button>
              <button class="outline-button" @click="closeSheet">取 消</button>
            </view>
          </view>

          <view v-else-if="sheet === 'reset-confirm'" class="driver-form-sheet">
            <view class="sheet-head"><text class="sheet-title">重置演示数据</text><button class="icon-button" aria-label="关闭" @click="closeSheet"><UiIcon name="x" :size="18" /></button></view>
            <text class="muted">将清空本地订单、司机与交接数据并恢复为初始演示数据（同源下其它端共享数据也会重置为演示集）。</text>
            <view class="sheet-actions">
              <button class="primary-button" @click="confirmResetDemo">确认重置</button>
              <button class="outline-button" @click="closeSheet">取 消</button>
            </view>
          </view>

          <view v-else-if="sheet === 'driver-toggle-confirm' && driverStatusTarget" class="driver-form-sheet">
            <view class="sheet-head"><text class="sheet-title">{{ driverStatusTarget.status === 'active' ? '停用司机' : '启用司机' }}</text><button class="icon-button" aria-label="关闭" @click="closeSheet"><UiIcon name="x" :size="18" /></button></view>
            <text class="muted">{{ driverToggleMessage(driverStatusTarget) }}</text>
            <view class="sheet-actions">
              <button class="primary-button" @click="confirmToggle">{{ driverStatusTarget.status === 'active' ? '确认停用' : '确认启用' }}</button>
              <button class="outline-button" @click="closeSheet">取 消</button>
            </view>
          </view>
        </view>
      </view>
    </template>
  </view>

  <view v-if="toastMsg" class="toast">{{ toastMsg }}</view>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import type { CatalogProduct, CatalogProductSubmission, DailyDeliveryRoute, DriverAccount, Order, RouteStop, ShortageItem } from '@agritainment/shared'
import { PLATFORM_AUDIT_LOG_STORAGE_KEY, PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY, PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_C_ORDERS_STORAGE_KEY, PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY, PLATFORM_DRIVERS_STORAGE_KEY, PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY, PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY, PLATFORM_SUPPLIER_ACCOUNTS_STORAGE_KEY, PLATFORM_SUPPLIER_SETTLEMENTS_STORAGE_KEY, configurePlatformProviders, createId, installKeyboardButtonSupport, money, subscribePlatformChanges, todayString } from '@agritainment/shared'
import { BusinessImage } from '@agritainment/ui'
import UiIcon from '../../components/UiIcon.vue'
import { buildNavigationUrl, deliveryDistanceKm, resolveOrderStore, storeDirectory, storeInfoOf, supplierInfo, supplierWarehouseOf } from '../../services/repository'
import { useSupplierStore } from '../../stores/supplier'
import { createSharedRefreshRunner } from './shared-refresh'

const store = useSupplierStore()
let disposeKeyboardButtons: () => void = () => undefined
let disposeStorageSync: (() => void) | null = null
let disposePlatformChanges: (() => void) | null = null
let disposeVisibilitySync: (() => void) | null = null
const platformChangeKeys = [PLATFORM_ORDERS_STORAGE_KEY, PLATFORM_DRIVERS_STORAGE_KEY, PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY, PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY, PLATFORM_C_ORDERS_STORAGE_KEY, PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_SUPPLIER_ACCOUNTS_STORAGE_KEY, PLATFORM_SUPPLIER_SETTLEMENTS_STORAGE_KEY, PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY]
const refreshSharedState = createSharedRefreshRunner(
  () => store.refreshSharedState(),
  (error) => { store.error = error instanceof Error ? error.message : '数据加载失败' }
)
const busy = ref(false)
const toastMsg = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined

function toast(text: string) {
  toastMsg.value = text
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastMsg.value = '' }, 2200)
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
    active.value = 'dashboard'
    secondaryWorkspace.value = null
    driverTab.value = 'today'
  }
}

function logout() {
  store.logout()
  closeSheet()
}

// ---------- 底部 tab（按角色）----------
type SupplierTab = 'dashboard' | 'orders' | 'products' | 'mine'
const active = ref<SupplierTab>('dashboard')
const supplierTabs = [
  { key: 'dashboard' as const, label: '首页', icon: 'layout-dashboard', badge: () => 0 },
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
type SecondaryWorkspace = 'drivers' | 'routes' | 'settlements' | 'handovers' | 'warehouse' | 'account'
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
    Object.assign(warehouseForm, { address: warehouse?.address || '', longitude: warehouse?.longitude, latitude: warehouse?.latitude })
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
const sheet = ref<null | 'order' | 'assign' | 'reassign' | 'courier' | 'handover-out' | 'handover-in' | 'driver-form' | 'driver-edit' | 'driver-reset' | 'driver-toggle-confirm' | 'reset-confirm'>(null)

function orderFulfillment(order: Order) {
  return order.supplierFulfillment || { status: 'submitted', shortages: [], handovers: [], updatedAt: order.createdAt }
}

// ---------- 商品二级工作页 ----------
const productWorkspace = ref(false)
const productFilter = ref<'全部' | '待审核' | '已驳回' | '已下架' | '已上架'>('全部')
const productFilters = ['全部', '待审核', '已驳回', '已下架', '已上架'] as const
const productChannelOptions: CatalogProduct['channel'][] = ['store', 'live', 'all']
const productEditor = ref<CatalogProduct | null>(null)
const productEditorFormalId = ref('')
const productFormError = ref('')

type SupplierProductRow = { key: string; product: CatalogProduct; status: 'pending' | 'rejected' | 'active' | 'offline'; submission?: CatalogProductSubmission }
const supplierProductRows = computed<SupplierProductRow[]>(() => {
  const formal = store.myCatalogProducts.map((product) => ({ key: `formal:${product.id}`, product, status: product.status as 'active' | 'offline' }))
  const submissions = store.myProductSubmissions.filter((item) => item.status !== 'approved').map((submission) => ({ key: `submission:${submission.id}`, product: submission.draft, status: submission.status as 'pending' | 'rejected', submission }))
  const rows = [...submissions, ...formal]
  return rows.filter((row) => productFilter.value === '全部'
    || (productFilter.value === '待审核' && row.status === 'pending')
    || (productFilter.value === '已驳回' && row.status === 'rejected')
    || (productFilter.value === '已下架' && row.status === 'offline')
    || (productFilter.value === '已上架' && row.status === 'active'))
})

function openProductWorkspace() {
  productWorkspace.value = true
  productEditor.value = null
}

function closeProductWorkspace() {
  productWorkspace.value = false
  productEditor.value = null
  productFormError.value = ''
  if (active.value === 'products') active.value = 'dashboard'
}

function openNewProduct() {
  const supplier = store.currentSupplier
  productEditorFormalId.value = ''
  productEditor.value = {
    id: createId('P'), name: '', category: supplier?.category || '土特产', supplierId: store.auth.supplierId, supplierName: supplier?.name || store.auth.name,
    source: 'platform', status: 'active', image: '/static/images/bacon.webp', images: [], tags: [], productType: 'goods', expressDelivery: true,
    channel: 'live', farmIds: [], promoterCommissionRate: 5, storeCommissionRate: 3,
    skus: [{ id: createId('SKU'), name: '默认规格', image: '/static/images/bacon.webp', retailPrice: 59.9, cost: 30, stock: 0, minimumOrderQuantity: 1, level1Amount: 10, level2Amount: 15 }]
  }
  productFormError.value = ''
}

function openProductEditor(product: CatalogProduct, submission?: CatalogProductSubmission) {
  productEditor.value = JSON.parse(JSON.stringify(submission?.draft || product)) as CatalogProduct
  productEditorFormalId.value = store.myCatalogProducts.some((item) => item.id === product.id) ? product.id : ''
  productFormError.value = ''
}

function setProductChannel(event: { detail: { value: string | number } }) {
  if (productEditor.value) productEditor.value.channel = productChannelOptions[Number(event.detail.value)] || 'store'
}

function validateSupplierProduct(product: CatalogProduct) {
  if (!product.name.trim() || !product.category.trim() || !product.skus.length) return '请完善商品名称、品类和 SKU'
  for (const sku of product.skus) {
    if (!sku.name.trim() || [sku.retailPrice, sku.cost, sku.stock, sku.level1Amount, sku.level2Amount].some((value) => !Number.isFinite(Number(value)) || Number(value) < 0)) return 'SKU 金额和库存不能为负数'
    if (!Number.isInteger(Number(sku.minimumOrderQuantity)) || Number(sku.minimumOrderQuantity) < 1) return '起订量必须为大于等于 1 的整数'
    if (Number(sku.retailPrice) < Number(sku.level1Amount) + Number(sku.level2Amount)) return '零售价不能低于分销金额合计'
  }
  return ''
}

async function submitSupplierProduct() {
  if (!productEditor.value) return
  const error = validateSupplierProduct(productEditor.value)
  if (error) { productFormError.value = error; return }
  const result = await store.submitCatalogProduct(productEditor.value)
  if (!result.ok) { productFormError.value = result.message; return }
  productEditor.value = null
  toast('商品已提交审核')
}

async function saveSupplierProductStock() {
  if (!productEditor.value || !productEditorFormalId.value) return
  const changes = productEditor.value.skus.map((sku) => ({ skuId: sku.id, stock: Number(sku.stock) }))
  const result = await store.adjustCatalogProductStock(productEditorFormalId.value, changes)
  if (!result.ok) { productFormError.value = result.message; return }
  productEditor.value = null
  toast('库存已更新')
}

async function toggleSupplierProduct(product: CatalogProduct) {
  const result = await store.toggleCatalogProduct(product.id)
  toast(result.ok ? (product.status === 'active' ? '商品已下架' : '商品已上架') : result.message)
}

// ---------- 配送范围、每日线路与仓点 ----------
const pendingProductCount = computed(() => store.myProductSubmissions.filter((item) => item.status === 'pending').length)
const routeDriverId = ref('')
const routeDate = ref(todayString())
const routeBusy = ref(false)
const warehouseForm = reactive<{ address: string; longitude?: number; latitude?: number }>({ address: '' })
const supplierWorkItems: Array<{ key: SecondaryWorkspace; label: string; icon: string; detail: string }> = [
  { key: 'drivers', label: '司机管理', icon: 'users', detail: '账号、状态与配送范围' },
  { key: 'routes', label: '线路规划', icon: 'navigation', detail: '智能排序、手调与发布' },
  { key: 'settlements', label: '结算账单', icon: 'package-check', detail: '查看账期和关联订单' },
  { key: 'handovers', label: '交接日志', icon: 'list-tree', detail: '出库和到店交接记录' },
  { key: 'warehouse', label: '仓点设置', icon: 'map-pin', detail: '地址与 GCJ-02 坐标' },
  { key: 'account', label: '账号信息', icon: 'user-round', detail: '供应商与登录账号' }
]
const routeDriver = computed(() => store.visibleDrivers.find((driver) => driver.id === routeDriverId.value))
const routeOrderCount = computed(() => store.currentDriverRoute?.sourceOrderIds.length || 0)
const routeCompletedOrderCount = computed(() => store.currentDriverRoute?.stops.reduce((count, stop) => count + (stop.completedOrderIds?.length || 0), 0) || 0)
const nextRouteStop = computed(() => store.currentDriverRoute?.stops.find((stop) => (stop.completedOrderIds?.length || 0) < stop.orderIds.length) || null)
const storeOptions = Object.values(storeDirectory)

function driverScopeIds(driverId: string) {
  return store.driverScopes.find((scope) => scope.supplierId === store.auth.supplierId && scope.driverId === driverId)?.storeIds || []
}
async function toggleDriverStore(driver: DriverAccount, storeId: string) {
  const current = driverScopeIds(driver.id)
  const next = current.includes(storeId) ? current.filter((id) => id !== storeId) : [...current, storeId]
  const result = await store.updateDriverScope(driver.id, next)
  toast(result.ok ? '配送范围已保存' : result.message)
}
async function optimizeRoute() {
  if (!routeDriverId.value) { toast('请选择司机'); return }
  routeBusy.value = true
  const result = await store.optimizeDriverRoute(routeDriverId.value, routeDate.value)
  routeBusy.value = false
  toast(result.ok ? '线路草稿已生成' : result.message)
}
function moveStop(index: number, direction: -1 | 1) {
  if (store.moveRouteStop(index, direction)) toast('站点顺序已调整')
}
async function publishRoute() {
  routeBusy.value = true
  const result = await store.publishRoute()
  routeBusy.value = false
  toast(result.ok ? '今日线路已发布' : result.message)
}
async function saveWarehouse() {
  const result = await store.updateWarehouse({ ...warehouseForm })
  toast(result.ok ? '仓点已保存' : result.message)
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
  return address ? `${address.region}${address.detail} · ${address.receiver} ${address.phone}` : `${storeInfoOf(order).address} · ${storeInfoOf(order).contact} ${storeInfoOf(order).phone}`
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
    ...(isCourierOrder(order) ? [] : [{ key: 'assign', label: '指派司机' }]),
    { key: 'courier', label: '快递直发' }
  ]
  if (status === 'shipped') return [
    { key: 'handover-out', label: '出库交接', primary: true },
    ...(shipType === 'driver' ? [{ key: 'reassign', label: '改派司机' }] : [])
  ]
  if (status === 'delivering' && shipType === 'courier') return [{ key: 'courier-delivered', label: '确认快递签收', primary: true }]
  if (status === 'delivering' && shipType === 'driver') return [{ key: 'reassign', label: '改派司机' }]
  return []
}

async function runAction(key: string, order: Order) {
  if (key === 'accept') {
    if (await store.acceptOrder(order.id)) toast('已接单')
    closeSheet()
    return
  }
  if (key === 'assign') { openAssign(order); return }
  if (key === 'reassign') { openReassign(order); return }
  if (key === 'courier') { openCourier(order); return }
  if (key === 'handover-out') { openHandoverOut(order); return }
  if (key === 'courier-delivered') {
    if (await store.markCourierDelivered(order.id)) toast('已确认快递签收')
    closeSheet()
    return
  }
}

function toggleSelect(id: string) {
  const index = selectedOrderIds.value.indexOf(id)
  if (index >= 0) selectedOrderIds.value.splice(index, 1)
  else selectedOrderIds.value.push(id)
}
async function batchAccept() {
  const count = await store.batchAcceptOrders([...selectedOrderIds.value])
  selectedOrderIds.value = []
  toast(`已批量接单 ${count} 单`)
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
  if (await store.markShortageHandled(orderId, skuId)) {
    selectedOrder.value = store.orders.find((order) => order.id === orderId) || selectedOrder.value
    toast('已标记补发')
  }
}
function askResetDemo() {
  sheet.value = 'reset-confirm'
}
async function confirmResetDemo() {
  closeSheet()
  await store.resetDemoData()
  active.value = 'dashboard'
  toast('演示数据已重置')
}
function closeSheet() {
  sheet.value = null
  selectedOrder.value = null
  assignTarget.value = null
  assignDriverId.value = ''
  courierTracking.value = ''
  handoverNote.value = ''
  handoverResult.value = null
  driverFormError.value = ''
  editingDriver.value = null
  resetPassword.value = ''
  driverStatusTarget.value = null
  resetActuals()
}
const assignTarget = ref<Order | null>(null)
const assignDriverId = ref('')
const assignableDrivers = computed(() => {
  const current = assignTarget.value?.supplierFulfillment?.driverId
  return assignTarget.value ? store.assignableDriversForOrder(assignTarget.value).filter((driver) => driver.id !== current) : []
})
function openAssign(order: Order) {
  assignTarget.value = order
  assignDriverId.value = ''
  sheet.value = 'assign'
}
function openReassign(order: Order) {
  assignTarget.value = order
  assignDriverId.value = ''
  sheet.value = 'reassign'
}
async function confirmAssign() {
  if (!assignTarget.value || !assignDriverId.value) return
  const isAssign = sheet.value === 'assign'
  const ok = isAssign
    ? await store.assignDriver(assignTarget.value.id, assignDriverId.value)
    : await store.reassignDriver(assignTarget.value.id, assignDriverId.value)
  if (ok) {
    toast(isAssign ? '已指派司机' : '已改派司机')
    closeSheet()
  } else toast(store.error || '指派失败，请检查司机配送范围和门店资料')
}

const courierTracking = ref('')
function openCourier(order: Order) {
  selectedOrder.value = order
  courierTracking.value = ''
  sheet.value = 'courier'
}
async function confirmCourier() {
  if (!selectedOrder.value) return
  if (await store.shipCourier(selectedOrder.value.id)) {
    toast('已快递直发')
    closeSheet()
  }
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
  const result = await store.handoverOut(selectedOrder.value.id, { ...actuals }, handoverNote.value.trim() || undefined)
  if (result.ok) {
    handoverResult.value = { shortages: result.shortages }
    toast(result.shortages.length ? `交接完成，缺货 ${result.shortages.length} 项` : '出库交接完成')
  }
}
async function confirmHandoverIn() {
  if (!selectedOrder.value) return
  if (await store.handoverIn(selectedOrder.value.id, handoverNote.value.trim() || undefined)) {
    toast('到店交接完成')
    closeSheet()
  }
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
  store.resetDriverPassword(editingDriver.value.id, resetPassword.value)
  toast('密码已重置')
  closeSheet()
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
  store.initialize()
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
$green: #14532d;
$green-deep: #0d3a1f;
$green-soft: #e8f3ec;
$red: #b91c1c;
$bg: #f4f5f1;
$panel: #ffffff;
$ink: #1f2a22;
$muted: #6b756d;
$line: #dfe3dc;

// ===== 登录页 =====
.login-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 0 24px 24px; background: linear-gradient(160deg, $green-deep 0%, $green 60%, #1e6b41 100%); }
/* #ifdef MP-WEIXIN */
.login-page { padding-top: calc(18px + var(--status-bar-height)); }
/* #endif */
/* #ifndef MP-WEIXIN */
.login-page { padding-top: calc(18px + env(safe-area-inset-top)); }
/* #endif */
.login-card { width: 100%; max-width: 380px; background: $panel; border-radius: 16px; overflow: hidden; box-shadow: 0 18px 48px rgba(13, 58, 31, .28); }
.login-banner { width: 100%; height: 150px; display: block; }
.login-body { padding: 22px 24px 26px; }
.login-title { display: block; text-align: center; font-size: 20px; font-weight: 700; color: $ink; }
.login-sub { display: block; text-align: center; margin-top: 6px; font-size: 12px; color: $muted; }
.role-tabs { display: flex; gap: 8px; margin: 20px 0 16px; }
.role-tabs button { flex: 1; padding: 10px 0; border-radius: 10px; background: $bg; color: $muted; font-size: 14px; }
.role-tabs button.active { background: $green; color: #fff; font-weight: 600; }
.login-fields { display: flex; flex-direction: column; gap: 12px; }
.login-button { margin-top: 18px; width: 100%; }
.login-hint { display: block; margin-top: 12px; text-align: center; font-size: 12px; color: $muted; }

// ===== 订单 =====
.order-check { display: flex; align-items: center; flex: none; }
.order-check > view { width: 20px; height: 20px; border: 1.5px solid $line; border-radius: 6px; display: flex; align-items: center; justify-content: center; background: #fff; }
.order-check > view.checked { background: $green; border-color: $green; }
.order-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.outline-button.danger { color: $red; border-color: rgba(185, 28, 28, .4); }
.dashboard-foot { display: flex; align-items: center; gap: 10px; margin-top: 18px; padding-top: 14px; border-top: 1px dashed $line; }

// ===== 司机 =====
.driver-avatar { width: 40px; height: 40px; border-radius: 50%; background: $green-soft; display: flex; align-items: center; justify-content: center; color: $green; flex: none; }
.driver-row { align-items: flex-start; }
.driver-row .outline-button { margin-top: 2px; }
.driver-actions { display: flex; gap: 8px; margin-top: 10px; }

// ===== 任务（司机端）=====
.task-store { display: flex; align-items: flex-start; gap: 8px; background: $bg; border-radius: 10px; padding: 10px 12px; margin-top: 10px; }
.distance-text { color: $green; font-size: 12px; margin-top: 4px; }
.task-nav { display: inline-flex; align-items: center; gap: 4px; flex: none; margin: 0; }
.task-items { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.task-item { display: flex; align-items: center; gap: 8px; }
.task-item image { width: 30px; height: 30px; border-radius: 8px; background: $bg; flex: none; }
.task-item text { font-size: 13px; flex: 1; }
.task-shortage { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 8px; }

// ===== 订单详情 =====
.steps { display: flex; gap: 6px; margin-bottom: 14px; overflow-x: auto; }
.step { display: flex; align-items: center; gap: 5px; flex: none; }
.step-dot { width: 20px; height: 20px; border-radius: 50%; background: $bg; color: $muted; font-size: 12px; display: flex; align-items: center; justify-content: center; }
.step.done .step-dot { background: $green; color: #fff; }
.step-label { font-size: 12px; color: $muted; white-space: nowrap; flex: none; }
.order-item-line { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px dashed $line; }
.order-item-line image { width: 36px; height: 36px; border-radius: 8px; background: $bg; flex: none; }
.order-item-price { font-size: 13px; font-weight: 700; flex: none; }
.store-line { display: flex; align-items: flex-start; gap: 8px; background: $bg; border-radius: 10px; padding: 10px 12px; }
.shortage-line { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 0; border-bottom: 1px dashed $line; }
.log-list { display: flex; flex-direction: column; gap: 8px; }
.log-event { display: flex; gap: 10px; align-items: flex-start; }
.log-dot { width: 8px; height: 8px; border-radius: 50%; background: $green; margin-top: 5px; flex: none; }

// ===== 指派/改派 =====
.driver-options { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.driver-option { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid $line; border-radius: 10px; text-align: left; background: #fff; width: 100%; margin-left: 0; margin-right: 0; }
.driver-option-name { font-size: 14px; font-weight: 600; }
.driver-option.active { border-color: $green; background: $green-soft; }
.radio-dot { width: 16px; height: 16px; border-radius: 50%; background: $green; flex: none; margin-left: auto; }

// ===== 出库交接 =====
.actual-list { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
.actual-line { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px dashed $line; }
.actual-input { display: flex; align-items: center; gap: 6px; flex: none; }
.actual-input text { font-size: 13px; color: $muted; }
.actual-input input { width: 70px; height: 34px; border: 1px solid $line; border-radius: 8px; padding: 0 8px; font-size: 13px; text-align: center; }
.handover-result { display: flex; flex-direction: column; gap: 6px; background: $green-soft; border-radius: 10px; padding: 14px; margin-top: 12px; }
.handover-result text { font-size: 14px; font-weight: 700; color: $green; }
.handover-result-sub { font-size: 12px; color: $green; }
.order-amount { margin-left: auto; font-size: 15px; font-weight: 700; flex: none; }
/* Cross-device fulfillment layout guards. */
.c-mall-tag { background: #eaf3ff; color: #35658f; }
.order-no, .muted, .row-main, .store-line, .task-store, .courier-sheet { min-width: 0; overflow-wrap: anywhere; word-break: break-word; }
.order-actions, .sheet-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.order-actions button, .sheet-actions button { min-height: 36px; }
.store-line .row-main, .task-store .row-main { flex: 1; }
.task-item .business-image { width:30px;height:30px;border-radius:8px;flex:none; }.order-item-line .business-image { width:36px;height:36px;border-radius:8px;flex:none; }
.product-work-page { position: fixed; inset: 0; z-index: 40; overflow-y: auto; padding: 16px 16px calc(28px + env(safe-area-inset-bottom)); background: $bg; color: $ink; }
.product-work-head { position: sticky; top: 0; z-index: 2; display: grid; grid-template-columns: 40px 1fr auto; gap: 10px; align-items: center; padding: 10px 0 14px; background: $bg; border-bottom: 1px solid $line; }
.product-work-head button { margin: 0; }
.product-work-title { display: block; font-size: 20px; font-weight: 750; }
.product-filter-chips { margin: 14px 0; }
.supplier-product-list { display: grid; gap: 10px; }
.supplier-product-card { padding: 14px; border: 1px solid $line; border-radius: 8px; background: #fff; }
.supplier-product-image { width: 48px; height: 48px; flex: none; border-radius: 6px; background: #f1f3ef; }
.supplier-product-skus { display: grid; gap: 4px; margin-top: 10px; color: $muted; font-size: 12px; }
.product-reject-note { display: block; margin-top: 10px; padding: 9px 10px; border-left: 3px solid $red; background: #fff2f2; color: $red; font-size: 12px; }
.supplier-product-form { display: grid; gap: 12px; max-width: 920px; margin: 18px auto 0; padding: 16px; border: 1px solid $line; border-radius: 8px; background: #fff; }
.picker-field { display: flex; align-items: center; min-height: 42px; padding: 0 12px; border: 1px solid $line; border-radius: 8px; background: #fff; }
.checkbox-field { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.supplier-sku-form { overflow-x: auto; }
.supplier-sku-fields { display: grid; grid-template-columns: 1.2fr repeat(6, minmax(90px, .8fr)); gap: 8px; min-width: 760px; }
.supplier-sku-fields label { display: grid; gap: 5px; color: $muted; font-size: 12px; }
.supplier-sku-fields input { width: 100%; height: 38px; box-sizing: border-box; padding: 0 8px; border: 1px solid $line; border-radius: 6px; color: $ink; }
.product-form-actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; padding-top: 12px; border-top: 1px solid $line; }
.product-form-actions button { margin: 0; }
.app-shell { overflow-x: hidden; }
.bottom-tab { min-height: 44px; min-width: 0; }
.bottom-tab text { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mine-page { display: grid; gap: 8px; }
.work-link { width: 100%; min-height: 58px; display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-bottom: 1px solid $line; background: #fff; color: $ink; text-align: left; }
.secondary-workspace { position: fixed; inset: 0; z-index: 45; overflow-x: hidden; overflow-y: auto; background: $bg; padding-top: 14px; }
.secondary-head { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 10px; min-height: 52px; margin: -14px -16px 14px; padding: 8px 16px; border-bottom: 1px solid $line; background: $bg; font-size: 17px; font-weight: 700; }
.scope-editor { display: grid; gap: 8px; margin-top: 12px; padding-top: 10px; border-top: 1px dashed $line; }
.route-controls { display: grid; gap: 10px; }
.route-date { width: 100%; height: 44px; padding: 0 12px; border: 1px solid $line; border-radius: 8px; background: #fff; }
.route-summary { display: grid; gap: 10px; margin-top: 14px; }
.route-stop { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.route-number { width: 28px; height: 28px; flex: none; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: $green; color: #fff; font-weight: 700; }
.route-actions { display: flex; flex-direction: column; gap: 5px; flex: none; }
.route-actions .icon-button { padding: 0; line-height: 1; }
.route-publish { width: 100%; margin-top: 6px; }
.route-driver-summary { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.route-driver-summary > view { display: grid; gap: 3px; min-width: 0; }
.route-driver-summary .section-title { margin: 0; }
.task-orders { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.compact-empty { min-height: 120px; padding: 24px 0; }
@media (max-width: 375px) {
  .page-pad { padding-left: 12px; padding-right: 12px; }
  .task-store { flex-wrap: wrap; }
  .task-store .task-nav { margin-left: 24px; }
  .route-stop { align-items: flex-start; flex-wrap: wrap; }
  .route-stop .row-main { flex: 1 1 calc(100% - 38px); }
  .route-actions { flex-direction: row; width: 100%; padding-left: 38px; }
  .bottom-tab { padding-left: 2px; padding-right: 2px; }
}
/* #ifdef MP-WEIXIN */
.app-shell { padding-bottom: var(--safe-area-inset-bottom, 0px); }
.product-work-page { padding-top: calc(16px + var(--status-bar-height)); }
.secondary-workspace { padding-top: calc(14px + var(--status-bar-height)); }
/* #endif */
/* #ifndef MP-WEIXIN */
.product-work-page { padding-top: max(16px, env(safe-area-inset-top)); }
.secondary-workspace { padding-top: max(14px, env(safe-area-inset-top)); }
/* #endif */
</style>
