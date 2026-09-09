<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app'
import type { BusinessMediaValue, Booking, CAddress, FarmExperience, Product, Role, StoreAccount, StoreRole, StorefrontOrder } from '@agritainment/shared'
import { PLATFORM_AFTERSALES_STORAGE_KEY, PLATFORM_BINDINGS_STORAGE_KEY, PLATFORM_BOOKINGS_STORAGE_KEY, PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_COMMISSION_LEDGER_STORAGE_KEY, PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_EXPERIENCES_STORAGE_KEY, PLATFORM_MEDIA_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY, PLATFORM_SHARE_CONFIG_STORAGE_KEY, PLATFORM_SHARES_STORAGE_KEY, PLATFORM_STORE_ACCOUNTS_STORAGE_KEY, PLATFORM_STORE_CATALOG_SELECTIONS_STORAGE_KEY, PLATFORM_VOUCHERS_STORAGE_KEY, calcMargin, createPlatformDictionaryCache, defaultProductCategoryImage, displayProductTags, formatNumber, initialCatalogOrderQuantity, installKeyboardButtonSupport, isExpressDeliverable, mediaValueToImage, money, normalizeMinimumOrderQuantity, productCategoryImage, readPlatformAfterSaleStatus, readPlatformAfterSales, readPlatformDictionaries, readPlatformRecoveryQueue, readCatalogState, readPlatformEntities, readPlatformOrderStatus, subscribePlatformChanges, validateCatalogSkuOrderQuantity } from '@agritainment/shared'
import { BusinessImage, ImageUploader } from '@agritainment/ui'
import UiIcon from '../../components/UiIcon.vue'
// #ifdef H5
import qrcode from 'qrcode-generator'
// #endif
import { seedDemoFarmhouseCart } from '../../data/demo-cart'
import { farmhouseBookingStatusText, farmhouseBookingVerificationError, isActiveBookingStatus, useFarmhouseStore, type FoodItem, type Room } from '../../stores/farmhouse'

type TabKey = 'home' | 'reserve' | 'shop' | 'member'
type WorkView = 'select' | 'verify' | 'design-rooms' | 'design-foods' | 'design-experiences' | 'staff-admin' | 'orders' | 'bookings' | 'ledger' | 'addresses' | 'checkout' | 'help' | null
type SheetKey = 'login' | 'cart' | 'orders' | 'bookings' | 'room-form' | 'food-form' | 'experience-form' | 'share' | 'product' | 'contact' | 'foods' | 'ledger' | 'recharge' | 'identity' | 'help' | 'booking-form' | 'after-sale' | 'service' | 'staff-form' | 'staff-promo' | 'pay' | null
type PayContext = { kind: 'service' | 'mall'; title: string; summary: string; amount: number }

let disposePlatformChanges: (() => void) | null = null
let disposeStorageSync: (() => void) | null = null
let disposeVisibilitySync: (() => void) | null = null
let runtimeFarm: unknown

const store = useFarmhouseStore()
const dictCache = createPlatformDictionaryCache()
const dictionaryState = ref(readPlatformDictionaries())
let disposeDictionaryImages: () => void = () => undefined
let disposeKeyboardButtons: () => void = () => undefined
const platformChangeKeys = [PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_STORE_CATALOG_SELECTIONS_STORAGE_KEY, PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_MEDIA_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY, PLATFORM_AFTERSALES_STORAGE_KEY, PLATFORM_BOOKINGS_STORAGE_KEY, PLATFORM_VOUCHERS_STORAGE_KEY, PLATFORM_COMMISSION_LEDGER_STORAGE_KEY, PLATFORM_STORE_ACCOUNTS_STORAGE_KEY, PLATFORM_EXPERIENCES_STORAGE_KEY, PLATFORM_SHARE_CONFIG_STORAGE_KEY, PLATFORM_SHARES_STORAGE_KEY, PLATFORM_BINDINGS_STORAGE_KEY]
const refreshSharedState = () => void store.initialize(true, runtimeFarm)
const activeTab = ref<TabKey>('home')
const workView = ref<WorkView>(null)
const verifyKeyword = ref('')
const roomKeyword = ref('')
const foodKeyword = ref('')
const selectKeyword = ref('')
const staffKeyword = ref('')
const orderKeyword = ref('')
const bookingKeyword = ref('')
const ledgerKeyword = ref('')
const deliveryMode = ref<'pickup' | 'courier'>('pickup')
const selectedAddressId = ref('')
const addressReturnContext = ref<'member' | 'cart' | 'checkout'>('member')
const addressFormOpen = ref(false)
const addressForm = reactive({ id: '', receiver: '', phone: '', region: ['湖南省', '长沙市', '岳麓区'], detail: '', isDefault: false })
const selectedDeliveryAddress = computed(() => store.addresses.find((address) => address.id === selectedAddressId.value) || store.defaultAddress || null)
const cartCategory = ref<'community' | 'express'>('community')
const selectedCartLineKeys = reactive(new Set<string>())
const checkoutLineRefs = ref<Array<{ productId: string; skuId: string }>>([])
const checkoutRemark = ref('')
const cartLineKey = (line: { productId: string; skuId: string }) => `${line.productId}-${line.skuId}`
const cartLineCategory = (line: { productId: string }) => {
  const product = store.products.find((item) => item.id === line.productId)
  return product && isExpressDeliverable(product) ? 'express' as const : 'community' as const
}
const cartCategoryItems = computed(() => store.cart.filter((line) => cartLineCategory(line) === cartCategory.value))
const selectedCartItems = computed(() => cartCategoryItems.value.filter((line) => selectedCartLineKeys.has(cartLineKey(line))))
const selectedCartCount = computed(() => selectedCartItems.value.reduce((sum, line) => sum + line.quantity, 0))
const selectedCartTotal = computed(() => selectedCartItems.value.reduce((sum, line) => sum + line.price * line.quantity, 0))
const cartCategoryAllSelected = computed(() => !!cartCategoryItems.value.length && cartCategoryItems.value.every((line) => selectedCartLineKeys.has(cartLineKey(line))))
const cartCategoryHasUnavailable = computed(() => selectedCartItems.value.some((line) => line.unavailable))
const cartCategoryCount = (category: 'community' | 'express') => store.cart.filter((line) => cartLineCategory(line) === category).reduce((sum, line) => sum + line.quantity, 0)
const checkoutItems = computed(() => checkoutLineRefs.value.map((ref) => store.cart.find((line) => line.productId === ref.productId && line.skuId === ref.skuId)).filter((line): line is typeof store.cart[number] => !!line))
const checkoutTotal = computed(() => checkoutItems.value.reduce((sum, line) => sum + line.price * line.quantity, 0))
const checkoutIsCourier = computed(() => deliveryMode.value === 'courier')
const checkoutCanPayWithBalance = computed(() => store.balance >= checkoutTotal.value)
const sheet = ref<SheetKey>(null)
const category = ref('全部')
const shopKeyword = ref('')
const reserveType = ref<'room' | 'package'>('room')
const bookingDates = Array.from({ length: 5 }, (_, offset) => {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  const prefix = offset === 0 ? '今天' : offset === 1 ? '明天' : `周${'日一二三四五六'[date.getDay()]}`
  return `${prefix} ${date.getMonth() + 1}月${date.getDate()}日`
})
const booking = reactive({ name: '观溪雅间', date: bookingDates[1], session: '晚市 17:30', people: 6 })
const experienceList = computed(() => {
  const farmId = store.tenant?.farmId || store.farm?.id || 'F001'
  return store.experiences.filter((item) => item.farmId === farmId && item.status === 'active')
})
const retailPrices = reactive<Record<string, number>>({})
const retailDraft = reactive<Record<string, number>>({})
const rechargeAmount = ref(100)
const selectedProduct = ref<Product | null>(null)
const productView = ref(false)
const selectedService = ref<FarmExperience | null>(null)
const serviceBooking = reactive({ date: bookingDates[1], people: 2 })
const bookingAmounts = reactive<Record<string, string>>({})
const serviceFee = computed(() => (selectedService.value ? selectedService.value.price * serviceBooking.people : 0))
const payContext = ref<PayContext | null>(null)
const payMethod = ref<'balance' | 'wechat'>('balance')
const paying = ref(false)
const canPayWithBalance = computed(() => !!payContext.value && store.balance >= payContext.value.amount)
const selectedSkuId = ref('')
const selectedSku = computed(() => selectedProduct.value?.skus.find((sku) => sku.id === selectedSkuId.value) || selectedProduct.value?.skus[0] || null)
const canPromote = computed(() => store.role !== 'customer')

function cartLineDeliveryMode(line: { productId: string }): 'pickup' | 'courier' {
  return cartLineCategory(line) === 'express' ? 'courier' : 'pickup'
}

function resetCheckoutDeliveryState() {
  selectedAddressId.value = ''
  deliveryMode.value = 'pickup'
  checkoutLineRefs.value = []
  checkoutRemark.value = ''
}

function syncSelectedCartLines() {
  const currentKeys = new Set(store.cart.map(cartLineKey))
  store.cart.forEach((line) => {
    const key = cartLineKey(line)
    if (!selectedCartLineKeys.has(key)) selectedCartLineKeys.add(key)
  })
  Array.from(selectedCartLineKeys).forEach((key) => { if (!currentKeys.has(key)) selectedCartLineKeys.delete(key) })
  if (!store.cart.some((line) => cartLineCategory(line) === cartCategory.value)) {
    cartCategory.value = store.cart.some((line) => cartLineCategory(line) === 'community') ? 'community' : 'express'
  }
}

function syncCheckoutLines() {
  const validRefs = checkoutLineRefs.value.filter((ref) => store.cart.some((line) => line.productId === ref.productId && line.skuId === ref.skuId))
  if (validRefs.length === checkoutLineRefs.value.length) return
  if (validRefs.length) checkoutLineRefs.value = validRefs
  else resetCheckoutDeliveryState()
}

function toggleCartLine(line: { productId: string; skuId: string }) {
  const key = cartLineKey(line)
  if (selectedCartLineKeys.has(key)) selectedCartLineKeys.delete(key)
  else selectedCartLineKeys.add(key)
}

function toggleAllCartLines() {
  if (cartCategoryAllSelected.value) cartCategoryItems.value.forEach((line) => selectedCartLineKeys.delete(cartLineKey(line)))
  else cartCategoryItems.value.forEach((line) => selectedCartLineKeys.add(cartLineKey(line)))
}

watch(() => store.cart, (cart) => {
  syncSelectedCartLines()
  syncCheckoutLines()
  if (!cart.length) resetCheckoutDeliveryState()
}, { deep: true })

function minimumOrderQuantity(sku: Pick<Product['skus'][number], 'minimumOrderQuantity'> | null | undefined) {
  return normalizeMinimumOrderQuantity(sku?.minimumOrderQuantity)
}

function canStartOrder(sku: Pick<Product['skus'][number], 'stock' | 'minimumOrderQuantity'> | null | undefined) {
  return !!sku && validateCatalogSkuOrderQuantity(sku, minimumOrderQuantity(sku)).ok
}

function canStartProductOrder(product: Product) {
  return product.skus.some((sku) => canStartOrder(sku))
}

const tabs: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'home', label: '门店', icon: 'house' },
  { key: 'reserve', label: '预订', icon: 'calendar-days' },
  { key: 'shop', label: '商城', icon: 'shopping-bag' },
  { key: 'member', label: '会员', icon: 'crown' }
]

const categories = computed(() => ['全部', ...Array.from(new Set(store.products.map((item) => item.category)))])
const catalogPackages = computed(() => {
  const farmId = store.tenant?.farmId || store.farm?.id || 'F001'
  const state = readCatalogState()
  if (!state) return []
  return state.products.filter((item) => item.productType === 'package' && (item.farmIds || []).includes(farmId) && item.status === 'active')
})
const activePolicies = computed(() => Object.values(readPlatformEntities()?.policies || {}).filter((item) => item.enabled))
const shopOrder = ['P001', 'P002', 'P010', 'P007', 'P008', 'P004', 'P005', 'P006']
const visibleProducts = computed(() => {
  const order = new Map(shopOrder.map((id, i) => [id, i]))
  return store.products
    .filter((item) => {
      const matchesCategory = category.value === '全部' || item.category === category.value
      return matchesCategory && store.isListed(item.id)
    })
    .sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99))
})
const waterfallColumns = computed(() => [
  visibleProducts.value.filter((_, index) => index % 2 === 0),
  visibleProducts.value.filter((_, index) => index % 2 === 1)
])
const roleNames: Record<Role, string> = { customer: '顾客', staff: '店员', manager: '店长' }

function toast(title: string) {
  uni.showToast({ title, icon: 'none' })
}

function retryLoad() {
  store.setMockScenario('normal')
  store.initialize(true)
}

function chooseTab(key: TabKey) {
  workView.value = null
  activeTab.value = key
  uni.pageScrollTo({ scrollTop: 0, duration: 0 })
}

function openReservation(type: 'room' | 'package', name: string) {
  reserveType.value = type
  booking.name = name
  chooseTab('reserve')
}

function openBookingForm(type: 'room' | 'package', name: string, people: number) {
  reserveType.value = type
  booking.name = name
  booking.people = people
  sheet.value = 'booking-form'
}

function openService(service: FarmExperience) {
  selectedService.value = service
  sheet.value = 'service'
}

function submitServiceOrder() {
  if (!requireLogin(() => submitServiceOrder())) return
  const service = selectedService.value
  if (!service) return
  if (service.status !== 'active') return toast('该体验暂不可下单')
  openPaySheet({
    kind: 'service',
    title: service.name,
    summary: `${serviceBooking.date} · ${serviceBooking.people} 人`,
    amount: service.price * serviceBooking.people
  })
}

