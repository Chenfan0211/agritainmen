<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app'
import type { BusinessMediaValue, Booking, FarmExperience, Product, Role, StoreAccount, StoreRole, StorefrontOrder } from '@agritainment/shared'
import { PLATFORM_AFTERSALES_STORAGE_KEY, PLATFORM_BINDINGS_STORAGE_KEY, PLATFORM_BOOKINGS_STORAGE_KEY, PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_COMMISSION_LEDGER_STORAGE_KEY, PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_EXPERIENCES_STORAGE_KEY, PLATFORM_MEDIA_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY, PLATFORM_SHARE_CONFIG_STORAGE_KEY, PLATFORM_SHARES_STORAGE_KEY, PLATFORM_STORE_ACCOUNTS_STORAGE_KEY, PLATFORM_STORE_CATALOG_SELECTIONS_STORAGE_KEY, PLATFORM_VOUCHERS_STORAGE_KEY, calcMargin, createPlatformDictionaryCache, defaultProductCategoryImage, displayProductTags, formatNumber, initialCatalogOrderQuantity, installKeyboardButtonSupport, isExpressDeliverable, mediaValueToImage, money, normalizeMinimumOrderQuantity, productCategoryImage, readPlatformAfterSaleStatus, readPlatformAfterSales, readPlatformDictionaries, readPlatformRecoveryQueue, readCatalogState, readPlatformEntities, readPlatformOrderStatus, subscribePlatformChanges, validateCatalogSkuOrderQuantity } from '@agritainment/shared'
import { BusinessImage, ImageUploader } from '@agritainment/ui'
import UiIcon from '../../components/UiIcon.vue'
// #ifdef H5
import qrcode from 'qrcode-generator'
// #endif
import { farmhouseBookingStatusText, farmhouseBookingVerificationError, isActiveBookingStatus, useFarmhouseStore, type FoodItem, type Room } from '../../stores/farmhouse'

type TabKey = 'home' | 'reserve' | 'shop' | 'member'
type WorkView = 'select' | 'verify' | 'design-rooms' | 'design-foods' | 'design-experiences' | 'staff-admin' | 'orders' | 'bookings' | 'ledger' | 'help' | null
type SheetKey = 'login' | 'cart' | 'orders' | 'bookings' | 'room-form' | 'food-form' | 'experience-form' | 'share' | 'product' | 'contact' | 'foods' | 'ledger' | 'recharge' | 'identity' | 'help' | 'booking-form' | 'after-sale' | 'service' | 'staff-form' | 'staff-promo' | null

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
const deliveryAddressDraft = ref('')
const deliveryMode = ref<'pickup' | 'courier'>('pickup')
const cartHasExpress = computed(() => store.cart.some((line) => {
  const product = store.products.find((item) => item.id === line.productId)
  return !!product && isExpressDeliverable(product)
}))
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
const selectedService = ref<FarmExperience | null>(null)
const serviceBooking = reactive({ date: bookingDates[1], people: 2 })
const bookingAmounts = reactive<Record<string, string>>({})
const serviceFee = computed(() => (selectedService.value ? selectedService.value.price * serviceBooking.people : 0))
const selectedSkuId = ref('')
const selectedSku = computed(() => selectedProduct.value?.skus.find((sku) => sku.id === selectedSkuId.value) || selectedProduct.value?.skus[0] || null)
const canPromote = computed(() => store.role !== 'customer')

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
  const payload = { type: 'service' as const, name: service.name, date: serviceBooking.date, session: '到店体验', people: serviceBooking.people, image: mediaValueToImage(service.image), amount: service.price * serviceBooking.people }
  if (!store.submitBooking(payload)) return toast('该日期已预约，请更换时间')
  sheet.value = null
  toast('服务预约成功')
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
  sheet.value = 'product'
}

function addProduct(product: Product, skuId?: string) {
  const result = store.addToCart(product, skuId)
  if (result === 'sku-required') return openProduct(product)
  if (result === 'out-of-stock') return toast('该规格库存不足')
  toast('已加入购物车')
}

