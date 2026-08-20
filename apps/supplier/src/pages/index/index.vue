<template>
  <!-- 登录 -->
  <view v-if="!store.auth.isLoggedIn" class="login-page">
    <view class="login-card">
      <image class="login-banner" src="/static/images/farmhouse.webp" mode="aspectFill" />
      <view class="login-body">
      <text class="login-title">供应商配送工作台</text>
      <text class="login-sub">甄选好物供应链 · 供应商与司机双角色配送履约</text>
      <view class="role-tabs">
        <button :class="{ active: loginRole === 'supplier' }" @click="switchLoginRole('supplier')">供应商</button>
        <button :class="{ active: loginRole === 'driver' }" @click="switchLoginRole('driver')">司机</button>
      </view>
      <view class="login-fields">
        <label class="form-field"><text>账号</text><input v-model="loginAccount" placeholder="请输入账号" confirm-type="done" @confirm="submitLogin" /></label>
        <label class="form-field"><text>密码</text><input v-model="loginPassword" type="password" placeholder="请输入密码" confirm-type="done" @confirm="submitLogin" /></label>
      </view>
      <text v-if="store.loginError" class="form-error login-error">{{ store.loginError }}</text>
      <button class="primary-button login-button" :disabled="busy" @click="submitLogin">登 录</button>
      <text class="login-hint">{{ loginRole === 'supplier' ? '演示供应商：supplier / 123456（已自动填充）' : '演示司机：driver01 / 123456（已自动填充）' }}</text>
      </view>
    </view>
  </view>

  <!-- 工作区 -->
  <view v-else class="app-shell">
    <view v-if="store.loading" class="page-state"><text>正在准备配送工作台...</text></view>
    <view v-else-if="store.error" class="page-state"><text>{{ store.error }}</text><button class="primary-button mini-button" style="margin-top:12px" @click="store.initialize(true)">重新加载</button></view>

    <template v-else>
      <!-- 供应商头部 -->
      <view v-if="store.auth.role === 'supplier'" class="hero">
        <view class="hero-top">
          <image class="hero-avatar" src="/static/images/bacon.webp" mode="aspectFill" />
          <view><text class="hero-title">{{ supplierInfo.name }}</text><view class="hero-sub">{{ supplierInfo.region }} · {{ supplierInfo.category }}</view></view>
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
                  <view class="row-top"><text class="order-no">{{ order.id }}</text><span class="badge" :class="orderFulfillment(order).status">{{ statusText(orderFulfillment(order).status) }}</span></view>
                  <text class="muted">{{ order.customer }} · {{ order.createdAt }}</text>
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
            <button class="outline-button mini-button" @click="askResetDemo">重置演示数据</button>
            <text class="muted">清空本地订单 / 司机数据并重新播种</text>
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
                    <span class="badge" :class="orderFulfillment(order).status">{{ statusText(orderFulfillment(order).status) }}</span>
                  </view>
                  <text class="muted">{{ order.customer }} · {{ order.items?.length || 1 }} 项 · 共 {{ order.quantity }} 件</text>
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

        <view v-else-if="active === 'drivers'" class="page-pad">
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
            </view>
          </view>
          <view v-else class="empty-state"><UiIcon name="users" :size="28" /><text>暂无司机账号，点击「新增司机」开通</text></view>
        </view>

        <view v-else class="page-pad">
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
      </template>
      <!-- 司机模块 -->
      <template v-else>
        <view v-if="driverTab === 'today'" class="page-pad">
          <view v-if="store.myTasks.length">
            <view v-for="order in store.myTasks" :key="order.id" class="list-card">
              <view class="row-top">
                <text class="order-no">{{ order.id }}</text>
                <span class="badge" :class="orderFulfillment(order).status">{{ statusText(orderFulfillment(order).status) }}</span>
              </view>
              <view class="task-store"><UiIcon name="map-pin" :size="16" /><view class="row-main"><text>{{ order.customer }}</text><text class="muted">{{ storeInfoOf(order.customer).address }} · {{ storeInfoOf(order.customer).contact }} {{ storeInfoOf(order.customer).phone }}</text></view></view>
              <view class="task-items">
                <view v-for="item in order.items" :key="`${item.productId}-${item.skuId}`" class="task-item"><image :src="item.image" mode="aspectFit" /><text>{{ item.name }}</text><text class="muted">×{{ item.quantity }}</text></view>
              </view>
              <view v-if="orderShortage(order).length" class="task-shortage"><span class="tag" :class="hasUnhandledShortage(order) ? 'danger' : 'out'">{{ hasUnhandledShortage(order) ? `缺货 ${orderShortage(order).length} 项` : '已补发' }}</span><text class="muted">{{ orderShortage(order).map((item) => `${item.name} 缺 ${item.shortage}${item.handled ? '(已补发)' : ''}`).join('、') }}</text></view>
              <button v-if="orderFulfillment(order).status === 'shipped'" class="outline-button" disabled>待供应商出库交接</button>
              <button v-else class="primary-button" @click="openDriverHandover(order)">到店交接</button>
            </view>
          </view>
          <view v-else class="empty-state"><UiIcon name="package-check" :size="28" /><text>今日暂无配送任务</text></view>
        </view>

        <view v-else-if="driverTab === 'history'" class="page-pad">
          <view v-if="store.myHistory.length">
            <view v-for="order in store.myHistory" :key="order.id" class="list-card">
              <view class="row-top"><text class="order-no">{{ order.id }}</text><span class="badge received">已收货</span></view>
              <view class="task-store"><UiIcon name="map-pin" :size="16" /><view class="row-main"><text>{{ order.customer }}</text><text class="muted">{{ order.createdAt }}</text></view></view>
              <view class="task-items">
                <view v-for="item in order.items" :key="`${item.productId}-${item.skuId}`" class="task-item"><image :src="item.image" mode="aspectFit" /><text>{{ item.name }}</text><text class="muted">×{{ item.quantity }}</text></view>
              </view>
            </view>
          </view>
          <view v-else class="empty-state"><UiIcon name="package-check" :size="28" /><text>暂无历史任务</text></view>
        </view>

        <view v-else class="page-pad">
          <view v-if="store.myHandovers.length">
            <view v-for="log in store.myHandovers" :key="log.id" class="list-card">
              <view class="row">
                <span class="tag" :class="log.type">{{ log.type === 'out' ? '出库交接' : '到店交接' }}</span>
                <view class="row-main"><text class="order-no">{{ log.orderId }}</text><text class="muted">{{ log.time }}</text></view>
              </view>
            </view>
          </view>
          <view v-else class="empty-state"><UiIcon name="list-tree" :size="28" /><text>暂无我的交接记录</text></view>
        </view>
      </template>

      <!-- 底部 tabbar -->
      <view class="tabbar">
        <button v-for="tab in currentTabs" :key="tab.key" class="tab-item" :class="{ active: isTabActive(tab.key) }" @click="switchTab(tab.key)">
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
            <view class="row" style="margin-bottom:12px"><span class="badge" :class="orderFulfillment(selectedOrder).status">{{ statusText(orderFulfillment(selectedOrder).status) }}</span><text class="muted">{{ selectedOrder.createdAt }}</text></view>
            <view class="steps">
              <view v-for="(step, index) in fulfillmentSteps" :key="step" class="step" :class="{ done: stepIndex(selectedOrder) >= index }"><view class="step-dot">{{ index + 1 }}</view><text class="step-label">{{ stepLabel(step) }}</text></view>
            </view>
            <view class="section-title">商品明细</view>
            <view v-for="item in selectedOrder.items" :key="`${item.productId}-${item.skuId}`" class="order-item-line">
              <image :src="item.image" mode="aspectFit" /><view class="row-main"><text>{{ item.name }}</text><text class="muted">{{ item.skuName }} ×{{ item.quantity }}</text></view><text class="order-item-price">{{ money(item.price * item.quantity) }}</text>
            </view>
            <view class="section-title">收货门店</view>
            <view class="store-line"><UiIcon name="map-pin" :size="16" /><view class="row-main"><text>{{ selectedOrder.customer }}</text><text class="muted">{{ storeInfoOf(selectedOrder.customer).address }} · {{ storeInfoOf(selectedOrder.customer).contact }} {{ storeInfoOf(selectedOrder.customer).phone }}</text></view></view>
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
                <view class="row-main"><text>{{ driver.name }}</text><text class="muted">{{ driver.phone }}</text></view>
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
            <text class="muted">订单 {{ selectedOrder.id }} · {{ selectedOrder.customer }}，录入运单号后直接发货</text>
            <label class="form-field" style="margin-top:12px"><text>运单号</text><input v-model="courierTracking" placeholder="如 SF888800002" confirm-type="done" @confirm="confirmCourier" /></label>
            <view class="sheet-actions">
              <button class="primary-button" :disabled="!courierTracking.trim()" @click="confirmCourier">确认发货</button>
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
            <view v-for="item in selectedOrder.items" :key="`${item.productId}-${item.skuId}`" class="order-item-line"><image :src="item.image" mode="aspectFit" /><view class="row-main"><text>{{ item.name }}</text><text class="muted">{{ item.skuName }} ×{{ item.quantity }}</text></view><text class="order-item-price">{{ money(item.price * item.quantity) }}</text></view>
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
            <text class="muted">{{ driverStatusTarget.status === 'active' ? `停用后「${driverStatusTarget.name}」将无法登录，已派任务不受影响。` : `启用后「${driverStatusTarget.name}」可重新登录。` }}</text>
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
import type { DriverAccount, Order, ShortageItem } from '@agritainment/shared'
import { installKeyboardButtonSupport, money } from '@agritainment/shared'
import UiIcon from '../../components/UiIcon.vue'
import { storeInfoOf, supplierInfo } from '../../services/repository'
import { useSupplierStore } from '../../stores/supplier'

