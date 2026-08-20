<template>
  <view v-if="!store.auth.isLoggedIn" class="login-page">
    <view class="login-card">
      <view class="login-head"><image class="login-logo" :src="store.info.image" mode="aspectFit" /><text class="login-title">门店订货商城</text><text class="login-sub">甄选好物供应链 · 供货价直采 · 中台直配到店</text></view>
      <view class="login-tabs">
        <button :class="{ active: loginTab === 'password' }" @click="loginTab = 'password'">密码登录</button>
        <button :class="{ active: loginTab === 'code' }" @click="loginTab = 'code'">验证码登录</button>
      </view>
      <view class="login-fields">
        <label class="login-field"><text>手机号</text><input v-model="loginPhone" type="number" maxlength="11" placeholder="请输入门店手机号" /></label>
        <label v-if="loginTab === 'password'" class="login-field"><text>密码</text><input v-model="loginPassword" type="password" placeholder="请输入密码" confirm-type="done" @confirm="submitLogin" /></label>
        <label v-else class="login-field"><text>验证码</text><view class="code-input"><input v-model="loginCode" type="number" maxlength="6" placeholder="请输入验证码" confirm-type="done" @confirm="submitLogin" /><button class="code-button" :disabled="codeCountdown > 0" @click="sendCode">{{ codeCountdown > 0 ? codeCountdown + 's' : '发送验证码' }}</button></view></label>
      </view>
      <button class="login-button" @click="submitLogin">登 录</button>
      <text class="login-hint">演示手机号 13800000000　密码 123456　验证码 123456</text>
    </view>
  </view>
  <view v-else class="app-shell">
    <view v-if="store.loading" class="loading">正在准备门店订货商城...</view>
    <view v-else-if="store.error" class="state-page">
      <UiIcon name="radio" :size="28" />
      <text>{{ store.error }}</text>
      <button class="primary-button" @click="retryLoad">重新加载</button>
    </view>
    <template v-else>
      <view v-if="activeTab === 'shop'" class="tab-page shop-page">
        <view class="mall-hero">
          <text class="mall-hero-title">门店订货商城</text>
          <text class="mall-hero-sub">甄选好物供应链 · 供货价直采 · 中台直配到店</text>
          <view class="mall-hero-meta"><text>🏪 {{ store.info.name }}</text><text>📍 {{ store.info.region }} · 账期月结</text></view>
        </view>
        <view class="page-pad">
          <view class="shop-metrics">
            <view><small>在售商品</small><strong>{{ storeMetrics.activeCount }} 款</strong></view>
            <view><small>可订商品</small><strong>{{ store.products.length }} 款</strong></view>
            <view><small>直采累计节省</small><strong>{{ money(storeMetrics.savedTotal) }}</strong></view>
          </view>
          <view class="search-bar"><UiIcon name="search" :size="18" /><input v-model="keyword" placeholder="搜索供应链商品 / 供应商" confirm-type="search" /></view>
          <view class="supply-note"><text class="note-emoji">🏬</text><text>带「中台供」标识的商品来自<b>甄选好物供应链中台</b>，统一品控、统一履约、供货价直采。</text></view>
          <view v-if="activePolicies.length" class="policy-hint">🎯 中台价格策略：<b>{{ activePolicies.map((p) => p.name).join('、') }}</b> 已生效</view>
          <view class="chip-scroll"><view class="chips"><button v-for="item in categories" :key="item.key" :class="{ active: category === item.key }" @click="category = item.key">{{ item.label }}<text class="chip-count">{{ item.count }}</text></button></view></view>
          <view v-if="visibleProducts.length" class="result-count">共 {{ visibleProducts.length }} 款商品 · 中台直配到店</view>
          <view v-if="visibleProducts.length" class="product-grid">
            <view v-for="product in visibleProducts" :key="product.id" class="product-card">
              <button class="product-image product-open" :aria-label="`查看${product.name}`" @click="openProduct(product)">
                <image class="product-emoji" :src="product.image" mode="aspectFit" />
                <text v-if="product.source === 'platform'">中台供</text>
              </button>
              <view class="product-body">
                <text class="item-title">{{ product.name }}</text>
                <text class="muted">{{ product.supplier }}</text>
                <view class="cost-line">
                  <strong>{{ money(product.cost) }}</strong>
                  <del>{{ money(product.price) }}</del>
                  <span>省 {{ savePercent(product) }}%</span>
                </view>
                <view class="product-divider"></view>
                <view class="product-foot">
                  <view class="product-stats">
                    <text>已售 {{ product.sales.toLocaleString('zh-CN') }}</text>
                    <text class="stat-dot">·</text>
                    <text :class="stockClass(product)">{{ stockText(product) }}</text>
                  </view>
                  <button :aria-label="`加入${product.name}到进货单`" :disabled="totalStock(product) === 0" @click="addProduct(product)"><UiIcon name="plus" :size="18" /></button>
                </view>
              </view>
            </view>
          </view>
          <view v-else class="empty-page"><UiIcon name="search" :size="28" /><text>没有找到相关商品</text><small>试试其他关键词或分类</small></view>
        </view>
      </view>

      <view v-else-if="activeTab === 'orders'" class="tab-page orders-page page-pad">
        <view class="mobile-head"><text class="page-title">我的订货单</text><text class="page-sub">供应链中台统一履约 · 直配到店</text></view>
        <view class="order-summary">
          <text>共 {{ store.orders.length }} 单</text>
          <text>待收货 {{ store.orderMetrics.pendingReceipt }}</text>
          <text>本月进货 {{ money(store.orderMetrics.monthAmount) }}</text>
        </view>
        <view class="chip-scroll"><view class="chips order-chips"><button v-for="item in orderFilters" :key="item.key" :class="{ active: orderFilter === item.key }" @click="orderFilter = item.key">{{ item.label }}<text class="chip-count">{{ item.count }}</text></button></view></view>
        <view v-if="filteredOrders.length" class="order-list">
          <button v-for="order in filteredOrders" :key="order.id" class="order-card" @click="openOrder(order.id)">
            <view class="order-top"><text class="order-no">{{ order.id }}</text><span class="status-badge" :class="order.status">{{ displayStatus(order) }}</span></view>
            <view class="order-main">
              <image class="order-emoji" :src="order.items[0]?.image || '/static/images/field.webp'" mode="aspectFit" />
              <view class="order-info">
                <text class="order-title">{{ orderTitle(order) }}</text>
                <small>{{ order.createdAt }} · 共 {{ order.itemCount }} 件 · {{ order.trackingNo ? '运单 ' + order.trackingNo : '等待接单' }}</small>
              </view>
            </view>
            <view class="order-bottom">
              <small v-if="order.saved">较零售省 {{ money(order.saved) }}</small>
              <strong>{{ money(order.amount) }}</strong>
              <UiIcon name="chevron-right" :size="17" />
            </view>
          </button>
        </view>
        <view v-else class="empty-page"><UiIcon name="package" :size="28" /><text>暂无相关订货单</text><small>去商城下一单吧～</small></view>
      </view>

      <view v-else class="tab-page store-page">
        <view class="store-hero">
          <view class="store-hero-top"><text class="page-title">门店工作台</text><small>供货价直采 · 供应链中台直配</small></view>
          <view class="store-identity"><image class="store-emoji" :src="store.info.image" mode="aspectFit" /><view><text>{{ store.info.name }}</text><small>{{ store.info.region }} · {{ store.info.contact }}</small></view></view>
          <view class="metric-band store-metrics">
            <view><small>本月进货额</small><strong>{{ money(store.orderMetrics.monthAmount) }}</strong></view>
            <view><small>订货单数</small><strong>{{ store.orderMetrics.orderCount }}</strong></view>
            <view><small>待收货</small><strong>{{ store.orderMetrics.pendingReceipt }}</strong></view>
            <view><small>累计节省</small><strong>{{ money(store.orderMetrics.savedAmount) }}</strong></view>
          </view>
        </view>
        <view class="page-pad store-body">
          <view class="section-head compact"><view><span></span><text>快捷入口</text></view></view>
          <view class="quick-grid">
            <button @click="goShop"><UiIcon name="shopping-bag" :size="22" /><text>去订货</text><small>可订 {{ store.products.length }} 款</small></button>
            <button @click="goOrders"><UiIcon name="package-check" :size="22" /><text>我的订单</text><small>共 {{ store.orders.length }} 单 · 待收货 {{ store.orderMetrics.pendingReceipt }}</small></button>
            <button @click="sheet = 'address'"><UiIcon name="map-pin" :size="22" /><text>收货地址</text><small>{{ store.info.address }}</small></button>
            <button @click="sheet = 'contact'"><UiIcon name="headset" :size="22" /><text>联系客服</text><small>{{ store.info.phone }}</small></button>
          </view>
          <view class="section-head compact"><view><span></span><text>热销常订</text></view><small>按进货次数</small></view>
          <view class="hot-list">
            <view v-for="(item, index) in storeMetrics.hotOrders" :key="item.id" class="hot-item">
              <text class="hot-rank">{{ index + 1 }}</text>
              <image class="hot-emoji" :src="item.image" mode="aspectFit" />
              <view class="hot-main"><text>{{ item.name }}</text><small>已订 {{ item.times }} 次</small></view>
              <strong>{{ money(item.amount) }}</strong>
            </view>
          </view>
          <view class="section-head compact"><view><span></span><text>商品管理</text></view><small>本店库存 · 上下架（独立管理）</small></view>
          <view class="stock-list">
            <view v-for="product in store.products" :key="product.id" class="stock-row">
              <view class="stock-main"><text>{{ product.name }}</text><small>供货价 {{ money(product.cost) }} · {{ store.isListed(product.id) ? '已上架' : '已下架' }}</small></view>
              <view class="stock-skus"><label v-for="sku in product.skus" :key="sku.id" class="stock-sku"><text>{{ sku.name }}</text><input v-model.number="stockDrafts[product.id][sku.id]" type="number" /></label></view>
              <view class="stock-actions"><button class="compact-button" @click="commitStock(product)">保存库存</button><button class="compact-button" :class="{ off: !store.isListed(product.id) }" @click="toggleListed(product.id)">{{ store.isListed(product.id) ? '下架' : '上架' }}</button></view>
            </view>
          </view>
          <view class="section-head compact"><view><span></span><text>门店信息</text></view></view>
          <view class="info-list">
            <view><small>门店名称</small><text>{{ store.info.name }}</text></view>
            <view><small>门店账号</small><text>{{ store.info.accountNo }}</text></view>
            <view><small>登录账号</small><text>{{ store.auth.phone }}</text></view>
            <view><small>结算方式</small><text>{{ store.info.account }}</text></view>
            <view><small>收货地址</small><text>{{ store.info.address }}</text></view>
            <view><small>客服电话</small><text>{{ store.info.phone }}</text></view>
          </view>
          <button class="logout-button" @click="logout">退出登录</button>
          <view class="security-note"><UiIcon name="shield-check" :size="18" /><text>门店以<b>供货价</b>向甄选好物供应链中台直采，统一品控、统一履约、直配到店；建议零售仅作毛利参考，请勿外泄供货价。</text></view>
          <view class="member-footer">平台支持 · 湖南省电子商务协会 · 甄选好物供应链中台</view>
        </view>
      </view>

      <view v-if="activeTab === 'shop' && store.cartCount" class="cart-bar">
        <button class="cart-count" @click="openCart"><UiIcon name="shopping-cart" :size="21" /><span>{{ store.cartCount }}</span></button>
        <view><small>合计</small><strong>{{ money(store.cartTotal) }}</strong></view>
        <button @click="openCart">去下单</button>
      </view>

      <view class="tabbar">
        <button v-for="tab in tabs" :key="tab.key" :class="{ active: activeTab === tab.key }" @click="chooseTab(tab.key)"><view class="tab-icon-wrap"><UiIcon :name="tab.icon" :size="21" /><text v-if="tab.key === 'orders' && store.orderMetrics.pendingReceipt" class="tab-badge">{{ store.orderMetrics.pendingReceipt }}</text></view><text class="tab-label">{{ tab.label }}</text></button>
      </view>

      <view v-if="sheet" class="sheet-mask" @click.self="sheet = null">
        <view class="sheet">
          <view class="sheet-handle"></view>
          <view class="sheet-head">
            <text>{{ sheetTitle }}</text>
            <button aria-label="关闭弹层" @click="sheet = null"><UiIcon name="x" :size="19" /></button>
          </view>

          <view v-if="sheet === 'product' && selectedProduct" class="product-detail">
            <image class="product-detail-emoji" :src="selectedProduct.image" mode="aspectFit" />
            <text>{{ selectedProduct.name }}</text>
            <small>{{ selectedProduct.supplier }} · {{ selectedProduct.tags.join(' / ') }}</small>
            <view class="detail-price"><strong>{{ money(selectedSku?.cost ?? selectedProduct.cost) }}</strong><del>{{ money(selectedProduct.price) }}</del><span>省 {{ savePercent(selectedProduct) }}%</span></view>
            <view v-if="selectedProduct.skus.length > 1" class="sku-options">
              <button v-for="sku in selectedProduct.skus" :key="sku.id" :class="{ active: selectedSkuId === sku.id }" @click="selectedSkuId = sku.id">
                <text>{{ sku.name }}</text><small>供货价 {{ money(sku.cost) }} · 库存 {{ sku.stock }}</small>
              </button>
            </view>
            <view class="product-detail-actions">
              <button class="outline-button" @click="sheet = null">再看看</button>
              <button class="primary-button" @click="addSelected">加入进货单</button>
            </view>
          </view>

          <view v-else-if="sheet === 'cart'" class="sheet-list">
            <view v-if="!store.cart.length" class="empty">进货单还是空的</view>
            <view v-for="item in store.cart" :key="`${item.productId}-${item.skuId}`" class="sheet-line" :class="{ shortage: item.quantity >= item.stock }">
              <image :src="item.image" mode="aspectFit" />
              <view><text>{{ item.name }}</text><small>{{ item.skuName }} · 供货价 {{ money(item.price) }} · 库存 {{ item.stock }}</small><strong>{{ money(item.price * item.quantity) }}</strong></view>
              <view class="stepper">
                <button aria-label="减少数量" @click="store.changeCart(item.productId, item.skuId, -1)">−</button>
                <text>{{ item.quantity }}</text>
                <button aria-label="增加数量" :disabled="item.quantity >= item.stock" @click="store.changeCart(item.productId, item.skuId, 1)">+</button>
              </view>
            </view>
            <text v-if="store.checkoutError" class="cart-error">{{ store.checkoutError }}</text>
            <view v-if="store.cart.length" class="checkout-summary">
              <view><text>共 {{ store.cartCount }} 件</text><strong>{{ money(store.cartTotal) }}</strong></view>
              <button class="primary-button" @click="goCheckout">确认下单</button>
            </view>
          </view>

          <view v-else-if="sheet === 'checkout'" class="checkout-form">
            <view class="checkout-store">
              <view><small>收货门店</small><text>{{ store.info.name }}</text></view>
              <view><small>收货地址</small><text>{{ store.info.address }}</text></view>
            </view>
            <view class="form-group"><text>下单备注（选填）</text><textarea v-model="remark" placeholder="例如：需要周三前送达 / 到货后电话联系" /></view>
            <view class="checkout-items">
              <view v-for="item in store.cart" :key="`${item.productId}-${item.skuId}`" class="checkout-line">
                <text>{{ item.name }} ×{{ item.quantity }}</text><strong>{{ money(item.price * item.quantity) }}</strong>
              </view>
            </view>
            <view class="checkout-summary">
              <view><text>商品金额</text><strong>{{ money(store.cartTotal) }}</strong></view>
              <view><text>较零售节省</text><strong class="save">{{ money(cartSaved) }}</strong></view>
              <view><text>配送费</text><strong>¥0</strong></view>
              <button class="primary-button" @click="submitOrder">提交订单</button>
            </view>
          </view>

          <view v-else-if="sheet === 'order' && selectedOrder" class="order-detail">
            <view class="order-detail-head"><text>{{ selectedOrder.id }}</text><span class="status-badge" :class="selectedOrder.status">{{ displayStatus(selectedOrder) }}</span></view>
            <view class="steps">
              <view v-for="(step, index) in purchaseSteps" :key="step" class="step" :class="{ done: stepIndex >= index, current: step === selectedOrder.status }">
                <view class="step-dot">{{ index + 1 }}</view><small>{{ statusLabel(step) }}</small>
              </view>
            </view>
            <view class="logistics">
              <view v-for="event in selectedOrder.logistics" :key="`${event.time}-${event.title}`" class="log-event">
                <view class="log-dot"></view>
                <view><text>{{ event.title }}</text><small>{{ event.time }} · {{ event.detail }}</small></view>
              </view>
            </view>
            <view class="order-items">
              <view v-for="item in selectedOrder.items" :key="`${item.productId}-${item.skuId}`" class="order-item-line">
                <image :src="item.image" mode="aspectFit" />
                <view><text>{{ item.name }}</text><small>{{ item.skuName }} ×{{ item.quantity }}</small></view>
                <strong>{{ money(item.price * item.quantity) }}</strong>
              </view>
            </view>
            <view class="checkout-summary">
              <view><text>商品合计</text><strong>{{ money(selectedOrder.amount) }}</strong></view>
              <view v-if="selectedOrder.saved"><text>较零售节省</text><strong class="save">{{ money(selectedOrder.saved) }}</strong></view>
              <view v-if="selectedOrder.remark"><text>备注</text><strong class="remark">{{ selectedOrder.remark }}</strong></view>
              <view v-if="selectedOrder.trackingNo"><text>运单号</text><strong>{{ selectedOrder.trackingNo }}</strong></view>
            </view>
            <view v-if="afterSaleStatus(selectedOrder.id)" class="after-sale-status">售后状态：{{ afterSaleStatus(selectedOrder.id) }}</view>
            <view class="order-actions">
              <button class="outline-button" @click="repeatOrder(selectedOrder.id)">再次下单</button>
              <button v-if="selectedOrder.status === 'submitted' || selectedOrder.status === 'accepted'" class="outline-button" @click="cancelOrder(selectedOrder.id)">取消订单</button>
              <button v-if="selectedOrder.status === 'delivering'" class="primary-button" @click="confirmReceipt(selectedOrder.id)">确认收货</button>
              <button v-if="selectedOrder.status === 'received' || selectedOrder.status === 'completed'" class="primary-button" @click="submitStoreAfterSale(selectedOrder.id)">发起售后</button>
              <button v-if="selectedOrder.status !== 'completed' && selectedOrder.status !== 'cancelled' && selectedOrder.status !== 'received'" class="primary-button" @click="advanceOrder(selectedOrder.id)">推进状态（演示）</button>
            </view>
          </view>

          <view v-else-if="sheet === 'contact'" class="contact-sheet">
            <view class="contact-hero">
              <UiIcon name="headset" :size="30" />
              <text>甄选好物供应链 · 门店客服</text>
              <small>统一品控 · 统一履约 · 工作日 {{ store.info.hours }} 在线</small>
            </view>
            <view class="contact-rows">
              <view class="contact-row"><small>客服电话</small><text>{{ store.info.phone }}</text></view>
              <view class="contact-row"><small>门店对接人</small><text>{{ store.info.contact }}</text></view>
              <view class="contact-row"><small>营业时间</small><text>{{ store.info.hours }}</text></view>
              <view class="contact-row"><small>收货地址</small><text>{{ store.info.address }}</text></view>
            </view>
            <view class="contact-actions">
              <button class="primary-button" @click="makePhoneCall">📞 拨打电话</button>
              <button class="outline-button" @click="copyPhone">复制客服电话</button>
            </view>
          </view>

          <view v-else-if="sheet === 'address'" class="address-sheet">
            <view class="address-card">
              <small>收货门店</small><text>{{ store.info.name }}</text>
              <small>收货人</small><text>{{ store.info.contact }} {{ store.info.phone }}</text>
              <small>收货地址</small><text>{{ store.info.address }}</text>
            </view>
            <text class="address-note">订单由供应链中台统一直配到店，到货后请当面验货签收。</text>
            <button class="outline-button" @click="copyAddress">复制地址</button>
          </view>
        </view>
      </view>
    </template>
  </view>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import type { Product, PurchaseStatus } from '@agritainment/shared'
