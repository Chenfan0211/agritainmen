<template>
  <view v-if="!store.auth.isLoggedIn" class="login-page">
    <view class="login-card">
      <view class="login-head">
        <view class="login-logo"><text class="logo-emoji">🥓</text></view>
        <text class="login-title">供应商配送工作台</text>
        <text class="login-sub">甄选好物供应链 · 供应商与司机双角色配送履约</text>
      </view>
      <view class="role-tabs">
        <button :class="{ active: loginRole === 'supplier' }" @click="switchLoginRole('supplier')">供应商</button>
        <button :class="{ active: loginRole === 'driver' }" @click="switchLoginRole('driver')">司机</button>
      </view>
      <view class="login-fields">
        <label class="login-field"><text>账号</text><input v-model="loginAccount" placeholder="请输入账号" confirm-type="done" @confirm="submitLogin" /></label>
        <label class="login-field"><text>密码</text><input v-model="loginPassword" type="password" placeholder="请输入密码" confirm-type="done" @confirm="submitLogin" /></label>
      </view>
      <text v-if="store.loginError" class="login-error">{{ store.loginError }}</text>
      <button class="login-button" :disabled="busy" @click="submitLogin">登 录</button>
      <text class="login-hint">{{ loginRole === 'supplier' ? '演示供应商：supplier / 123456' : '演示司机：driver01-03 / 123456' }}</text>
    </view>
  </view>

  <view v-else-if="store.auth.role === 'supplier'" class="supplier-shell">
    <aside class="side-nav">
      <view class="brand"><text class="brand-emoji">🥓</text><text>供应商工作台</text></view>
      <button v-for="item in navItems" :key="item.key" class="nav-item" :class="{ active: active === item.key }" @click="active = item.key">
        <UiIcon :name="item.icon" :size="18" /><text>{{ item.label }}</text>
        <span v-if="item.badge()" class="nav-badge">{{ item.badge() }}</span>
      </button>
      <view class="side-foot">
        <view class="supplier-chip"><text>{{ supplierInfo.name }}</text><small>{{ supplierInfo.region }}</small></view>
        <button class="logout-button" @click="logout">退出登录</button>
      </view>
    </aside>
    <main class="main-area">
      <header class="topbar">
        <view class="topbar-title"><text>{{ titles[active].title }}</text><small>{{ titles[active].subtitle }}</small></view>
        <view class="topbar-meta"><text>{{ todayText }}</text><text class="topbar-role">供应商</text></view>
      </header>

      <view v-if="store.loading" class="loading">正在准备配送工作台...</view>
      <view v-else-if="store.error" class="state-page">
        <UiIcon name="radio" :size="28" /><text>{{ store.error }}</text>
        <button class="primary-button" @click="store.initialize(true)">重新加载</button>
      </view>

      <template v-else>
        <view v-if="active === 'dashboard'" class="module dashboard">
          <view class="metric-band">
            <view><small>待接单</small><strong>{{ store.metrics.toAcceptCount }}</strong></view>
            <view><small>待发货</small><strong>{{ store.metrics.toDispatchCount }}</strong></view>
            <view><small>配送中</small><strong>{{ store.metrics.deliveringCount }}</strong></view>
            <view class="warn"><small>今日缺货</small><strong>{{ store.metrics.shortageOrderCount }}</strong></view>
            <view><small>我的司机</small><strong>{{ store.activeDrivers.length }}</strong></view>
          </view>
          <view class="dash-grid">
            <view class="panel">
              <view class="panel-head"><view><span></span><text>今日配送订单</text></view><button class="text-button" @click="active = 'orders'">全部订单</button></view>
              <view v-if="recentOrders.length" class="compact-list">
                <button v-for="order in recentOrders" :key="order.id" class="compact-row" @click="openOrder(order)">
                  <view class="compact-main"><text class="order-no">{{ order.id }}</text><text class="muted">{{ order.customer }}</text></view>
                  <span v-if="orderShortage(order).length" class="tag danger">缺货 {{ orderShortage(order).length }} 项</span>
                  <span class="status-badge" :class="orderFulfillment(order).status">{{ statusText(orderFulfillment(order).status) }}</span>
                </button>
              </view>
              <view v-else class="empty-page"><UiIcon name="package" :size="28" /><text>今日暂无配送订单</text></view>
            </view>
            <view class="panel">
              <view class="panel-head"><view><span></span><text>最近交接日志</text></view><button class="text-button" @click="active = 'handovers'">全部日志</button></view>
              <view v-if="recentHandovers.length" class="compact-list">
                <view v-for="log in recentHandovers" :key="log.id" class="compact-row static">
                  <view class="compact-main"><text class="order-no">{{ log.orderId }}</text><text class="muted">{{ log.operatorName }} · {{ log.operatorRole === 'driver' ? '司机' : '供应商' }}{{ log.shortageCount ? ` · 缺货 ${log.shortageCount} 项` : '' }}</text></view>
                  <span class="tag" :class="log.type">{{ log.type === 'out' ? '出库交接' : '到店交接' }}</span>
                </view>
              </view>
              <view v-else class="empty-page"><UiIcon name="list-tree" :size="28" /><text>暂无交接日志</text></view>
            </view>
          </view>
        </view>
        <view v-else-if="active === 'orders'" class="module orders">
          <view class="module-toolbar">
            <view class="chips">
              <button v-for="item in orderFilters" :key="item.key" :class="{ active: orderFilter === item.key }" @click="orderFilter = item.key">{{ item.label }}<text class="chip-count">{{ item.count }}</text></button>
            </view>
            <view class="toolbar-right">
              <view class="search-box"><UiIcon name="search" :size="16" /><input v-model="orderKeyword" placeholder="搜索单号 / 门店" confirm-type="search" /></view>
              <button v-if="selectedOrderIds.length" class="primary-button small" @click="batchAccept">批量接单（{{ selectedOrderIds.length }}）</button>
            </view>
          </view>
          <view v-if="filteredOrders.length" class="order-list">
            <view v-for="order in filteredOrders" :key="order.id" class="order-card">
              <view class="order-card-main">
                <view v-if="orderFulfillment(order).status === 'submitted'" class="order-check" @click.stop="toggleSelect(order.id)">
                  <view :class="{ checked: selectedOrderIds.includes(order.id) }"><UiIcon v-if="selectedOrderIds.includes(order.id)" name="check" :size="13" /></view>
                </view>
                <button class="order-body" @click="openOrder(order)">
                  <view class="order-top"><text class="order-no">{{ order.id }}</text><span class="status-badge" :class="orderFulfillment(order).status">{{ statusText(orderFulfillment(order).status) }}</span></view>
                  <view class="order-line"><image class="order-emoji" :src="order.items?.[0]?.image || '/static/images/field.webp'" mode="aspectFit" /><view class="order-info"><text class="order-title">{{ order.items?.[0]?.name || order.productName }}</text><small>{{ order.customer }} · {{ order.items?.length || 1 }} 项 · 共 {{ order.quantity }} 件</small></view></view>
                  <view class="order-bottom">
                    <view class="order-meta">
                      <small>{{ order.createdAt }}</small>
                      <small v-if="orderFulfillment(order).driverName">司机 {{ orderFulfillment(order).driverName }}</small>
                      <small v-else-if="orderFulfillment(order).trackingNo">运单 {{ orderFulfillment(order).trackingNo }}</small>
                      <span v-if="orderShortage(order).length" class="tag danger">缺货 {{ orderShortage(order).length }} 项</span>
                    </view>
                    <strong>{{ money(order.amount) }}</strong>
                  </view>
                </button>
              </view>
              <view v-if="orderActions(order).length" class="order-actions">
                <button v-for="action in orderActions(order)" :key="action.key" class="outline-button small" :class="{ 'primary-button': action.primary }" @click="runAction(action.key, order)">{{ action.label }}</button>
              </view>
            </view>
          </view>
          <view v-else class="empty-page"><UiIcon name="search" :size="28" /><text>没有符合条件的配送订单</text></view>
        </view>

        <view v-else-if="active === 'drivers'" class="module drivers">
          <view class="module-toolbar">
            <view class="chips">
              <button v-for="item in driverStatusFilters" :key="item" :class="{ active: driverStatusFilter === item }" @click="driverStatusFilter = item">{{ item }}</button>
            </view>
            <view class="toolbar-right">
              <view class="search-box"><UiIcon name="search" :size="16" /><input v-model="driverSearch" placeholder="搜索姓名 / 账号 / 手机" confirm-type="search" /></view>
              <button class="primary-button small" @click="openDriverForm"><UiIcon name="plus" :size="15" />新增司机</button>
            </view>
          </view>
          <view v-if="filteredDrivers.length" class="driver-list">
            <view v-for="driver in filteredDrivers" :key="driver.id" class="driver-card">
              <view class="driver-main">
                <view class="driver-avatar"><UiIcon name="user-round" :size="20" /></view>
                <view class="driver-info">
                  <view class="driver-name"><text>{{ driver.name }}</text><span class="status-badge" :class="driver.status">{{ driver.status === 'active' ? '启用' : '停用' }}</span></view>
                  <small>{{ driver.account }} · {{ driver.phone }}</small>
                  <small>创建于 {{ driver.createdAt }} · 进行中任务 {{ store.driverTaskCounts[driver.id] || 0 }}</small>
                </view>
              </view>
              <view class="driver-actions">
                <button class="outline-button small" @click="openDriverEdit(driver)">编辑</button>
                <button class="outline-button small" @click="openReset(driver)">重置密码</button>
                <button class="outline-button small" :class="{ danger: driver.status === 'active' }" @click="askToggle(driver)">{{ driver.status === 'active' ? '停用' : '启用' }}</button>
              </view>
            </view>
          </view>
          <view v-else class="empty-page"><UiIcon name="users" :size="28" /><text>暂无司机账号，点击「新增司机」开通</text></view>
        </view>

        <view v-else class="module handovers">
          <view class="module-toolbar">
            <view class="chips">
              <button v-for="item in handoverTypeFilters" :key="item" :class="{ active: handoverFilter === item }" @click="handoverFilter = item">{{ item }}</button>
            </view>
            <view class="toolbar-right">
              <select v-model="handoverDriverFilter" class="select-box">
                <option value="全部">全部司机</option>
                <option v-for="driver in store.drivers" :key="driver.id" :value="driver.name">{{ driver.name }}</option>
              </select>
            </view>
          </view>
          <view v-if="filteredHandovers.length" class="handover-list">
            <view v-for="log in filteredHandovers" :key="log.id" class="handover-card">
              <span class="tag" :class="log.type">{{ log.type === 'out' ? '出库交接' : '到店交接' }}</span>
              <view class="handover-main">
                <text class="order-no">{{ log.orderId }}</text>
                <small>{{ log.customer }} · {{ log.time }}</small>
                <small>操作人：{{ log.operatorName }}（{{ log.operatorRole === 'driver' ? '司机' : '供应商' }}）{{ log.shortageCount ? ` · 缺货 ${log.shortageCount} 项` : '' }}{{ log.note ? ` · ${log.note}` : '' }}</small>
              </view>
            </view>
          </view>
          <view v-else class="empty-page"><UiIcon name="list-tree" :size="28" /><text>暂无交接日志</text></view>
        </view>
      </template>
    </main>
    <view v-if="sheet" class="sheet-mask" @click.self="closeSheet">
      <view class="sheet-panel">
        <view v-if="sheet === 'order' && selectedOrder" class="order-detail">
          <view class="sheet-head"><text class="sheet-title">{{ selectedOrder.id }}</text><button class="icon-button" aria-label="关闭" @click="closeSheet"><UiIcon name="x" :size="18" /></button></view>
          <view class="detail-status"><span class="status-badge" :class="orderFulfillment(selectedOrder).status">{{ statusText(orderFulfillment(selectedOrder).status) }}</span><small>{{ selectedOrder.createdAt }}</small></view>
          <view class="steps">
            <view v-for="(step, index) in fulfillmentSteps" :key="step" class="step" :class="{ done: stepIndex(selectedOrder) >= index }"><view class="step-dot">{{ index + 1 }}</view><small>{{ stepLabel(step) }}</small></view>
          </view>
          <view class="detail-section"><view class="section-title">商品明细</view>
            <view v-for="item in selectedOrder.items" :key="`${item.productId}-${item.skuId}`" class="order-item-line">
              <image :src="item.image" mode="aspectFit" /><view><text>{{ item.name }}</text><small>{{ item.skuName }} ×{{ item.quantity }}</small></view><strong>{{ money(item.price * item.quantity) }}</strong>
            </view>
          </view>
          <view class="detail-section"><view class="section-title">收货门店</view>
            <view class="store-line"><UiIcon name="map-pin" :size="16" /><view><text>{{ selectedOrder.customer }}</text><small>{{ storeInfoOf(selectedOrder.customer).address }} · {{ storeInfoOf(selectedOrder.customer).contact }} {{ storeInfoOf(selectedOrder.customer).phone }}</small></view></view>
          </view>
          <view v-if="orderShortage(selectedOrder).length" class="detail-section"><view class="section-title">缺货清单 <span class="tag danger">缺货 {{ orderShortage(selectedOrder).length }} 项</span></view>
            <view v-for="item in orderShortage(selectedOrder)" :key="item.skuId" class="shortage-line"><text>{{ item.name }}</text><small>应发 {{ item.ordered }} · 实发 {{ item.actual }}</small><span class="tag danger">缺 {{ item.shortage }}</span></view>
          </view>
          <view class="detail-section"><view class="section-title">交接记录</view>
            <view v-if="handoversOf(selectedOrder).length" class="log-list">
              <view v-for="log in handoversOf(selectedOrder)" :key="log.id" class="log-event"><view class="log-dot"></view><view><text>{{ log.type === 'out' ? '出库交接' : '到店交接' }} · {{ log.operatorName }}</text><small>{{ log.time }} · {{ log.operatorRole === 'driver' ? '司机' : '供应商' }}{{ log.shortageCount ? ` · 缺货 ${log.shortageCount} 项` : '' }}{{ log.note ? ` · ${log.note}` : '' }}</small></view></view>
            </view>
            <text v-else class="muted">暂无交接记录</text>
          </view>
          <view class="detail-section"><view class="section-title">流转记录</view>
            <view class="log-list">
              <view v-for="(event, index) in (selectedOrder.flow || [])" :key="index" class="log-event"><view class="log-dot"></view><view><text>{{ event.action }}</text><small>{{ event.time }} · {{ event.operator }}</small></view></view>
            </view>
          </view>
          <view class="sheet-actions">
            <button v-for="action in orderActions(selectedOrder)" :key="action.key" class="outline-button" :class="{ 'primary-button': action.primary }" @click="runAction(action.key, selectedOrder)">{{ action.label }}</button>
            <button class="outline-button" @click="closeSheet">关 闭</button>
          </view>
        </view>

        <view v-else-if="(sheet === 'assign' || sheet === 'reassign') && assignTarget" class="driver-picker">
          <view class="sheet-head"><text class="sheet-title">{{ sheet === 'assign' ? '指派司机' : '改派司机' }}</text><button class="icon-button" aria-label="关闭" @click="closeSheet"><UiIcon name="x" :size="18" /></button></view>
          <text class="muted">订单 {{ assignTarget.id }} · {{ assignTarget.customer }}</text>
          <view v-if="assignableDrivers.length" class="driver-options">
            <button v-for="driver in assignableDrivers" :key="driver.id" class="driver-option" :class="{ active: assignDriverId === driver.id }" @click="assignDriverId = driver.id">
              <view class="driver-avatar"><UiIcon name="user-round" :size="18" /></view>
              <view><text>{{ driver.name }}</text><small>{{ driver.phone }}</small></view>
              <view v-if="assignDriverId === driver.id" class="radio-dot"></view>
            </button>
          </view>
          <view v-else class="empty-page"><UiIcon name="users" :size="28" /><text>暂无可用的司机，请先到司机管理开通</text></view>
          <view class="sheet-actions">
            <button class="primary-button" :disabled="!assignDriverId" @click="confirmAssign">{{ sheet === 'assign' ? '确认指派' : '确认改派' }}</button>
            <button class="outline-button" @click="closeSheet">取 消</button>
          </view>
        </view>

        <view v-else-if="sheet === 'courier' && selectedOrder" class="courier-sheet">
          <view class="sheet-head"><text class="sheet-title">快递直发</text><button class="icon-button" aria-label="关闭" @click="closeSheet"><UiIcon name="x" :size="18" /></button></view>
          <text class="muted">订单 {{ selectedOrder.id }} · {{ selectedOrder.customer }}，录入运单号后直接发货</text>
          <label class="login-field"><text>运单号</text><input v-model="courierTracking" placeholder="如 SF888800002" confirm-type="done" @confirm="confirmCourier" /></label>
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
            <small v-if="handoverResult.shortages.length">缺货 {{ handoverResult.shortages.length }} 项：{{ handoverResult.shortages.map((item) => `${item.name} 缺 ${item.shortage}`).join('、') }}</small>
            <small v-else>全部商品足量出库</small>
          </view>
          <view v-else class="actual-list">
            <view v-for="item in selectedOrder.items" :key="item.skuId" class="actual-line">
              <view><text>{{ item.name }}</text><small>{{ item.skuName }} · 应发 {{ item.quantity }}</small></view>
              <label class="actual-input"><text>实发</text><input type="number" :min="0" :max="item.quantity" v-model.number="actuals[item.skuId]" /></label>
            </view>
            <label class="login-field"><text>备注（可选）</text><input v-model="handoverNote" placeholder="交接备注" /></label>
          </view>
          <view class="sheet-actions">
            <button v-if="!handoverResult" class="primary-button" @click="confirmHandoverOut">确认交接</button>
            <button class="outline-button" @click="closeSheet">{{ handoverResult ? '完 成' : '取 消' }}</button>
          </view>
        </view>

        <view v-else-if="sheet === 'handover-in' && selectedOrder" class="handover-sheet">
          <view class="sheet-head"><text class="sheet-title">到店交接</text><button class="icon-button" aria-label="关闭" @click="closeSheet"><UiIcon name="x" :size="18" /></button></view>
          <view class="store-line"><UiIcon name="map-pin" :size="16" /><view><text>{{ selectedOrder.customer }}</text><small>{{ storeInfoOf(selectedOrder.customer).address }} · {{ storeInfoOf(selectedOrder.customer).contact }} {{ storeInfoOf(selectedOrder.customer).phone }}</small></view></view>
          <view class="detail-section"><view class="section-title">商品明细</view>
            <view v-for="item in selectedOrder.items" :key="`${item.productId}-${item.skuId}`" class="order-item-line"><image :src="item.image" mode="aspectFit" /><view><text>{{ item.name }}</text><small>{{ item.skuName }} ×{{ item.quantity }}</small></view><strong>{{ money(item.price * item.quantity) }}</strong></view>
          </view>
          <view v-if="orderShortage(selectedOrder).length" class="detail-section"><view class="section-title">缺货提示</view>
            <view v-for="item in orderShortage(selectedOrder)" :key="item.skuId" class="shortage-line"><text>{{ item.name }}</text><span class="tag danger">缺 {{ item.shortage }}</span></view>
          </view>
          <label class="login-field"><text>备注（可选）</text><input v-model="handoverNote" placeholder="交接备注" /></label>
          <view class="sheet-actions">
            <button class="primary-button" @click="confirmHandoverIn">确认已送达门店</button>
            <button class="outline-button" @click="closeSheet">取 消</button>
          </view>
        </view>
        <view v-else-if="sheet === 'driver-form' || sheet === 'driver-edit'" class="driver-form-sheet">
          <view class="sheet-head"><text class="sheet-title">{{ sheet === 'driver-form' ? '新增司机' : '编辑司机' }}</text><button class="icon-button" aria-label="关闭" @click="closeSheet"><UiIcon name="x" :size="18" /></button></view>
          <view class="form-fields">
            <label class="login-field"><text>姓名</text><input v-model="driverForm.name" placeholder="司机姓名" /></label>
            <label class="login-field"><text>手机号</text><input v-model="driverForm.phone" type="number" maxlength="11" placeholder="11 位手机号" /></label>
            <label v-if="sheet === 'driver-form'" class="login-field"><text>账号</text><input v-model="driverForm.account" placeholder="4-20 位字母数字，登录用" /></label>
            <label v-if="sheet === 'driver-form'" class="login-field"><text>初始密码</text><input v-model="driverForm.password" placeholder="6-20 位" /></label>
          </view>
          <text v-if="driverFormError" class="login-error">{{ driverFormError }}</text>
          <view class="sheet-actions">
            <button class="primary-button" @click="saveDriver">{{ sheet === 'driver-form' ? '创建账号' : '保存' }}</button>
            <button class="outline-button" @click="closeSheet">取 消</button>
          </view>
        </view>

        <view v-else-if="sheet === 'driver-reset' && editingDriver" class="driver-form-sheet">
          <view class="sheet-head"><text class="sheet-title">重置密码 · {{ editingDriver.name }}</text><button class="icon-button" aria-label="关闭" @click="closeSheet"><UiIcon name="x" :size="18" /></button></view>
          <label class="login-field"><text>新密码</text><input v-model="resetPassword" type="password" placeholder="6-20 位" confirm-type="done" @confirm="confirmReset" /></label>
          <text v-if="driverFormError" class="login-error">{{ driverFormError }}</text>
          <view class="sheet-actions">
            <button class="primary-button" @click="confirmReset">确认重置</button>
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
  </view>

  <view v-else class="driver-shell">
    <header class="driver-head">
      <view class="driver-identity"><view class="driver-avatar large"><UiIcon name="user-round" :size="22" /></view><view><text>{{ store.auth.name }}</text><small>司机 · {{ store.auth.account }}</small></view></view>
      <view class="driver-metrics"><view><small>今日任务</small><strong>{{ store.myTasks.length }}</strong></view><view><small>今日完成</small><strong>{{ driverDoneToday }}</strong></view></view>
      <button class="logout-button" @click="logout">退出</button>
    </header>
    <view class="driver-tabs">
      <button v-for="item in driverTabs" :key="item.key" :class="{ active: driverTab === item.key }" @click="driverTab = item.key">{{ item.label }}<text v-if="item.key === 'today' && store.myTasks.length" class="chip-count">{{ store.myTasks.length }}</text></button>
    </view>
    <view v-if="driverTab === 'today'" class="driver-page">
      <view v-if="store.myTasks.length" class="task-list">
        <view v-for="order in store.myTasks" :key="order.id" class="task-card">
          <view class="task-top"><text class="order-no">{{ order.id }}</text><span class="status-badge" :class="orderFulfillment(order).status">{{ statusText(orderFulfillment(order).status) }}</span></view>
          <view class="task-store"><UiIcon name="map-pin" :size="16" /><view><text>{{ order.customer }}</text><small>{{ storeInfoOf(order.customer).address }} · {{ storeInfoOf(order.customer).contact }} {{ storeInfoOf(order.customer).phone }}</small></view></view>
          <view class="task-items">
            <view v-for="item in order.items" :key="`${item.productId}-${item.skuId}`" class="task-item"><image :src="item.image" mode="aspectFit" /><text>{{ item.name }}</text><small>×{{ item.quantity }}</small></view>
          </view>
          <view v-if="orderShortage(order).length" class="task-shortage"><span class="tag danger">缺货 {{ orderShortage(order).length }} 项</span><small>{{ orderShortage(order).map((item) => `${item.name} 缺 ${item.shortage}`).join('、') }}</small></view>
          <view class="task-actions">
            <button v-if="orderFulfillment(order).status === 'shipped'" class="outline-button small" disabled>待供应商出库交接</button>
            <button v-else class="primary-button" @click="openDriverHandover(order)">到店交接</button>
          </view>
        </view>
      </view>
      <view v-else class="empty-page"><UiIcon name="package-check" :size="28" /><text>今日暂无配送任务</text></view>
    </view>
    <view v-else-if="driverTab === 'history'" class="driver-page">
      <view v-if="store.myHistory.length" class="task-list">
        <view v-for="order in store.myHistory" :key="order.id" class="task-card done">
          <view class="task-top"><text class="order-no">{{ order.id }}</text><span class="status-badge received">已收货</span></view>
          <view class="task-store"><UiIcon name="map-pin" :size="16" /><view><text>{{ order.customer }}</text><small>{{ order.createdAt }}</small></view></view>
          <view class="task-items"><view v-for="item in order.items" :key="`${item.productId}-${item.skuId}`" class="task-item"><image :src="item.image" mode="aspectFit" /><text>{{ item.name }}</text><small>×{{ item.quantity }}</small></view></view>
        </view>
      </view>
      <view v-else class="empty-page"><UiIcon name="package-check" :size="28" /><text>暂无历史任务</text></view>
    </view>
    <view v-else class="driver-page">
      <view v-if="store.myHandovers.length" class="handover-list">
        <view v-for="log in store.myHandovers" :key="log.id" class="handover-card">
          <span class="tag" :class="log.type">{{ log.type === 'out' ? '出库交接' : '到店交接' }}</span>
          <view class="handover-main"><text class="order-no">{{ log.orderId }}</text><small>{{ log.time }}</small></view>
        </view>
      </view>
      <view v-else class="empty-page"><UiIcon name="list-tree" :size="28" /><text>暂无我的交接记录</text></view>
    </view>

    <view v-if="sheet === 'handover-in' && selectedOrder" class="sheet-mask" @click.self="closeSheet">
      <view class="sheet-panel">
        <view class="handover-sheet">
          <view class="sheet-head"><text class="sheet-title">到店交接</text><button class="icon-button" aria-label="关闭" @click="closeSheet"><UiIcon name="x" :size="18" /></button></view>
          <view class="store-line"><UiIcon name="map-pin" :size="16" /><view><text>{{ selectedOrder.customer }}</text><small>{{ storeInfoOf(selectedOrder.customer).address }} · {{ storeInfoOf(selectedOrder.customer).contact }} {{ storeInfoOf(selectedOrder.customer).phone }}</small></view></view>
          <view class="detail-section"><view class="section-title">商品明细</view>
            <view v-for="item in selectedOrder.items" :key="`${item.productId}-${item.skuId}`" class="order-item-line"><image :src="item.image" mode="aspectFit" /><view><text>{{ item.name }}</text><small>{{ item.skuName }} ×{{ item.quantity }}</small></view><strong>{{ money(item.price * item.quantity) }}</strong></view>
          </view>
          <view v-if="orderShortage(selectedOrder).length" class="detail-section"><view class="section-title">缺货提示</view>
            <view v-for="item in orderShortage(selectedOrder)" :key="item.skuId" class="shortage-line"><text>{{ item.name }}</text><span class="tag danger">缺 {{ item.shortage }}</span></view>
          </view>
          <label class="login-field"><text>备注（可选）</text><input v-model="handoverNote" placeholder="交接备注" /></label>
          <view class="sheet-actions">
            <button class="primary-button" @click="confirmHandoverIn">确认已送达门店</button>
            <button class="outline-button" @click="closeSheet">取 消</button>
          </view>
        </view>
      </view>
    </view>
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