const store = useSupplierStore()
let disposeKeyboardButtons: () => void = () => undefined
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
const loginAccount = ref('supplier')
const loginPassword = ref('123456')

function switchLoginRole(role: 'supplier' | 'driver') {
  loginRole.value = role
  store.loginError = ''
  loginAccount.value = role === 'supplier' ? 'supplier' : 'driver01'
  loginPassword.value = '123456'
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
    driverTab.value = 'today'
  }
}

function logout() {
  store.logout()
  closeSheet()
}

// ---------- 底部 tab（按角色）----------
type SupplierTab = 'dashboard' | 'orders' | 'drivers' | 'handovers'
const active = ref<SupplierTab>('dashboard')
const supplierTabs = [
  { key: 'dashboard' as const, label: '工作台', icon: 'layout-dashboard', badge: () => 0 },
  { key: 'orders' as const, label: '配送订单', icon: 'package', badge: () => store.metrics.toAcceptCount },
  { key: 'drivers' as const, label: '司机管理', icon: 'users', badge: () => 0 },
  { key: 'handovers' as const, label: '交接日志', icon: 'list-tree', badge: () => 0 }
]
type DriverTab = 'today' | 'history' | 'mine'
const driverTab = ref<DriverTab>('today')
const driverTabs = [
  { key: 'today' as const, label: '今日任务', icon: 'package-check', badge: () => store.myTasks.length },
  { key: 'history' as const, label: '历史任务', icon: 'calendar-check', badge: () => 0 },
  { key: 'mine' as const, label: '我的交接', icon: 'list-tree', badge: () => 0 }
]
const currentTabs = computed(() => (store.auth.role === 'supplier' ? supplierTabs : driverTabs))
function isTabActive(key: string) {
  return store.auth.role === 'supplier' ? active.value === key : driverTab.value === key
}
function switchTab(key: string) {
  if (store.auth.role === 'supplier') active.value = key as SupplierTab
  else driverTab.value = key as DriverTab
}