import { installKeyboardButtonSupport, money, orderStatusText, purchaseSteps, readPlatformAfterSaleStatus, readPlatformEntities, readPlatformOrder, validatePhone } from '@agritainment/shared'
import UiIcon from '../../components/UiIcon.vue'
import { deriveStoreMetrics } from '../../services/repository'
import { useStoreStore } from '../../stores/store'

type TabKey = 'shop' | 'orders' | 'store'
type SheetKey = 'product' | 'cart' | 'checkout' | 'order' | 'address' | 'contact' | null

const store = useStoreStore()
const storeMetrics = computed(() => deriveStoreMetrics(store.products))
const activePolicies = computed(() => Object.values(readPlatformEntities()?.policies || {}).filter((item) => item.enabled))
const stockDrafts = reactive<Record<string, Record<string, number>>>({})
function ensureStockDrafts() {
  store.products.forEach((p) => {
    if (!stockDrafts[p.id]) stockDrafts[p.id] = {}
    p.skus.forEach((s) => { if (stockDrafts[p.id][s.id] === undefined) stockDrafts[p.id][s.id] = s.stock })
  })
}
function commitStock(product: Product) {
  product.skus.forEach((s) => { const v = stockDrafts[product.id]?.[s.id]; if (v !== undefined) store.setSkuStock(product.id, s.id, v) })
  toast('库存已更新（本店独立，不回传中台）')
}
function toggleListed(productId: string) {
  if (!store.toggleListed(productId)) return toast('商品不存在')
  toast(store.isListed(productId) ? '已上架到本店商城' : '已从本店商城下架')
}