function openCategoryCheckout() {
  if (!requireLogin(() => openCategoryCheckout())) return
  if (!selectedCartItems.value.length) return toast('请选择要结算的商品')
  if (cartCategoryHasUnavailable.value) return toast('选中商品库存不足或购买数量未达要求')
  checkoutLineRefs.value = selectedCartItems.value.map((line) => ({ productId: line.productId, skuId: line.skuId }))
  deliveryMode.value = cartCategory.value === 'express' ? 'courier' : 'pickup'
  checkoutRemark.value = ''
  payMethod.value = store.balance >= checkoutTotal.value ? 'balance' : 'wechat'
  sheet.value = null
  workView.value = 'checkout'
  if (deliveryMode.value === 'courier' && !selectedDeliveryAddress.value) openAddresses('checkout', true)
}

function openPaySheet(context: PayContext) {
  payContext.value = context
  payMethod.value = store.balance >= context.amount ? 'balance' : 'wechat'
  sheet.value = 'pay'
}

async function confirmPay() {
  if (paying.value || !payContext.value) return
  if (payMethod.value === 'balance' && store.balance < payContext.value.amount) return toast('余额不足，请改用微信支付或先充值')
  paying.value = true
  await new Promise((resolve) => setTimeout(resolve, 400))
  try {
    if (payContext.value.kind === 'service') {
      const service = selectedService.value
      if (!service || service.status !== 'active') return toast('该体验暂不可下单')
      const payload = { type: 'service' as const, name: service.name, date: serviceBooking.date, session: '到店体验', people: serviceBooking.people, image: mediaValueToImage(service.image), amount: service.price * serviceBooking.people }
      if (!store.payExperience(payload, payMethod.value)) return toast(store.checkoutError || '该日期已预约，请更换时间')
      sheet.value = null
      workView.value = 'bookings'
      toast('支付成功')
      return
    }
    if (!await store.checkout({ deliveryMode: deliveryMode.value, selectedLines: checkoutLineRefs.value, addressId: selectedDeliveryAddress.value?.id, payMethod: payMethod.value, remark: checkoutRemark.value })) return toast(store.checkoutError)
    resetCheckoutDeliveryState()
    sheet.value = null
    workView.value = 'orders'
    toast('支付成功')
  } finally {
    paying.value = false
  }
}

function chooseRole(role: Role) {
  store.setRole(role)
  if (role === 'customer') {
    workView.value = null
    sheet.value = null
  }
  toast(`已切换为${roleNames[role]}`)
}

function openProduct(product: Product) {
  selectedProduct.value = product
  selectedSkuId.value = product.skus[0].id
  productView.value = true
  sheet.value = null
}

function openSkuSheet(product: Product) {
  selectedProduct.value = product
  selectedSkuId.value = product.skus.find((sku) => canStartOrder(sku))?.id || product.skus[0]?.id || ''
  sheet.value = 'product'
}

function addProduct(product: Product, skuId?: string) {
  const result = store.addToCart(product, skuId)
  if (result === 'sku-required') return openSkuSheet(product)
  if (result === 'out-of-stock') return toast('该规格库存不足')
  toast('已加入购物车')
}

function addSelectedProduct() {
  if (!selectedProduct.value) return
  const result = store.addToCart(selectedProduct.value, selectedSkuId.value)
  if (result === 'sku-required') return toast('请先选择商品规格')
  if (result === 'out-of-stock') return toast('该规格库存不足')
  sheet.value = null
  toast('已加入购物车')
}

function closeProductView() {
  productView.value = false
}

function shareProduct(product: Product) {
  if (!requireLogin(() => shareProduct(product))) return
  const record = store.shareProductPromotion(product.id)
  if (record) uni.setClipboardData({ data: record.link, success: () => toast('商品推广链接已生成') })
}

function submitBooking() {
  if (!requireLogin(() => submitBooking())) return
  const bookingImage = reserveType.value === 'room' ? mediaValueToImage(store.rooms.find((room) => room.name === booking.name)?.image || '/static/images/mountain.webp') : '/static/images/farmhouse.webp'
  const payload: Omit<Booking, 'id' | 'status'> = { type: reserveType.value, ...booking, image: bookingImage }
  if (!store.submitBooking(payload)) return toast('该场次已预订，请更换时间')
  sheet.value = null
  workView.value = 'bookings'
  toast('预订成功')
}

async function checkout(payMethod?: 'balance' | 'wechat') {
  if (!requireLogin(() => checkout(payMethod))) return
  if (!checkoutLineRefs.value.length) return toast('请先从购物车选择商品')
  if (!await store.checkout({ deliveryMode: deliveryMode.value, selectedLines: checkoutLineRefs.value, addressId: selectedDeliveryAddress.value?.id, payMethod, remark: checkoutRemark.value })) return toast(store.checkoutError)
  resetCheckoutDeliveryState()
  sheet.value = null
  workView.value = 'orders'
  toast('订单提交成功')
}

function recharge() {
  sheet.value = 'recharge'
}

function confirmRecharge() {
  if (!requireLogin(() => confirmRecharge())) return
  if (!store.recharge(rechargeAmount.value)) return toast('请选择有效充值金额')
  sheet.value = null
  workView.value = 'ledger'
  toast(`已充值 ${money(rechargeAmount.value)}`)
}

function retailKey(productId: string, skuId: string) { return `${productId}:${skuId}` }
function getRetail(product: Product, skuId: string) {
  const key = retailKey(product.id, skuId)
  return retailPrices[key] ?? store.products.find((item) => item.id === product.id)?.skus.find((sku) => sku.id === skuId)?.price ?? product.skus.find((sku) => sku.id === skuId)?.price ?? 0
}

function listProduct(product: Product) {
  const listed = isListed(product)
  const prices = Object.fromEntries(product.skus.map((sku) => [sku.id, Number(retailDraft[retailKey(product.id, sku.id)] ?? getRetail(product, sku.id))]))
  if (!store.listProduct(product.id, prices)) return toast(store.checkoutError || '各规格零售价必须高于对应供货价')
  Object.entries(prices).forEach(([skuId, price]) => {
    retailPrices[retailKey(product.id, skuId)] = price
    retailDraft[retailKey(product.id, skuId)] = price
  })
  ensureStockDrafts()
  toast(listed ? '本店价格已更新' : '已上架到本店商城')
}

function isListed(product: Product) {
  return store.isListed(product.id)
}
function retailPreview(product: Product, skuId: string) {
  const key = retailKey(product.id, skuId)
  const draft = Number(retailDraft[key] ?? getRetail(product, skuId))
  return Number.isFinite(draft) && draft > 0 ? draft : getRetail(product, skuId)
}

function commitRetail(product: Product, skuId: string) {
  const key = retailKey(product.id, skuId)
  const sku = product.skus.find((item) => item.id === skuId)
  const draft = Number(retailDraft[key] ?? getRetail(product, skuId))
  if (!sku || !draft || draft <= 0) { toast('请输入有效的零售价'); retailDraft[key] = getRetail(product, skuId); return }
  if (draft <= sku.cost) { toast('零售价需高于供货价，不允许负毛利销售'); retailDraft[key] = getRetail(product, skuId); return }
  if (draft === getRetail(product, skuId)) return
  retailPrices[key] = draft
  toast('本店零售价已更新')
}

function sharePromotion() {
  if (!requireLogin(() => sharePromotion())) return
  const record = store.sharePromotion()
  if (record) uni.setClipboardData({ data: record.link, success: () => toast('推广链接已生成并复制') })
}

function copyPhone() {
  if (!store.tenant?.phone) return
  uni.setClipboardData({ data: store.tenant.phone, success: () => toast('联系电话已复制') })
}

const pendingAction = ref<(() => void) | null>(null)
const wechatLoggingIn = ref(false)
const accountLoggingIn = ref(false)
const accountLoginInput = ref('')
const accountPasswordInput = ref('')
const loginRole = ref<Role>('customer')
function requireLogin(action?: () => void) {
  if (store.auth.isLoggedIn) return true
  if (action) pendingAction.value = action
  loginRole.value = store.role
  sheet.value = 'login'
  return false
}
async function wechatLogin() {
  if (wechatLoggingIn.value) return
  wechatLoggingIn.value = true
  await store.wechatLogin()
  store.setRole(loginRole.value)
  wechatLoggingIn.value = false
  sheet.value = null
  toast(`已以${roleNames[loginRole.value]}身份登录`)
  const action = pendingAction.value
  pendingAction.value = null
  if (action) action()
}

function loginAccount() {
  if (accountLoggingIn.value) return
  if (!accountLoginInput.value.trim() || !accountPasswordInput.value) { toast('请输入账号和密码'); return }
  if (!store.loginWithAccount(accountLoginInput.value.trim(), accountPasswordInput.value)) { toast('账号或密码错误，或该账号未启用'); return }
  accountLoggingIn.value = false
  sheet.value = null
  toast(`已以${roleNames[store.role]}身份登录`)
  const action = pendingAction.value
  pendingAction.value = null
  if (action) action()
}
function logout() {
  store.logout()
  resetCheckoutDeliveryState()
  selectedCartLineKeys.clear()
  syncSelectedCartLines()
  sheet.value = null
  toast('已退出登录')
}

function makePhoneCall() {
  if (!store.tenant?.phone) return
  uni.makePhoneCall({ phoneNumber: store.tenant.phone, fail: () => toast('当前环境不支持拨号，请复制联系电话') })
}

function reminderNote() {
  return '预订成功后将自动发送到店提醒，到店出示订单核销即可。支持在线改期与退订。'
}


const afterSaleTarget = ref<{ id: string; type: 'refund' | 'return' } | null>(null)
const afterSaleEvidence = ref<BusinessMediaValue[]>([])

const experienceForm = reactive({ id: '', name: '', categoryCode: 'pick', description: '', price: 0, status: 'active' as FarmExperience['status'], image: '/static/images/field.webp' as BusinessMediaValue })
const editingExperienceId = ref('')
const experienceCategoryOptions = computed(() => dictCache.getOptions('serviceCategory'))
const bookingSessionOptions = computed(() => dictCache.getOptions('bookingSession'))
function openExperienceForm(experience?: FarmExperience) {
  editingExperienceId.value = experience?.id || ''
  Object.assign(experienceForm, experience ? { id: experience.id, name: experience.name, categoryCode: experience.categoryCode, description: experience.description, price: experience.price, status: experience.status, image: experience.image } : { id: '', name: '', categoryCode: 'pick', description: '', price: 0, status: 'active', image: '/static/images/field.webp' })
  sheet.value = 'experience-form'
}
function saveExperienceForm() {
  const farmId = store.tenant?.farmId || store.farm?.id || 'F001'
  const payload = { farmId, name: experienceForm.name.trim(), categoryCode: experienceForm.categoryCode, description: experienceForm.description.trim(), price: Math.max(0, Number(experienceForm.price) || 0), status: experienceForm.status, image: experienceForm.image, sort: 1 }
  if (!payload.name) return toast('请填写体验名称')
  const ok = editingExperienceId.value ? store.updateExperience(editingExperienceId.value, payload) : store.addExperience(payload)
  sheet.value = null
  toast(ok ? (editingExperienceId.value ? '体验已更新' : '体验已新增') : '保存失败')
}
function removeExperienceFn(experience: FarmExperience) {
  uni.showModal({ title: '删除体验', content: '确认删除「' + experience.name + '」？', success: (res) => { if (res.confirm) { store.removeExperience(experience.id); toast('体验已删除') } } })
}
const roomForm = reactive({ name: '', image: '/static/images/mountain.webp' as BusinessMediaValue, emoji: '🪟', capacity: '', sessions: '', status: '可预订' as Room['status'], people: 8 })
const editingRoomId = ref('')
const staffForm = reactive({ id: '', name: '', account: '', password: '', role: 'staff' as StoreRole, promoEnabled: false })
const staffQrDataUrl = ref('')
const currentStaffAccount = computed(() => store.storeAccounts.find((item) => item.id === store.loggedAccountId))
const myStaffPromoEnabled = computed(() => store.role === 'staff' && !!currentStaffAccount.value?.promoEnabled)
const myStaffAccounts = computed(() => store.storeAccounts.filter((item) => item.farmId === (store.tenant?.farmId || store.farm?.id || 'F001')))

const filteredVerifyBookings = computed(() => {
  const kw = verifyKeyword.value.trim().toLowerCase()
  if (!kw) return store.bookings
  return store.bookings.filter((item) => `${item.name}${item.date}${item.session}${item.status}`.toLowerCase().includes(kw))
})
const filteredRooms = computed(() => {
  const kw = roomKeyword.value.trim().toLowerCase()
  if (!kw) return store.rooms
  return store.rooms.filter((room) => `${room.name}${room.capacity}${room.status}`.toLowerCase().includes(kw))
})
const filteredFoods = computed(() => {
  const kw = foodKeyword.value.trim().toLowerCase()
  if (!kw) return store.foods
  return store.foods.filter((food) => `${food.name}${food.description}`.toLowerCase().includes(kw))
})
const filteredSelectable = computed(() => {
  const kw = selectKeyword.value.trim().toLowerCase()
  if (!kw) return store.selectableProducts
  return store.selectableProducts.filter((product) => `${product.name}${product.category}`.toLowerCase().includes(kw))
})
const filteredStaffAccounts = computed(() => {
  const kw = staffKeyword.value.trim().toLowerCase()
  if (!kw) return myStaffAccounts.value
  return myStaffAccounts.value.filter((acc) => `${acc.name}${acc.account}`.toLowerCase().includes(kw))
})
const filteredOrders = computed(() => {
  const kw = orderKeyword.value.trim().toLowerCase()
  if (!kw) return store.orders
  return store.orders.filter((order) => `${order.id}${orderTitle(order)}`.toLowerCase().includes(kw))
})
const filteredBookings = computed(() => {
  const kw = bookingKeyword.value.trim().toLowerCase()
  if (!kw) return store.bookings
  return store.bookings.filter((item) => `${item.name}${item.date}${item.session}`.toLowerCase().includes(kw))
})
const filteredLedger = computed(() => {
  const kw = ledgerKeyword.value.trim().toLowerCase()
  if (!kw) return store.balanceEntries
  return store.balanceEntries.filter((entry) => `${entry.description}${entry.amount}`.toLowerCase().includes(kw))
})