const todayText = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })

// ---------- login ----------
const loginRole = ref<'supplier' | 'driver'>('supplier')
const loginAccount = ref('')
const loginPassword = ref('')

function switchLoginRole(role: 'supplier' | 'driver') {
  loginRole.value = role
  store.loginError = ''
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
    loginAccount.value = ''
    loginPassword.value = ''
    active.value = 'dashboard'
  }
}

function logout() {
  store.logout()
  closeSheet()
}

// ---------- supplier workspace ----------
type SupplierModule = 'dashboard' | 'orders' | 'drivers' | 'handovers'
const active = ref<SupplierModule>('dashboard')
const navItems = [
  { key: 'dashboard' as const, label: '工作台', icon: 'layout-dashboard', badge: () => 0 },
  { key: 'orders' as const, label: '配送订单', icon: 'package', badge: () => store.metrics.toAcceptCount },
  { key: 'drivers' as const, label: '司机管理', icon: 'users', badge: () => 0 },
  { key: 'handovers' as const, label: '交接日志', icon: 'list-tree', badge: () => 0 }
]
const titles: Record<SupplierModule, { title: string; subtitle: string }> = {
  dashboard: { title: '工作台', subtitle: '今日配送概览与最近交接' },
  orders: { title: '配送订单', subtitle: '门店进货单履约：接单 / 派单 / 交接' },
  drivers: { title: '司机管理', subtitle: '为名下司机开通与管理账号' },
  handovers: { title: '交接日志', subtitle: '出库与到店交接记录' }
}

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
const recentOrders = computed(() => store.supplierOrders.filter((order) => ['submitted', 'accepted', 'shipped', 'delivering'].includes(orderFulfillment(order).status)).slice(0, 5))