const tabs: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'shop', label: '商城', icon: 'shopping-bag' },
  { key: 'orders', label: '订单', icon: 'package-check' },
  { key: 'store', label: '门店', icon: 'store' }
]

const activeTab = ref<TabKey>('shop')
const category = ref('全部')
const keyword = ref('')
const orderFilter = ref<'all' | PurchaseStatus>('all')
const sheet = ref<SheetKey>(null)
const selectedProduct = ref<Product | null>(null)
const selectedSkuId = ref('')
const selectedOrderId = ref('')
const remark = ref('')

const statusLabels: Record<PurchaseStatus, string> = {
  submitted: '待接单', accepted: '待发货', shipped: '已发货', delivering: '配送中', received: '已收货', completed: '已完成', cancelled: '已取消'
}
const statusLabel = (status: PurchaseStatus) => statusLabels[status]
const displayStatus = (order: { id: string; status: PurchaseStatus }) => {
  const platform = readPlatformOrder(order.id)
  if (platform && platform.status !== 'pending') return orderStatusText(platform.status)
  return statusLabel(order.status)
}
const afterSaleStatus = (orderId: string) => readPlatformAfterSaleStatus(orderId)

const categories = computed(() => {
  const keys = ['全部', ...new Set(store.products.map((item) => item.category))]
  return keys.map((key) => ({
    key,
    label: key,
    count: key === '全部' ? store.products.length : store.products.filter((product) => product.category === key).length
  }))
})