function openHelp() {
  workView.value = 'help'
}

function openAddresses(context: 'member' | 'cart' | 'checkout' = 'member', create = false) {
  if (!requireLogin(() => openAddresses(context, create))) return
  addressReturnContext.value = context
  if ((context === 'cart' || context === 'checkout') && !selectedDeliveryAddress.value) selectedAddressId.value = store.defaultAddress?.id || ''
  sheet.value = null
  workView.value = 'addresses'
  addressFormOpen.value = false
  if (create) openAddressForm()
}

function openAddressForm(address?: CAddress) {
  const region = address?.region.split(/\s+/).filter(Boolean)
  Object.assign(addressForm, {
    id: address?.id || '',
    receiver: address?.receiver || '',
    phone: address?.phone || '',
    region: region?.length === 3 ? region : ['湖南省', '长沙市', '岳麓区'],
    detail: address?.detail || '',
    isDefault: address ? address.isDefault : store.addresses.length === 0
  })
  addressFormOpen.value = true
}

function changeAddressRegion(event: { detail?: { value?: string[] } }) {
  const value = event.detail?.value
  if (Array.isArray(value) && value.length === 3) addressForm.region = value
}

function closeAddresses() {
  if (addressFormOpen.value) {
    addressFormOpen.value = false
    return
  }
  workView.value = null
  if (addressReturnContext.value === 'cart') sheet.value = 'cart'
  if (addressReturnContext.value === 'checkout') workView.value = 'checkout'
}

function saveAddress() {
  const receiver = addressForm.receiver.trim()
  const phone = addressForm.phone.trim()
  const detail = addressForm.detail.trim()
  if (!receiver || !phone || addressForm.region.some((item) => !item) || !detail) return toast('请完整填写收货地址')
  if (!/^1[3-9]\d{9}$/.test(phone)) return toast('请输入正确的大陆手机号')
  const saved = store.upsertAddress({
    id: addressForm.id || undefined,
    receiver,
    phone,
    region: addressForm.region.join(' '),
    detail,
    isDefault: addressForm.isDefault
  })
  if (!saved) return toast('地址保存失败，请检查填写内容')
  if (addressReturnContext.value === 'cart' || addressReturnContext.value === 'checkout') selectedAddressId.value = saved.id
  addressFormOpen.value = false
  toast('收货地址已保存')
  if (addressReturnContext.value === 'cart' || addressReturnContext.value === 'checkout') closeAddresses()
}

function chooseDeliveryAddress(address: CAddress) {
  if (addressReturnContext.value !== 'cart' && addressReturnContext.value !== 'checkout') return
  selectedAddressId.value = address.id
  closeAddresses()
}

function setDefaultAddress(id: string) {
  if (!store.setDefaultAddress(id)) return toast('默认地址设置失败')
  toast('已设为默认地址')
}

function confirmRemoveAddress(id: string) {
  uni.showModal({
    title: '删除地址',
    content: '确定删除这条收货地址吗？',
    confirmColor: '#c8493b',
    success: ({ confirm }) => {
      if (!confirm) return
      if (!store.removeAddress(id)) return toast('地址删除失败')
      if (selectedAddressId.value === id) selectedAddressId.value = store.defaultAddress?.id || ''
      toast('地址已删除')
    }
  })
}
const referrerText = computed(() => {
  const referrer = store.referrer
  if (!referrer?.name) return ''
  return `${referrer.type === 'staff' ? '店员' : '推客'}「${referrer.name}」推荐本店`
})
function openStaffForm(item?: StoreAccount) {
  editingRoomId.value = '' // reuse not needed
  if (item) {
    Object.assign(staffForm, { id: item.id, name: item.name, account: item.account, password: item.password, role: item.role, promoEnabled: !!item.promoEnabled })
  } else {
    Object.assign(staffForm, { id: '', name: '', account: '', password: '', role: 'staff', promoEnabled: false })
  }
  sheet.value = 'staff-form'
}
function saveStaffForm() {
  if (!staffForm.name.trim() || !staffForm.account.trim() || !staffForm.password.trim()) return toast('请填写姓名、账号和密码')
  const ok = staffForm.id ? store.updateStoreAccount(staffForm.id, { name: staffForm.name, account: staffForm.account, password: staffForm.password, role: staffForm.role, promoEnabled: staffForm.promoEnabled }) : store.addStoreAccount({ name: staffForm.name, account: staffForm.account, password: staffForm.password, role: staffForm.role, promoEnabled: staffForm.promoEnabled })
  if (!ok) return toast('保存失败：账号可能已存在')
  sheet.value = null
  toast('店员账号已保存并同步到中控台')
}
function openStaffPromo() {
  if (!myStaffPromoEnabled.value) return
  sheet.value = 'staff-promo'
  generateStaffQr()
}
function staffPromoLink() {
  const acc = currentStaffAccount.value
  if (!acc) return ''
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/#/pages/index/index?staff=${acc.id}&staffName=${encodeURIComponent(acc.name)}&farmId=${store.tenant?.farmId || ''}`
}
async function generateStaffQr() {
  // #ifdef H5
  try {
    const qr = qrcode(0, 'M')
    qr.addData(staffPromoLink())
    qr.make()
    const svg = qr.createSvgTag(4, 8)
    staffQrDataUrl.value = 'data:image/svg+xml;base64,' + btoa(svg)
  } catch (error) {
    console.error('qr generate failed', error)
    staffQrDataUrl.value = ''
  }
  // #endif
}
function copyStaffPromoLink() {
  uni.setClipboardData({ data: staffPromoLink(), success: () => toast('店员推广链接已复制') })
}
const foodForm = reactive({ name: '', description: '', price: 0, originalPrice: undefined as number | undefined, emoji: '', image: '/static/images/field.webp' as BusinessMediaValue })
const editingFoodId = ref('')

function openRoomForm(room?: Room) {
  editingRoomId.value = room?.id || ''
  roomForm.name = room?.name || ''
  roomForm.image = room?.image || '/static/images/mountain.webp'
  roomForm.emoji = room?.emoji || '🪟'
  roomForm.capacity = room?.capacity || ''
  roomForm.sessions = room?.sessions || ''
  roomForm.status = room?.status || '可预订'
  roomForm.people = room?.people || 8
  sheet.value = 'room-form'
}
function saveRoomForm() {
  const payload: Omit<Room, 'id'> = { name: roomForm.name.trim(), image: roomForm.image, emoji: roomForm.emoji.trim() || '🪟', capacity: roomForm.capacity.trim(), sessions: roomForm.sessions.trim(), status: roomForm.status, people: Math.max(1, Number(roomForm.people) || 8) }
  const ok = editingRoomId.value ? store.updateRoom(editingRoomId.value, payload) : store.addRoom(payload)
  if (!ok) return toast('请填写包厢名称')
  sheet.value = null
  toast(editingRoomId.value ? '包厢已更新' : '包厢已新增')
}
function removeRoom(id: string) {
  const room = store.rooms.find((item) => item.id === id)
  uni.showModal({
    title: '删除包厢',
    content: `确认删除「${room?.name || '该包厢'}」？删除后不可恢复。`,
    success: (res) => {
      if (!res.confirm) return
      if (!store.removeRoom(id)) return
      toast('包厢已删除')
    }
  })
}
function openFoodForm(food?: FoodItem) {
  editingFoodId.value = food?.id || ''
  foodForm.name = food?.name || ''
  foodForm.description = food?.description || ''
  foodForm.price = food?.price ?? 0
  foodForm.originalPrice = food?.originalPrice
  foodForm.emoji = food?.emoji || ''
  foodForm.image = food?.image || '/static/images/field.webp'
  sheet.value = 'food-form'
}
function saveFoodForm() {
  const payload = { name: foodForm.name.trim(), description: foodForm.description.trim(), price: foodForm.price, originalPrice: foodForm.originalPrice || undefined, image: foodForm.image }
  const ok = editingFoodId.value ? store.updateFood(editingFoodId.value, payload) : store.addFood(payload)
  if (!ok) return toast('请填写菜品名称且价格需大于 0')
  sheet.value = null
  toast(editingFoodId.value ? '菜品已更新' : '菜品已新增')
}
function removeFood(id: string) {
  const food = store.foods.find((item) => item.id === id)
  uni.showModal({
    title: '删除菜品',
    content: `确认删除「${food?.name || '该菜品'}」？删除后不可恢复。`,
    success: (res) => {
      if (!res.confirm) return
      if (!store.removeFood(id)) return
      toast('菜品已删除')
    }
  })
}
function verifyBooking(id: string) {
  const item = store.bookings.find((booking) => booking.id === id)
  if (!item) return toast('未找到该预约')
  const statusError = farmhouseBookingVerificationError(item.status)
  if (statusError) return toast(statusError)
  const amount = Number(bookingAmounts[id] || item.amount || 0)
  if (!Number.isFinite(amount) || amount <= 0) return toast('请填写本次预约实际消费金额')
  uni.showModal({
    title: '核销预订',
    content: `确认核销「${item.name}」，实际消费 ¥${amount.toFixed(2)}？核销后状态不可回退。`,
    success: (res) => {
      if (!res.confirm) return
      if (!store.verifyBooking(id, amount)) return toast('该预约当前不能核销，请刷新后重试')
      toast('核销成功')
    }
  })
}
function setBookingAmount(id: string, event: Event) {
  bookingAmounts[id] = (event.target as HTMLInputElement).value
}
async function verifyVoucher(id: string) {
  if (!await store.redeemVoucher(id)) return toast('券订单当前不能核销')
  toast('券订单核销成功')
}

async function refundVoucher(id: string) {
  if (!await store.refundVoucher(id)) return toast('券订单当前不能退款')
  toast('券订单已退款并冲正佣金')
}

function cancelBooking(id: string) {
  if (!requireLogin(() => cancelBooking(id))) return
  if (!store.cancelBooking(id)) return
  toast('预订已取消')
}



const platformOrderStatus = (orderId: string) => readPlatformOrderStatus(orderId)
const afterSaleStatusOf = (orderId: string) => readPlatformAfterSaleStatus(orderId)
const afterSaleFailureOf = (orderId: string) => Object.values(readPlatformAfterSales() || {}).find((item) => item.orderId === orderId)?.failureReason
const afterSaleRetryOf = (orderId: string) => {
  const operationId = Object.values(readPlatformAfterSales() || {}).find((item) => item.orderId === orderId)?.operationId
  const task = operationId ? readPlatformRecoveryQueue().find((item) => item.operationId === operationId && item.status === 'pending') : undefined
  return task ? `恢复重试 ${task.retryCount} 次` : ''
}
const stockDrafts = reactive<Record<string, Record<string, number>>>({})
function ensureStockDrafts() {
  store.selectableProducts.forEach((p) => {
    if (!stockDrafts[p.id]) stockDrafts[p.id] = {}
    p.skus.forEach((s) => { stockDrafts[p.id][s.id] = s.stock })
  })
}
function commitStock(product: Product) {
  const saved = product.skus.every((s) => {
    const value = stockDrafts[product.id]?.[s.id]
    return value === undefined || store.setSkuStock(product.id, s.id, value)
  })
  ensureStockDrafts()
  if (!saved) return toast(store.checkoutError || '商品库存已更新，请重试')
  toast('本店库存已更新')
}
function toggleListed(productId: string) {
  if (!store.toggleListed(productId)) return toast('请先上架到本店商城')
  toast(store.isListed(productId) ? '已上架本店' : '已从本店商城下架')
}
function orderTitle(order: StorefrontOrder) {
  return order.items.map((line) => `${line.name} ×${line.quantity}`).join('、')
}

function repeatOrder(id: string) {
  if (!store.repeatOrder(id)) return toast('订单商品当前无库存')
  sheet.value = 'cart'
  toast('订单商品已加入购物车')
}

async function cancelStorefrontOrder(id: string) {
  if (!await store.cancelStorefrontOrder(id)) return toast(store.checkoutError || '当前订单不能取消')
  toast('订单已取消，余额和库存已恢复')
}

function requestStorefrontAfterSale(id: string, type: 'refund' | 'return') {
  afterSaleTarget.value = { id, type }
  afterSaleEvidence.value = []
  sheet.value = 'after-sale'
}
async function confirmStorefrontAfterSale() {
  const target = afterSaleTarget.value
  if (!target) return
  if (!await store.requestStorefrontAfterSale(target.id, target.type, afterSaleEvidence.value.length ? afterSaleEvidence.value : undefined)) return toast('当前订单不能申请售后')
  sheet.value = null
  afterSaleTarget.value = null
  toast(target.type === 'refund' ? '退款申请已提交' : '退货申请已提交')
}