const selectedOrder = ref<Order | null>(null)
const selectedOrderIds = ref<string[]>([])
const sheet = ref<null | 'order' | 'assign' | 'reassign' | 'courier' | 'handover-out' | 'handover-in' | 'driver-form' | 'driver-edit' | 'driver-reset' | 'driver-toggle-confirm'>(null)

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

// ---------- driver management ----------
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

// ---------- handovers ----------
const handoverFilter = ref('全部')
const handoverDriverFilter = ref('全部')
const handoverTypeFilters = ['全部', '出库交接', '到店交接']
const filteredHandovers = computed(() => store.allHandovers.filter((log) => {
  const matchesType = handoverFilter.value === '全部' || (handoverFilter.value === '出库交接' ? log.type === 'out' : log.type === 'in')
  const matchesDriver = handoverDriverFilter.value === '全部' || log.operatorName === handoverDriverFilter.value
  return matchesType && matchesDriver
}))
const recentHandovers = computed(() => store.allHandovers.slice(0, 5))

// ---------- driver workspace ----------
const driverTab = ref<'today' | 'history' | 'mine'>('today')
const driverTabs = [
  { key: 'today' as const, label: '今日任务' },
  { key: 'history' as const, label: '历史任务' },
  { key: 'mine' as const, label: '我的交接' }
]
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
$gold: #b8903f;
$red: #b91c1c;
$bg: #f4f5f1;
$panel: #ffffff;
$ink: #1f2a22;
$muted: #6b756d;
$line: #dfe3dc;