const visibleProducts = computed(() => {
  const kw = keyword.value.trim()
  return store.products.filter((item) => {
    const matchesCategory = category.value === '全部' || item.category === category.value
    const matchesKeyword = !kw || item.name.includes(kw) || item.supplier.includes(kw) || item.tags.some((tag) => tag.includes(kw))
    return matchesCategory && matchesKeyword && store.isListed(item.id)
  })
})

const orderFilters = computed(() => {
  const count = (key: 'all' | PurchaseStatus) => key === 'all' ? store.orders.length : store.orders.filter((order) => order.status === key).length
  return [
    { key: 'all' as const, label: '全部', count: count('all') },
    { key: 'submitted' as const, label: '待接单', count: count('submitted') },
    { key: 'accepted' as const, label: '待发货', count: count('accepted') },
    { key: 'shipped' as const, label: '已发货', count: count('shipped') },
    { key: 'delivering' as const, label: '配送中', count: count('delivering') },
    { key: 'received' as const, label: '已收货', count: count('received') },
    { key: 'completed' as const, label: '已完成', count: count('completed') }
  ]
})

const filteredOrders = computed(() => orderFilter.value === 'all' ? store.orders : store.orders.filter((order) => order.status === orderFilter.value))

const selectedOrder = computed(() => store.orders.find((item) => item.id === selectedOrderId.value) || null)

const selectedSku = computed(() => {
  if (!selectedProduct.value) return null
  return selectedProduct.value.skus.find((sku) => sku.id === selectedSkuId.value) || selectedProduct.value.skus[0] || null
})

const stepIndex = computed(() => {
  if (!selectedOrder.value) return 0
  return Math.max(0, purchaseSteps.indexOf(selectedOrder.value.status))
})

const cartSaved = computed(() => Math.round(store.cart.reduce((sum, line) => sum + (line.retail - line.price) * line.quantity, 0) * 100) / 100)

const sheetTitle = computed(() => {
  switch (sheet.value) {
    case 'product': return '商品详情'
    case 'cart': return '进货单'
    case 'checkout': return '确认下单'
    case 'order': return '订单详情'
    case 'address': return '收货信息'
    case 'contact': return '联系客服'
    default: return ''
  }
})

function savePercent(product: Product) {
  return Math.max(0, Math.round((1 - product.cost / product.price) * 100))
}

function totalStock(product: Product) {
  return product.skus.reduce((sum, sku) => sum + sku.stock, 0)
}

function stockClass(product: Product) {
  const stock = totalStock(product)
  if (stock <= 0) return 'stock-out'
  if (stock < 50) return 'stock-low'
  return 'stock-ok'
}

function stockText(product: Product) {
  const stock = totalStock(product)
  if (stock <= 0) return '已售罄'
  if (stock < 50) return `库存紧张 ${stock.toLocaleString('zh-CN')}`
  return `库存 ${stock.toLocaleString('zh-CN')}`
}



function orderTitle(order: { items: Array<{ name: string; quantity: number }> }) {
  return order.items.map((line) => `${line.name} ×${line.quantity}`).join('、')
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
  sheet.value = null
  uni.pageScrollTo({ scrollTop: 0, duration: 0 })
}

function goShop() {
  activeTab.value = 'shop'
  uni.pageScrollTo({ scrollTop: 0, duration: 0 })
}

function goOrders() {
  activeTab.value = 'orders'
  orderFilter.value = 'all'
  uni.pageScrollTo({ scrollTop: 0, duration: 0 })
}

function openProduct(product: Product) {
  selectedProduct.value = product
  selectedSkuId.value = product.skus[0].id
  sheet.value = 'product'
}

function addProduct(product: Product) {
  const result = store.addToCart(product)
  if (result === 'sku-required') return openProduct(product)
  if (result === 'out-of-stock') return toast(store.checkoutError || '该规格库存不足')
  toast('已加入进货单')
}

function addSelected() {
  if (!selectedProduct.value) return
  const result = store.addToCart(selectedProduct.value, selectedSkuId.value)
  if (result === 'sku-required') return toast('请先选择商品规格')
  if (result === 'out-of-stock') return toast(store.checkoutError || '该规格库存不足')
  sheet.value = 'cart'
  toast('已加入进货单')
}

function openCart() {
  sheet.value = 'cart'
}

function goCheckout() {
  remark.value = ''
  sheet.value = 'checkout'
}

function submitOrder() {
  if (!store.submitOrder(remark.value)) return toast(store.checkoutError || '进货单为空')
  sheet.value = 'order'
  selectedOrderId.value = store.orders[0].id
  activeTab.value = 'orders'
  toast('订单已提交')
}

function openOrder(id: string) {
  selectedOrderId.value = id
  sheet.value = 'order'
}

function advanceOrder(id: string) {
  if (!store.advanceOrder(id)) return toast('订单已全部完成')
  toast('订单状态已推进')
}

function confirmReceipt(id: string) {
  if (!store.confirmReceipt(id)) return toast('当前订单状态无法确认收货')
  toast('已确认收货')
}

function cancelOrder(id: string) {
  uni.showModal({
    title: '取消进货单',
    content: '确认取消该进货单？取消后中台将标记为未支付取消。',
    success: (res) => {
      if (!res.confirm) return
      if (!store.cancelOrder(id)) return toast('当前订单状态不可取消')
      toast('订单已取消')
    }
  })
}

function submitStoreAfterSale(id: string) {
  uni.showModal({
    title: '发起售后',
    content: '确认对这笔进货单发起售后？平台受理后将进入售后结算处理。',
    success: (res) => {
      if (!res.confirm) return
      if (!store.initiateAfterSale(id)) return toast('该订单已发起售后或状态不可售后')
      toast('售后已发起，等待平台处理')
    }
  })
}

function repeatOrder(id: string) {
  if (!store.repeatOrder(id)) return toast(store.checkoutError || '订单商品当前无库存')
  sheet.value = 'cart'
  toast('订单商品已加入进货单')
}

function makePhoneCall() {
  uni.makePhoneCall({ phoneNumber: store.info.phone, fail: () => toast('当前环境不支持拨号，请复制联系电话') })
}

function copyAddress() {
  uni.setClipboardData({ data: `${store.info.name} ${store.info.contact} ${store.info.phone} ${store.info.address}`, success: () => toast('收货信息已复制') })
}

function copyPhone() {
  uni.setClipboardData({ data: store.info.phone, success: () => toast('客服电话已复制') })
}