onMounted(async () => {
  disposeKeyboardButtons = installKeyboardButtonSupport()
  disposeDictionaryImages = dictCache.subscribe((state) => { dictionaryState.value = state })
  const query = uni.getLaunchOptionsSync().query || {}
  const scenario = query.mock
  if (scenario === 'empty' || scenario === 'failure') store.setMockScenario(scenario)
  // #ifdef H5
  runtimeFarm = query.farm
  // #endif
  await store.initialize(false, runtimeFarm)
  store.cart = seedDemoFarmhouseCart(store.cart, store.products, store.mockScenario)
  syncSelectedCartLines()
  ensureStockDrafts()
  if (typeof query.promoter === 'string' && query.promoter) store.setReferrer({ type: 'promoter', promoterId: query.promoter, name: String(query.promoterName || ''), liveId: typeof query.live === 'string' ? query.live : undefined })
  if (typeof query.staff === 'string' && query.staff) store.setReferrer({ type: 'staff', staffAccountId: query.staff, name: String(query.staffName || '') })
  // 直达结算：URL 带 productId/skuId/qty → 自动加购并打开购物车结算弹层
  if (typeof query.productId === 'string' && query.productId) {
    const directProduct = store.products.find((item) => item.id === query.productId)
    if (directProduct) {
      const skuId = typeof query.skuId === 'string' && query.skuId ? query.skuId : undefined
      const sku = directProduct.skus.find((item) => item.id === skuId) || (directProduct.skus.length === 1 ? directProduct.skus[0] : undefined)
      const explicitQuantity = typeof query.qty === 'string' && query.qty ? Number(query.qty) : undefined
      if (sku && canStartOrder(sku)) {
        const explicitQuantityAccepted = (() => {
          if (explicitQuantity === undefined) return true
          const validation = validateCatalogSkuOrderQuantity(sku, explicitQuantity)
          if (validation.ok) return true
          toast(validation.code === 'below_minimum_order_quantity' ? '套餐购买数量未达要求，请调整数量' : validation.code === 'insufficient_stock' ? '套餐库存不足' : '请输入有效的购买数量')
          return false
        })()
        if (explicitQuantityAccepted) {
          const result = store.addToCart(directProduct, sku.id)
          if (result !== 'out-of-stock') {
            const initialQuantity = initialCatalogOrderQuantity(minimumOrderQuantity(sku))
            if (explicitQuantity === undefined || store.changeCart(directProduct.id, sku.id, explicitQuantity - initialQuantity)) sheet.value = 'cart'
            else toast(store.checkoutError || '请输入有效的购买数量')
          } else {
            toast(store.checkoutError || '套餐库存不足')
          }
        }
      } else {
        toast(sku && sku.stock < minimumOrderQuantity(sku) ? '库存不足或购买数量未达要求' : '该套餐暂不可购')
      }
    } else {
      toast('该套餐暂不可购')
    }
  }
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--farm-green', store.tenant?.theme || '#17633f')
    document.title = store.tenant?.name || '中选科技农家乐门店端'
  }
  store.selectableProducts.forEach((item) => {
    item.skus.forEach((sku) => {
      const key = retailKey(item.id, sku.id)
      const selectedPrice = store.products.find((product) => product.id === item.id)?.skus.find((candidate) => candidate.id === sku.id)?.price ?? sku.price
      if (!retailPrices[key]) retailPrices[key] = selectedPrice
      if (!retailDraft[key]) retailDraft[key] = selectedPrice
    })
  })
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
  disposeKeyboardButtons()
  disposeDictionaryImages()
  disposePlatformChanges?.(); disposePlatformChanges = null
  disposeStorageSync?.(); disposeStorageSync = null
  disposeVisibilitySync?.(); disposeVisibilitySync = null
  dictCache.dispose()
})

onShareAppMessage(() => ({ title: store.tenant?.name || '石板溪农家乐', path: '/pages/index/index?from=share' }))
onShareTimeline(() => ({ title: store.tenant?.name || '石板溪农家乐' }))
</script>