function addSelectedProduct() {
  if (!selectedProduct.value) return
  const result = store.addToCart(selectedProduct.value, selectedSkuId.value)
  if (result === 'sku-required') return toast('请先选择商品规格')
  if (result === 'out-of-stock') return toast('该规格库存不足')
  sheet.value = 'cart'
  toast('已加入购物车')
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

async function checkout() {
  if (!requireLogin(() => checkout())) return
  const address = deliveryMode.value === 'courier' ? deliveryAddressDraft.value.trim() : ''
  if (!await store.checkout({ deliveryMode: deliveryMode.value, address })) return toast(store.checkoutError)
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
  deliveryAddressDraft.value = store.deliveryAddress || store.tenant?.address || ''
  workView.value = 'help'
}
function saveDeliveryAddress() {
  if (!deliveryAddressDraft.value.trim()) return toast('请填写收货地址')
  store.setDeliveryAddress(deliveryAddressDraft.value)
  toast('收货地址已保存')
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
      <view v-if="workView === 'select'" class="work-page page-pad" :data-visual-view="workView">
        <view class="sub-head"><button class="icon-button" aria-label="返回会员中心" @click="workView = null"><UiIcon name="arrow-left" :size="20" /></button><view><text class="page-title">选品上架</text><text class="page-sub">从统一商品目录选品 · 设置本店价格与上下架状态</text></view></view>
        <view class="work-metric-band"><view><small>目录可选</small><strong>{{ store.selectableProducts.length }} 款</strong></view><view><small>本店已上架</small><strong>{{ store.products.length }} 款</strong></view><view><small>建议毛利率</small><strong>30%+</strong></view></view>
        <view class="security-note"><UiIcon name="shield-check" :size="18" /><text>店长专属：设置本店零售价并上架后，商品才会出现在本店商城。</text></view>
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

      <view v-else-if="workView === 'verify'" class="work-page page-pad" :data-visual-view="workView">
        <view class="sub-head"><button class="icon-button" aria-label="返回会员中心" @click="workView = null"><UiIcon name="arrow-left" :size="20" /></button><view><text class="page-title">订单核销</text><text class="page-sub">到店核对预订/预约信息，确认后核销</text></view></view>
        <view class="security-note"><UiIcon name="shield-check" :size="18" /><text>店员与店长均可核销：顾客到店出示预订信息，核对后点击「核销」，状态变为已核销。</text></view>
        <view v-if="store.vouchers.length" class="voucher-list"><view class="section-head compact"><view><span></span><text>直播套餐券订单（{{ store.vouchers.length }}）</text></view></view><view v-for="voucher in store.vouchers" :key="voucher.id" class="verify-item voucher-verify"><view class="verify-main"><text class="item-title">{{ voucher.id }}</text><small>数量 {{ voucher.quantity }} · ¥{{ voucher.amount.toFixed(2) }} · {{ voucher.status }}</small></view><span class="verify-status" :class="voucher.status === 'paid' ? '' : 'ok'">{{ voucher.status === 'paid' ? '待核销' : voucher.status === 'redeemed' ? '已核销' : '已退款' }}</span><button v-if="voucher.status === 'paid'" class="verify-btn" @click="verifyVoucher(voucher.id)">核销</button><button v-else-if="voucher.status === 'redeemed'" class="verify-btn" @click="refundVoucher(voucher.id)">退款</button><span v-else class="verify-done">✓</span></view></view>
        <view class="list-search"><UiIcon name="search" :size="16" /><input v-model="verifyKeyword" placeholder="搜索预订名称 / 日期 / 状态" /></view>
        <view v-if="!filteredVerifyBookings.length" class="empty-page pc-empty"><UiIcon name="calendar-check" :size="28" /><text>暂无预订记录</text></view>
        <view class="verify-list">
          <view v-for="item in filteredVerifyBookings" :key="item.id" class="verify-item booking-verify">
            <BusinessImage v-if="item.image" class="verify-emoji" :src="item.image" mode="aspectFill" /><view v-else class="verify-emoji icon-placeholder"><UiIcon name="calendar-check" :size="22" /></view>
            <view class="verify-main"><text class="item-title">{{ item.name }}</text><small>{{ item.type === 'service' ? item.date + ' · ' + item.people + ' 人' : item.date + ' · ' + item.session + ' · ' + item.people + ' 人' }}</small></view>
            <span class="verify-status" :class="item.status === 'cancelled' ? 'cancel' : item.status === 'completed' ? 'ok' : ''">{{ farmhouseBookingStatusText(item.status) }}</span>
            <view v-if="isActiveBookingStatus(item.status)" class="verify-amount"><text>¥</text><input type="digit" inputmode="decimal" aria-label="实际消费金额" placeholder="实际金额" :value="bookingAmounts[item.id] ?? item.amount ?? ''" @input="setBookingAmount(item.id, $event)" /></view>
            <button v-if="isActiveBookingStatus(item.status)" class="verify-btn" @click="verifyBooking(item.id)">核销</button>
            <span v-else class="verify-done">{{ item.status === 'cancelled' ? '—' : '✓' }}</span>
          </view>
        </view>
      </view>

      <view v-else-if="workView === 'design-rooms'" class="work-page page-pad" :data-visual-view="workView">
        <view class="sub-head"><button class="icon-button" aria-label="返回会员中心" @click="workView = null"><UiIcon name="arrow-left" :size="20" /></button><view><text class="page-title">设计特色包厢</text><text class="page-sub">新增 / 编辑 / 删除包厢，保存后即时展示到首页与预订页</text></view><button class="text-button" @click="openRoomForm()">＋ 新增包厢</button></view>
        <view class="security-note"><UiIcon name="shield-check" :size="18" /><text>店长专属：包厢名称、容量、场次与状态会展示给顾客，请确保信息准确。</text></view>
        <view class="list-search"><UiIcon name="search" :size="16" /><input v-model="roomKeyword" placeholder="搜索包厢名称 / 容量 / 状态" /></view>
        <view v-if="!filteredRooms.length" class="empty-page pc-empty"><UiIcon name="door-open" :size="28" /><text>还没有包厢，点击右上角「新增包厢」</text></view>
        <view class="design-list">
          <view v-for="room in filteredRooms" :key="room.id" class="design-item">
            <BusinessImage v-if="room.image" class="design-emoji" :src="room.image" mode="aspectFill" /><span v-else class="design-emoji icon-placeholder"><UiIcon name="door-open" :size="24" /></span>
            <view class="design-main"><text class="item-title">{{ room.name }}</text><small>{{ room.capacity }} · {{ room.sessions }} · {{ room.status }}</small></view>
            <view class="design-actions"><button class="design-edit" @click="openRoomForm(room)">编辑</button><button class="design-del" @click="removeRoom(room.id)">删除</button></view>
          </view>
        </view>
      </view>

      <view v-else-if="workView === 'design-foods'" class="work-page page-pad" :data-visual-view="workView">
        <view class="sub-head"><button class="icon-button" aria-label="返回会员中心" @click="workView = null"><UiIcon name="arrow-left" :size="20" /></button><view><text class="page-title">设计招牌土菜</text><text class="page-sub">新增 / 编辑 / 删除菜品，保存后即时展示到首页招牌土菜</text></view><button class="text-button" @click="openFoodForm()">＋ 新增菜品</button></view>
        <view class="security-note"><UiIcon name="shield-check" :size="18" /><text>店长专属：菜品名称、描述与价格会展示给顾客，请确保信息准确。</text></view>
        <view class="list-search"><UiIcon name="search" :size="16" /><input v-model="foodKeyword" placeholder="搜索菜品名称 / 描述" /></view>
        <view v-if="!filteredFoods.length" class="empty-page pc-empty"><UiIcon name="utensils" :size="28" /><text>还没有菜品，点击右上角「新增菜品」</text></view>
        <view class="design-list">
          <view v-for="food in filteredFoods" :key="food.id" class="design-item">
            <BusinessImage v-if="food.image" class="design-emoji" :src="food.image" mode="aspectFill" /><view v-else class="design-emoji icon-placeholder"><UiIcon name="utensils" :size="24" /></view>
            <view class="design-main"><text class="item-title">{{ food.name }}</text><small>{{ food.description }} · {{ money(food.price) }}</small></view>
            <view class="design-actions"><button class="design-edit" @click="openFoodForm(food)">编辑</button><button class="design-del" @click="removeFood(food.id)">删除</button></view>
          </view>
        </view>
      </view>
      <view v-else-if="workView === 'design-experiences'" class="work-page page-pad" :data-visual-view="workView">
        <view class="sub-head"><button class="icon-button" aria-label="返回会员中心" @click="workView = null"><UiIcon name="arrow-left" :size="20" /></button><view><text class="page-title">设计体验项目</text><text class="page-sub">新增 / 编辑 / 删除本店体验项目</text></view><button class="primary-button small" @click="openExperienceForm()">＋ 新增体验</button></view>
        <view class="list-search"><UiIcon name="search" :size="16" /><input v-model="foodKeyword" placeholder="搜索体验项目" /></view>
        <view v-if="!experienceList.length" class="empty-page pc-empty"><UiIcon name="sprout" :size="28" /><text>还没有体验项目</text></view>
        <view class="design-list">
          <view v-for="experience in experienceList" :key="experience.id" class="design-item">
            <BusinessImage v-if="experience.image" class="design-emoji" :src="experience.image" mode="aspectFill" />
            <view class="design-main"><text class="item-title">{{ experience.name }}</text><small>{{ experience.description }} · ¥{{ experience.price }}/人</small></view>
            <view class="design-actions"><button class="design-edit" @click="openExperienceForm(experience)">编辑</button><button class="design-remove" @click="removeExperienceFn(experience)">删除</button></view>
          </view>
        </view>
      </view>

      <view v-else-if="workView === 'staff-admin'" class="work-page page-pad" :data-visual-view="workView">
        <view class="sub-head"><button class="icon-button" aria-label="返回会员中心" @click="workView = null"><UiIcon name="arrow-left" :size="20" /></button><view><text class="page-title">店员管理</text><text class="page-sub">本店店员登录账号 · 推广权限由店长选配</text></view><button class="text-button" @click="openStaffForm()">＋ 新增店员</button></view>
        <view class="security-note"><UiIcon name="shield-check" :size="18" /><text>店员可登录本店核销订单；开启「推广权限」后店员可生成自己的推广码，用户扫码下单后店员按比例分成。</text></view>
        <view class="list-search"><UiIcon name="search" :size="16" /><input v-model="staffKeyword" placeholder="搜索店员姓名 / 账号" /></view>
        <view v-if="!filteredStaffAccounts.length" class="empty-page pc-empty"><UiIcon name="users" :size="28" /><text>本店暂无店员账号，点击右上角「新增店员」</text></view>
        <view class="design-list">
          <view v-for="acc in filteredStaffAccounts" :key="acc.id" class="design-item">
            <view class="design-emoji icon-placeholder"><UiIcon :name="acc.role === 'owner' ? 'store' : 'user-round'" :size="24" /></view>
            <view class="design-main"><text class="item-title">{{ acc.name }}</text><small>{{ acc.account }} · {{ acc.role === 'owner' ? '店主' : '店员' }} · 推广{{ acc.promoEnabled ? '已开' : '关闭' }} · {{ acc.enabled ? '启用' : '停用' }}</small></view>
            <view class="design-actions"><button class="design-edit" @click="openStaffForm(acc)">编辑</button><button class="design-del" @click="store.toggleStoreAccount(acc.id); toast('账号状态已切换')">{{ acc.enabled ? '停用' : '启用' }}</button></view>
          </view>
        </view>
      </view>

      <view v-else-if="workView === 'orders'" class="work-page page-pad" :data-visual-view="workView">
        <view class="sub-head"><button class="icon-button" aria-label="返回会员中心" @click="workView = null"><UiIcon name="arrow-left" :size="20" /></button><view><text class="page-title">我的订单</text><text class="page-sub">共 {{ store.orders.length }} 单 · 中选科技供应链中台统一履约</text></view></view>
        <view class="list-search"><UiIcon name="search" :size="16" /><input v-model="orderKeyword" placeholder="搜索订单号 / 商品" /></view>
        <view v-if="!filteredOrders.length" class="empty-page pc-empty"><UiIcon name="package-check" :size="28" /><text>还没有订单，去商城逛逛吧～</text></view>
        <view class="records order-records">
          <view v-for="item in filteredOrders" :key="item.id" class="rec-line"><BusinessImage v-if="item.items[0]?.image" class="rec-ic" :src="item.items[0].image" mode="aspectFill" /><view v-else class="rec-ic icon-placeholder"><UiIcon name="package" :size="20" /></view><view class="rec-b"><text class="rec-t">{{ orderTitle(item) }}</text><small class="rec-s">{{ money(item.amount) }} · 特产商城</small><small v-if="item.delivery?.mode === 'courier'" class="rec-s">{{ item.courier || '快递直发' }}{{ item.trackingNo ? ' ' + item.trackingNo : '' }} · {{ item.delivery?.address }}</small><small v-if="afterSaleFailureOf(item.id)" class="rec-s">退款失败：{{ afterSaleFailureOf(item.id) }}</small><small v-if="afterSaleRetryOf(item.id)" class="rec-s">{{ afterSaleRetryOf(item.id) }}</small><view class="record-actions"><button class="rebuy-button" @click="repeatOrder(item.id)">再次购买</button><button v-if="item.status === '待发货'" class="rebuy-button" @click="cancelStorefrontOrder(item.id)">取消订单</button><button v-if="item.status === '已完成'" class="rebuy-button" @click="requestStorefrontAfterSale(item.id, 'refund')">申请退款</button><button v-if="item.status === '已完成'" class="rebuy-button" @click="requestStorefrontAfterSale(item.id, 'return')">申请退货</button></view></view><span class="rec-st">{{ platformOrderStatus(item.id) || item.status }}</span><span v-if="afterSaleStatusOf(item.id)" class="rec-st after">{{ afterSaleStatusOf(item.id) }}</span></view>
        </view>
      </view>

      <view v-else-if="workView === 'bookings'" class="work-page page-pad" :data-visual-view="workView">
        <view class="sub-head"><button class="icon-button" aria-label="返回会员中心" @click="workView = null"><UiIcon name="arrow-left" :size="20" /></button><view><text class="page-title">我的预订</text><text class="page-sub">共 {{ store.bookings.length }} 个预订 · 到店出示核销</text></view></view>
        <view class="list-search"><UiIcon name="search" :size="16" /><input v-model="bookingKeyword" placeholder="搜索预订名称 / 日期" /></view>
        <view v-if="!filteredBookings.length" class="empty-page pc-empty"><UiIcon name="calendar-check" :size="28" /><text>还没有预订，去门店逛逛吧～</text></view>
        <view class="records order-records">
          <view v-for="item in filteredBookings" :key="item.id" class="rec-line"><BusinessImage v-if="item.image" class="rec-ic" :src="item.image" mode="aspectFill" /><view v-else class="rec-ic icon-placeholder"><UiIcon name="calendar-days" :size="20" /></view><view class="rec-b"><text class="rec-t">{{ item.name }}</text><small class="rec-s">{{ item.type === 'service' ? item.date + ' · ' + item.people + ' 人' + (item.amount ? ' · ' + money(item.amount) : '') : item.date + ' · ' + item.session + ' · ' + item.people + ' 人' }}</small><button v-if="isActiveBookingStatus(item.status)" class="rebuy-button" @click="cancelBooking(item.id)">取消预订</button></view><span class="rec-st" :class="item.status === 'cancelled' ? 'go' : item.status === 'completed' ? 'ok' : ''">{{ farmhouseBookingStatusText(item.status) }}</span></view>
        </view>
      </view>

      <view v-else-if="workView === 'ledger'" class="work-page page-pad" :data-visual-view="workView">
        <view class="sub-head"><button class="icon-button" aria-label="返回会员中心" @click="workView = null"><UiIcon name="arrow-left" :size="20" /></button><view><text class="page-title">储值记录</text><text class="page-sub">充值 / 消费明细</text></view></view>
        <view class="list-search"><UiIcon name="search" :size="16" /><input v-model="ledgerKeyword" placeholder="搜索描述 / 金额" /></view>
        <view v-if="!filteredLedger.length" class="empty-page pc-empty"><UiIcon name="credit-card" :size="28" /><text>暂无储值流水</text></view>
        <view class="ledger-list">
          <view v-for="entry in filteredLedger" :key="entry.id"><view><text>{{ entry.description }}</text><small>{{ entry.createdAt }} · 余额 {{ money(entry.balance) }}</small></view><strong :class="entry.type">{{ entry.amount > 0 ? '+' : '' }}{{ money(entry.amount) }}</strong></view>
        </view>
      </view>

      <view v-else-if="workView === 'help'" class="work-page page-pad" :data-visual-view="workView">
        <view class="sub-head"><button class="icon-button" aria-label="返回会员中心" @click="workView = null"><UiIcon name="arrow-left" :size="20" /></button><view><text class="page-title">设置与帮助</text><text class="page-sub">收货地址 · 客服 · 关于</text></view></view>
        <view class="help-sheet">
          <view class="help-row address-edit-row"><UiIcon name="map-pin" :size="20" /><view class="help-edit"><text>收货地址</text><input v-model="deliveryAddressDraft" placeholder="请输入收货地址" /></view><button class="address-save" @click="saveDeliveryAddress">保存</button></view>
          <view class="help-row" @click="makePhoneCall"><UiIcon name="headset" :size="20" /><view><text>联系客服</text><small>{{ store.tenant?.phone }} · 营业 {{ store.tenant?.hours }}</small></view><UiIcon name="chevron-right" :size="17" /></view>
          <view class="help-row"><UiIcon name="store" :size="20" /><view><text>关于平台</text><small>中选科技数字供应链与引流服务平台 · 演示版本</small></view><UiIcon name="chevron-right" :size="17" /></view>
          <view class="help-row logout-help" @click="logout"><UiIcon name="door-open" :size="20" /><view><text>退出登录</text><small>退出当前微信登录账号</small></view><UiIcon name="chevron-right" :size="17" /></view>
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
          <view class="quick-grid"><button @click="openReservation('room', '观溪雅间')"><UiIcon name="door-open" :size="22" /><text>包厢预订</text></button><button @click="openReservation('package', '四人欢聚套餐')"><UiIcon name="utensils" :size="22" /><text>套餐预订</text></button><button @click="chooseTab('shop')"><UiIcon name="shopping-bag" :size="22" /><text>特产商城</text></button><button @click="chooseTab('member')"><UiIcon name="crown" :size="22" /><text>会员中心</text></button></view>
          <view class="notice"><UiIcon name="megaphone" :size="18" /><text>端午特惠：到店满 200 减 30，会员储值享 9 折，分享好友下单得佣金～</text></view>
          <view class="section-head"><view><span></span><text>招牌土菜</text></view><button v-if="store.foods.length" @click="sheet = 'foods'">查看更多</button></view>
          <view v-if="store.foods.length" class="food-scroll"><view class="food-list"><view v-for="food in store.foods.slice(0, 4)" :key="food.id" class="food-card"><BusinessImage class="food-thumb" :src="food.image" mode="aspectFill" /><text>{{ food.name }}</text><small>{{ food.description }}</small><view class="food-price"><strong>{{ money(food.price) }}</strong><del v-if="food.originalPrice">{{ money(food.originalPrice) }}</del></view></view></view></view>
          <view v-else class="empty-page home-empty pc-empty"><UiIcon name="utensils" :size="28" /><text>暂无招牌土菜，店主可到会员中心→设计招牌土菜添加</text></view>
          <view class="section-head"><view><span></span><text>特色包厢</text></view><button class="more-button" @click="chooseTab('reserve')">去预订 ›</button></view>
          <view v-if="store.rooms.length" class="room-list"><view v-for="room in store.rooms.slice(0, 2)" :key="room.id" class="room-card"><BusinessImage class="room-emoji" :src="room.image" mode="aspectFill" /><view><text>{{ room.name }}</text><small>{{ room.capacity }}</small></view><button @click="openReservation('room', room.name)">立即预订</button></view></view>
          <view v-else class="empty-page home-empty pc-empty"><UiIcon name="door-open" :size="28" /><text>暂无包厢，店主可到会员中心→设计特色包厢添加</text></view>
          <view class="section-head" @click="openService(experienceList[0])"><view><span></span><text>特色服务</text></view></view>
          <view class="service-grid"><view v-for="s in experienceList" :key="s.id" hover-class="s-hover" @click="openService(s)"><BusinessImage class="s-emoji" :src="s.image" mode="aspectFill" /><text>{{ s.name }}</text><small>{{ s.description }}</small></view></view>
        </view>

        <view v-else-if="activeTab === 'reserve'" class="tab-page page-pad" :data-visual-view="activeTab">
          <view class="mobile-head"><text class="page-title">预约预订</text><text class="page-sub">包厢预定 · 套餐预定 · 到店预约</text></view>
          <view class="section-head compact"><view><span></span><text>选择日期</text></view></view>
          <view class="cats"><button v-for="item in bookingDates" :key="item" :class="{ on: booking.date === item }" @click="booking.date = item">{{ item }}</button></view>
          <view class="section-head compact"><view><span></span><text>包厢预订</text></view></view>
          <view v-if="store.rooms.length" class="reserve-list">
            <view v-for="room in store.rooms" :key="room.id" class="room">
              <BusinessImage class="rimg" :src="room.image" mode="aspectFill" />
              <view class="rb"><view class="rn">{{ room.name }}<text :class="room.status === '仅余晚市' ? 'status-busy' : 'status-free'">{{ room.status }}</text></view><view class="rd">{{ room.capacity }}</view><view class="rfoot"><span class="rd inline-label"><UiIcon name="calendar-days" :size="14" />{{ room.sessions }}</span><button class="booknow" @click="openBookingForm('room', room.name, room.people)">预订</button></view></view>
            </view>
          </view>
          <view v-else class="empty-page home-empty pc-empty"><UiIcon name="door-open" :size="28" /><text>暂无包厢可预订</text></view>
          <view class="section-head compact"><view><span></span><text>套餐预订</text></view><small>含锁定食材</small></view>
          <view class="combo-list">
            <view v-for="pkg in catalogPackages" :key="pkg.id" class="combo">
              <BusinessImage class="ci" :src="pkg.image" mode="aspectFill" />
              <view class="cb"><view class="cn">{{ pkg.name }}</view><view class="cl">{{ pkg.skus[0]?.name || "含锁定食材" }}</view><view class="cprice">{{ money(pkg.skus[0]?.retailPrice || 0) }}</view></view>
              <button class="booknow" @click="openBookingForm('package', pkg.name, 4)">预订</button>
            </view>
          </view>
          <view class="reserve-note"><UiIcon name="bell" :size="16" /><text>{{ reminderNote() }}</text></view>
          <button class="record-link" @click="sheet = 'bookings'"><UiIcon name="calendar-check" :size="18" />查看我的预订（{{ store.bookings.length }}）<UiIcon name="chevron-right" :size="18" /></button>
        </view>
        <view v-else-if="activeTab === 'shop'" class="tab-page page-pad shop-page" :data-visual-view="activeTab">
          <view class="mobile-head"><text class="page-title">特产商城</text><text class="page-sub">土特产 · 农产品 · 套餐券 · 伴手礼</text></view>
                    <view class="chip-scroll"><view class="chips"><button v-for="item in categories" :key="item" :class="{ active: category === item }" :aria-label="item" :title="item" @click="category = item"><BusinessImage class="category-image" :src="productCategoryImage(item, dictionaryState)" :fallback="defaultProductCategoryImage(item)" :error-fallback="defaultProductCategoryImage()" :show-error="false" mode="aspectFill" /><text class="category-label">{{ item }}</text></button></view></view>
          <view class="supply-note"><UiIcon name="factory" :size="18" /><text>带「中台供」标识的商品来自<b>中选科技供应链中台</b>，统一品控、统一履约、价格更优。</text></view>
          <view v-if="activePolicies.length" class="policy-hint"><UiIcon name="badge-percent" :size="16" /><text>中台价格策略：<b>{{ activePolicies.map((p) => p.name).join('、') }}</b> 已生效</text></view>
          <view v-if="visibleProducts.length" class="waterfall-grid">
            <view v-for="(column, columnIndex) in waterfallColumns" :key="columnIndex" class="waterfall-column">
             <view v-for="product in column" :key="product.id" class="product-card"><button class="product-image product-open" :aria-label="`查看${product.name}`" @click="openProduct(product)"><BusinessImage class="product-emoji" :src="product.image" mode="aspectFill" /><text v-if="product.source === 'platform'" data-typography-compact>中台供</text></button><view class="product-body"><text class="item-title">{{ product.name }}</text><view class="product-tag-row"><span class="source-tag">{{ displayProductTags(product, 'store')[0] || '门店商品' }}</span><span v-if="isExpressDeliverable(product)" class="express-tag">快递直发</span></view><small class="muted">{{ canStartProductOrder(product) ? `库存 ${product.skus.reduce((sum, sku) => sum + sku.stock, 0)}` : '库存不足或数量未达要求' }}</small><view><strong>{{ money(product.price) }}</strong><button :aria-label="`加入${product.name}到购物车`" :disabled="!canStartProductOrder(product)" @click="addProduct(product)"><UiIcon name="plus" :size="18" /></button></view></view></view>
            </view>
          </view>
          <view v-else class="empty-page pc-empty"><view class="pc-state-icon"><UiIcon name="search" :size="26" /></view><text>没有找到相关商品</text><small>试试其他关键词或分类</small></view>
        </view>

        <view v-else class="tab-page member-page" :data-visual-view="activeTab">
          <template v-if="store.auth.isLoggedIn">
<view class="mobile-head"><text class="page-title">会员中心</text><text class="page-sub">会员充值 · 等级权益 · 积分优惠券<text v-if="canPromote"> · 分销推广</text></text></view>
<view class="member-body pc-page">
<view class="member-hero pc-hero"><span class="lv pc-hero-badge"><UiIcon name="crown" :size="15" />黄金会员</span><text class="uname pc-hero-name">{{ store.member.name }}</text><small class="uid pc-hero-uid">{{ store.member.memberNo || 'SBX·8829' }} · 已享专属价</small><view class="mbal pc-hero-data"><view><small>储值余额</small><strong>{{ money(store.balance) }}</strong></view><view><small>积分</small><strong>{{ store.points.toLocaleString('zh-CN') }}</strong></view></view><button class="recharge pc-hero-action" @click="recharge">充值 ＋</button></view>
<view class="pc-section-title"><view class="pc-bar"></view><text>我的服务</text></view>
<view class="mine-list pc-grid"><button class="pc-grid-item" @click="workView = 'orders'"><view class="pc-grid-icon"><UiIcon name="package-check" :size="20" /></view><view class="pc-grid-main"><text>我的订单</text><small>共 {{ store.orders.length }} 单</small></view></button><button class="pc-grid-item" @click="workView = 'bookings'"><view class="pc-grid-icon"><UiIcon name="calendar-check" :size="20" /></view><view class="pc-grid-main"><text>我的预订</text><small>共 {{ store.bookings.length }} 个预订</small></view></button><button class="pc-grid-item" @click="workView = 'ledger'"><view class="pc-grid-icon"><UiIcon name="credit-card" :size="20" /></view><view class="pc-grid-main"><text>储值记录</text><small>充值 / 消费明细</small></view></button><button class="pc-grid-item" @click="openHelp()"><view class="pc-grid-icon"><UiIcon name="headset" :size="20" /></view><view class="pc-grid-main"><text>设置与帮助</text><small>收货地址 · 客服 · 关于</small></view></button></view>
<view class="role-block pc-card"><view class="pc-section-title"><view class="pc-bar"></view><text>切换演示身份</text></view><view class="segmented roles pc-seg"><button v-for="role in (['customer','staff','manager'] as Role[])" :key="role" :class="{ active: store.role === role }" @click="chooseRole(role)">{{ roleNames[role] }}</button></view><text class="role-help pc-help">{{ store.role === 'customer' ? '浏览、预订、商城和会员功能' : store.role === 'staff' ? '包含顾客功能，并可核销订单' : '包含全部功能，并可设计包厢土菜、选品上架、核销订单' }}</text></view>
<view v-if="canPromote" class="promotion"><view><UiIcon name="badge-dollar-sign" :size="24" /><text>分销推广中心</text><small>分享门店 / 商品给好友，好友下单你就赚佣金。员工、老客户、推客、主播均可参与，形成私域裂变。</small></view><view class="promo-stats"><view><text>累计佣金</text><strong>¥{{ formatNumber(store.member.cumulativeCommission ?? 0) }}</strong></view><view><text>我的粉丝</text><strong>{{ store.member.fans ?? 0 }}</strong></view><view><text>本月订单</text><strong>{{ store.member.monthlyOrders ?? 0 }}</strong></view></view><button @click="sheet = 'share'"><UiIcon name="link" :size="16" />生成我的专属推广海报</button></view>
<view v-if="store.canOperate" class="workbench"><view class="pc-section-title pc-light-title"><view class="pc-bar"></view><text>店铺经营工作台</text></view><button @click="workView = 'verify'"><UiIcon name="check" :size="21" /><view><text>订单核销</text><small>到店核销预订/预约订单</small></view><UiIcon name="chevron-right" :size="18" /></button><button v-if="store.canSelect" @click="workView = 'design-rooms'"><UiIcon name="door-open" :size="21" /><view><text>设计特色包厢</text><small>新增 / 编辑 / 删除包厢</small></view><UiIcon name="chevron-right" :size="18" /></button><button v-if="store.canSelect" @click="workView = 'design-foods'"><UiIcon name="utensils" :size="21" /><view><text>设计招牌土菜</text><small>新增 / 编辑 / 删除菜品</small></view><UiIcon name="chevron-right" :size="18" /></button><button v-if="store.canSelect" @click="workView = 'design-experiences'"><UiIcon name="sprout" :size="21" /><view><text>设计体验项目</text><small>新增 / 编辑 / 删除体验</small></view><UiIcon name="chevron-right" :size="18" /></button><button v-if="store.canSelect" @click="workView = 'select'"><UiIcon name="tags" :size="21" /><view><text>选品上架</text><small>自主定价并上架到本店商城</small></view><UiIcon name="chevron-right" :size="18" /></button><button v-if="store.role === 'manager'" @click="workView = 'staff-admin'"><UiIcon name="users" :size="21" /><view><text>店员管理</text><small>添加登录账号 · 配置推广权限</small></view><UiIcon name="chevron-right" :size="18" /></button><button v-if="myStaffPromoEnabled" @click="openStaffPromo()"><UiIcon name="link" :size="21" /><view><text>我的推广码</text><small>生成店员推广码 / 链接</small></view><UiIcon name="chevron-right" :size="18" /></button></view>
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
                <view class="login-prompt-icon icon-placeholder"><UiIcon name="user-round-check" :size="30" /></view>
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
           <view class="sheet-head"><text>{{ sheet === 'login' ? '微信登录' : sheet === 'service' ? (selectedService?.name || '服务详情') : sheet === 'cart' ? '购物车结算' : sheet === 'orders' ? '我的订单' : sheet === 'bookings' ? '我的预订' : sheet === 'room-form' ? (editingRoomId ? '编辑包厢' : '新增包厢') : sheet === 'food-form' ? (editingFoodId ? '编辑菜品' : '新增菜品') : sheet === 'experience-form' ? (editingExperienceId ? '编辑体验' : '新增体验') : sheet === 'product' ? '商品详情' : sheet === 'booking-form' ? booking.name : sheet === 'contact' ? `联系${store.tenant?.name || ''}` : sheet === 'after-sale' ? '售后申请' : sheet === 'foods' ? '招牌菜品' : sheet === 'ledger' ? '储值明细' : sheet === 'recharge' ? '会员储值充值' : sheet === 'identity' ? '切换身份' : sheet === 'staff-form' ? (staffForm.id ? '编辑店员' : '新增店员') : sheet === 'staff-promo' ? '我的推广码' : sheet === 'help' ? '设置与帮助' : '专属推广海报' }}</text><button aria-label="关闭弹层" @click="sheet = null"><UiIcon name="x" :size="19" /></button></view>
<view v-if="sheet === 'login'" class="login-sheet">
          <view class="login-sheet-icon icon-placeholder"><UiIcon name="user-round-check" :size="28" /></view>
          <text class="login-sheet-title">{{ loginRole === 'customer' ? '微信一键登录' : '账号密码登录' }}</text>
          <text class="login-sheet-sub">登录「{{ store.tenant?.name || '中选科技农家乐门店端' }}」前，请先选择身份</text>
          <view class="segmented roles login-roles">
            <button v-for="role in (['customer','staff','manager'] as Role[])" :key="role" :class="{ active: loginRole === role }" @click="loginRole = role">{{ roleNames[role] }}</button>
          </view>
          <text class="role-help login-role-help">{{ loginRole === 'customer' ? '浏览、预订、商城和会员功能（免登录）' : loginRole === 'staff' ? '店员账号登录，包含顾客功能，并可核销订单' : '店主账号登录，包含全部功能，并可设计包厢土菜、选品上架、核销订单' }}</text>
          <template v-if="loginRole === 'customer'">
            <button class="primary-button" :disabled="wechatLoggingIn" @click="wechatLogin">微信一键登录</button>
            <text class="login-sheet-tip">模拟微信授权 · 小程序端走 uni.login 获取 openid</text>
          </template>
          <template v-else>
            <label class="form-field"><text>登录账号</text><input v-model="accountLoginInput" placeholder="手机号 / 账号" /></label>
            <label class="form-field"><text>登录密码</text><input v-model="accountPasswordInput" type="password" placeholder="请输入密码" /></label>
            <button class="primary-button" @click="loginAccount()">登 录</button>
            <text class="login-sheet-tip">店主 / 店员账号由后台「农家乐管理 → 门店账号」配置</text>
          </template>
        </view>

           <view v-else-if="sheet === 'cart'" class="sheet-list"><view v-if="!store.cart.length" class="empty">购物车还是空的</view><view v-for="item in store.cart" :key="`${item.productId}-${item.skuId}`" class="sheet-line" :class="{ shortage: item.unavailable }"><BusinessImage :src="item.image" mode="aspectFill" /><view><text>{{ item.name }}</text><small>{{ item.skuName }} · 库存 {{ item.stock }}</small><small v-if="item.unavailable" class="stock-warning">库存不足或购买数量未达要求，不可结算</small><strong>{{ money(item.price) }}</strong></view><view class="stepper"><button aria-label="减少数量" @click="store.changeCart(item.productId, item.skuId, -1)">−</button><text>{{ item.quantity }}</text><button aria-label="增加数量" :disabled="item.quantity >= item.stock" @click="store.changeCart(item.productId, item.skuId, 1)">+</button></view></view><text v-if="store.checkoutError" class="cart-error">{{ store.checkoutError }}</text><view v-if="cartHasExpress" class="delivery-picker"><text class="delivery-label">配送方式</text><view class="ui-chips"><button :class="{ sel: deliveryMode === 'pickup' }" @click="deliveryMode = 'pickup'">到店自提</button><button :class="{ sel: deliveryMode === 'courier' }" @click="deliveryMode = 'courier'">快递配送</button></view><label v-if="deliveryMode === 'courier'" class="form-field"><text>收货地址</text><input v-model="deliveryAddressDraft" placeholder="省市区 + 详细地址" /></label></view><view v-if="store.cart.length" class="checkout-summary"><view><text>储值余额</text><strong>{{ money(store.balance) }}</strong></view><view><text>应付合计</text><strong>{{ money(store.cartTotal) }}</strong></view><button class="primary-button" :disabled="store.cartHasUnavailable" @click="checkout">提交订单</button></view></view>

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
            <button class="primary-button" @click="saveRoomForm">{{ editingRoomId ? '保存修改' : '新增包厢' }}</button>
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
            <button class="primary-button" @click="saveFoodForm">{{ editingFoodId ? '保存修改' : '新增菜品' }}</button>
          </view>
          <view v-else-if="sheet === 'experience-form'" class="design-form">
            <label class="form-field"><text>体验名称</text><input v-model="experienceForm.name" placeholder="如：农事采摘体验" /></label>
            <view class="form-field"><text>体验分类</text><view class="choice-row"><button v-for="opt in experienceCategoryOptions" :key="opt.code" :class="{ active: experienceForm.categoryCode === opt.code }" @click="experienceForm.categoryCode = opt.code">{{ opt.label }}</button></view></view>
            <label class="form-field"><text>体验描述</text><input v-model="experienceForm.description" placeholder="如：应季果蔬采摘 · 亲子互动" /></label>
            <label class="form-field"><text>价格（元/人）</text><input v-model.number="experienceForm.price" type="digit" /></label>
            <view class="form-field"><text>体验图片</text><ImageUploader v-model="experienceForm.image" purpose="experience" profile="normal" /></view>
            <button class="primary-button" @click="saveExperienceForm">{{ editingExperienceId ? '保存修改' : '新增体验' }}</button>
          </view>




           <view v-else-if="sheet === 'product' && selectedProduct" class="product-detail"><BusinessImage :src="selectedProduct.image" mode="aspectFill" /><text>{{ selectedProduct.name }}</text><small>{{ displayProductTags(selectedProduct, 'store').join(' · ') }}</small><view v-if="selectedProduct.skus.length > 1" class="sku-options"><button v-for="sku in selectedProduct.skus" :key="sku.id" :class="{ active: selectedSkuId === sku.id }" :disabled="!canStartOrder(sku)" @click="selectedSkuId = sku.id"><text>{{ sku.name }}</text><small>{{ money(sku.price) }} · 库存 {{ sku.stock }}</small><small v-if="!canStartOrder(sku)" class="stock-warning">库存不足或数量未达要求</small></button></view><small v-else-if="selectedSku">库存 {{ selectedSku.stock }}</small><small v-if="selectedSku && !canStartOrder(selectedSku)" class="stock-warning">库存不足或数量未达要求</small><view class="product-detail-actions"><button class="outline-button" @click="shareProduct(selectedProduct)">分享商品</button><button class="primary-button" :disabled="!canStartOrder(selectedSku)" @click="addSelectedProduct">加入购物车</button></view></view>
           <view v-else-if="sheet === 'booking-form'" class="booking-sheet"><small class="booking-sub">选择日期 / 场次 / 人数，确认后将发送到店提醒</small><view class="booking-section"><text class="inline-label"><UiIcon name="calendar-days" :size="16" />选择日期</text><view class="ui-chips"><button v-for="item in bookingDates.slice(0, 3)" :key="item" :class="{ sel: booking.date === item }" @click="booking.date = item">{{ item }}</button></view></view><view class="booking-section"><text class="inline-label"><UiIcon name="bell" :size="16" />选择场次</text><view class="ui-chips"><button v-for="opt in (bookingSessionOptions.length ? bookingSessionOptions : [{ label: '午市 11:00' }, { label: '晚市 17:30' }])" :key="opt.label" :class="{ sel: booking.session === opt.label }" @click="booking.session = opt.label">{{ opt.label }}</button></view></view><view class="booking-section"><text class="inline-label"><UiIcon name="users" :size="16" />用餐人数</text><view class="ui-chips"><button v-for="item in [4,6,8,10,20]" :key="item" :class="{ sel: booking.people === item }" @click="booking.people = item">{{ item }} 人</button></view></view><button class="primary-button" @click="submitBooking">确认预订</button></view>
          <view v-else-if="sheet === 'after-sale' && afterSaleTarget" class="design-form">
            <view class="form-field"><text>售后类型</text><view class="choice-row"><button :class="{ active: afterSaleTarget.type === 'refund' }" @click="afterSaleTarget.type = 'refund'">申请退款</button><button :class="{ active: afterSaleTarget.type === 'return' }" @click="afterSaleTarget.type = 'return'">申请退货</button></view></view>
            <view class="form-field"><text>上传凭证（1-6 张，可选）</text><ImageUploader v-model="afterSaleEvidence" multiple :max-count="6" purpose="after-sale" profile="license" /></view>
            <small class="form-hint">提交后平台将结合凭证审核</small>
            <button class="primary-button" @click="confirmStorefrontAfterSale">提交售后申请</button>
          </view>
<view v-else-if="sheet === 'contact'" class="contact-sheet"><small class="contact-sub">营业 {{ store.tenant?.hours }} · {{ store.tenant?.slogan }}</small><view class="ui-opt sel" @click="copyPhone"><text>门店电话</text><span>{{ store.tenant?.phone }}</span></view><button class="primary-button" @click="makePhoneCall"><UiIcon name="phone" :size="18" />拨打电话</button><button class="outline-button" @click="sheet = null">取消</button></view>
          <view v-else-if="sheet === 'foods'" class="food-detail-list"><view v-if="!store.foods.length" class="empty">暂无招牌菜品</view><view v-for="food in store.foods" :key="food.id"><BusinessImage :src="food.image" mode="aspectFill" /><view><text>{{ food.name }}</text><small>{{ food.description }}</small></view><strong>{{ money(food.price) }}</strong><button @click="sheet = null; openReservation('package', food.name)">预订</button></view></view><view v-else-if="sheet === 'service' && selectedService" class="service-detail"><BusinessImage class="s-emoji" :src="selectedService.image" mode="aspectFill" /><text class="s-name">{{ selectedService.name }}</text><small class="s-desc">{{ selectedService.description }}</small><view class="s-rows"><view><text>体验类型</text><strong>{{ selectedService.categoryCode }}</strong></view><view><text>状态</text><strong>{{ selectedService.status === 'active' ? '在售' : '下架' }}</strong></view></view><view class="s-order"><text class="inline-label"><UiIcon name="calendar-days" :size="16" />选择日期</text><view class="ui-chips"><button v-for="d in bookingDates.slice(0, 3)" :key="d" :class="{ sel: serviceBooking.date === d }" @click="serviceBooking.date = d">{{ d }}</button></view></view><view class="s-order"><text class="inline-label"><UiIcon name="users" :size="16" />人数</text><view class="ui-chips"><button v-for="p in [2, 4, 6, 8]" :key="p" :class="{ sel: serviceBooking.people === p }" @click="serviceBooking.people = p">{{ p }} 人</button></view></view><view class="s-fee"><text>费用</text><strong>¥{{ selectedService.price }}/人 × {{ serviceBooking.people }} 人 = ¥{{ serviceFee }}</strong></view><button class="primary-button" @click="submitServiceOrder">确认下单</button><button class="outline-button" @click="makePhoneCall"><UiIcon name="phone" :size="18" />电话咨询</button></view>
           <view v-else-if="sheet === 'recharge'" class="recharge-confirm"><text class="recharge-sub">当前余额 {{ money(store.balance) }} · 储值享 9 折，可用于堂食与商城</text><view class="ui-chips"><button v-for="item in [100,300,500,1000]" :key="item" :class="{ sel: rechargeAmount === item }" @click="rechargeAmount = item">¥{{ item }}</button></view><button class="primary-button" @click="confirmRecharge">确认充值</button></view>
          <view v-else-if="sheet === 'identity'" class="identity-sheet"><small class="identity-sub">演示不同角色可见的功能权限</small><view class="identity-options"><button v-for="role in (['customer','staff','manager'] as Role[])" :key="role" :class="{ sel: store.role === role }" @click="chooseRole(role); sheet = null"><UiIcon :name="role === 'manager' ? 'store' : role === 'staff' ? 'user-round-check' : 'user-round'" :size="20" /><view><text>{{ roleNames[role] }}</text><small>{{ role === 'customer' ? '普通消费者 · 仅购物、预订与会员' : role === 'staff' ? '可见「店员专区」· 核销订单' : '设计包厢/土菜 + 选品上架 + 核销订单 · 管理本店' }}</small></view><span>{{ store.role === role ? '✓' : '›' }}</span></button></view><button class="outline-button" @click="sheet = null">取消</button></view>
          <view v-else-if="sheet === 'staff-form'" class="design-form">
            <label class="form-field"><text>姓名</text><input v-model="staffForm.name" placeholder="如 李店员" /></label>
            <label class="form-field"><text>登录账号（手机号）</text><input v-model="staffForm.account" placeholder="如 13800000002" /></label>
            <label class="form-field"><text>登录密码</text><input v-model="staffForm.password" placeholder="如 123456" /></label>
            <view class="form-field"><text>角色</text><view class="choice-row"><button :class="{ active: staffForm.role === 'staff' }" @click="staffForm.role = 'staff'">店员</button><button :class="{ active: staffForm.role === 'owner' }" @click="staffForm.role = 'owner'">店主</button></view></view>
            <view class="form-field"><text>店员推广权限</text><view class="choice-row"><button :class="{ active: staffForm.promoEnabled }" @click="staffForm.promoEnabled = true">开启（可生成推广码）</button><button :class="{ active: !staffForm.promoEnabled }" @click="staffForm.promoEnabled = false">关闭</button></view></view>
            <button class="primary-button" @click="saveStaffForm">{{ staffForm.id ? '保存修改' : '新增店员' }}</button>
          </view>
          <view v-else-if="sheet === 'staff-promo'" class="staff-promo-sheet">
            <view class="qr-box"><image v-if="staffQrDataUrl" :src="staffQrDataUrl" mode="aspectFit" /><view v-else class="qr-placeholder">二维码（H5 生成）</view></view>
            <text class="staff-promo-title">我的店员推广码</text>
            <small class="staff-promo-sub">用户扫码进入本店并绑定我，用户下单后我按店员比例参与分成</small>
            <view class="staff-promo-link">{{ staffPromoLink() }}</view>
            <button class="primary-button" @click="copyStaffPromoLink"><UiIcon name="link" :size="18" />复制推广链接</button>
          </view>
          <view v-else class="poster-sheet"><small class="poster-sub">分享给好友，好友下单即可获得佣金</small><view class="ui-opt sel"><text>推广门店</text><span>{{ store.tenant?.name }}</span></view><button class="primary-button" @click="sharePromotion"><UiIcon name="link" :size="18" />复制推广链接</button><button class="outline-button" @click="sheet = null">取消</button></view>
        </view>
      </view>
    </template>
  </view>
</template>

<style scoped lang="scss" src="../../styles/index-page.scss"></style>