const loginTab = ref<'password' | 'code'>('password')
const loginPhone = ref('13800000000')
const loginPassword = ref('123456')
const loginCode = ref('123456')
const codeCountdown = ref(0)
let codeTimer: ReturnType<typeof setInterval> | null = null
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
  toast('登录成功')
}
function logout() {
  store.logout()
  toast('已退出登录')
}

let disposeKeyboardButtons: (() => void) | undefined
onMounted(async () => {
  disposeKeyboardButtons = installKeyboardButtonSupport()
  const scenario = uni.getLaunchOptionsSync().query?.mock
  if (scenario === 'empty' || scenario === 'failure') store.setMockScenario(scenario)
  await store.initialize()
  ensureStockDrafts()
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--farm-green', '#17633f')
    document.title = '门店订货商城'
  }
})
onBeforeUnmount(() => disposeKeyboardButtons?.())
</script>

<style scoped lang="scss">
.app-shell { width:100%; min-height:100vh; background:var(--farm-bg); padding-bottom:calc(72px + env(safe-area-inset-bottom)); }
.loading { min-height:100vh;display:grid;place-items:center;color:var(--farm-muted); }
.page-pad { padding:0 16px; }
.tab-page { min-height:100vh;padding-bottom:30px; }
.mobile-head { padding-top:calc(20px + env(safe-area-inset-top));padding-bottom:14px; }
.page-title { display:block;font-size:18px;font-weight:800; }
.page-sub { display:block;margin-top:5px;color:var(--farm-muted);font-size:11px; }