<template>
  <view class="app-shell">
    <view v-if="store.loading" class="loading pc-loading">正在准备门店...</view>
    <view v-else-if="store.error" class="state-page"><UiIcon name="radio" :size="28" /><text>{{ store.error }}</text><button class="primary-button" @click="retryLoad">重新加载</button></view>
    <template v-else>
      <view v-if="productView && selectedProduct" class="work-page page-pad product-view" data-visual-view="product">
        <view class="sub-head"><button class="page-back" aria-label="返回" @click="closeProductView"><UiIcon name="arrow-left" :size="20" /></button><view><text class="page-title">商品详情</text><text class="page-sub">产地直发 · 中选科技供应链中台履约</text></view></view>
        <view class="work-body product-detail">
          <view class="detail-head"><BusinessImage class="detail-thumb" :src="selectedProduct.image" mode="aspectFill" /><view><text>{{ selectedProduct.name }}</text><small>{{ displayProductTags(selectedProduct, 'store').join(' · ') }}</small><strong class="detail-price">{{ money(selectedProduct.price) }}</strong></view></view>
          <small v-if="selectedSku">库存 {{ selectedSku.stock }}</small>
          <small v-if="selectedSku && !canStartOrder(selectedSku)" class="stock-warning">库存不足或数量未达要求</small>
        </view>
        <view class="product-detail-actions"><button class="outline-button" @click="shareProduct(selectedProduct)">分享商品</button><button class="primary-button" :disabled="!canStartProductOrder(selectedProduct)" @click="addProduct(selectedProduct)">加入购物车</button></view>
      </view>
      <view v-else-if="workView === 'select'" class="work-page page-pad" :data-visual-view="workView">
        <view class="sub-head"><button class="page-back" aria-label="返回会员中心" @click="workView = null"><UiIcon name="arrow-left" :size="20" /></button><view><text class="page-title">选品上架</text><text class="page-sub">从统一商品目录选品 · 设置本店价格与上下架状态</text></view></view>
        <view class="work-body">
        <view class="work-metric-band"><view><small>目录可选</small><strong>{{ store.selectableProducts.length }} 款</strong></view><view><small>本店已上架</small><strong>{{ store.products.length }} 款</strong></view><view><small>建议毛利率</small><strong>30%+</strong></view></view>
        <view class="section-head compact"><view><span></span><text>统一目录商品</text></view><small>供货价 → 本店零售价</small></view>
        <view class="list-search"><UiIcon name="search" :size="16" /><input v-model="selectKeyword" placeholder="搜索商品名称 / 品类" /></view>
        <view class="select-list">
          <view v-for="product in filteredSelectable" :key="product.id" class="select-item">
            <view class="si-head">
              <BusinessImage class="select-emoji" :src="product.image" mode="aspectFill" />
              <view class="si-title"><text class="item-title">{{ product.name }}</text><small class="si-sub">中台供货价 <b>{{ money(product.cost) }}</b> · 建议零售 {{ money(product.price) }}</small></view>
              <span class="si-status" :class="isListed(product) ? 'listed' : ''">{{ isListed(product) ? '已上架' : '未上架' }}</span>
            </view>
            <view v-for="sku in product.skus" :key="sku.id" class="si-pricing">
              <label class="si-field"><text>{{ sku.name }} · 本店零售价 <span>¥</span></text><view class="si-price-row"><input v-model.number="retailDraft[retailKey(product.id, sku.id)]" type="digit" /><button class="si-confirm" @click="commitRetail(product, sku.id)">确认</button></view></label>
              <view class="si-margin"><text>供货 {{ money(sku.cost) }} · 毛利</text><strong :class="{ neg: calcMargin(sku.cost, retailPreview(product, sku.id)).amount < 0 }">{{ money(calcMargin(sku.cost, retailPreview(product, sku.id)).amount) }} · <span>{{ calcMargin(sku.cost, retailPreview(product, sku.id)).rate }}%</span></strong></view>
            </view>
            <button class="si-btn" :class="{ listed: isListed(product) }" @click="listProduct(product)">{{ isListed(product) ? '保存各规格价格' : '上架到本店商城' }}</button>
            <view v-if="isListed(product)" class="si-local"><view class="si-stock"><label v-for="sku in product.skus" :key="sku.id" class="si-stock-sku"><text>{{ sku.name }}</text><input v-model.number="stockDrafts[product.id][sku.id]" type="number" /></label></view><view class="si-local-actions"><button class="si-confirm" @click="commitStock(product)">保存库存</button><button class="si-confirm danger" @click="toggleListed(product.id)">下架</button></view></view>
          </view>
        </view>
        </view>
      </view>

      <view v-else-if="workView === 'verify'" class="work-page page-pad" :data-visual-view="workView">
        <view class="sub-head"><button class="page-back" aria-label="返回会员中心" @click="workView = null"><UiIcon name="arrow-left" :size="20" /></button><view><text class="page-title">订单核销</text><text class="page-sub">到店核对预订/预约信息，确认后核销</text></view></view>
        <view class="work-body">
        <view v-if="store.vouchers.length" class="voucher-list"><view class="section-head compact"><view><span></span><text>直播套餐券订单（{{ store.vouchers.length }}）</text></view></view><view v-for="voucher in store.vouchers" :key="voucher.id" class="verify-item voucher-verify"><view class="verify-main"><text class="item-title">{{ voucher.id }}</text><small>数量 {{ voucher.quantity }} · ¥{{ voucher.amount.toFixed(2) }} · {{ voucher.status }}</small></view><span class="verify-status" :class="voucher.status === 'paid' ? '' : 'ok'">{{ voucher.status === 'paid' ? '待核销' : voucher.status === 'redeemed' ? '已核销' : '已退款' }}</span><button v-if="voucher.status === 'paid'" class="verify-btn" @click="verifyVoucher(voucher.id)">核销</button><button v-else-if="voucher.status === 'redeemed'" class="verify-btn" @click="refundVoucher(voucher.id)">退款</button><span v-else class="verify-done"><UiIcon name="check" :size="16" /></span></view></view>
        <view class="list-search"><UiIcon name="search" :size="16" /><input v-model="verifyKeyword" placeholder="搜索预订名称 / 日期 / 状态" /></view>
        <view v-if="!filteredVerifyBookings.length" class="empty-page pc-empty"><view class="pc-state-icon"><UiIcon name="calendar-check" :size="28" /></view><text>暂无预订记录</text></view>
        <view class="verify-list">
          <view v-for="item in filteredVerifyBookings" :key="item.id" class="verify-item booking-verify">
            <BusinessImage v-if="item.image" class="verify-emoji" :src="item.image" mode="aspectFill" /><view v-else class="verify-emoji icon-placeholder"><UiIcon name="calendar-check" :size="22" /></view>
            <view class="verify-main"><text class="item-title">{{ item.name }}</text><small>{{ item.type === 'service' ? item.date + ' · ' + item.people + ' 人' : item.date + ' · ' + item.session + ' · ' + item.people + ' 人' }}</small></view>
            <span class="verify-status" :class="item.status === 'cancelled' ? 'cancel' : item.status === 'completed' ? 'ok' : ''">{{ farmhouseBookingStatusText(item.status) }}</span>
            <view v-if="isActiveBookingStatus(item.status)" class="verify-amount"><text>¥</text><input type="digit" inputmode="decimal" aria-label="实际消费金额" placeholder="实际金额" :value="bookingAmounts[item.id] ?? item.amount ?? ''" @input="setBookingAmount(item.id, $event)" /></view>
            <button v-if="isActiveBookingStatus(item.status)" class="verify-btn" @click="verifyBooking(item.id)">核销</button>
            <span v-else class="verify-done"><UiIcon :name="item.status === 'cancelled' ? 'x' : 'check'" :size="16" /></span>
          </view>
        </view>
        </view>
      </view>

      <view v-else-if="workView === 'design-rooms'" class="work-page page-pad" :data-visual-view="workView">
        <view class="sub-head"><button class="page-back" aria-label="返回会员中心" @click="workView = null"><UiIcon name="arrow-left" :size="20" /></button><view><text class="page-title">设计特色包厢</text><text class="page-sub">新增 / 编辑 / 删除包厢，保存后即时展示到首页与预订页</text></view><button class="text-button" @click="openRoomForm()">＋ 新增包厢</button></view>
        <view class="work-body">
        <view class="list-search"><UiIcon name="search" :size="16" /><input v-model="roomKeyword" placeholder="搜索包厢名称 / 容量 / 状态" /></view>
        <view v-if="!filteredRooms.length" class="empty-page pc-empty"><view class="pc-state-icon"><UiIcon name="door-open" :size="28" /></view><text>还没有包厢，点击右上角「新增包厢」</text></view>
        <view class="design-list">
          <view v-for="room in filteredRooms" :key="room.id" class="design-item">
            <BusinessImage v-if="room.image" class="design-emoji" :src="room.image" mode="aspectFill" /><span v-else class="design-emoji icon-placeholder"><UiIcon name="door-open" :size="24" /></span>
            <view class="design-main"><text class="item-title">{{ room.name }}</text><small>{{ room.capacity }} · {{ room.sessions }} · {{ room.status }}</small></view>
            <view class="design-actions"><button class="design-edit" @click="openRoomForm(room)">编辑</button><button class="design-del" @click="removeRoom(room.id)">删除</button></view>
          </view>
        </view>
        </view>
      </view>

      <view v-else-if="workView === 'design-foods'" class="work-page page-pad" :data-visual-view="workView">
        <view class="sub-head"><button class="page-back" aria-label="返回会员中心" @click="workView = null"><UiIcon name="arrow-left" :size="20" /></button><view><text class="page-title">设计招牌土菜</text><text class="page-sub">新增 / 编辑 / 删除菜品，保存后即时展示到首页招牌土菜</text></view><button class="text-button" @click="openFoodForm()">＋ 新增菜品</button></view>
        <view class="work-body">
        <view class="list-search"><UiIcon name="search" :size="16" /><input v-model="foodKeyword" placeholder="搜索菜品名称 / 描述" /></view>
        <view v-if="!filteredFoods.length" class="empty-page pc-empty"><view class="pc-state-icon"><UiIcon name="utensils" :size="28" /></view><text>还没有菜品，点击右上角「新增菜品」</text></view>
        <view class="design-list">
          <view v-for="food in filteredFoods" :key="food.id" class="design-item">
            <BusinessImage v-if="food.image" class="design-emoji" :src="food.image" mode="aspectFill" /><view v-else class="design-emoji icon-placeholder"><UiIcon name="utensils" :size="24" /></view>
            <view class="design-main"><text class="item-title">{{ food.name }}</text><small>{{ food.description }} · {{ money(food.price) }}</small></view>
            <view class="design-actions"><button class="design-edit" @click="openFoodForm(food)">编辑</button><button class="design-del" @click="removeFood(food.id)">删除</button></view>
          </view>
        </view>
        </view>
      </view>
      <view v-else-if="workView === 'design-experiences'" class="work-page page-pad" :data-visual-view="workView">
        <view class="sub-head"><button class="page-back" aria-label="返回会员中心" @click="workView = null"><UiIcon name="arrow-left" :size="20" /></button><view><text class="page-title">设计体验项目</text><text class="page-sub">新增 / 编辑 / 删除本店体验项目</text></view><button class="primary-button small" @click="openExperienceForm()">＋ 新增体验</button></view>
        <view class="work-body">
        <view class="list-search"><UiIcon name="search" :size="16" /><input v-model="foodKeyword" placeholder="搜索体验项目" /></view>
        <view v-if="!experienceList.length" class="empty-page pc-empty"><view class="pc-state-icon"><UiIcon name="sprout" :size="28" /></view><text>还没有体验项目</text></view>
        <view class="design-list">
          <view v-for="experience in experienceList" :key="experience.id" class="design-item">
            <BusinessImage v-if="experience.image" class="design-emoji" :src="experience.image" mode="aspectFill" />
            <view class="design-main"><text class="item-title">{{ experience.name }}</text><small>{{ experience.description }} · ¥{{ experience.price }}/人</small></view>
            <view class="design-actions"><button class="design-edit" @click="openExperienceForm(experience)">编辑</button><button class="design-remove" @click="removeExperienceFn(experience)">删除</button></view>
          </view>
        </view>
        </view>
      </view>

      <view v-else-if="workView === 'staff-admin'" class="work-page page-pad" :data-visual-view="workView">
        <view class="sub-head"><button class="page-back" aria-label="返回会员中心" @click="workView = null"><UiIcon name="arrow-left" :size="20" /></button><view><text class="page-title">店员管理</text><text class="page-sub">本店店员登录账号 · 推广权限由店长选配</text></view><button class="text-button" @click="openStaffForm()">＋ 新增店员</button></view>
        <view class="work-body">
        <view class="list-search"><UiIcon name="search" :size="16" /><input v-model="staffKeyword" placeholder="搜索店员姓名 / 账号" /></view>
        <view v-if="!filteredStaffAccounts.length" class="empty-page pc-empty"><view class="pc-state-icon"><UiIcon name="users" :size="28" /></view><text>本店暂无店员账号，点击右上角「新增店员」</text></view>
        <view class="design-list">
          <view v-for="acc in filteredStaffAccounts" :key="acc.id" class="design-item">
            <view class="design-emoji icon-placeholder"><UiIcon :name="acc.role === 'owner' ? 'store' : 'user-round'" :size="24" /></view>
            <view class="design-main"><text class="item-title">{{ acc.name }}</text><small>{{ acc.account }} · {{ acc.role === 'owner' ? '店主' : '店员' }} · 推广{{ acc.promoEnabled ? '已开' : '关闭' }} · {{ acc.enabled ? '启用' : '停用' }}</small></view>
            <view class="design-actions"><button class="design-edit" @click="openStaffForm(acc)">编辑</button><button class="design-del" @click="store.toggleStoreAccount(acc.id); toast('账号状态已切换')">{{ acc.enabled ? '停用' : '启用' }}</button></view>
          </view>
        </view>
        </view>
      </view>

      <view v-else-if="workView === 'orders'" class="work-page page-pad" :data-visual-view="workView">
        <view class="sub-head"><button class="page-back" aria-label="返回会员中心" @click="workView = null"><UiIcon name="arrow-left" :size="20" /></button><view><text class="page-title">我的订单</text><text class="page-sub">共 {{ store.orders.length }} 单 · 中选科技供应链中台统一履约</text></view></view>
        <view class="work-body">
        <view class="list-search"><UiIcon name="search" :size="16" /><input v-model="orderKeyword" placeholder="搜索订单号 / 商品" /></view>
        <view v-if="!filteredOrders.length" class="empty-page pc-empty"><view class="pc-state-icon"><UiIcon name="package-check" :size="28" /></view><text>还没有订单，去商城逛逛吧～</text></view>
        <view class="records order-records">
         <view v-for="item in filteredOrders" :key="item.id" class="rec-line"><BusinessImage v-if="item.items[0]?.image" class="rec-ic" :src="item.items[0].image" mode="aspectFill" /><view v-else class="rec-ic icon-placeholder"><UiIcon name="package" :size="20" /></view><view class="rec-b"><text class="rec-t">{{ orderTitle(item) }}</text><small class="rec-s">{{ money(item.amount) }} · 特产商城</small><small v-if="item.delivery?.mode === 'courier'" class="rec-s">{{ item.courier || '快递直发' }}{{ item.trackingNo ? ' ' + item.trackingNo : '' }} · {{ item.delivery?.address }}</small><small v-if="item.remark" class="rec-s">备注：{{ item.remark }}</small><small v-if="afterSaleFailureOf(item.id)" class="rec-s">退款失败：{{ afterSaleFailureOf(item.id) }}</small><small v-if="afterSaleRetryOf(item.id)" class="rec-s">{{ afterSaleRetryOf(item.id) }}</small><view class="record-actions"><button class="action-btn action-btn--primary" @click="repeatOrder(item.id)">再次购买</button><button v-if="item.status === '待发货'" class="action-btn action-btn--muted" @click="cancelStorefrontOrder(item.id)">取消订单</button><button v-if="item.status === '已完成'" class="action-btn action-btn--gold" @click="requestStorefrontAfterSale(item.id, 'refund')">申请退款</button><button v-if="item.status === '已完成'" class="action-btn action-btn--danger" @click="requestStorefrontAfterSale(item.id, 'return')">申请退货</button></view></view><span class="rec-st">{{ platformOrderStatus(item.id) || item.status }}</span><span v-if="afterSaleStatusOf(item.id)" class="rec-st after">{{ afterSaleStatusOf(item.id) }}</span></view>
        </view>
        </view>
      </view>

      <view v-else-if="workView === 'bookings'" class="work-page page-pad" :data-visual-view="workView">
        <view class="sub-head"><button class="page-back" aria-label="返回会员中心" @click="workView = null"><UiIcon name="arrow-left" :size="20" /></button><view><text class="page-title">我的预订</text><text class="page-sub">共 {{ store.bookings.length }} 个预订 · 到店出示核销</text></view></view>
        <view class="work-body">
        <view class="list-search"><UiIcon name="search" :size="16" /><input v-model="bookingKeyword" placeholder="搜索预订名称 / 日期" /></view>
        <view v-if="!filteredBookings.length" class="empty-page pc-empty"><view class="pc-state-icon"><UiIcon name="calendar-check" :size="28" /></view><text>还没有预订，去门店逛逛吧～</text></view>
        <view class="records order-records">
          <view v-for="item in filteredBookings" :key="item.id" class="rec-line"><BusinessImage v-if="item.image" class="rec-ic" :src="item.image" mode="aspectFill" /><view v-else class="rec-ic icon-placeholder"><UiIcon name="calendar-days" :size="20" /></view><view class="rec-b"><text class="rec-t">{{ item.name }}</text><small class="rec-s">{{ item.type === 'service' ? item.date + ' · ' + item.people + ' 人' + (item.amount ? ' · ' + money(item.amount) : '') : item.date + ' · ' + item.session + ' · ' + item.people + ' 人' }}</small><button v-if="isActiveBookingStatus(item.status)" class="action-btn action-btn--muted" @click="cancelBooking(item.id)">取消预订</button></view><span class="rec-st" :class="item.status === 'cancelled' ? 'go' : item.status === 'completed' ? 'ok' : ''">{{ farmhouseBookingStatusText(item.status) }}</span></view>
        </view>
        </view>
      </view>

      <view v-else-if="workView === 'ledger'" class="work-page page-pad" :data-visual-view="workView">
        <view class="sub-head"><button class="page-back" aria-label="返回会员中心" @click="workView = null"><UiIcon name="arrow-left" :size="20" /></button><view><text class="page-title">储值记录</text><text class="page-sub">充值 / 消费明细</text></view></view>
        <view class="work-body">
        <view class="list-search"><UiIcon name="search" :size="16" /><input v-model="ledgerKeyword" placeholder="搜索描述 / 金额" /></view>
        <view v-if="!filteredLedger.length" class="empty-page pc-empty"><view class="pc-state-icon"><UiIcon name="credit-card" :size="28" /></view><text>暂无储值流水</text></view>
        <view class="ledger-list">
          <view v-for="entry in filteredLedger" :key="entry.id"><view><text>{{ entry.description }}</text><small>{{ entry.createdAt }} · 余额 {{ money(entry.balance) }}</small></view><strong :class="entry.type">{{ entry.amount > 0 ? '+' : '' }}{{ money(entry.amount) }}</strong></view>
        </view>
        </view>
      </view>

      <view v-else-if="workView === 'checkout'" class="work-page page-pad checkout-page" :data-visual-view="workView">
        <view class="sub-head"><button class="page-back" aria-label="返回购物车" @click="workView = null; sheet = 'cart'"><UiIcon name="arrow-left" :size="20" /></button><view><text class="page-title">确认订单</text><text class="page-sub">{{ checkoutIsCourier ? '快递直发' : '社区团购 · 到店自提' }}</text></view></view>
        <view class="work-body checkout-body">
          <view v-if="checkoutIsCourier" class="checkout-address-card checkout-address-card--page" role="button" tabindex="0" aria-label="选择本单收货地址" @click="openAddresses('checkout')" @keyup.enter="openAddresses('checkout')" @keyup.space.prevent="openAddresses('checkout')"><UiIcon name="map-pin" :size="21" /><view v-if="selectedDeliveryAddress"><view><text>{{ selectedDeliveryAddress.receiver }}</text><strong>{{ selectedDeliveryAddress.phone }}</strong><span v-if="selectedDeliveryAddress.isDefault">默认</span></view><small>{{ selectedDeliveryAddress.region }} {{ selectedDeliveryAddress.detail }}</small></view><view v-else><text>添加收货地址</text><small>快递配送前请先填写收货信息</small></view><UiIcon name="chevron-right" :size="17" /></view>
          <view v-else class="pickup-point-card"><view class="pickup-point-icon"><UiIcon name="store" :size="22" /></view><view><text>{{ store.tenant?.name || store.farm?.name || '当前农家乐' }}</text><small>{{ store.farm?.region || '' }} {{ store.tenant?.address || store.farm?.address || '' }}</small><small>{{ store.tenant?.phone || '' }} · 营业 {{ store.tenant?.hours || '以门店实际营业时间为准' }}</small></view><span>自提点</span></view>
          <view class="checkout-section"><view class="checkout-section-head"><text>商品明细</text><small>{{ checkoutItems.length }} 款 · {{ checkoutItems.reduce((sum, item) => sum + item.quantity, 0) }} 件</small></view><view class="checkout-items"><view v-for="item in checkoutItems" :key="cartLineKey(item)" class="checkout-line"><BusinessImage :src="item.image" mode="aspectFill" /><view><text>{{ item.name }}</text><small>{{ item.skuName }} × {{ item.quantity }}</small></view><strong>{{ money(item.price * item.quantity) }}</strong></view></view></view>
          <view class="checkout-section"><view class="checkout-section-head"><text>订单备注</text><small>选填</small></view><textarea v-model="checkoutRemark" class="checkout-remark" maxlength="120" placeholder="如：到店后联系我，或请按门店安排配送" /></view>
          <view class="checkout-section"><view class="checkout-section-head"><text>支付方式</text><small>{{ checkoutCanPayWithBalance ? '余额优先' : '余额不足' }}</small></view><view class="checkout-pay-methods"><button :class="{ selected: payMethod === 'balance' }" :disabled="!checkoutCanPayWithBalance" @click="payMethod = 'balance'"><UiIcon name="wallet-cards" :size="19" /><view><text>会员余额</text><small>{{ checkoutCanPayWithBalance ? money(store.balance) : '余额不足，请使用微信支付' }}</small></view><span v-if="payMethod === 'balance'">已选</span></button><button :class="{ selected: payMethod === 'wechat' }" @click="payMethod = 'wechat'"><UiIcon name="message-circle" :size="19" /><view><text>微信支付（演示）</text><small>模拟支付成功，不扣储值余额</small></view><span v-if="payMethod === 'wechat'">已选</span></button></view></view>
          <view class="checkout-total-card"><view><text>商品合计</text><strong>{{ money(checkoutTotal) }}</strong></view><view><text>配送与优惠</text><strong>暂无</strong></view><view class="checkout-total-row"><text>应付金额</text><strong>{{ money(checkoutTotal) }}</strong></view></view>
        </view>
        <view class="checkout-page-foot"><view><small>应付金额</small><strong>{{ money(checkoutTotal) }}</strong></view><button class="primary-button" :disabled="paying || !checkoutItems.length || (checkoutIsCourier && !selectedDeliveryAddress) || (payMethod === 'balance' && !checkoutCanPayWithBalance)" @click="checkout(payMethod)">{{ paying ? '提交中…' : '提交订单' }}</button></view>
      </view>

      <view v-else-if="workView === 'addresses'" class="work-page page-pad address-page" :data-visual-view="workView">
        <view class="sub-head"><button class="page-back" :aria-label="addressFormOpen ? '返回地址列表' : addressReturnContext === 'cart' ? '返回购物车' : addressReturnContext === 'checkout' ? '返回确认订单' : '返回会员中心'" @click="closeAddresses"><UiIcon name="arrow-left" :size="20" /></button><view><text class="page-title">{{ addressFormOpen ? (addressForm.id ? '编辑收货地址' : '新增收货地址') : '收货地址' }}</text><text class="page-sub">农家乐商城通用 · 地址信息仅用于快递配送</text></view></view>
        <view class="work-body">
          <view v-if="addressFormOpen" class="address-form">
            <label class="form-field"><text>收货人</text><input v-model="addressForm.receiver" maxlength="30" placeholder="请输入收货人姓名" /></label>
            <label class="form-field"><text>手机号</text><input v-model="addressForm.phone" type="number" maxlength="11" placeholder="请输入大陆手机号" /></label>
            <view class="form-field"><text>省市区</text><picker mode="region" :value="addressForm.region" @change="changeAddressRegion"><view class="region-picker"><text>{{ addressForm.region.join(' / ') }}</text><UiIcon name="chevron-right" :size="17" /></view></picker></view>
            <label class="form-field"><text>详细地址</text><textarea v-model="addressForm.detail" maxlength="120" placeholder="街道、门牌号、小区、楼栋等" /></label>
            <button class="default-choice" :class="{ selected: addressForm.isDefault }" :disabled="addressForm.isDefault" @click="addressForm.isDefault = true"><span><UiIcon v-if="addressForm.isDefault" name="check" :size="15" /></span><text>{{ addressForm.isDefault ? '默认地址（不能直接取消）' : '设为默认地址' }}</text></button>
            <small v-if="!store.addresses.length && !addressForm.id" class="default-address-hint">首个地址将自动设为默认</small>
          </view>
          <view v-else class="address-list" :role="addressReturnContext === 'cart' || addressReturnContext === 'checkout' ? 'radiogroup' : undefined" :aria-label="addressReturnContext === 'cart' || addressReturnContext === 'checkout' ? '选择本单收货地址' : undefined">
            <view v-if="!store.addresses.length" class="empty-page pc-empty"><view class="pc-state-icon"><UiIcon name="map-pin" :size="28" /></view><text>还没有收货地址</text><small>新增后，快递配送时可以直接选择</small></view>
            <view v-for="address in store.addresses" :key="address.id" class="address-card" :class="{ selected: (addressReturnContext === 'cart' || addressReturnContext === 'checkout') && selectedDeliveryAddress?.id === address.id }">
              <view class="address-card-select" :role="addressReturnContext === 'cart' || addressReturnContext === 'checkout' ? 'radio' : undefined" :aria-checked="addressReturnContext === 'cart' || addressReturnContext === 'checkout' ? selectedDeliveryAddress?.id === address.id : undefined" :tabindex="addressReturnContext === 'cart' || addressReturnContext === 'checkout' ? 0 : undefined" @click="chooseDeliveryAddress(address)" @keyup.enter="chooseDeliveryAddress(address)" @keyup.space.prevent="chooseDeliveryAddress(address)">
                <view class="address-card-head"><text>{{ address.receiver }}</text><strong>{{ address.phone }}</strong><span v-if="address.isDefault" class="address-default-tag">默认</span><span v-if="(addressReturnContext === 'cart' || addressReturnContext === 'checkout') && selectedDeliveryAddress?.id === address.id" class="address-selected-tag">本单使用</span></view>
                <small>{{ address.region }} {{ address.detail }}</small>
              </view>
              <view class="address-card-actions"><button v-if="!address.isDefault" @click.stop="setDefaultAddress(address.id)">设为默认</button><button @click.stop="openAddressForm(address)">编辑</button><button class="danger" @click.stop="confirmRemoveAddress(address.id)">删除</button></view>
            </view>
          </view>
        </view>
        <view class="address-page-action"><button v-if="addressFormOpen" class="primary-button" @click="saveAddress">保存地址</button><button v-else class="primary-button" @click="openAddressForm()"><UiIcon name="plus" :size="18" />新增收货地址</button></view>
      </view>

      <view v-else-if="workView === 'help'" class="work-page page-pad" :data-visual-view="workView">
        <view class="sub-head"><button class="page-back" aria-label="返回会员中心" @click="workView = null"><UiIcon name="arrow-left" :size="20" /></button><view><text class="page-title">设置与帮助</text><text class="page-sub">客服 · 关于</text></view></view>
        <view class="work-body">
        <view class="help-sheet">
          <view class="help-row" @click="makePhoneCall"><UiIcon name="headset" :size="20" /><view><text>联系客服</text><small>{{ store.tenant?.phone }} · 营业 {{ store.tenant?.hours }}</small></view><UiIcon name="chevron-right" :size="17" /></view>
          <view class="help-row"><UiIcon name="store" :size="20" /><view><text>关于平台</text><small>中选科技数字供应链与引流服务平台 · 演示版本</small></view><UiIcon name="chevron-right" :size="17" /></view>
          <button class="logout-button logout-danger" @click="logout">退出登录</button>
        </view>
        </view>
      </view>

      <template v-else>
        <view v-if="activeTab === 'home'" class="tab-page home-page" :data-visual-view="activeTab">
          <view v-if="referrerText" class="referrer-banner"><UiIcon name="user-round-check" :size="16" /><text>{{ referrerText }}</text></view>
          <view class="hero">
            <BusinessImage class="hero-media" :src="store.farm?.image" mode="aspectFill" />
            <view class="hero-shade"></view>
            <view class="hero-content"><text class="location"><UiIcon name="map-pin" :size="15" />{{ store.farm?.city || '湘西州' }} · 距您 {{ store.tenant?.distanceKm || 8.6 }}km</text><text class="hero-title">{{ store.tenant?.name }}</text><text class="hero-sub"><UiIcon name="trophy" :size="15" />{{ store.farm?.rating || 4.9 }} 分 · {{ store.tenant?.slogan }} · 营业 {{ store.tenant?.hours }}</text></view>
          </view>
           <view class="store-summary"><BusinessImage :src="store.farm?.image" mode="aspectFill" /><view><text class="item-title">{{ store.tenant?.name }}</text><text class="rating"><UiIcon name="trophy" :size="14" />{{ store.farm?.rating || 0 }} · 月售 {{ store.farm?.monthlySales || 0 }}+ · 本地口碑店</text><view class="tag-row"><text v-for="tag in store.farm?.storeTags || store.farm?.tags || []" :key="tag">{{ tag }}</text></view></view><button class="call-button" @click="sheet = 'contact'"><UiIcon name="phone" :size="17" />电话</button></view>