// ---------- 订单 ----------
const orderFilter = ref('全部')
const orderKeyword = ref('')
const orderStatusKeys = ['全部', 'submitted', 'accepted', 'shipped', 'delivering', 'received', 'cancelled', '缺货'] as const
const orderFilters = computed(() => orderStatusKeys.map((key) => ({
  key,
  label: key === '全部' ? '全部' : key === '缺货' ? '缺货' : store.statusText(key),
  count: key === '全部' ? store.orders.length : key === '缺货' ? store.metrics.shortageOrderCount : store.orders.filter((order) => orderFulfillment(order).status === key).length
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
function orderShortage(order: Order): ShortageItem[] {
  return order.supplierFulfillment?.shortages || []
}
function handoversOf(order: Order) {
  return order.supplierFulfillment?.handovers || []
}
function statusText(status: string) {
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
    { key: 'assign', label: '指派司机' },
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

function runAction(key: string, order: Order) {
  if (key === 'accept') {
    if (store.acceptOrder(order.id)) toast('已接单')
    closeSheet()
    return
  }
  if (key === 'assign') { openAssign(order); return }
  if (key === 'reassign') { openReassign(order); return }
  if (key === 'courier') { openCourier(order); return }
  if (key === 'handover-out') { openHandoverOut(order); return }
  if (key === 'courier-delivered') {
    if (store.markCourierDelivered(order.id)) toast('已确认快递签收')
    closeSheet()
    return
  }
}

function toggleSelect(id: string) {
  const index = selectedOrderIds.value.indexOf(id)
  if (index >= 0) selectedOrderIds.value.splice(index, 1)
  else selectedOrderIds.value.push(id)
}
function batchAccept() {
  const count = store.batchAcceptOrders([...selectedOrderIds.value])
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
function markHandled(skuId: string) {
  const orderId = selectedOrder.value?.id
  if (!orderId) return
  if (store.markShortageHandled(orderId, skuId)) {
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
  return store.activeDrivers.filter((driver) => driver.id !== current)
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
function confirmAssign() {
  if (!assignTarget.value || !assignDriverId.value) return
  const isAssign = sheet.value === 'assign'
  const ok = isAssign
    ? store.assignDriver(assignTarget.value.id, assignDriverId.value)
    : store.reassignDriver(assignTarget.value.id, assignDriverId.value)
  if (ok) toast(isAssign ? '已指派司机' : '已改派司机')
  closeSheet()
}

const courierTracking = ref('')
function openCourier(order: Order) {
  selectedOrder.value = order
  courierTracking.value = ''
  sheet.value = 'courier'
}
function confirmCourier() {
  if (!selectedOrder.value || !courierTracking.value.trim()) return
  if (store.shipCourier(selectedOrder.value.id, courierTracking.value.trim())) {
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
function confirmHandoverOut() {
  if (!selectedOrder.value) return
  const result = store.handoverOut(selectedOrder.value.id, { ...actuals }, handoverNote.value.trim() || undefined)
  if (result.ok) {
    handoverResult.value = { shortages: result.shortages }
    toast(result.shortages.length ? `交接完成，缺货 ${result.shortages.length} 项` : '出库交接完成')
  }
}
function confirmHandoverIn() {
  if (!selectedOrder.value) return
  if (store.handoverIn(selectedOrder.value.id, handoverNote.value.trim() || undefined)) {
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
const filteredDrivers = computed(() => store.drivers.filter((driver) => {
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
function saveDriver() {
  if (sheet.value === 'driver-form') {
    const result = store.addDriver({ name: driverForm.name, phone: driverForm.phone, account: driverForm.account, password: driverForm.password })
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
function confirmToggle() {
  if (!driverStatusTarget.value) return
  store.toggleDriverStatus(driverStatusTarget.value.id)
  toast(driverStatusTarget.value.status === 'active' ? '已停用司机' : '已启用司机')
  closeSheet()
}

// ---------- 交接日志 ----------
const handoverFilter = ref('全部')
const handoverDriverFilter = ref('全部')
const handoverTypeFilters = ['全部', '出库交接', '到店交接']
const handoverDriverFilters = computed(() => ['全部', ...store.drivers.map((driver) => driver.name)])
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
  store.initialize()
  disposeKeyboardButtons = installKeyboardButtonSupport()
})
onBeforeUnmount(() => disposeKeyboardButtons())
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
.login-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: calc(24px + env(safe-area-inset-top)) 24px 24px; background: linear-gradient(160deg, $green-deep 0%, $green 60%, #1e6b41 100%); }
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
.task-items { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.task-item { display: flex; align-items: center; gap: 8px; }
.task-item image { width: 30px; height: 30px; border-radius: 8px; background: $bg; flex: none; }
.task-item text { font-size: 13px; flex: 1; }
.task-shortage { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 8px; }

// ===== 订单详情 =====
.steps { display: flex; gap: 6px; margin-bottom: 14px; overflow-x: auto; }
.step { display: flex; align-items: center; gap: 5px; flex: none; }
.step-dot { width: 20px; height: 20px; border-radius: 50%; background: $bg; color: $muted; font-size: 11px; display: flex; align-items: center; justify-content: center; }
.step.done .step-dot { background: $green; color: #fff; }
.step-label { font-size: 11px; color: $muted; white-space: nowrap; flex: none; }
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
.driver-option { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid $line; border-radius: 10px; text-align: left; background: #fff; }
.driver-option.active { border-color: $green; background: $green-soft; }
.radio-dot { width: 16px; height: 16px; border-radius: 50%; background: $green; flex: none; }

// ===== 出库交接 =====
.actual-list { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
.actual-line { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px dashed $line; }
.actual-input { display: flex; align-items: center; gap: 6px; flex: none; }
.actual-input text { font-size: 12px; color: $muted; }
.actual-input input { width: 70px; height: 34px; border: 1px solid $line; border-radius: 8px; padding: 0 8px; font-size: 13px; text-align: center; }
.handover-result { display: flex; flex-direction: column; gap: 6px; background: $green-soft; border-radius: 10px; padding: 14px; margin-top: 12px; }
.handover-result text { font-size: 14px; font-weight: 700; color: $green; }
.handover-result-sub { font-size: 12px; color: $green; }
.order-amount { margin-left: auto; font-size: 15px; font-weight: 700; flex: none; }
</style>