/* ===== 商城头部 ===== */
.mall-hero { padding:calc(30px + env(safe-area-inset-top)) 18px 22px;background:linear-gradient(135deg,#3c7a45,#1d5a2a 60%,#114a22);color:#fff; }
.mall-hero-title { display:block;font-size:22px;font-weight:800;letter-spacing:1px; }
.mall-hero-sub { display:block;margin-top:7px;font-size:11px;opacity:.9; }
.mall-hero-meta { display:flex;gap:14px;margin-top:14px; }
.mall-hero-meta text { font-size:10px;opacity:.92; }

/* ===== 商城运营数据条 ===== */
.shop-metrics { margin-top:14px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px; }
.shop-metrics view { padding:11px 6px;background:#fff;border:1px solid var(--farm-line);border-radius:9px;text-align:center; }
.shop-metrics small,.shop-metrics strong { display:block; }
.shop-metrics small { color:var(--farm-muted);font-size:9px; }
.shop-metrics strong { margin-top:5px;font-size:13px;color:var(--farm-green); }
.result-count { margin-top:13px;color:var(--farm-muted);font-size:9px; }

/* ===== 搜索 ===== */
.search-bar { height:42px;margin-top:14px;padding:0 12px;background:#fff;border:1px solid var(--farm-line);border-radius:7px;display:flex;align-items:center;gap:8px; }
.search-bar input { flex:1;height:100%;font-size:11px; }
.search-bar .ui-icon { filter:invert(45%); }

/* ===== 提示条 ===== */
.supply-note,.security-note { margin:14px 0;padding:12px;background:#fff9e9;border:1px solid #ecdfbd;border-radius:7px;display:flex;align-items:flex-start;gap:8px;color:#765c27;font-size:10px;line-height:1.5; }
.security-note { background:var(--farm-green-soft);border-color:#cfe2d6;color:#315e48; }
.supply-note b,.security-note b { font-weight:800; }
.policy-hint{margin:12px 0;padding:9px 12px;border-radius:7px;background:#eef5ef;border:1px solid #cfe2d6;color:#315e48;font-size:11px;font-weight:700}.policy-hint b{color:#17633f}
.note-emoji { flex:none; }

/* ===== 订单汇总 ===== */
.order-summary { display:flex;align-items:center;gap:14px;margin:12px 0 0;padding:11px 13px;background:#fff;border:1px solid var(--farm-line);border-radius:9px; }
.order-summary text { color:var(--farm-muted);font-size:10px; }
.order-summary text:first-child { font-weight:800;color:var(--farm-ink); }
.chip-count { display:inline-grid;place-items:center;min-width:17px;height:17px;margin-left:4px;padding:0 4px;border-radius:9px;background:var(--farm-green-soft);color:var(--farm-green);font-size:9px;font-weight:800;vertical-align:middle; }
.chips button.active .chip-count { background:rgba(255,255,255,.24);color:#fff; }

/* ===== 分类 chips ===== */
.chip-scroll { margin:13px -16px 0;width:calc(100% + 32px);white-space:nowrap;overflow-x:auto;overflow-y:hidden; }
.chips { width:max-content;padding:0 16px;display:flex;gap:7px; }
.chips button { height:34px;padding:0 12px;border-radius:17px;background:#fff;border:1px solid var(--farm-line);font-size:10px;color:var(--farm-muted); }
.chips button.active { color:#fff;background:var(--farm-green);border-color:var(--farm-green); }

/* ===== 商品双列网格 ===== */
.product-grid { display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:12px; }
.product-card { min-width:0;background:#fff;border:1px solid var(--farm-line);border-radius:16px;overflow:hidden; }
.product-image { height:128px;position:relative;width:100%;padding:0;border-radius:0;background:transparent;display:block; }
.product-image::after { display:none; }
.product-emoji { width:100%;height:128px;display:block; }
.product-image text { position:absolute;left:7px;top:7px;padding:4px 6px;border-radius:3px;background:var(--farm-green);color:#fff;font-size:8px;font-weight:700; }
.product-body { padding:10px; }
.item-title { display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:14px;font-weight:800;line-height:1.35;min-height:38px; }
.muted { display:block;color:var(--farm-muted);font-size:9px;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
.cost-line { display:flex;align-items:baseline;gap:6px;margin-top:8px; }
.cost-line strong { font-size:14px;color:var(--farm-red); }
.cost-line del { font-size:9.5px;color:var(--farm-muted); }
.cost-line span { margin-left:auto;font-size:9px;font-weight:700;color:#fff;background:var(--farm-red);border-radius:4px;padding:1px 5px; }
.product-foot { margin-top:0;display:flex;align-items:center;justify-content:space-between;gap:8px; }
.product-divider { height:1px;background:#eef0eb;margin:10px 0 9px; }
.product-stats { display:flex;align-items:center;gap:4px;min-width:0;flex:1; }
.product-stats text { color:var(--farm-muted);font-size:9px;white-space:nowrap; }
.product-stats .stat-dot { color:#c9cec9; }
.product-stats .stock-ok { color:var(--farm-green);font-weight:700; }
.product-stats .stock-low { color:#b8860b;font-weight:700; }
.product-stats .stock-out { color:var(--farm-red);font-weight:700; }
.product-foot button { width:34px;height:34px;border-radius:50%;background:var(--farm-green);display:grid;place-items:center;flex:none; }
.product-foot uni-button[disabled] { background:#c9cfc9; }
.product-foot button .ui-icon { filter:brightness(0) invert(1); }

/* ===== 底部购物车栏 ===== */
.cart-bar { position:fixed;left:12px;right:12px;bottom:calc(72px + env(safe-area-inset-bottom));height:54px;padding:6px 7px 6px 12px;background:#183a2b;color:#fff;border-radius:8px;z-index:22;display:flex;align-items:center;gap:10px;box-shadow:0 8px 25px rgba(0,0,0,.2); }
.cart-count { width:36px;height:36px;position:relative;border-radius:50%;background:#fff;display:grid;place-items:center;padding:0; }
.cart-count span { position:absolute;right:0;top:0;z-index:1;min-width:18px;height:18px;border-radius:9px;background:var(--farm-red);color:#fff;display:grid;place-items:center;font-size:8px; }
.cart-bar>view { flex:1; }
.cart-bar small,.cart-bar strong { display:block; }
.cart-bar small { opacity:.7;font-size:8px; }
.cart-bar strong { font-size:14px; }
.cart-bar>button:last-child { height:40px;padding:0 16px;border-radius:6px;background:#d2ae5b;color:#2c271b;font-weight:800;font-size:11px;display:inline-flex;align-items:center;justify-content:center; }

/* ===== 底部 tab ===== */
.tabbar { position:fixed;left:0;right:0;bottom:0;height:calc(66px + env(safe-area-inset-bottom));padding-bottom:calc(8px + env(safe-area-inset-bottom));background:rgba(255,255,255,.96);backdrop-filter:blur(10px);border-top:1px solid var(--farm-line);display:grid;grid-template-columns:repeat(3,1fr);z-index:20; }
.tabbar button { background:transparent;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:#8a918a;font-size:9px; }
.tab-icon-wrap { position:relative;display:grid;place-items:center; }
.tab-badge { position:absolute;top:-5px;right:-11px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:var(--farm-red);color:#fff;display:grid;place-items:center;font-size:8px;font-weight:800; }
.tabbar button.active { color:var(--farm-green);font-weight:800; }
.tabbar button.active .ui-icon { filter:invert(30%) sepia(18%) saturate(1320%) hue-rotate(98deg); }

/* ===== 弹层 ===== */
.sheet-mask { position:fixed;inset:0;background:rgba(14,25,19,.48);z-index:40;display:flex;align-items:flex-end; }
.sheet { width:100%;max-height:84vh;overflow-y:auto;background:#fff;border-radius:14px 14px 0 0;padding:8px 16px calc(22px + env(safe-area-inset-bottom)); }
.sheet-handle { width:38px;height:4px;border-radius:2px;background:#d8dbd4;margin:0 auto 9px; }
.sheet-head { height:46px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #eef0eb; }
.sheet-head>text { font-size:16px;font-weight:900; }
.sheet-head button { width:34px;height:34px;background:#f2f3ee;border-radius:50%;display:grid;place-items:center; }
.sheet-head uni-button { margin: 0; }
.sheet-list { display:grid; }
.sheet-line { min-height:76px;padding:10px 0;border-bottom:1px solid #eef0eb;display:grid;grid-template-columns:54px 1fr auto;gap:9px;align-items:center; }
.sheet-line image { width:54px;height:54px;border-radius:6px; }
.sheet-line text,.sheet-line strong { display:block; }
.sheet-line text { font-size:10px;line-height:1.35; }
.sheet-line small { display:block;margin-top:4px;color:var(--farm-muted);font-size:9px; }
.sheet-line strong { margin-top:5px;color:var(--farm-red);font-size:11px; }
.sheet-line.shortage { background:#fff8f2; }
.stepper { height:30px;display:grid;grid-template-columns:28px 28px 28px;border:1px solid var(--farm-line);border-radius:5px;overflow:hidden; }
.stepper button,.stepper text { display:grid;place-items:center;background:#fff;font-size:12px;margin:0; }
.stepper text { border-left:1px solid var(--farm-line);border-right:1px solid var(--farm-line); }
.stepper button:disabled { background:#eef0eb;color:#a3aaa3; }
.cart-error { display:block;margin:10px 0 0;padding:10px;border-radius:6px;background:#fae8e4;color:var(--farm-red);font-size:12px; }
.checkout-summary { padding-top:13px; }
.checkout-summary>view { display:flex;justify-content:space-between;margin-bottom:9px;font-size:10px; }
.checkout-summary .primary-button { margin-top:8px; }
.checkout-summary .save { color:var(--farm-green); }
.checkout-summary .remark { color:var(--farm-muted);font-size:10px;font-weight:600;text-align:right; }
.stock-list{max-height:320px;overflow-y:auto;border:1px solid var(--farm-line);border-radius:10px;padding:4px 10px;background:#fff}.stock-row{display:grid;grid-template-columns:1fr auto;gap:8px;padding:9px 0;border-bottom:1px solid #eef0eb}.stock-row:last-child{border-bottom:0}.stock-main text{font-size:11px;font-weight:800;display:block}.stock-main small{display:block;margin-top:3px;color:var(--farm-muted);font-size:9px}.stock-skus{display:flex;gap:6px;flex-wrap:wrap}.stock-sku{display:flex;align-items:center;gap:4px}.stock-sku text{font-size:9px;color:var(--farm-muted)}.stock-sku input{width:52px;height:28px;border:1px solid var(--farm-line);border-radius:5px;padding:0 6px;font-size:11px}.stock-actions{display:flex;gap:6px;align-items:center}.stock-actions .compact-button{min-height:28px;padding:0 8px;border-radius:5px;background:var(--farm-green);color:#fff;font-size:10px;font-weight:700}.stock-actions .compact-button.off{background:#f0f2ed;color:#687168}
.primary-button { width:100%;height:44px;border-radius:6px;background:var(--farm-green);color:#fff;font-weight:800;font-size:13px; }
.outline-button { width:100%;height:40px;border-radius:6px;background:#fff;color:var(--farm-green);border:1px solid #bad3c4;font-size:11px;font-weight:700; }
.empty { padding:50px 0;text-align:center;color:var(--farm-muted);font-size:11px; }
.empty-page { min-height:230px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--farm-muted); }
.empty-page text,.empty-page small { display:block; }
.empty-page text { margin-top:10px;font-size:12px;font-weight:800; }
.empty-page small { margin-top:5px;font-size:9px; }

/* ===== 商品详情 ===== */
.product-detail { padding-top:12px; }
.product-detail-emoji { width:100%;height:190px;display:block;border-radius:10px; }
.product-detail>text { display:block;margin-top:13px;font-size:17px;font-weight:900; }
.product-detail>small { display:block;margin-top:6px;color:var(--farm-muted);font-size:10px; }
.detail-price { display:flex;align-items:baseline;gap:6px;margin-top:12px; }
.detail-price strong { font-size:20px;color:var(--farm-red); }
.detail-price del { font-size:10px;color:var(--farm-muted); }
.detail-price span { margin-left:auto;font-size:9px;font-weight:700;color:#fff;background:var(--farm-red);border-radius:4px;padding:2px 6px; }
.sku-options { display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:14px; }
.sku-options button { min-height:56px;padding:11px 12px;border:1px solid #e0e4dd;border-radius:12px;background:#fff;text-align:left;display:flex;flex-direction:column;justify-content:center;transition:border-color .15s,background .15s; }
.sku-options button text,.sku-options button small { display:block; }
.sku-options button text { font-size:13px;font-weight:800;color:#23291f; }
.sku-options button small { margin-top:4px;color:#8a918a;font-size:10px; }
.sku-options button.active { border-color:var(--farm-green);background:var(--farm-green-soft);box-shadow:0 0 0 1px var(--farm-green); }
.sku-options button.active text { color:var(--farm-green); }
.sku-options button.active small { color:var(--farm-green); }
.sku-options button:disabled { opacity:.5; }
.product-detail-actions { display:grid;grid-template-columns:1fr 1.4fr;gap:9px;margin-top:15px; }
.product-detail-actions .outline-button,.product-detail-actions .primary-button { margin:0;height:44px; }

/* ===== 确认下单 ===== */
.checkout-form { padding-top:12px; }
.checkout-store { padding:13px;background:#f7f8f4;border:1px solid var(--farm-line);border-radius:7px;display:grid;gap:9px; }
.checkout-store view { display:flex;justify-content:space-between;gap:12px; }
.checkout-store small { color:var(--farm-muted);font-size:9px;flex:none; }
.checkout-store text { font-size:11px;font-weight:700;text-align:right; }
.form-group { margin-top:13px; }
.form-group>text { display:block;margin-bottom:9px;font-size:11px;font-weight:800; }
.form-group textarea { width:100%;height:76px;padding:10px;border:1px solid var(--farm-line);border-radius:6px;font-size:11px;background:#fff; }
.checkout-items { margin-top:13px;display:grid;gap:9px; }
.checkout-line { padding:9px 11px;background:#f7f8f4;border:1px solid var(--farm-line);border-radius:6px;display:flex;align-items:center;justify-content:space-between;gap:10px; }
.checkout-line text { font-size:10px; }
.checkout-line strong { color:var(--farm-red);font-size:11px;white-space:nowrap; }

/* ===== 订单 ===== */
.order-chips { padding:0; }
.order-list { margin-top:14px;display:grid;gap:11px; }
.order-card { width:100%;padding:13px;background:#fff;border:1px solid var(--farm-line);border-radius:14px;text-align:left;color:var(--farm-ink); }
.order-top { display:flex;align-items:center;justify-content:space-between;gap:10px; }
.order-no { font-size:11px;font-weight:800;color:var(--farm-muted); }
.status-badge { padding:3px 8px;border-radius:4px;font-size:9px;font-weight:700; }
.status-badge.submitted { background:#f2f3ee;color:#6e7368; }
.status-badge.accepted { background:#e8f0f7;color:#2b6a9c; }
.status-badge.shipped { background:#e7f2eb;color:#17633f; }
.status-badge.delivering { background:#fdf3df;color:#9a722b; }
.status-badge.received { background:#e7f2eb;color:#17633f; }
.status-badge.completed { background:#eef0eb;color:#6e7368; }
.order-main { margin-top:11px;display:flex;align-items:center;gap:11px; }
.order-emoji { width:56px;height:56px;border-radius:10px;display:block;flex-shrink:0; }
.order-info { flex:1;min-width:0; }
.order-title { display:block;font-size:12px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
.order-info small { display:block;margin-top:5px;color:var(--farm-muted);font-size:9px; }
.order-bottom { margin-top:11px;padding-top:10px;border-top:1px solid #eef0eb;display:flex;align-items:center;gap:8px; }
.order-bottom small { color:var(--farm-green);font-size:9px; }
.order-bottom strong { margin-left:auto;font-size:14px;color:var(--farm-red); }
.order-bottom .ui-icon { filter:invert(45%); }

/* ===== 订单详情 ===== */
.order-detail { padding-top:12px; }
.order-detail-head { display:flex;align-items:center;justify-content:space-between;gap:10px; }
.order-detail-head>text { font-size:13px;font-weight:900; }
.steps { margin-top:14px;display:grid;grid-template-columns:repeat(6,1fr);gap:2px; }
.step { text-align:center;position:relative; }
.step::after { content:'';position:absolute;left:50%;top:9px;width:100%;height:2px;background:#dfe2dc; }
.step:last-child::after { display:none; }
.step.done::after { background:var(--farm-green); }
.step-dot { width:18px;height:18px;margin:0 auto;border-radius:50%;background:#dfe2dc;color:#fff;font-size:9px;display:grid;place-items:center;position:relative;z-index:1; }
.step.done .step-dot { background:var(--farm-green); }
.step.current .step-dot { background:var(--farm-red);box-shadow:0 0 0 3px rgba(169,71,61,.18); }
.step small { display:block;margin-top:6px;color:var(--farm-muted);font-size:8px; }
.step.current small { color:var(--farm-red);font-weight:800; }
.logistics { margin-top:14px;padding:12px;background:#f7f8f4;border:1px solid var(--farm-line);border-radius:8px;display:grid;gap:11px; }
.log-event { display:flex;gap:9px; }
.log-dot { width:7px;height:7px;margin-top:4px;border-radius:50%;background:var(--farm-green);flex:none; }
.log-event:first-child .log-dot { box-shadow:0 0 0 3px rgba(23,99,63,.16); }
.log-event text,.log-event small { display:block; }
.log-event text { font-size:11px;font-weight:800; }
.log-event small { margin-top:3px;color:var(--farm-muted);font-size:9px;line-height:1.5; }
.order-items { margin-top:14px;display:grid;gap:9px; }
.order-item-line { min-height:64px;padding:9px;background:#f7f8f4;border:1px solid var(--farm-line);border-radius:7px;display:grid;grid-template-columns:48px 1fr auto;gap:9px;align-items:center; }
.order-item-line image { width:48px;height:48px;border-radius:5px; }
.order-item-line text,.order-item-line small { display:block; }
.order-item-line text { font-size:11px;font-weight:800; }
.order-item-line small { margin-top:4px;color:var(--farm-muted);font-size:9px; }
.order-item-line strong { font-size:11px;color:var(--farm-red);white-space:nowrap; }
.order-actions { margin-top:16px;display:grid;gap:9px; }
.after-sale-status{margin-top:14px;padding:10px 12px;border-radius:7px;background:#fff3e8;border:1px solid #f2d9b8;color:#9a6b1f;font-size:11px;font-weight:700}

/* ===== 门店工作台 ===== */
.store-hero { padding:calc(28px + env(safe-area-inset-top)) 18px 20px;background:linear-gradient(135deg,#3a566f,#243a4f);color:#fff; }
.store-hero-top small { display:block;margin-top:5px;color:rgba(255,255,255,.7);font-size:10px; }
.store-identity { margin-top:18px;display:flex;align-items:center;gap:12px; }
.store-emoji { width:50px;height:50px;border-radius:14px;display:block;flex-shrink:0; }
.store-identity text,.store-identity small { display:block; }
.store-identity text { font-size:15px;font-weight:800; }
.store-identity small { margin-top:4px;font-size:9px;opacity:.75; }
.metric-band { margin-top:18px;display:grid;grid-template-columns:repeat(3,1fr);background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.14);border-radius:10px; }
.metric-band view { padding:12px 6px;text-align:center;border-right:1px solid rgba(255,255,255,.14); }
.metric-band view:last-child { border:0; }
.metric-band text,.metric-band strong { display:block; }
.metric-band text { color:rgba(255,255,255,.72);font-size:9px; }
.metric-band strong { margin-top:5px;font-size:14px; }
.store-metrics { grid-template-columns:repeat(4,1fr); }
.store-body { padding-top:16px; }
.section-head { padding:0 0 10px;display:flex;align-items:center;justify-content:space-between; }
.section-head>view { display:flex;align-items:center;gap:7px; }
.section-head span { width:3px;height:16px;background:var(--farm-green);border-radius:2px; }
.section-head text { font-size:15px;font-weight:900; }
.quick-grid { margin:0 -16px;display:flex;gap:8px; }
.quick-grid button { flex:1 1 0;min-width:0;width:100%;min-height:96px;padding:8px 4px;background:#fff;border:1px solid var(--farm-line);border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;font-size:11px;color:var(--farm-ink); }
.quick-grid button small { display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--farm-muted);font-size:8px;line-height:1.3; }
.hot-list { display:grid;gap:9px;background:#fff;border:1px solid var(--farm-line);border-radius:12px;padding:12px; }
.hot-item { display:grid;grid-template-columns:20px 40px 1fr auto;gap:9px;align-items:center; }
.hot-rank { width:20px;height:20px;border-radius:6px;background:var(--farm-green-soft);color:var(--farm-green);display:grid;place-items:center;font-size:10px;font-weight:800; }
.hot-item:nth-child(1) .hot-rank { background:var(--farm-gold);color:#fff; }
.hot-item:nth-child(2) .hot-rank { background:#d9c78f;color:#fff; }
.hot-emoji { width:40px;height:40px;border-radius:9px;display:block;flex-shrink:0; }
.hot-main { min-width:0; }
.hot-main text,.hot-main small { display:block; }
.hot-main text { font-size:11px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
.hot-main small { margin-top:4px;color:var(--farm-muted);font-size:9px; }
.hot-item strong { font-size:12px;color:var(--farm-red);white-space:nowrap; }
.quick-grid .ui-icon { filter:invert(30%) sepia(18%) saturate(1320%) hue-rotate(98deg); }
.info-list { display:grid;gap:0;background:#fff;border:1px solid var(--farm-line);border-radius:10px;overflow:hidden; }
.info-list>view { min-height:46px;padding:0 13px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #eef0eb; }
.info-list>view:last-child { border:0; }
.info-list small { color:var(--farm-muted);font-size:10px;flex:none; }
.info-list text { font-size:11px;font-weight:700;text-align:right; }
.member-footer { margin-top:22px;padding-bottom:10px;text-align:center;color:var(--farm-muted);font-size:9px; }

/* ===== 联系客服 ===== */
.contact-sheet { padding-top:12px; }
.contact-hero { padding:20px 16px;background:linear-gradient(135deg,#3a566f,#243a4f);border-radius:12px;color:#fff;text-align:center; }
.contact-hero .ui-icon { margin:0 auto;filter:brightness(0) invert(1); }
.contact-hero text { display:block;margin-top:10px;font-size:15px;font-weight:900; }
.contact-hero small { display:block;margin-top:6px;font-size:10px;opacity:.75;line-height:1.5; }
.contact-rows { margin-top:13px;display:grid;background:#fff;border:1px solid var(--farm-line);border-radius:10px;overflow:hidden; }
.contact-row { min-height:46px;padding:0 13px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #eef0eb; }
.contact-row:last-child { border:0; }
.contact-row small { color:var(--farm-muted);font-size:10px;flex:none; }
.contact-row text { font-size:11px;font-weight:700;text-align:right; }
.contact-actions { margin-top:15px;display:grid;gap:9px; }
.contact-actions .primary-button,
.contact-actions .outline-button { height:44px;margin:0; }

/* ===== 收货地址 ===== */
.address-sheet { padding-top:12px; }
.address-card { padding:14px;background:#f7f8f4;border:1px solid var(--farm-line);border-radius:8px;display:grid;gap:8px; }
.address-card small { color:var(--farm-muted);font-size:9px; }
.address-card text { font-size:12px;font-weight:800;line-height:1.5; }
.address-note { display:block;margin:12px 2px;color:var(--farm-muted);font-size:10px;line-height:1.6; }

/* ===== 状态页 ===== */
.state-page { min-height:100vh;padding:24px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:var(--farm-muted);text-align:center; }
.state-page .primary-button { max-width:240px; }
.emoji-thumb { flex:none;display:grid;place-items:center; }
.chip-scroll { scrollbar-width:none; }
.chip-scroll::-webkit-scrollbar { display:none; }

/* ===== 键盘可访问 ===== */
.app-shell button:focus-visible,.app-shell input:focus-visible,.app-shell textarea:focus-visible { outline:3px solid rgba(23,99,63,.28);outline-offset:2px; }

@media (min-width:700px) {
  .app-shell { max-width:430px;margin:0 auto;box-shadow:0 0 0 1px #e1e3dc; }
  .tabbar { left:50%;right:auto;width:430px;transform:translateX(-50%); }
  .cart-bar { left:50%;right:auto;width:406px;transform:translateX(-50%); }
  .sheet { max-width:430px;margin:0 auto; }
  .sheet-mask { justify-content:center; }
}

/* ===== 按钮文字水平垂直居中（uni-button 默认 display:block 文字顶对齐，导致固定高度按钮文字偏上） ===== */
.chips uni-button,
.primary-button,
.outline-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 0;
}

/* ===== 圆形/小图标按钮内容居中（uni-button 默认 padding:0 14px 挤压内容，导致图标右偏） ===== */
.product-foot uni-button,
.cart-count,
.sheet-head uni-button,
.stepper uni-button {
  padding: 0;
}

/* ===== 清除 uni-button 默认边框 ===== */
.chips uni-button::after, .primary-button::after, .outline-button::after,
.product-foot uni-button::after, .cart-count::after, .sheet-head uni-button::after,
.stepper uni-button::after, .login-tabs uni-button::after, .tabbar uni-button::after,
.code-button::after, .login-button::after, .logout-button::after, .quick-grid uni-button::after { border: none; }
.chips uni-button:active, .quick-grid uni-button:active, .primary-button:active, .outline-button:active { opacity: .88; }

/* ===== 登录页 ===== */
.login-page{min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(160deg,#0e3a26,#17633f 58%,#2f8a5b);padding:24px}
.login-card{width:min(360px,100%);background:#fff;border-radius:20px;padding:30px 26px 24px;box-shadow:0 24px 60px -24px rgba(0,0,0,.45)}
.login-head{display:flex;flex-direction:column;align-items:center;gap:8px;margin-bottom:24px}
.login-logo{width:56px;height:56px;border-radius:16px;display:block}
.login-title{font-size:19px;font-weight:800;color:#123}
.login-sub{font-size:11.5px;color:#8a9a90}
.login-tabs{display:flex;background:#f1f5f2;border-radius:11px;padding:4px;margin-bottom:18px}
.login-tabs button{flex:1;min-height:38px;border-radius:8px;font-size:13.5px;font-weight:700;color:#6b7a70;display:flex;align-items:center;justify-content:center}
.login-tabs button.active{background:#fff;color:#17633f;box-shadow:0 2px 8px rgba(23,99,63,.12)}
.login-fields{display:flex;flex-direction:column;gap:14px;margin-bottom:20px}
.login-field{display:flex;flex-direction:column;gap:6px}
.login-field text{font-size:12px;color:#5a6a60;font-weight:700}
.login-field input{height:46px;border:1px solid #dfe7e1;border-radius:10px;padding:0 14px;font-size:14px;background:#fafcfb}
.code-input{display:flex;gap:10px}
.code-input input{flex:1;min-width:0}
.code-button{min-height:46px;padding:0 14px;border-radius:10px;background:#17633f;color:#fff;font-size:13px;font-weight:700;white-space:nowrap;display:inline-flex;align-items:center;justify-content:center}
.code-button[disabled]{opacity:.55}
.login-button{min-height:46px;border-radius:11px;background:linear-gradient(135deg,#17633f,#2f8a5b);color:#fff;font-size:15px;font-weight:800;display:flex;align-items:center;justify-content:center}
.login-hint{display:block;text-align:center;margin-top:16px;font-size:11.5px;color:#8a9a90}
.logout-button{width:100%;min-height:42px;margin:14px 0 4px;border-radius:12px;background:#f1f5f2;color:#555;font-size:13.5px;font-weight:700;border:1px solid #e2eae4;display:flex;align-items:center;justify-content:center}

</style>