<view class="quick-grid pc-tile-grid"><button class="pc-tile pc-tile--green" @click="openReservation('room', '观溪雅间')"><view class="pc-tile-icon"><UiIcon name="door-open" :size="26" /></view><text class="pc-tile-label">包厢预订</text></button><button class="pc-tile pc-tile--amber" @click="openReservation('package', '四人欢聚套餐')"><view class="pc-tile-icon"><UiIcon name="utensils" :size="26" /></view><text class="pc-tile-label">套餐预订</text></button><button class="pc-tile pc-tile--coral" @click="chooseTab('shop')"><view class="pc-tile-icon"><UiIcon name="shopping-bag" :size="26" /></view><text class="pc-tile-label">特产商城</text></button><button class="pc-tile pc-tile--blue" @click="chooseTab('member')"><view class="pc-tile-icon"><UiIcon name="crown" :size="26" /></view><text class="pc-tile-label">会员中心</text></button></view>
          <view class="notice"><UiIcon name="megaphone" :size="18" /><text>端午特惠：到店满 200 减 30，会员储值享 9 折，分享好友下单得佣金～</text></view>
          <view class="section-head"><view><span></span><text>招牌土菜</text></view><button v-if="store.foods.length" @click="sheet = 'foods'">查看更多</button></view>
          <view v-if="store.foods.length" class="food-scroll"><view class="food-list"><view v-for="food in store.foods.slice(0, 4)" :key="food.id" class="food-card"><BusinessImage class="food-thumb" :src="food.image" mode="aspectFill" /><text>{{ food.name }}</text><small>{{ food.description }}</small><view class="food-price"><strong>{{ money(food.price) }}</strong><del v-if="food.originalPrice">{{ money(food.originalPrice) }}</del></view></view></view></view>
          <view v-else class="empty-page home-empty pc-empty"><view class="pc-state-icon"><UiIcon name="utensils" :size="28" /></view><text>暂无招牌土菜，店主可到会员中心→设计招牌土菜添加</text></view>
          <view class="section-head"><view><span></span><text>特色包厢</text></view><button class="more-button" @click="chooseTab('reserve')">去预订 ›</button></view>
          <view v-if="store.rooms.length" class="room-list"><view v-for="room in store.rooms.slice(0, 2)" :key="room.id" class="room-card"><BusinessImage class="room-emoji" :src="room.image" mode="aspectFill" /><view><text>{{ room.name }}</text><small>{{ room.capacity }}</small></view><button @click="openReservation('room', room.name)">立即预订</button></view></view>
          <view v-else class="empty-page home-empty pc-empty"><view class="pc-state-icon"><UiIcon name="door-open" :size="28" /></view><text>暂无包厢，店主可到会员中心→设计特色包厢添加</text></view>
          <view class="section-head" @click="openService(experienceList[0])"><view><span></span><text>特色服务</text></view></view>
          <view class="service-grid"><view v-for="s in experienceList" :key="s.id" hover-class="s-hover" @click="openService(s)"><BusinessImage class="s-emoji" :src="s.image" mode="aspectFill" /><text>{{ s.name }}</text><small>{{ s.description }}</small></view></view>
        </view>

        <view v-else-if="activeTab === 'reserve'" class="tab-page page-pad" :data-visual-view="activeTab">
          <view class="mall-hero"><text class="mall-hero-title">预约预订</text><text class="mall-hero-sub">包厢预定 · 套餐预定 · 到店预约</text></view>
          <view class="section-head compact"><view><span></span><text>选择日期</text></view></view>
          <view class="cats"><button v-for="item in bookingDates" :key="item" :class="{ on: booking.date === item }" @click="booking.date = item">{{ item }}</button></view>
          <view class="section-head compact"><view><span></span><text>包厢预订</text></view></view>
          <view v-if="store.rooms.length" class="reserve-list">
            <view v-for="room in store.rooms" :key="room.id" class="room">
              <BusinessImage class="rimg" :src="room.image" mode="aspectFill" />
              <view class="rb">
                <text class="rn">{{ room.name }}</text>
                <view class="rd">{{ room.capacity }} · <text :class="room.status === '仅余晚市' ? 'status-busy' : 'status-free'">{{ room.status }}</text></view>
                <view class="rfoot"><span class="rd inline-label"><UiIcon name="calendar-days" :size="14" />{{ room.sessions }}</span><button class="booknow" @click="openBookingForm('room', room.name, room.people)">预订</button></view>
              </view>
            </view>
          </view>
          <view v-else class="empty-page home-empty pc-empty"><view class="pc-state-icon"><UiIcon name="door-open" :size="28" /></view><text>暂无包厢可预订</text></view>
          <view class="section-head compact"><view><span></span><text>套餐预订</text></view><small>含锁定食材</small></view>
          <view class="combo-list">
            <view v-for="pkg in catalogPackages" :key="pkg.id" class="combo">
              <BusinessImage class="ci" :src="pkg.image" mode="aspectFill" />
              <view class="cb">
                <view class="cn">{{ pkg.name }}</view>
                <view class="cl">{{ pkg.skus[0]?.name || "含锁定食材" }}</view>
                <view class="cfoot"><view class="cprice">{{ money(pkg.skus[0]?.retailPrice || 0) }}</view><button class="booknow" @click="openBookingForm('package', pkg.name, 4)">预订</button></view>
              </view>
            </view>
          </view>
          <view class="reserve-note"><UiIcon name="bell" :size="16" /><text>{{ reminderNote() }}</text></view>
          <button class="record-link" @click="workView = 'bookings'"><UiIcon name="calendar-check" :size="18" />查看我的预订（{{ store.bookings.length }}）<UiIcon name="chevron-right" :size="18" /></button>
        </view>
        <view v-else-if="activeTab === 'shop'" class="tab-page page-pad shop-page" :data-visual-view="activeTab">
          <view class="mall-hero"><text class="mall-hero-title">特产商城</text><text class="mall-hero-sub">{{ visibleProducts.length }} 件在售</text></view>
                    <view class="category-grid"><button v-for="item in categories" :key="item" class="category-grid-item" :class="{ active: category === item }" :aria-label="item" :title="item" @click="category = item"><BusinessImage class="category-grid-img" :src="productCategoryImage(item, dictionaryState)" :fallback="defaultProductCategoryImage(item)" :error-fallback="defaultProductCategoryImage()" :show-error="false" mode="aspectFill" /><text class="category-grid-label">{{ item }}</text></button></view>
          <view v-if="visibleProducts.length" class="waterfall-grid">
            <view v-for="(column, columnIndex) in waterfallColumns" :key="columnIndex" class="waterfall-column">
             <view v-for="product in column" :key="product.id" class="product-card"><button class="product-image product-open" :aria-label="`查看${product.name}`" @click="openProduct(product)"><BusinessImage class="product-emoji" :src="product.image" mode="aspectFill" /><text v-if="product.source === 'platform'" data-typography-compact>中台供</text></button><view class="product-body"><view class="tag-row"><span class="source-tag">{{ displayProductTags(product, 'store')[0] || '门店商品' }}</span><span v-if="isExpressDeliverable(product)" class="express-tag">快递直发</span></view><text class="item-title">{{ product.name }}</text><small class="muted">{{ canStartProductOrder(product) ? `已售 · 库存 ${product.skus.reduce((sum, sku) => sum + sku.stock, 0)}` : '库存不足或数量未达要求' }}</small><view class="product-foot"><strong>{{ money(product.price) }}</strong><button class="add-btn" :aria-label="`加入${product.name}到购物车`" :disabled="!canStartProductOrder(product)" @click="addProduct(product)"><UiIcon name="plus" :size="16" /></button></view></view></view>
            </view>
          </view>
          <view v-else class="empty-page pc-empty"><view class="pc-state-icon"><UiIcon name="search" :size="26" /></view><text>没有找到相关商品</text><small>试试其他关键词或分类</small></view>
        </view>

        <view v-else class="tab-page member-page page-pad" :data-visual-view="activeTab">
          <template v-if="store.auth.isLoggedIn">