.login-page {
  min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; background: linear-gradient(160deg, $green-deep 0%, $green 60%, #1e6b41 100%);
}
.login-card { width: 100%; max-width: 380px; background: $panel; border-radius: 18px; padding: 28px 26px; box-shadow: 0 18px 48px rgba(13, 58, 31, .28); }
.login-head { text-align: center; margin-bottom: 20px; }
.login-logo { width: 64px; height: 64px; margin: 0 auto 10px; border-radius: 16px; background: $green-soft; display: flex; align-items: center; justify-content: center; }
.logo-emoji { font-size: 32px; }
.login-title { display: block; font-size: 20px; font-weight: 700; color: $ink; }
.login-sub { display: block; margin-top: 6px; font-size: 12px; color: $muted; }
.role-tabs { display: flex; gap: 8px; margin-bottom: 16px; }
.role-tabs button { flex: 1; padding: 10px 0; border-radius: 10px; background: $bg; color: $muted; font-size: 14px; }
.role-tabs button.active { background: $green; color: #fff; font-weight: 600; }
.login-fields { display: flex; flex-direction: column; gap: 12px; }
.login-field { display: flex; flex-direction: column; gap: 6px; }
.login-field > text { font-size: 12px; color: $muted; }
.login-field input { height: 46px; border: 1px solid $line; border-radius: 10px; padding: 0 12px; font-size: 14px; background: #fff; }
.login-button { margin-top: 18px; width: 100%; padding: 12px 0; border-radius: 10px; background: $green; color: #fff; font-size: 15px; font-weight: 600; }
.login-error { display: block; margin-top: 10px; font-size: 12px; color: $red; }
.login-hint { display: block; margin-top: 12px; text-align: center; font-size: 12px; color: $muted; }

.supplier-shell { display: flex; min-height: 100vh; }
.side-nav { width: 228px; flex: none; background: $green-deep; color: #fff; display: flex; flex-direction: column; padding: 18px 12px; }
.brand { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 700; padding: 4px 10px 18px; }
.brand-emoji { font-size: 22px; }
.nav-item { display: flex; align-items: center; gap: 10px; padding: 11px 12px; border-radius: 10px; color: rgba(255,255,255,.78); font-size: 14px; text-align: left; margin-bottom: 4px; }
.nav-item.active { background: rgba(255,255,255,.14); color: #fff; font-weight: 600; }
.nav-badge { margin-left: auto; background: $gold; color: #fff; border-radius: 10px; font-size: 11px; padding: 1px 7px; }
.side-foot { margin-top: auto; display: flex; flex-direction: column; gap: 10px; }
.supplier-chip { background: rgba(255,255,255,.08); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; }
.supplier-chip text { font-size: 13px; }
.supplier-chip small { font-size: 11px; color: rgba(255,255,255,.6); }
.logout-button { border: 1px solid rgba(255,255,255,.25); border-radius: 10px; padding: 9px 0; color: rgba(255,255,255,.85); font-size: 13px; background: transparent; }

.main-area { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.topbar { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; background: $panel; border-bottom: 1px solid $line; }
.topbar-title { display: flex; flex-direction: column; gap: 2px; }
.topbar-title text { font-size: 18px; font-weight: 700; }
.topbar-title small { font-size: 12px; color: $muted; }
.topbar-meta { display: flex; align-items: center; gap: 10px; font-size: 12px; color: $muted; }
.topbar-role { background: $green-soft; color: $green; border-radius: 10px; padding: 3px 10px; font-size: 12px; }

.module { padding: 20px 24px; }
.metric-band { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 18px; }
.metric-band > view { background: $panel; border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 6px; border: 1px solid $line; }
.metric-band small { font-size: 12px; color: $muted; }
.metric-band strong { font-size: 26px; font-weight: 700; }
.metric-band .warn strong { color: $red; }
.dash-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.panel { background: $panel; border: 1px solid $line; border-radius: 14px; padding: 16px; }
.panel-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.panel-head > view { display: flex; align-items: center; gap: 8px; font-weight: 600; }
.panel-head span { width: 4px; height: 16px; background: $green; border-radius: 2px; }
.text-button { background: transparent; color: $green; font-size: 13px; padding: 4px 8px; }
.compact-list { display: flex; flex-direction: column; gap: 8px; }
.compact-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; background: $bg; text-align: left; }
.compact-row.static { cursor: default; }
.compact-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.muted { font-size: 12px; color: $muted; }

.module-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.chips { display: flex; gap: 8px; flex-wrap: wrap; }
.chips button { padding: 7px 13px; border-radius: 20px; background: $panel; border: 1px solid $line; font-size: 13px; color: $muted; }
.chips button.active { background: $green; color: #fff; border-color: $green; font-weight: 600; }
.chip-count { font-size: 11px; opacity: .75; margin-left: 3px; }
.toolbar-right { display: flex; align-items: center; gap: 10px; }
.search-box { display: flex; align-items: center; gap: 6px; background: $panel; border: 1px solid $line; border-radius: 10px; padding: 7px 10px; }
.search-box input { height: 24px; border: 0; outline: 0; font-size: 13px; min-width: 180px; }
.select-box { border: 1px solid $line; border-radius: 10px; padding: 7px 10px; font-size: 13px; background: $panel; }

.order-list { display: flex; flex-direction: column; gap: 12px; }
.order-card { background: $panel; border: 1px solid $line; border-radius: 14px; overflow: hidden; }
.order-card-main { display: flex; }
.order-check { display: flex; align-items: center; padding: 0 10px; }
.order-check > view { width: 18px; height: 18px; border: 1.5px solid $line; border-radius: 5px; display: flex; align-items: center; justify-content: center; }
.order-check > view.checked { background: $green; border-color: $green; }
.order-body { flex: 1; text-align: left; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
.order-top { display: flex; align-items: center; justify-content: space-between; }
.order-no { font-size: 13px; font-weight: 600; color: $ink; }
.order-line { display: flex; align-items: center; gap: 10px; }
.order-emoji { width: 44px; height: 44px; border-radius: 10px; background: $bg; }
.order-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.order-title { font-size: 14px; font-weight: 600; }
.order-info small { font-size: 12px; color: $muted; }
.order-bottom { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; }
.order-meta { display: flex; flex-direction: column; gap: 2px; }
.order-meta small { font-size: 12px; color: $muted; }
.order-bottom strong { font-size: 16px; }
.order-actions { display: flex; gap: 8px; padding: 0 16px 14px; flex-wrap: wrap; }
.status-badge { display: inline-flex; align-items: center; font-size: 11px; padding: 2px 9px; border-radius: 10px; font-weight: 600; flex: none; }
.status-badge.submitted, .status-badge.cancelled { background: #f3f0e8; color: #8a6d1f; }
.status-badge.accepted { background: #eaf0fb; color: #2f5bb3; }
.status-badge.shipped { background: #e8f3ec; color: $green; }
.status-badge.delivering { background: #fdf1e2; color: #a05a12; }
.status-badge.received, .status-badge.completed { background: #e8f3ec; color: $green; }
.status-badge.active { background: #e8f3ec; color: $green; }
.status-badge.disabled { background: #f2f2f2; color: $muted; }

.tag { display: inline-flex; align-items: center; font-size: 11px; padding: 2px 8px; border-radius: 8px; flex: none; font-weight: 600; }
.tag.danger { background: #fdeaea; color: $red; }
.tag.out { background: $green-soft; color: $green; }
.tag.in { background: #eaf0fb; color: #2f5bb3; }

.primary-button { background: $green; color: #fff; border-radius: 10px; padding: 10px 16px; font-size: 14px; font-weight: 600; }
.primary-button.small { padding: 6px 12px; font-size: 13px; }
.outline-button { background: $panel; border: 1px solid $line; color: $ink; border-radius: 10px; padding: 10px 16px; font-size: 14px; }
.outline-button.small { padding: 6px 12px; font-size: 13px; }
.outline-button.danger { color: $red; border-color: rgba(185, 28, 28, .35); }
.outline-button.small[disabled] { opacity: .55; }

.empty-page { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 40px 0; color: $muted; text-align: center; }
.empty-page text { font-size: 14px; }
.empty-page small { font-size: 12px; }
.loading { padding: 60px; text-align: center; color: $muted; }
.state-page { padding: 60px; display: flex; flex-direction: column; align-items: center; gap: 12px; color: $muted; }

.driver-list, .handover-list { display: flex; flex-direction: column; gap: 10px; }
.driver-card { background: $panel; border: 1px solid $line; border-radius: 14px; padding: 14px 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.driver-main { display: flex; align-items: center; gap: 12px; min-width: 0; }
.driver-avatar { width: 40px; height: 40px; border-radius: 50%; background: $green-soft; display: flex; align-items: center; justify-content: center; color: $green; flex: none; }
.driver-avatar.large { width: 46px; height: 46px; }
.driver-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.driver-name { display: flex; align-items: center; gap: 8px; }
.driver-name text { font-size: 15px; font-weight: 600; }
.driver-info small { font-size: 12px; color: $muted; }
.driver-actions { display: flex; gap: 8px; flex-wrap: wrap; }

.handover-card { display: flex; align-items: center; gap: 12px; background: $panel; border: 1px solid $line; border-radius: 12px; padding: 12px 14px; }
.handover-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.handover-main small { font-size: 12px; color: $muted; }

.sheet-mask { position: fixed; inset: 0; background: rgba(15, 23, 18, .45); display: flex; align-items: flex-end; justify-content: center; z-index: 50; }
.sheet-panel { background: $panel; width: 100%; max-width: 560px; max-height: 88vh; overflow-y: auto; border-radius: 18px 18px 0 0; padding: 20px; }
.sheet-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.sheet-title { font-size: 16px; font-weight: 700; }
.icon-button { width: 34px; height: 34px; border-radius: 10px; background: $bg; display: flex; align-items: center; justify-content: center; }
.detail-status { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.steps { display: flex; gap: 6px; margin-bottom: 16px; overflow-x: auto; }
.step { display: flex; align-items: center; gap: 5px; flex: none; }
.step-dot { width: 20px; height: 20px; border-radius: 50%; background: $bg; color: $muted; font-size: 11px; display: flex; align-items: center; justify-content: center; }
.step.done .step-dot { background: $green; color: #fff; }
.step small { font-size: 11px; color: $muted; white-space: nowrap; }
.detail-section { margin-bottom: 14px; }
.section-title { font-size: 13px; font-weight: 600; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
.order-item-line { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px dashed $line; }
.order-item-line image { width: 36px; height: 36px; border-radius: 8px; background: $bg; }
.order-item-line > view { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.order-item-line text { font-size: 13px; }
.order-item-line small { font-size: 12px; color: $muted; }
.order-item-line strong { font-size: 13px; }
.store-line { display: flex; align-items: flex-start; gap: 8px; background: $bg; border-radius: 10px; padding: 10px 12px; }
.store-line > view { display: flex; flex-direction: column; gap: 2px; }
.store-line text { font-size: 13px; font-weight: 600; }
.store-line small { font-size: 12px; color: $muted; }
.shortage-line { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 7px 0; border-bottom: 1px dashed $line; }
.shortage-line text { font-size: 13px; }
.shortage-line small { font-size: 12px; color: $muted; }
.log-list { display: flex; flex-direction: column; gap: 8px; }
.log-event { display: flex; gap: 10px; align-items: flex-start; }
.log-dot { width: 8px; height: 8px; border-radius: 50%; background: $green; margin-top: 5px; flex: none; }
.log-event > view { display: flex; flex-direction: column; gap: 1px; }
.log-event text { font-size: 13px; }
.log-event small { font-size: 12px; color: $muted; }
.sheet-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px; flex-wrap: wrap; }

.driver-options { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.driver-option { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid $line; border-radius: 10px; text-align: left; background: #fff; }
.driver-option.active { border-color: $green; background: $green-soft; }
.driver-option > view:nth-child(2) { flex: 1; display: flex; flex-direction: column; gap: 1px; }
.driver-option text { font-size: 14px; font-weight: 600; }
.driver-option small { font-size: 12px; color: $muted; }
.radio-dot { width: 16px; height: 16px; border-radius: 50%; background: $green; }

.actual-list { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
.actual-line { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px dashed $line; }
.actual-line > view { display: flex; flex-direction: column; gap: 1px; }
.actual-line text { font-size: 13px; }
.actual-line small { font-size: 12px; color: $muted; }
.actual-input { display: flex; align-items: center; gap: 6px; }
.actual-input text { font-size: 12px; color: $muted; }
.actual-input input { width: 70px; height: 32px; border: 1px solid $line; border-radius: 8px; padding: 0 8px; font-size: 13px; text-align: center; }
.handover-result { display: flex; flex-direction: column; gap: 6px; background: $green-soft; border-radius: 10px; padding: 14px; margin-top: 12px; }
.handover-result text { font-size: 14px; font-weight: 700; color: $green; }
.handover-result small { font-size: 12px; color: $green; }

.form-fields { display: flex; flex-direction: column; gap: 12px; }
.driver-shell { min-height: 100vh; background: $bg; }
.driver-head { display: flex; align-items: center; gap: 14px; padding: 16px 20px; background: $green-deep; color: #fff; flex-wrap: wrap; }
.driver-identity { display: flex; align-items: center; gap: 10px; }
.driver-identity .driver-avatar { background: rgba(255,255,255,.16); color: #fff; }
.driver-identity > view:last-child { display: flex; flex-direction: column; gap: 1px; }
.driver-identity text { font-size: 16px; font-weight: 700; }
.driver-identity small { font-size: 12px; color: rgba(255,255,255,.7); }
.driver-metrics { display: flex; gap: 20px; margin-left: auto; }
.driver-metrics > view { display: flex; flex-direction: column; gap: 1px; }
.driver-metrics small { font-size: 11px; color: rgba(255,255,255,.7); }
.driver-metrics strong { font-size: 18px; }
.driver-head .logout-button { border-color: rgba(255,255,255,.35); color: #fff; }
.driver-tabs { display: flex; gap: 4px; padding: 10px 16px; background: $panel; border-bottom: 1px solid $line; }
.driver-tabs button { padding: 9px 16px; border-radius: 10px; font-size: 14px; color: $muted; background: transparent; }
.driver-tabs button.active { background: $green-soft; color: $green; font-weight: 600; }
.driver-page { padding: 16px; }
.task-list { display: flex; flex-direction: column; gap: 12px; }
.task-card { background: $panel; border: 1px solid $line; border-radius: 14px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
.task-card.done { opacity: .85; }
.task-top { display: flex; align-items: center; justify-content: space-between; }
.task-store { display: flex; align-items: flex-start; gap: 8px; background: $bg; border-radius: 10px; padding: 10px 12px; }
.task-store > view { display: flex; flex-direction: column; gap: 2px; }
.task-store text { font-size: 14px; font-weight: 600; }
.task-store small { font-size: 12px; color: $muted; }
.task-items { display: flex; flex-direction: column; gap: 6px; }
.task-item { display: flex; align-items: center; gap: 8px; }
.task-item image { width: 30px; height: 30px; border-radius: 8px; background: $bg; }
.task-item text { font-size: 13px; flex: 1; }
.task-item small { font-size: 12px; color: $muted; }
.task-shortage { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.task-shortage small { font-size: 12px; color: $red; }
.task-actions { display: flex; justify-content: flex-end; }

.toast { position: fixed; left: 50%; bottom: 40px; transform: translateX(-50%); background: rgba(15, 23, 18, .88); color: #fff; border-radius: 20px; padding: 10px 20px; font-size: 13px; z-index: 99; }

@media (max-width: 860px) {
  .supplier-shell { flex-direction: column; }
  .side-nav { width: 100%; flex-direction: row; align-items: center; padding: 10px 12px; overflow-x: auto; }
  .brand { padding: 0 8px 0 0; flex: none; }
  .brand text { display: none; }
  .nav-item { padding: 8px 12px; margin-bottom: 0; flex: none; }
  .side-foot { margin-top: 0; margin-left: auto; flex-direction: row; }
  .supplier-chip { display: none; }
  .logout-button { padding: 7px 12px; }
  .module { padding: 14px 14px; }
  .metric-band { grid-template-columns: repeat(3, 1fr); }
  .dash-grid { grid-template-columns: 1fr; }
  .topbar { padding: 12px 14px; }
  .module-toolbar { align-items: stretch; flex-direction: column; }
  .toolbar-right { justify-content: space-between; }
  .search-box input { min-width: 120px; }
}
</style>