<view class="mall-hero"><text class="mall-hero-title">会员中心</text><text class="mall-hero-sub">会员充值 · 等级权益 · 积分优惠券<text v-if="canPromote"> · 分销推广</text></text></view>
<view class="member-body pc-page">
<view class="member-hero pc-hero"><view class="member-hero-top"><view class="member-hero-id"><view class="member-avatar">{{ store.member.name.slice(0, 1) }}</view><view><text class="uname pc-hero-name">{{ store.member.name }}</text><small class="uid pc-hero-uid">{{ store.member.memberNo || 'SBX·8829' }} · 已享专属价</small></view></view><span class="lv pc-hero-badge"><UiIcon name="crown" :size="15" />黄金会员</span></view><view class="mbal pc-hero-data"><view class="member-asset"><small>储值余额</small><view class="member-asset-row"><strong>{{ money(store.balance) }}</strong><button class="recharge pc-hero-action" @click="recharge">充值 ＋</button></view></view><view><small>积分</small><strong>{{ store.points.toLocaleString('zh-CN') }}</strong></view></view></view>
<view class="pc-section-title"><view class="pc-bar"></view><text>我的服务</text></view>
<view class="mine-list pc-tile-grid"><button class="pc-tile pc-tile--green" @click="workView = 'orders'"><view class="pc-tile-icon"><UiIcon name="package-check" :size="26" /><text v-if="store.orders.length" class="pc-tile-badge">{{ store.orders.length > 99 ? '99+' : store.orders.length }}</text></view><text class="pc-tile-label">我的订单</text></button><button class="pc-tile pc-tile--amber" @click="workView = 'bookings'"><view class="pc-tile-icon"><UiIcon name="calendar-check" :size="26" /><text v-if="store.bookings.length" class="pc-tile-badge">{{ store.bookings.length > 99 ? '99+' : store.bookings.length }}</text></view><text class="pc-tile-label">我的预订</text></button><button class="pc-tile pc-tile--coral" @click="workView = 'ledger'"><view class="pc-tile-icon"><UiIcon name="credit-card" :size="26" /></view><text class="pc-tile-label">储值记录</text></button><button class="pc-tile pc-tile--teal" @click="openAddresses()"><view class="pc-tile-icon"><UiIcon name="map-pin" :size="26" /></view><text class="pc-tile-label">收货地址</text></button><button class="pc-tile pc-tile--blue" @click="openHelp()"><view class="pc-tile-icon"><UiIcon name="headset" :size="26" /></view><text class="pc-tile-label">设置与帮助</text></button></view>
<view class="role-block pc-card"><view class="pc-section-title"><view class="pc-bar"></view><text>切换演示身份</text></view><view class="segmented roles pc-seg"><button v-for="role in (['customer','staff','manager'] as Role[])" :key="role" :class="{ active: store.role === role }" @click="chooseRole(role)">{{ roleNames[role] }}</button></view><text class="role-help pc-help">{{ store.role === 'customer' ? '浏览、预订、商城和会员功能' : store.role === 'staff' ? '包含顾客功能，并可核销订单' : '包含全部功能，并可设计包厢土菜、选品上架、核销订单' }}</text></view>
<view v-if="canPromote" class="promotion"><view><UiIcon name="badge-dollar-sign" :size="24" /><text>分销推广中心</text><small>分享门店 / 商品给好友，好友下单你就赚佣金。员工、老客户、推客、主播均可参与，形成私域裂变。</small></view><view class="promo-stats"><view><text>累计佣金</text><strong>¥{{ formatNumber(store.member.cumulativeCommission ?? 0) }}</strong></view><view><text>我的粉丝</text><strong>{{ store.member.fans ?? 0 }}</strong></view><view><text>本月订单</text><strong>{{ store.member.monthlyOrders ?? 0 }}</strong></view></view><button @click="sheet = 'share'"><UiIcon name="link" :size="16" />生成我的专属推广海报</button></view>
<view v-if="store.canOperate" class="workbench pc-tile-grid">
<view class="pc-section-title pc-light-title workbench-title"><view class="pc-bar"></view><text>店铺经营工作台</text></view>
<button class="pc-tile pc-tile--green" @click="workView = 'verify'"><view class="pc-tile-icon"><UiIcon name="check" :size="26" /></view><text class="pc-tile-label">订单核销</text><small class="pc-tile-sub">到店核销</small></button>
<button v-if="store.canSelect" class="pc-tile pc-tile--amber" @click="workView = 'design-rooms'"><view class="pc-tile-icon"><UiIcon name="door-open" :size="26" /></view><text class="pc-tile-label">设计特色包厢</text></button>
<button v-if="store.canSelect" class="pc-tile pc-tile--coral" @click="workView = 'design-foods'"><view class="pc-tile-icon"><UiIcon name="utensils" :size="26" /></view><text class="pc-tile-label">设计招牌土菜</text></button>
<button v-if="store.canSelect" class="pc-tile pc-tile--blue" @click="workView = 'design-experiences'"><view class="pc-tile-icon"><UiIcon name="sprout" :size="26" /></view><text class="pc-tile-label">设计体验项目</text></button>
<button v-if="store.canSelect" class="pc-tile pc-tile--purple" @click="workView = 'select'"><view class="pc-tile-icon"><UiIcon name="tags" :size="26" /></view><text class="pc-tile-label">选品上架</text></button>
<button v-if="store.role === 'manager'" class="pc-tile pc-tile--teal" @click="workView = 'staff-admin'"><view class="pc-tile-icon"><UiIcon name="users" :size="26" /></view><text class="pc-tile-label">店员管理</text></button>
<button v-if="myStaffPromoEnabled" class="pc-tile pc-tile--green" @click="openStaffPromo()"><view class="pc-tile-icon"><UiIcon name="link" :size="26" /></view><text class="pc-tile-label">我的推广码</text></button>
</view>
<view class="member-footer pc-footer">平台支持 · 湖南省电子商务协会 · 中选科技供应链中台</view>
</view>
          </template>
          <view v-else class="login-prompt">
            <view class="login-prompt-card">
              <view class="pc-login-hero">
                <view class="pc-login-mark"><UiIcon name="crown" :size="26" /></view>
                <text class="pc-login-brand">石板溪农家乐</text>
                <text class="pc-login-sub">门店 · 预订 · 商城 · 会员</text>
              </view>
              <view class="login-prompt-body">
                <text class="login-prompt-title">微信一键登录</text>
                <text class="login-prompt-sub">登录后可查看会员权益、预订下单、充值并参与分销推广</text>
                <button class="primary-button" @click="requireLogin()">微信一键登录</button>
              </view>
            </view>
          </view>
        </view>

        <view v-if="activeTab === 'shop' && store.cartCount" class="cart-bar"><button class="cart-count" @click="sheet = 'cart'"><UiIcon name="shopping-cart" :size="21" /><span>{{ store.cartCount }}</span></button><view><small>合计</small><strong>{{ money(store.cartTotal) }}</strong></view><button @click="sheet = 'cart'">去结算</button></view>
        <view class="tabbar"><button v-for="tab in tabs" :key="tab.key" :class="{ active: activeTab === tab.key }" @click="chooseTab(tab.key)"><UiIcon :name="tab.icon" :size="21" /><text>{{ tab.label }}</text></button></view>
      </template>



      <view v-if="sheet" class="sheet-mask" @click.self="sheet = null">
        <view class="sheet" :data-visual-state="sheet">
          <view class="sheet-handle"></view>
           <view class="sheet-head"><text>{{ sheet === 'login' ? '微信登录' : sheet === 'service' ? (selectedService?.name || '服务详情') : sheet === 'cart' ? '购物车结算' : sheet === 'room-form' ? (editingRoomId ? '编辑包厢' : '新增包厢') : sheet === 'food-form' ? (editingFoodId ? '编辑菜品' : '新增菜品') : sheet === 'experience-form' ? (editingExperienceId ? '编辑体验' : '新增体验') : sheet === 'product' ? '选择规格' : sheet === 'booking-form' ? booking.name : sheet === 'contact' ? `联系${store.tenant?.name || ''}` : sheet === 'after-sale' ? '售后申请' : sheet === 'foods' ? '招牌菜品' : sheet === 'recharge' ? '会员储值充值' : sheet === 'identity' ? '切换身份' : sheet === 'staff-form' ? (staffForm.id ? '编辑店员' : '新增店员') : sheet === 'pay' ? '确认支付' : sheet === 'staff-promo' ? '我的推广码' : '专属推广海报' }}</text><button aria-label="关闭弹层" @click="sheet = null"><UiIcon name="x" :size="19" /></button></view>
        <scroll-view class="sheet-scroll" scroll-y>
<view v-if="sheet === 'login'" class="login-sheet">
          <view class="login-sheet-icon icon-placeholder"><UiIcon name="user-round-check" :size="28" /></view>
          <text class="login-sheet-title">{{ loginRole === 'customer' ? '微信一键登录' : '账号密码登录' }}</text>
          <text class="login-sheet-sub">登录「{{ store.tenant?.name || '中选科技农家乐门店端' }}」前，请先选择身份</text>
          <view class="segmented roles login-roles">
            <button v-for="role in (['customer','staff','manager'] as Role[])" :key="role" :class="{ active: loginRole === role }" @click="loginRole = role">{{ roleNames[role] }}</button>
          </view>
          <text class="role-help login-role-help">{{ loginRole === 'customer' ? '浏览、预订、商城和会员功能（免登录）' : loginRole === 'staff' ? '店员账号登录，包含顾客功能，并可核销订单' : '店主账号登录，包含全部功能，并可设计包厢土菜、选品上架、核销订单' }}</text>
          <template v-if="loginRole === 'customer'">
            <text class="login-sheet-tip">模拟微信授权 · 小程序端走 uni.login 获取 openid</text>
          </template>
          <template v-else>
            <label class="form-field"><text>登录账号</text><input v-model="accountLoginInput" placeholder="手机号 / 账号" /></label>
            <label class="form-field"><text>登录密码</text><input v-model="accountPasswordInput" type="password" placeholder="请输入密码" /></label>
            <text class="login-sheet-tip">店主 / 店员账号由后台「农家乐管理 → 门店账号」配置</text>
          </template>
        </view>

           <view v-else-if="sheet === 'cart'" class="sheet-list cart-sheet-list">
             <view v-if="!store.cart.length" class="empty pc-empty"><view class="pc-state-icon"><UiIcon name="shopping-cart" :size="26" /></view><text>购物车还是空的</text></view>
             <template v-else>
               <view class="cart-category-tabs"><button :class="{ active: cartCategory === 'community' }" @click="cartCategory = 'community'"><text>社区团购</text><small>{{ cartCategoryCount('community') }} 件</small></button><button :class="{ active: cartCategory === 'express' }" @click="cartCategory = 'express'"><text>快递直发</text><small>{{ cartCategoryCount('express') }} 件</small></button></view>
               <view class="cart-select-all"><text>{{ cartCategory === 'express' ? '快递商品' : '普通商品' }} · {{ cartCategoryItems.length }} 款</text><button @click="toggleAllCartLines"><span class="cart-check" :class="{ checked: cartCategoryAllSelected }"><UiIcon v-if="cartCategoryAllSelected" name="check" :size="14" /></span>{{ cartCategoryAllSelected ? '取消全选' : '全选' }}</button></view>
               <view v-if="!cartCategoryItems.length" class="empty cart-category-empty"><view class="pc-state-icon"><UiIcon :name="cartCategory === 'express' ? 'truck' : 'store'" :size="25" /></view><text>{{ cartCategory === 'express' ? '暂无快递直发商品' : '暂无社区团购商品' }}</text><small>{{ cartCategory === 'express' ? '支持快递的商品会显示在这里' : '普通商品请到农家乐自提' }}</small></view>
               <view v-for="item in cartCategoryItems" :key="cartLineKey(item)" class="sheet-line cart-line" :class="{ shortage: item.unavailable, selected: selectedCartLineKeys.has(cartLineKey(item)) }">
                 <button class="cart-line-check" :aria-label="selectedCartLineKeys.has(cartLineKey(item)) ? `取消选择${item.name}` : `选择${item.name}`" @click="toggleCartLine(item)"><span class="cart-check" :class="{ checked: selectedCartLineKeys.has(cartLineKey(item)) }"><UiIcon v-if="selectedCartLineKeys.has(cartLineKey(item))" name="check" :size="14" /></span></button>
                 <BusinessImage :src="item.image" mode="aspectFill" />
                 <view class="sheet-line-main"><view class="sheet-line-title"><text>{{ item.name }}</text><span class="cart-fulfillment-tag" :class="cartLineDeliveryMode(item)">{{ cartLineDeliveryMode(item) === 'courier' ? '快递直发' : '社区团购' }}</span></view><small>{{ item.skuName }}</small><small v-if="item.unavailable" class="stock-warning">库存不足或购买数量未达要求，不可结算</small><view class="sheet-line-foot"><strong>{{ money(item.price) }}</strong><view class="stepper"><button aria-label="减少数量" @click="store.changeCart(item.productId, item.skuId, -1)">−</button><text>{{ item.quantity }}</text><button aria-label="增加数量" :disabled="item.quantity >= item.stock" @click="store.changeCart(item.productId, item.skuId, 1)">+</button></view></view></view>
               </view>
               <text v-if="store.checkoutError" class="cart-error">{{ store.checkoutError }}</text>
             </template>
           </view>

           <view v-else-if="sheet === 'room-form'" class="design-form">
            <label class="form-field"><text>包厢名称</text><input v-model="roomForm.name" placeholder="如：观溪雅间" /></label>
            <view class="form-field"><text>展示图片</text>
              <ImageUploader v-model="roomForm.image" purpose="room" profile="normal" />
              <small class="form-hint">可上传门店实拍图，未上传使用默认场景图</small>
            </view>
            <label class="form-field"><text>容量与特色</text><input v-model="roomForm.capacity" placeholder="如：8–10 人 · 临溪景观 · 最低消费 ¥600" /></label>
            <label class="form-field"><text>可订场次</text><input v-model="roomForm.sessions" placeholder="如：午市 11:00 / 晚市 17:30" /></label>
            <label class="form-field"><text>可容纳人数</text><input v-model.number="roomForm.people" type="number" /></label>
            <view class="form-field"><text>状态</text><view class="choice-row"><button :class="{ active: roomForm.status === '可预订' }" @click="roomForm.status = '可预订'">可预订</button><button :class="{ active: roomForm.status === '仅余晚市' }" @click="roomForm.status = '仅余晚市'">仅余晚市</button></view></view>
          </view>
          <view v-else-if="sheet === 'food-form'" class="design-form">
            <label class="form-field"><text>菜品名称</text><input v-model="foodForm.name" placeholder="如：土鸡汤" /></label>
            <label class="form-field"><text>菜品描述</text><input v-model="foodForm.description" placeholder="如：柴火慢炖 3 小时" /></label>
            <label class="form-field"><text>售价（元）</text><input v-model.number="foodForm.price" type="digit" /></label>
            <label class="form-field"><text>原价（元，可选）</text><input v-model.number="foodForm.originalPrice" type="digit" placeholder="留空则无划线价" /></label>

            <view class="form-field"><text>菜品图片</text>
              <ImageUploader v-model="foodForm.image" purpose="food" profile="normal" />
              <small class="form-hint">可上传菜品实拍图，未上传使用默认图</small>
            </view>
          </view>
          <view v-else-if="sheet === 'experience-form'" class="design-form">
            <label class="form-field"><text>体验名称</text><input v-model="experienceForm.name" placeholder="如：农事采摘体验" /></label>
            <view class="form-field"><text>体验分类</text><view class="choice-row"><button v-for="opt in experienceCategoryOptions" :key="opt.code" :class="{ active: experienceForm.categoryCode === opt.code }" @click="experienceForm.categoryCode = opt.code">{{ opt.label }}</button></view></view>
            <label class="form-field"><text>体验描述</text><input v-model="experienceForm.description" placeholder="如：应季果蔬采摘 · 亲子互动" /></label>
            <label class="form-field"><text>价格（元/人）</text><input v-model.number="experienceForm.price" type="digit" /></label>
            <view class="form-field"><text>体验图片</text><ImageUploader v-model="experienceForm.image" purpose="experience" profile="normal" /></view>
          </view>




           <view v-else-if="sheet === 'product' && selectedProduct" class="product-detail sku-sheet"><view class="sku-product-summary"><BusinessImage class="sku-product-image" :src="selectedSku?.image || selectedProduct.image" mode="aspectFill" /><view><text class="sku-product-name">{{ selectedProduct.name }}</text><strong>{{ money(selectedSku?.price || selectedProduct.price) }}</strong><small>库存 {{ selectedSku?.stock || 0 }}</small><small>已选：{{ selectedSku?.name || '暂未选择' }}</small></view></view><text class="sku-label">选择规格</text><view class="sku-options"><button v-for="sku in selectedProduct.skus" :key="sku.id" :class="{ active: selectedSkuId === sku.id }" :disabled="!canStartOrder(sku)" @click="selectedSkuId = sku.id"><text>{{ sku.name }}</text><small>{{ money(sku.price) }} · 库存 {{ sku.stock }}</small></button></view><small v-if="selectedSku && !canStartOrder(selectedSku)" class="stock-warning">库存不足或数量未达要求</small></view>
           <view v-else-if="sheet === 'booking-form'" class="booking-sheet"><small class="booking-sub">选择日期 / 场次 / 人数，确认后将发送到店提醒</small><view class="booking-section"><text class="inline-label"><UiIcon name="calendar-days" :size="16" />选择日期</text><view class="ui-chips"><button v-for="item in bookingDates.slice(0, 3)" :key="item" :class="{ sel: booking.date === item }" @click="booking.date = item">{{ item }}</button></view></view><view class="booking-section"><text class="inline-label"><UiIcon name="bell" :size="16" />选择场次</text><view class="ui-chips"><button v-for="opt in (bookingSessionOptions.length ? bookingSessionOptions : [{ label: '午市 11:00' }, { label: '晚市 17:30' }])" :key="opt.label" :class="{ sel: booking.session === opt.label }" @click="booking.session = opt.label">{{ opt.label }}</button></view></view><view class="booking-section"><text class="inline-label"><UiIcon name="users" :size="16" />用餐人数</text><view class="ui-chips"><button v-for="item in [4,6,8,10,20]" :key="item" :class="{ sel: booking.people === item }" @click="booking.people = item">{{ item }} 人</button></view></view></view>
          <view v-else-if="sheet === 'after-sale' && afterSaleTarget" class="design-form">
            <view class="form-field"><text>售后类型</text><view class="choice-row"><button :class="{ active: afterSaleTarget.type === 'refund' }" @click="afterSaleTarget.type = 'refund'">申请退款</button><button :class="{ active: afterSaleTarget.type === 'return' }" @click="afterSaleTarget.type = 'return'">申请退货</button></view></view>
            <view class="form-field"><text>上传凭证（1-6 张，可选）</text><ImageUploader v-model="afterSaleEvidence" multiple :max-count="6" purpose="after-sale" profile="license" /></view>
            <small class="form-hint">提交后平台将结合凭证审核</small>
          </view>
<view v-else-if="sheet === 'contact'" class="contact-sheet"><small class="contact-sub">营业 {{ store.tenant?.hours }} · {{ store.tenant?.slogan }}</small><view class="ui-opt sel" @click="copyPhone"><text>门店电话</text><span>{{ store.tenant?.phone }}</span></view></view>
          <view v-else-if="sheet === 'foods'" class="food-detail-list"><view v-if="!store.foods.length" class="empty pc-empty"><view class="pc-state-icon"><UiIcon name="utensils" :size="26" /></view><text>暂无招牌菜品</text></view><view v-for="food in store.foods" :key="food.id"><BusinessImage :src="food.image" mode="aspectFill" /><view><text>{{ food.name }}</text><small>{{ food.description }}</small></view><strong>{{ money(food.price) }}</strong><button @click="sheet = null; openReservation('package', food.name)">预订</button></view></view><view v-else-if="sheet === 'service' && selectedService" class="service-detail"><BusinessImage class="s-emoji" :src="selectedService.image" mode="aspectFill" /><text class="s-name">{{ selectedService.name }}</text><small class="s-desc">{{ selectedService.description }}</small><view class="s-rows"><view><text>体验类型</text><strong>{{ dictCache.label('serviceCategory', selectedService.categoryCode) || '体验项目' }}</strong></view></view><view class="s-order"><text class="inline-label"><UiIcon name="calendar-days" :size="16" />选择日期</text><view class="ui-chips"><button v-for="d in bookingDates.slice(0, 3)" :key="d" :class="{ sel: serviceBooking.date === d }" @click="serviceBooking.date = d">{{ d }}</button></view></view><view class="s-order"><text class="inline-label"><UiIcon name="users" :size="16" />人数</text><view class="ui-chips"><button v-for="p in [2, 4, 6, 8]" :key="p" :class="{ sel: serviceBooking.people === p }" @click="serviceBooking.people = p">{{ p }} 人</button></view></view><view class="s-fee"><text>费用</text><strong>¥{{ selectedService.price }}/人 × {{ serviceBooking.people }} 人 = ¥{{ serviceFee }}</strong></view></view>
           <view v-else-if="sheet === 'recharge'" class="recharge-confirm"><text class="recharge-sub">当前余额 {{ money(store.balance) }} · 储值享 9 折，可用于堂食与商城</text><view class="ui-chips"><button v-for="item in [100,300,500,1000]" :key="item" :class="{ sel: rechargeAmount === item }" @click="rechargeAmount = item">¥{{ item }}</button></view></view>
          <view v-else-if="sheet === 'pay' && payContext" class="pay-sheet">
            <view class="pay-summary"><text>{{ payContext.title }}</text><small>{{ payContext.summary }}</small><strong>应付 {{ money(payContext.amount) }}</strong></view>
            <text class="pay-label">支付方式</text>
            <view class="pay-methods">
              <button :class="{ sel: payMethod === 'balance' }" :disabled="!canPayWithBalance" @click="payMethod = 'balance'"><text>会员余额</text><small>{{ canPayWithBalance ? money(store.balance) : '余额不足，请改用微信支付或先充值' }}</small></button>
              <button :class="{ sel: payMethod === 'wechat' }" @click="payMethod = 'wechat'"><text>微信支付（演示）</text><small>模拟支付成功，不扣储值余额</small></button>
            </view>
          </view>
          <view v-else-if="sheet === 'staff-form'" class="design-form">
            <label class="form-field"><text>姓名</text><input v-model="staffForm.name" placeholder="如 李店员" /></label>
            <label class="form-field"><text>登录账号（手机号）</text><input v-model="staffForm.account" placeholder="如 13800000002" /></label>
            <label class="form-field"><text>登录密码</text><input v-model="staffForm.password" placeholder="如 123456" /></label>
            <view class="form-field"><text>角色</text><view class="choice-row"><button :class="{ active: staffForm.role === 'staff' }" @click="staffForm.role = 'staff'">店员</button><button :class="{ active: staffForm.role === 'owner' }" @click="staffForm.role = 'owner'">店主</button></view></view>
            <view class="form-field"><text>店员推广权限</text><view class="choice-row"><button :class="{ active: staffForm.promoEnabled }" @click="staffForm.promoEnabled = true">开启（可生成推广码）</button><button :class="{ active: !staffForm.promoEnabled }" @click="staffForm.promoEnabled = false">关闭</button></view></view>
          </view>
          <view v-else-if="sheet === 'staff-promo'" class="staff-promo-sheet">
            <view class="qr-box"><image v-if="staffQrDataUrl" :src="staffQrDataUrl" mode="aspectFit" /><view v-else class="qr-placeholder">二维码（H5 生成）</view></view>
            <text class="staff-promo-title">我的店员推广码</text>
            <small class="staff-promo-sub">用户扫码进入本店并绑定我，用户下单后我按店员比例参与分成</small>
            <view class="staff-promo-link">{{ staffPromoLink() }}</view>
          </view>
          <view v-else class="poster-sheet"><small class="poster-sub">分享给好友，好友下单即可获得佣金</small><view class="ui-opt sel"><text>推广门店</text><span>{{ store.tenant?.name }}</span></view></view>
        </scroll-view>
          <view v-if="sheet === 'cart' && store.cart.length" class="sheet-foot cart-sheet-foot"><view><small>{{ cartCategory === 'express' ? '快递直发' : '社区团购' }} · 已选 {{ selectedCartCount }} 件</small><strong>{{ money(selectedCartTotal) }}</strong></view><button class="primary-button" :disabled="!selectedCartItems.length || cartCategoryHasUnavailable" @click="openCategoryCheckout">去结算</button></view>
          <view v-else-if="sheet === 'room-form'" class="sheet-foot"><button class="primary-button" @click="saveRoomForm">{{ editingRoomId ? '保存修改' : '新增包厢' }}</button></view>
          <view v-else-if="sheet === 'food-form'" class="sheet-foot"><button class="primary-button" @click="saveFoodForm">{{ editingFoodId ? '保存修改' : '新增菜品' }}</button></view>
          <view v-else-if="sheet === 'experience-form'" class="sheet-foot"><button class="primary-button" @click="saveExperienceForm">{{ editingExperienceId ? '保存修改' : '新增体验' }}</button></view>
          <view v-else-if="sheet === 'after-sale' && afterSaleTarget" class="sheet-foot"><button class="primary-button" @click="confirmStorefrontAfterSale">提交售后申请</button></view>
          <view v-else-if="sheet === 'product' && selectedProduct" class="product-detail-actions sheet-foot"><button class="outline-button" @click="shareProduct(selectedProduct)">分享商品</button><button class="primary-button" :disabled="!canStartOrder(selectedSku)" @click="addSelectedProduct">加入购物车</button></view>
          <view v-else-if="sheet === 'booking-form'" class="sheet-foot"><button class="primary-button" @click="submitBooking">确认预订</button></view>
          <view v-else-if="sheet === 'recharge'" class="sheet-foot"><button class="primary-button" @click="confirmRecharge">确认充值</button></view>
          <view v-else-if="sheet === 'staff-form'" class="sheet-foot"><button class="primary-button" @click="saveStaffForm">{{ staffForm.id ? '保存修改' : '新增店员' }}</button></view>
          <view v-else-if="sheet === 'login'" class="sheet-foot"><button v-if="loginRole === 'customer'" class="primary-button" :disabled="wechatLoggingIn" @click="wechatLogin">微信一键登录</button><button v-else class="primary-button" @click="loginAccount()">登 录</button></view>
          <view v-else-if="sheet === 'pay' && payContext" class="sheet-foot"><button class="primary-button" :disabled="paying || (payMethod === 'balance' && !canPayWithBalance)" @click="confirmPay">{{ paying ? '支付中…' : '确认支付' }}</button></view>
          <view v-else-if="sheet === 'service' && selectedService" class="sheet-foot"><button class="primary-button" :disabled="selectedService.status !== 'active'" @click="submitServiceOrder">{{ selectedService.status === 'active' ? '确认下单' : '暂不可下单' }}</button><button class="outline-button consult-button" @click="makePhoneCall"><UiIcon name="phone" :size="18" />电话咨询</button></view>
          <view v-else-if="sheet === 'contact'" class="sheet-foot"><button class="primary-button" @click="makePhoneCall"><UiIcon name="phone" :size="18" />拨打电话</button><button class="outline-button" @click="sheet = null">取消</button></view>
          <view v-else-if="sheet === 'staff-promo'" class="sheet-foot"><button class="primary-button" @click="copyStaffPromoLink"><UiIcon name="link" :size="18" />复制推广链接</button></view>
          <view v-else-if="sheet === 'share'" class="sheet-foot"><button class="primary-button" @click="sharePromotion"><UiIcon name="link" :size="18" />复制推广链接</button><button class="outline-button" @click="sheet = null">取消</button></view>
        </view>
      </view>
    </template>
  </view>
</template>

<style scoped lang="scss" src="../../styles/index-page.scss"></style>
<style lang="scss">
/* #ifdef MP-WEIXIN */
.sub-head,
.mall-hero,
.hero-content,
.loading,
.state-page {
  padding-top: calc(12px + var(--status-bar-height));
  padding-right: 96px;
}
.sub-head {
  min-height: calc(72px + var(--status-bar-height));
}
.login-prompt {
  padding-top: calc(24px + var(--status-bar-height));
}
.location {
  top: calc(12px + var(--status-bar-height));
  right: 96px;
}
.app-shell,
.sheet {
  max-width: 100% !important;
}
.tabbar {
  left: 0 !important;
  right: 0 !important;
  width: auto !important;
  transform: none !important;
}
.cart-bar {
  left: 12px !important;
  right: 12px !important;
  width: auto !important;
  transform: none !important;
}
/* #endif */
</style>
