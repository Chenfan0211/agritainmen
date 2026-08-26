<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app'
import type { BusinessMediaValue, Booking, FarmExperience, Product, Role, StoreAccount, StoreRole, StorefrontOrder } from '@agritainment/shared'
import { calcMargin, createPlatformDictionaryCache, displayProductTags, formatNumber, installKeyboardButtonSupport, isExpressDeliverable, mediaValueToImage, money, readPlatformAfterSaleStatus, readCatalogState, readPlatformEntities, readPlatformOrderStatus, subscribePlatformChanges } from '@agritainment/shared'
import { BusinessImage, ImageUploader } from '@agritainment/ui'
import UiIcon from '../../components/UiIcon.vue'
// #ifdef H5
import qrcode from 'qrcode-generator'
// #endif
import { useFarmhouseStore, type FoodItem, type Room } from '../../stores/farmhouse'

type TabKey = 'home' | 'reserve' | 'shop' | 'member'
type WorkView = 'select' | 'verify' | 'design-rooms' | 'design-foods' | 'design-experiences' | 'staff-admin' | 'orders' | 'bookings' | 'ledger' | 'help' | null
type SheetKey = 'login' | 'cart' | 'orders' | 'bookings' | 'room-form' | 'food-form' | 'experience-form' | 'share' | 'product' | 'contact' | 'foods' | 'ledger' | 'recharge' | 'identity' | 'help' | 'booking-form' | 'after-sale' | 'service' | 'staff-form' | 'staff-promo' | null

let disposePlatformChanges: (() => void) | null = null

const store = useFarmhouseStore()
const dictCache = createPlatformDictionaryCache()
let disposeKeyboardButtons: () => void = () => undefined
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

function checkout() {
  if (!requireLogin(() => checkout())) return
  const address = deliveryMode.value === 'courier' ? deliveryAddressDraft.value.trim() : ''
  if (!store.checkout({ deliveryMode: deliveryMode.value, address })) return toast(store.checkoutError)
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
  if (!item || item.status !== 'reserved') return
  const amount = Number(bookingAmounts[id] || item.amount || 0)
  if (!Number.isFinite(amount) || amount <= 0) return toast('请填写本次预约实际消费金额')
  uni.showModal({
    title: '核销预订',
    content: `确认核销「${item.name}」，实际消费 ¥${amount.toFixed(2)}？核销后状态不可回退。`,
    success: (res) => {
      if (!res.confirm) return
      if (!store.verifyBooking(id, amount)) return
      toast('核销成功')
    }
  })
}
function setBookingAmount(id: string, event: Event) {
  bookingAmounts[id] = (event.target as HTMLInputElement).value
}
function verifyVoucher(id: string) {
  if (!store.redeemVoucher(id)) return toast('券订单当前不能核销')
  toast('券订单核销成功')
}

function refundVoucher(id: string) {
  if (!store.refundVoucher(id)) return toast('券订单当前不能退款')
  toast('券订单已退款并冲正佣金')
}

function cancelBooking(id: string) {
  if (!requireLogin(() => cancelBooking(id))) return
  if (!store.cancelBooking(id)) return
  toast('预订已取消')
}



const platformOrderStatus = (orderId: string) => readPlatformOrderStatus(orderId)
const afterSaleStatusOf = (orderId: string) => readPlatformAfterSaleStatus(orderId)
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

function cancelStorefrontOrder(id: string) {
  if (!store.cancelStorefrontOrder(id)) return toast(store.checkoutError || '当前订单不能取消')
  toast('订单已取消，余额和库存已恢复')
}

function requestStorefrontAfterSale(id: string, type: 'refund' | 'return') {
  afterSaleTarget.value = { id, type }
  afterSaleEvidence.value = []
  sheet.value = 'after-sale'
}
function confirmStorefrontAfterSale() {
  const target = afterSaleTarget.value
  if (!target) return
  if (!store.requestStorefrontAfterSale(target.id, target.type, afterSaleEvidence.value.length ? afterSaleEvidence.value : undefined)) return toast('当前订单不能申请售后')
  sheet.value = null
  afterSaleTarget.value = null
  toast(target.type === 'refund' ? '退款申请已提交' : '退货申请已提交')
}

function completeStorefrontAfterSale(id: string) {
  if (!store.completeStorefrontAfterSale(id)) return toast(store.checkoutError || '售后暂不能完成')
  toast('售后已完成')
}

onMounted(async () => {
  disposeKeyboardButtons = installKeyboardButtonSupport()
  const query = uni.getLaunchOptionsSync().query || {}
  const scenario = query.mock
  if (scenario === 'empty' || scenario === 'failure') store.setMockScenario(scenario)
  let runtimeFarm: unknown
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
      const qty = Math.max(1, Number(query.qty) || 1)
      if (sku && sku.stock > 0) {
        const result = store.addToCart(directProduct, sku.id)
        if (result !== 'out-of-stock') {
          for (let i = 1; i < qty; i++) store.changeCart(directProduct.id, sku.id, 1)
          sheet.value = 'cart'
        } else {
          toast('套餐库存不足')
        }
      } else {
        toast('该套餐暂不可购')
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
})
  if (typeof window !== 'undefined') {
    const onStorage = () => void store.refreshSharedState()
    window.addEventListener('storage', onStorage)
    disposePlatformChanges = () => window.removeEventListener('storage', onStorage)
  }

onBeforeUnmount(() => { disposeKeyboardButtons(); disposePlatformChanges?.(); disposePlatformChanges = null; dictCache.dispose() })

onShareAppMessage(() => ({ title: store.tenant?.name || '石板溪农家乐', path: '/pages/index/index?from=share' }))
onShareTimeline(() => ({ title: store.tenant?.name || '石板溪农家乐' }))
</script>

<template>
  <view class="app-shell">
    <view v-if="store.loading" class="loading">正在准备门店...</view>
    <view v-else-if="store.error" class="state-page"><UiIcon name="radio" :size="28" /><text>{{ store.error }}</text><button class="primary-button" @click="retryLoad">重新加载</button></view>
    <template v-else>
      <view v-if="workView === 'select'" class="work-page page-pad">
        <view class="sub-head"><button class="icon-button" aria-label="返回会员中心" @click="workView = null"><UiIcon name="arrow-left" :size="20" /></button><view><text class="page-title">选品上架</text><text class="page-sub">从统一商品目录选品 · 设置本店价格与上下架状态</text></view></view>
        <view class="work-metric-band"><view><small>目录可选</small><strong>{{ store.selectableProducts.length }} 款</strong></view><view><small>本店已上架</small><strong>{{ store.products.length }} 款</strong></view><view><small>建议毛利率</small><strong>30%+</strong></view></view>
        <view class="security-note"><UiIcon name="shield-check" :size="18" /><text>店长专属：设置本店零售价并上架后，商品才会出现在本店商城。</text></view>
        <view class="section-head compact"><view><span></span><text>统一目录商品</text></view><small>供货价 → 本店零售价</small></view>
        <view class="list-search"><UiIcon name="search" :size="16" /><input v-model="selectKeyword" placeholder="搜索商品名称 / 品类" /></view>
        <view class="select-list">
          <view v-for="product in filteredSelectable" :key="product.id" class="select-item">
            <view class="si-head">
              <BusinessImage class="select-emoji" :src="product.image" mode="aspectFit" />
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

      <view v-else-if="workView === 'verify'" class="work-page page-pad">
        <view class="sub-head"><button class="icon-button" aria-label="返回会员中心" @click="workView = null"><UiIcon name="arrow-left" :size="20" /></button><view><text class="page-title">订单核销</text><text class="page-sub">到店核对预订/预约信息，确认后核销</text></view></view>
        <view class="security-note"><UiIcon name="shield-check" :size="18" /><text>店员与店长均可核销：顾客到店出示预订信息，核对后点击「核销」，状态变为已核销。</text></view>
        <view v-if="store.vouchers.length" class="voucher-list"><view class="section-head compact"><view><span></span><text>直播套餐券订单（{{ store.vouchers.length }}）</text></view></view><view v-for="voucher in store.vouchers" :key="voucher.id" class="verify-item"><view class="verify-main"><text class="item-title">{{ voucher.id }}</text><small>数量 {{ voucher.quantity }} · ¥{{ voucher.amount.toFixed(2) }} · {{ voucher.status }}</small></view><span class="verify-status" :class="voucher.status === 'paid' ? '' : 'ok'">{{ voucher.status === 'paid' ? '待核销' : voucher.status === 'redeemed' ? '已核销' : '已退款' }}</span><button v-if="voucher.status === 'paid'" class="verify-btn" @click="verifyVoucher(voucher.id)">核销</button><button v-else-if="voucher.status === 'redeemed'" class="verify-btn" @click="refundVoucher(voucher.id)">退款</button><span v-else class="verify-done">✓</span></view></view>
        <view class="list-search"><UiIcon name="search" :size="16" /><input v-model="verifyKeyword" placeholder="搜索预订名称 / 日期 / 状态" /></view>
        <view v-if="!filteredVerifyBookings.length" class="empty-page"><UiIcon name="calendar-check" :size="28" /><text>暂无预订记录</text></view>
        <view class="verify-list">
          <view v-for="item in filteredVerifyBookings" :key="item.id" class="verify-item">
            <BusinessImage v-if="item.image" class="verify-emoji" :src="item.image" mode="aspectFit" /><view v-else class="verify-emoji emoji-thumb">🪟</view>
            <view class="verify-main"><text class="item-title">{{ item.name }}</text><small>{{ item.type === 'service' ? item.date + ' · ' + item.people + ' 人' : item.date + ' · ' + item.session + ' · ' + item.people + ' 人' }}</small></view>
            <span class="verify-status" :class="item.status === 'reserved' ? '' : item.status === 'cancelled' ? 'cancel' : 'ok'">{{ item.status === 'reserved' ? '已确认' : item.status === 'cancelled' ? '已取消' : '已核销' }}</span>
            <view v-if="item.status === 'reserved'" class="verify-amount"><text>¥</text><input type="digit" inputmode="decimal" aria-label="实际消费金额" placeholder="实际金额" :value="bookingAmounts[item.id] ?? item.amount ?? ''" @input="setBookingAmount(item.id, $event)" /></view>
            <button v-if="item.status === 'reserved'" class="verify-btn" @click="verifyBooking(item.id)">核销</button>
            <span v-else class="verify-done">{{ item.status === 'cancelled' ? '—' : '✓' }}</span>
          </view>
        </view>
      </view>

      <view v-else-if="workView === 'design-rooms'" class="work-page page-pad">
        <view class="sub-head"><button class="icon-button" aria-label="返回会员中心" @click="workView = null"><UiIcon name="arrow-left" :size="20" /></button><view><text class="page-title">设计特色包厢</text><text class="page-sub">新增 / 编辑 / 删除包厢，保存后即时展示到首页与预订页</text></view><button class="text-button" @click="openRoomForm()">＋ 新增包厢</button></view>
        <view class="security-note"><UiIcon name="shield-check" :size="18" /><text>店长专属：包厢名称、容量、场次与状态会展示给顾客，请确保信息准确。</text></view>
        <view class="list-search"><UiIcon name="search" :size="16" /><input v-model="roomKeyword" placeholder="搜索包厢名称 / 容量 / 状态" /></view>
        <view v-if="!filteredRooms.length" class="empty-page"><UiIcon name="door-open" :size="28" /><text>还没有包厢，点击右上角「新增包厢」</text></view>
        <view class="design-list">
          <view v-for="room in filteredRooms" :key="room.id" class="design-item">
            <BusinessImage v-if="room.image" class="design-emoji" :src="room.image" mode="aspectFit" /><span v-else class="design-emoji emoji-thumb">{{ room.emoji || '🪟' }}</span>
            <view class="design-main"><text class="item-title">{{ room.name }}</text><small>{{ room.capacity }} · {{ room.sessions }} · {{ room.status }}</small></view>
            <view class="design-actions"><button class="design-edit" @click="openRoomForm(room)">编辑</button><button class="design-del" @click="removeRoom(room.id)">删除</button></view>
          </view>
        </view>
      </view>

      <view v-else-if="workView === 'design-foods'" class="work-page page-pad">
        <view class="sub-head"><button class="icon-button" aria-label="返回会员中心" @click="workView = null"><UiIcon name="arrow-left" :size="20" /></button><view><text class="page-title">设计招牌土菜</text><text class="page-sub">新增 / 编辑 / 删除菜品，保存后即时展示到首页招牌土菜</text></view><button class="text-button" @click="openFoodForm()">＋ 新增菜品</button></view>
        <view class="security-note"><UiIcon name="shield-check" :size="18" /><text>店长专属：菜品名称、描述与价格会展示给顾客，请确保信息准确。</text></view>
        <view class="list-search"><UiIcon name="search" :size="16" /><input v-model="foodKeyword" placeholder="搜索菜品名称 / 描述" /></view>
        <view v-if="!filteredFoods.length" class="empty-page"><UiIcon name="utensils" :size="28" /><text>还没有菜品，点击右上角「新增菜品」</text></view>
        <view class="design-list">
          <view v-for="food in filteredFoods" :key="food.id" class="design-item">
            <BusinessImage v-if="food.image" class="design-emoji" :src="food.image" mode="aspectFill" /><view v-else class="design-emoji empty-box"></view>
            <view class="design-main"><text class="item-title">{{ food.name }}</text><small>{{ food.description }} · {{ money(food.price) }}</small></view>
            <view class="design-actions"><button class="design-edit" @click="openFoodForm(food)">编辑</button><button class="design-del" @click="removeFood(food.id)">删除</button></view>
          </view>
        </view>
      </view>
      <view v-else-if="workView === 'design-experiences'" class="work-page page-pad">
        <view class="sub-head"><button class="icon-button" aria-label="返回会员中心" @click="workView = null"><UiIcon name="arrow-left" :size="20" /></button><view><text class="page-title">设计体验项目</text><text class="page-sub">新增 / 编辑 / 删除本店体验项目</text></view><button class="primary-button small" @click="openExperienceForm()">＋ 新增体验</button></view>
        <view class="list-search"><UiIcon name="search" :size="16" /><input v-model="foodKeyword" placeholder="搜索体验项目" /></view>
        <view v-if="!experienceList.length" class="empty-page"><UiIcon name="sprout" :size="28" /><text>还没有体验项目</text></view>
        <view class="design-list">
          <view v-for="experience in experienceList" :key="experience.id" class="design-item">
            <BusinessImage v-if="experience.image" class="design-emoji" :src="experience.image" mode="aspectFill" />
            <view class="design-main"><text class="item-title">{{ experience.name }}</text><small>{{ experience.description }} · ¥{{ experience.price }}/人</small></view>
            <view class="design-actions"><button class="design-edit" @click="openExperienceForm(experience)">编辑</button><button class="design-remove" @click="removeExperienceFn(experience)">删除</button></view>
          </view>
        </view>
      </view>

      <view v-else-if="workView === 'staff-admin'" class="work-page page-pad">
        <view class="sub-head"><button class="icon-button" aria-label="返回会员中心" @click="workView = null"><UiIcon name="arrow-left" :size="20" /></button><view><text class="page-title">店员管理</text><text class="page-sub">本店店员登录账号 · 推广权限由店长选配</text></view><button class="text-button" @click="openStaffForm()">＋ 新增店员</button></view>
        <view class="security-note"><UiIcon name="shield-check" :size="18" /><text>店员可登录本店核销订单；开启「推广权限」后店员可生成自己的推广码，用户扫码下单后店员按比例分成。</text></view>
        <view class="list-search"><UiIcon name="search" :size="16" /><input v-model="staffKeyword" placeholder="搜索店员姓名 / 账号" /></view>
        <view v-if="!filteredStaffAccounts.length" class="empty-page"><UiIcon name="users" :size="28" /><text>本店暂无店员账号，点击右上角「新增店员」</text></view>
        <view class="design-list">
          <view v-for="acc in filteredStaffAccounts" :key="acc.id" class="design-item">
            <view class="design-emoji emoji-thumb">{{ acc.role === 'owner' ? '🧑‍💼' : '🧑‍🍳' }}</view>
            <view class="design-main"><text class="item-title">{{ acc.name }}</text><small>{{ acc.account }} · {{ acc.role === 'owner' ? '店主' : '店员' }} · 推广{{ acc.promoEnabled ? '已开' : '关闭' }} · {{ acc.enabled ? '启用' : '停用' }}</small></view>
            <view class="design-actions"><button class="design-edit" @click="openStaffForm(acc)">编辑</button><button class="design-del" @click="store.toggleStoreAccount(acc.id); toast('账号状态已切换')">{{ acc.enabled ? '停用' : '启用' }}</button></view>
          </view>
        </view>
      </view>

      <view v-else-if="workView === 'orders'" class="work-page page-pad">
        <view class="sub-head"><button class="icon-button" aria-label="返回会员中心" @click="workView = null"><UiIcon name="arrow-left" :size="20" /></button><view><text class="page-title">我的订单</text><text class="page-sub">共 {{ store.orders.length }} 单 · 中选科技供应链中台统一履约</text></view></view>
        <view class="list-search"><UiIcon name="search" :size="16" /><input v-model="orderKeyword" placeholder="搜索订单号 / 商品" /></view>
        <view v-if="!filteredOrders.length" class="empty-page"><UiIcon name="package-check" :size="28" /><text>还没有订单，去商城逛逛吧～</text></view>
        <view class="records order-records">
          <view v-for="item in filteredOrders" :key="item.id" class="rec-line"><BusinessImage v-if="item.items[0]?.image" class="rec-ic" :src="item.items[0].image" mode="aspectFit" /><view v-else class="rec-ic emoji-thumb">📦</view><view class="rec-b"><text class="rec-t">{{ orderTitle(item) }}</text><small class="rec-s">{{ money(item.amount) }} · 特产商城</small><small v-if="item.delivery?.mode === 'courier'" class="rec-s">{{ item.courier || '快递直发' }}{{ item.trackingNo ? ' ' + item.trackingNo : '' }} · {{ item.delivery?.address }}</small><view class="record-actions"><button class="rebuy-button" @click="repeatOrder(item.id)">再次购买</button><button v-if="item.status === '待发货'" class="rebuy-button" @click="cancelStorefrontOrder(item.id)">取消订单</button><button v-if="item.status === '已完成'" class="rebuy-button" @click="requestStorefrontAfterSale(item.id, 'refund')">申请退款</button><button v-if="item.status === '已完成'" class="rebuy-button" @click="requestStorefrontAfterSale(item.id, 'return')">申请退货</button><button v-if="item.status === '退款中' || item.status === '退货中'" class="rebuy-button" @click="completeStorefrontAfterSale(item.id)">完成售后</button></view></view><span class="rec-st">{{ platformOrderStatus(item.id) || item.status }}</span><span v-if="afterSaleStatusOf(item.id)" class="rec-st after">{{ afterSaleStatusOf(item.id) }}</span></view>
        </view>
      </view>

      <view v-else-if="workView === 'bookings'" class="work-page page-pad">
        <view class="sub-head"><button class="icon-button" aria-label="返回会员中心" @click="workView = null"><UiIcon name="arrow-left" :size="20" /></button><view><text class="page-title">我的预订</text><text class="page-sub">共 {{ store.bookings.length }} 个预订 · 到店出示核销</text></view></view>
        <view class="list-search"><UiIcon name="search" :size="16" /><input v-model="bookingKeyword" placeholder="搜索预订名称 / 日期" /></view>
        <view v-if="!filteredBookings.length" class="empty-page"><UiIcon name="calendar-check" :size="28" /><text>还没有预订，去门店逛逛吧～</text></view>
        <view class="records order-records">
          <view v-for="item in filteredBookings" :key="item.id" class="rec-line"><BusinessImage v-if="item.image" class="rec-ic" :src="item.image" mode="aspectFit" /><view v-else class="rec-ic emoji-thumb">🪟</view><view class="rec-b"><text class="rec-t">{{ item.name }}</text><small class="rec-s">{{ item.type === 'service' ? item.date + ' · ' + item.people + ' 人' + (item.amount ? ' · ' + money(item.amount) : '') : item.date + ' · ' + item.session + ' · ' + item.people + ' 人' }}</small><button v-if="item.status === 'reserved'" class="rebuy-button" @click="cancelBooking(item.id)">取消预订</button></view><span class="rec-st" :class="item.status === 'cancelled' ? 'go' : item.status === 'completed' ? 'ok' : ''">{{ item.status === 'reserved' ? '已确认' : item.status === 'cancelled' ? '已取消' : '已核销' }}</span></view>
        </view>
      </view>

      <view v-else-if="workView === 'ledger'" class="work-page page-pad">
        <view class="sub-head"><button class="icon-button" aria-label="返回会员中心" @click="workView = null"><UiIcon name="arrow-left" :size="20" /></button><view><text class="page-title">储值记录</text><text class="page-sub">充值 / 消费明细</text></view></view>
        <view class="list-search"><UiIcon name="search" :size="16" /><input v-model="ledgerKeyword" placeholder="搜索描述 / 金额" /></view>
        <view v-if="!filteredLedger.length" class="empty-page"><UiIcon name="credit-card" :size="28" /><text>暂无储值流水</text></view>
        <view class="ledger-list">
          <view v-for="entry in filteredLedger" :key="entry.id"><view><text>{{ entry.description }}</text><small>{{ entry.createdAt }} · 余额 {{ money(entry.balance) }}</small></view><strong :class="entry.type">{{ entry.amount > 0 ? '+' : '' }}{{ money(entry.amount) }}</strong></view>
        </view>
      </view>

      <view v-else-if="workView === 'help'" class="work-page page-pad">
        <view class="sub-head"><button class="icon-button" aria-label="返回会员中心" @click="workView = null"><UiIcon name="arrow-left" :size="20" /></button><view><text class="page-title">设置与帮助</text><text class="page-sub">收货地址 · 客服 · 关于</text></view></view>
        <view class="help-sheet">
          <view class="help-row address-edit-row"><UiIcon name="map-pin" :size="20" /><view class="help-edit"><text>收货地址</text><input v-model="deliveryAddressDraft" placeholder="请输入收货地址" /></view><button class="address-save" @click="saveDeliveryAddress">保存</button></view>
          <view class="help-row" @click="makePhoneCall"><UiIcon name="headset" :size="20" /><view><text>联系客服</text><small>{{ store.tenant?.phone }} · 营业 {{ store.tenant?.hours }}</small></view><UiIcon name="chevron-right" :size="17" /></view>
          <view class="help-row"><UiIcon name="store" :size="20" /><view><text>关于平台</text><small>中选科技数字供应链与引流服务平台 · 演示版本</small></view><UiIcon name="chevron-right" :size="17" /></view>
          <view class="help-row logout-help" @click="logout"><UiIcon name="door-open" :size="20" /><view><text>退出登录</text><small>退出当前微信登录账号</small></view><UiIcon name="chevron-right" :size="17" /></view>
        </view>
      </view>

      <template v-else>
        <view v-if="activeTab === 'home'" class="tab-page home-page">
          <view v-if="referrerText" class="referrer-banner">🎁 {{ referrerText }}</view>
          <view class="hero">
            <BusinessImage class="hero-media" :src="store.farm?.image" mode="aspectFill" />
            <view class="hero-shade"></view>
            <view class="hero-content"><text class="location">📍 {{ store.farm?.city || '湘西州' }} · 距您 {{ store.tenant?.distanceKm || 8.6 }}km</text><text class="hero-title">{{ store.tenant?.name }}</text><text class="hero-sub">⭐ {{ store.farm?.rating || 4.9 }} 分 · {{ store.tenant?.slogan }} · 营业 {{ store.tenant?.hours }}</text></view>
          </view>
           <view class="store-summary"><BusinessImage :src="store.farm?.image" mode="aspectFit" /><view><text class="item-title">{{ store.tenant?.name }}</text><text class="rating">⭐ {{ store.farm?.rating || 0 }} · 月售 {{ store.farm?.monthlySales || 0 }}+ · 本地口碑店</text><view class="tag-row"><text v-for="tag in store.farm?.storeTags || store.farm?.tags || []" :key="tag">{{ tag }}</text></view></view><button class="call-button" @click="sheet = 'contact'"><UiIcon name="phone" :size="17" />电话</button></view>
          <view class="quick-grid"><button @click="openReservation('room', '观溪雅间')"><UiIcon name="door-open" :size="22" /><text>包厢预订</text></button><button @click="openReservation('package', '四人欢聚套餐')"><UiIcon name="utensils" :size="22" /><text>套餐预订</text></button><button @click="chooseTab('shop')"><UiIcon name="shopping-bag" :size="22" /><text>特产商城</text></button><button @click="chooseTab('member')"><UiIcon name="crown" :size="22" /><text>会员中心</text></button></view>
          <view class="notice"><UiIcon name="megaphone" :size="18" /><text>端午特惠：到店满 200 减 30，会员储值享 9 折，分享好友下单得佣金～</text></view>
          <view class="section-head"><view><span></span><text>招牌土菜</text></view><button v-if="store.foods.length" @click="sheet = 'foods'">查看更多</button></view>
          <view v-if="store.foods.length" class="food-scroll"><view class="food-list"><view v-for="food in store.foods.slice(0, 4)" :key="food.id" class="food-card"><BusinessImage class="food-thumb" :src="food.image" mode="aspectFit" /><text>{{ food.name }}</text><small>{{ food.description }}</small><view class="food-price"><strong>{{ money(food.price) }}</strong><del v-if="food.originalPrice">{{ money(food.originalPrice) }}</del></view></view></view></view>
          <view v-else class="empty-page home-empty"><UiIcon name="utensils" :size="28" /><text>暂无招牌土菜，店主可到会员中心→设计招牌土菜添加</text></view>
          <view class="section-head"><view><span></span><text>特色包厢</text></view><button class="more-button" @click="chooseTab('reserve')">去预订 ›</button></view>
          <view v-if="store.rooms.length" class="room-list"><view v-for="room in store.rooms.slice(0, 2)" :key="room.id" class="room-card"><BusinessImage class="room-emoji" :src="room.image" mode="aspectFit" /><view><text>{{ room.name }}</text><small>{{ room.capacity }}</small></view><button @click="openReservation('room', room.name)">立即预订</button></view></view>
          <view v-else class="empty-page home-empty"><UiIcon name="door-open" :size="28" /><text>暂无包厢，店主可到会员中心→设计特色包厢添加</text></view>
          <view class="section-head" @click="openService(experienceList[0])"><view><span></span><text>特色服务</text></view></view>
          <view class="service-grid"><view v-for="s in experienceList" :key="s.id" hover-class="s-hover" @click="openService(s)"><BusinessImage class="s-emoji" :src="s.image" mode="aspectFit" /><text>{{ s.name }}</text><small>{{ s.description }}</small></view></view>
        </view>

        <view v-else-if="activeTab === 'reserve'" class="tab-page page-pad">
          <view class="mobile-head"><text class="page-title">预约预订</text><text class="page-sub">包厢预定 · 套餐预定 · 到店预约</text></view>
          <view class="section-head compact"><view><span></span><text>选择日期</text></view></view>
          <view class="cats"><button v-for="item in bookingDates" :key="item" :class="{ on: booking.date === item }" @click="booking.date = item">{{ item }}</button></view>
          <view class="section-head compact"><view><span></span><text>包厢预订</text></view></view>
          <view v-if="store.rooms.length" class="reserve-list">
            <view v-for="room in store.rooms" :key="room.id" class="room">
              <BusinessImage class="rimg" :src="room.image" mode="aspectFit" />
              <view class="rb"><view class="rn">{{ room.name }}<text :class="room.status === '仅余晚市' ? 'status-busy' : 'status-free'">{{ room.status }}</text></view><view class="rd">{{ room.capacity }}</view><view class="rfoot"><span class="rd">🕐 {{ room.sessions }}</span><button class="booknow" @click="openBookingForm('room', room.name, room.people)">预订</button></view></view>
            </view>
          </view>
          <view v-else class="empty-page home-empty"><UiIcon name="door-open" :size="28" /><text>暂无包厢可预订</text></view>
          <view class="section-head compact"><view><span></span><text>套餐预订</text></view><small>含锁定食材</small></view>
          <view class="combo-list">
            <view v-for="pkg in catalogPackages" :key="pkg.id" class="combo">
              <BusinessImage class="ci" :src="pkg.image" mode="aspectFit" />
              <view class="cb"><view class="cn">{{ pkg.name }}</view><view class="cl">{{ pkg.skus[0]?.name || "含锁定食材" }}</view><view class="cprice">{{ money(pkg.skus[0]?.retailPrice || 0) }}</view></view>
              <button class="booknow" @click="openBookingForm('package', pkg.name, 4)">预订</button>
            </view>
          </view>
          <view class="reserve-note">🔔 {{ reminderNote() }}</view>
          <button class="record-link" @click="sheet = 'bookings'"><UiIcon name="calendar-check" :size="18" />查看我的预订（{{ store.bookings.length }}）<UiIcon name="chevron-right" :size="18" /></button>
        </view>
        <view v-else-if="activeTab === 'shop'" class="tab-page page-pad shop-page">
          <view class="mobile-head"><text class="page-title">特产商城</text><text class="page-sub">土特产 · 农产品 · 套餐券 · 伴手礼</text></view>
                    <view class="chip-scroll"><view class="chips"><button v-for="item in categories" :key="item" :class="{ active: category === item }" @click="category = item">{{ item }}</button></view></view>
          <view class="supply-note"><text class="note-emoji">🏬</text><text>带「中台供」标识的商品来自<b>中选科技供应链中台</b>，统一品控、统一履约、价格更优。</text></view>
          <view v-if="activePolicies.length" class="policy-hint">🎯 中台价格策略：<b>{{ activePolicies.map((p) => p.name).join('、') }}</b> 已生效</view>
          <view v-if="visibleProducts.length" class="product-grid">
             <view v-for="product in visibleProducts" :key="product.id" class="product-card"><button class="product-image product-open" :aria-label="`查看${product.name}`" @click="openProduct(product)"><BusinessImage class="product-emoji" :src="product.image" mode="aspectFit" /><text v-if="product.source === 'platform'">中台供</text></button><view class="product-body"><text class="item-title">{{ product.name }}</text><view class="product-tag-row"><span class="source-tag">{{ displayProductTags(product, 'store')[0] || '门店商品' }}</span><span v-if="isExpressDeliverable(product)" class="express-tag">快递直发</span></view><view><strong>{{ money(product.price) }}</strong><button :aria-label="`加入${product.name}到购物车`" @click="addProduct(product)"><UiIcon name="plus" :size="18" /></button></view></view></view>
          </view><view v-else class="empty-page"><UiIcon name="search" :size="28" /><text>没有找到相关商品</text><small>试试其他关键词或分类</small></view>
        </view>

        <view v-else class="tab-page member-page">
          <template v-if="store.auth.isLoggedIn">
           <view class="mobile-head"><text class="page-title">会员中心</text><text class="page-sub">会员充值 · 等级权益 · 积分优惠券 · 分销推广</text></view>
          <view class="identity-row"><small>当前身份 · {{ roleNames[store.role] }}</small><button @click="sheet = 'identity'">切换身份 ▾</button></view>
          <view class="member-hero"><span class="lv">👑 黄金会员</span><text class="uname">{{ store.member.name }}</text><small class="uid">{{ store.member.memberNo || 'SBX·8829' }} · 已享专属价</small><view class="mbal"><view><small>储值余额</small><strong>{{ money(store.balance) }}</strong></view><view><small>积分</small><strong>{{ store.points.toLocaleString('zh-CN') }}</strong></view></view><button class="recharge" @click="recharge">充值 ＋</button></view>
          <view class="page-pad member-body">
            <view class="role-block"><view class="section-head compact"><view><span></span><text>切换演示身份</text></view></view><view class="segmented roles"><button v-for="role in (['customer','staff','manager'] as Role[])" :key="role" :class="{ active: store.role === role }" @click="chooseRole(role)">{{ roleNames[role] }}</button></view><text class="role-help">{{ store.role === 'customer' ? '浏览、预订、商城和会员功能' : store.role === 'staff' ? '包含顾客功能，并可核销订单' : '包含全部功能，并可设计包厢土菜、选品上架、核销订单' }}</text></view>
            <view class="promotion"><view><UiIcon name="badge-dollar-sign" :size="24" /><text>💰 分销推广中心</text><small>分享门店 / 商品给好友，好友下单你就赚佣金。员工、老客户、推客、主播均可参与，形成私域裂变。</small></view>            <view class="promo-stats"><view><text>累计佣金</text><strong>¥{{ formatNumber(store.member.cumulativeCommission ?? 0) }}</strong></view><view><text>我的粉丝</text><strong>{{ store.member.fans ?? 0 }}</strong></view><view><text>本月订单</text><strong>{{ store.member.monthlyOrders ?? 0 }}</strong></view></view><button @click="sheet = 'share'"><UiIcon name="link" :size="16" />🔗 生成我的专属推广海报</button></view>
            <view v-if="store.canOperate" class="workbench"><view class="section-head compact"><view><span></span><text>店铺经营工作台</text></view></view><button @click="workView = 'verify'"><UiIcon name="check" :size="21" /><view><text>订单核销</text><small>到店核销预订/预约订单</small></view><UiIcon name="chevron-right" :size="18" /></button><button v-if="store.canSelect" @click="workView = 'design-rooms'"><UiIcon name="door-open" :size="21" /><view><text>设计特色包厢</text><small>新增 / 编辑 / 删除包厢</small></view><UiIcon name="chevron-right" :size="18" /></button><button v-if="store.canSelect" @click="workView = 'design-foods'"><UiIcon name="utensils" :size="21" /><view><text>设计招牌土菜</text><small>新增 / 编辑 / 删除菜品</small></view><UiIcon name="chevron-right" :size="18" /></button><button v-if="store.canSelect" @click="workView = 'design-experiences'"><UiIcon name="sprout" :size="21" /><view><text>设计体验项目</text><small>新增 / 编辑 / 删除体验</small></view><UiIcon name="chevron-right" :size="18" /></button><button v-if="store.canSelect" @click="workView = 'select'"><UiIcon name="tags" :size="21" /><view><text>选品上架</text><small>自主定价并上架到本店商城</small></view><UiIcon name="chevron-right" :size="18" /></button><button v-if="store.role === 'manager'" @click="workView = 'staff-admin'"><UiIcon name="users" :size="21" /><view><text>店员管理</text><small>添加登录账号 · 配置推广权限</small></view><UiIcon name="chevron-right" :size="18" /></button><button v-if="myStaffPromoEnabled" @click="openStaffPromo()"><UiIcon name="link" :size="21" /><view><text>我的推广码</text><small>生成店员推广码 / 链接</small></view><UiIcon name="chevron-right" :size="18" /></button></view>
            <view class="mine-list"><button @click="workView = 'orders'"><UiIcon name="package-check" :size="20" /><view><text>我的订单</text><small>共 {{ store.orders.length }} 单</small></view><UiIcon name="chevron-right" :size="18" /></button><button @click="workView = 'bookings'"><UiIcon name="calendar-check" :size="20" /><view><text>我的预订</text><small>共 {{ store.bookings.length }} 个预订</small></view><UiIcon name="chevron-right" :size="18" /></button><button @click="workView = 'ledger'"><UiIcon name="credit-card" :size="20" /><view><text>储值记录</text><small>充值 / 消费明细</small></view><UiIcon name="chevron-right" :size="18" /></button><button @click="openHelp()"><UiIcon name="headset" :size="20" /><view><text>设置与帮助</text><small>收货地址 · 客服 · 关于</small></view><UiIcon name="chevron-right" :size="18" /></button></view>
            <view class="member-footer">平台支持 · 湖南省电子商务协会 · 中选科技供应链中台</view>
            <view class="recharge-options"><text>快捷充值</text><view class="choice-row"><button v-for="item in [100,300,500,1000]" :key="item" :class="{ active: rechargeAmount === item }" @click="rechargeAmount = item">{{ money(item) }}</button></view><button class="primary-button" @click="recharge">模拟充值</button></view>
          </view>
          </template>
          <view v-else class="login-prompt">
            <view class="login-prompt-card">
              <view class="login-prompt-icon emoji-thumb">👋</view>
              <text class="login-prompt-title">微信一键登录</text>
              <text class="login-prompt-sub">登录后可查看会员权益、预订下单、充值并参与分销推广</text>
              <button class="primary-button" @click="requireLogin()">微信一键登录</button>
            </view>
          </view>
        </view>

        <view v-if="activeTab === 'shop' && store.cartCount" class="cart-bar"><button class="cart-count" @click="sheet = 'cart'"><UiIcon name="shopping-cart" :size="21" /><span>{{ store.cartCount }}</span></button><view><small>合计</small><strong>{{ money(store.cartTotal) }}</strong></view><button @click="sheet = 'cart'">去结算</button></view>
        <view class="tabbar"><button v-for="tab in tabs" :key="tab.key" :class="{ active: activeTab === tab.key }" @click="chooseTab(tab.key)"><UiIcon :name="tab.icon" :size="21" /><text>{{ tab.label }}</text></button></view>
      </template>



      <view v-if="sheet" class="sheet-mask" @click.self="sheet = null">
        <view class="sheet">
          <view class="sheet-handle"></view>
           <view class="sheet-head"><text>{{ sheet === 'login' ? '微信登录' : sheet === 'service' ? (selectedService?.name || '服务详情') : sheet === 'cart' ? '购物车结算' : sheet === 'orders' ? '我的订单' : sheet === 'bookings' ? '我的预订' : sheet === 'room-form' ? (editingRoomId ? '编辑包厢' : '新增包厢') : sheet === 'food-form' ? (editingFoodId ? '编辑菜品' : '新增菜品') : sheet === 'experience-form' ? (editingExperienceId ? '编辑体验' : '新增体验') : sheet === 'product' ? '商品详情' : sheet === 'booking-form' ? booking.name : sheet === 'contact' ? `联系${store.tenant?.name || ''}` : sheet === 'after-sale' ? '售后申请' : sheet === 'foods' ? '招牌菜品' : sheet === 'ledger' ? '储值明细' : sheet === 'recharge' ? '会员储值充值' : sheet === 'identity' ? '切换身份' : sheet === 'staff-form' ? (staffForm.id ? '编辑店员' : '新增店员') : sheet === 'staff-promo' ? '我的推广码' : sheet === 'help' ? '设置与帮助' : '专属推广海报' }}</text><button aria-label="关闭弹层" @click="sheet = null"><UiIcon name="x" :size="19" /></button></view>
<view v-if="sheet === 'login'" class="login-sheet">
          <view class="login-sheet-icon emoji-thumb">👋</view>
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

           <view v-else-if="sheet === 'cart'" class="sheet-list"><view v-if="!store.cart.length" class="empty">购物车还是空的</view><view v-for="item in store.cart" :key="`${item.productId}-${item.skuId}`" class="sheet-line" :class="{ shortage: item.quantity >= item.stock }"><BusinessImage :src="item.image" mode="aspectFit" /><view><text>{{ item.name }}</text><small>{{ item.skuName }} · 库存 {{ item.stock }}</small><strong>{{ money(item.price) }}</strong></view><view class="stepper"><button aria-label="减少数量" @click="store.changeCart(item.productId, item.skuId, -1)">−</button><text>{{ item.quantity }}</text><button aria-label="增加数量" :disabled="item.quantity >= item.stock" @click="store.changeCart(item.productId, item.skuId, 1)">+</button></view></view><text v-if="store.checkoutError" class="cart-error">{{ store.checkoutError }}</text><view v-if="cartHasExpress" class="delivery-picker"><text class="delivery-label">配送方式</text><view class="ui-chips"><button :class="{ sel: deliveryMode === 'pickup' }" @click="deliveryMode = 'pickup'">到店自提</button><button :class="{ sel: deliveryMode === 'courier' }" @click="deliveryMode = 'courier'">快递配送</button></view><label v-if="deliveryMode === 'courier'" class="form-field"><text>收货地址</text><input v-model="deliveryAddressDraft" placeholder="省市区 + 详细地址" /></label></view><view v-if="store.cart.length" class="checkout-summary"><view><text>储值余额</text><strong>{{ money(store.balance) }}</strong></view><view><text>应付合计</text><strong>{{ money(store.cartTotal) }}</strong></view><button class="primary-button" @click="checkout">提交订单</button></view></view>

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




           <view v-else-if="sheet === 'product' && selectedProduct" class="product-detail"><BusinessImage :src="selectedProduct.image" mode="aspectFit" /><text>{{ selectedProduct.name }}</text><small>{{ displayProductTags(selectedProduct, 'store').join(' · ') }}</small><view v-if="selectedProduct.skus.length > 1" class="sku-options"><button v-for="sku in selectedProduct.skus" :key="sku.id" :class="{ active: selectedSkuId === sku.id }" :disabled="!sku.stock" @click="selectedSkuId = sku.id"><text>{{ sku.name }}</text><small>{{ money(sku.price) }} · 库存 {{ sku.stock }}</small></button></view><view class="product-detail-actions"><button class="outline-button" @click="shareProduct(selectedProduct)">分享商品</button><button class="primary-button" :disabled="!selectedSkuId" @click="addSelectedProduct">加入购物车</button></view></view>
           <view v-else-if="sheet === 'booking-form'" class="booking-sheet"><small class="booking-sub">选择日期 / 场次 / 人数，确认后将发送到店提醒</small><view class="booking-section"><text>📅 选择日期</text><view class="ui-chips"><button v-for="item in bookingDates.slice(0, 3)" :key="item" :class="{ sel: booking.date === item }" @click="booking.date = item">{{ item }}</button></view></view><view class="booking-section"><text>🕐 选择场次</text><view class="ui-chips"><button v-for="opt in (bookingSessionOptions.length ? bookingSessionOptions : [{ label: '午市 11:00' }, { label: '晚市 17:30' }])" :key="opt.label" :class="{ sel: booking.session === opt.label }" @click="booking.session = opt.label">{{ opt.label }}</button></view></view><view class="booking-section"><text>👥 用餐人数</text><view class="ui-chips"><button v-for="item in [4,6,8,10,20]" :key="item" :class="{ sel: booking.people === item }" @click="booking.people = item">{{ item }} 人</button></view></view><button class="primary-button" @click="submitBooking">确认预订</button></view>
          <view v-else-if="sheet === 'after-sale' && afterSaleTarget" class="design-form">
            <view class="form-field"><text>售后类型</text><view class="choice-row"><button :class="{ active: afterSaleTarget.type === 'refund' }" @click="afterSaleTarget.type = 'refund'">申请退款</button><button :class="{ active: afterSaleTarget.type === 'return' }" @click="afterSaleTarget.type = 'return'">申请退货</button></view></view>
            <view class="form-field"><text>上传凭证（1-6 张，可选）</text><ImageUploader v-model="afterSaleEvidence" multiple :max-count="6" purpose="after-sale" profile="license" /></view>
            <small class="form-hint">提交后平台将结合凭证审核</small>
            <button class="primary-button" @click="confirmStorefrontAfterSale">提交售后申请</button>
          </view>
<view v-else-if="sheet === 'contact'" class="contact-sheet"><small class="contact-sub">营业 {{ store.tenant?.hours }} · {{ store.tenant?.slogan }}</small><view class="ui-opt sel" @click="copyPhone"><text>门店电话</text><span>{{ store.tenant?.phone }}</span></view><button class="primary-button" @click="makePhoneCall">📞 拨打电话</button><button class="outline-button" @click="sheet = null">取消</button></view>
          <view v-else-if="sheet === 'foods'" class="food-detail-list"><view v-if="!store.foods.length" class="empty">暂无招牌菜品</view><view v-for="food in store.foods" :key="food.id"><BusinessImage :src="food.image" mode="aspectFit" /><view><text>{{ food.name }}</text><small>{{ food.description }}</small></view><strong>{{ money(food.price) }}</strong><button @click="sheet = null; openReservation('package', food.name)">预订</button></view></view><view v-else-if="sheet === 'service' && selectedService" class="service-detail"><BusinessImage class="s-emoji" :src="selectedService.image" mode="aspectFit" /><text class="s-name">{{ selectedService.name }}</text><small class="s-desc">{{ selectedService.description }}</small><view class="s-rows"><view><text>体验类型</text><strong>{{ selectedService.categoryCode }}</strong></view><view><text>状态</text><strong>{{ selectedService.status === 'active' ? '在售' : '下架' }}</strong></view></view><view class="s-order"><text>📅 选择日期</text><view class="ui-chips"><button v-for="d in bookingDates.slice(0, 3)" :key="d" :class="{ sel: serviceBooking.date === d }" @click="serviceBooking.date = d">{{ d }}</button></view></view><view class="s-order"><text>👥 人数</text><view class="ui-chips"><button v-for="p in [2, 4, 6, 8]" :key="p" :class="{ sel: serviceBooking.people === p }" @click="serviceBooking.people = p">{{ p }} 人</button></view></view><view class="s-fee"><text>费用</text><strong>¥{{ selectedService.price }}/人 × {{ serviceBooking.people }} 人 = ¥{{ serviceFee }}</strong></view><button class="primary-button" @click="submitServiceOrder">确认下单</button><button class="outline-button" @click="makePhoneCall">📞 电话咨询</button></view>
           <view v-else-if="sheet === 'recharge'" class="recharge-confirm"><text class="recharge-sub">当前余额 {{ money(store.balance) }} · 储值享 9 折，可用于堂食与商城</text><view class="ui-chips"><button v-for="item in [100,300,500,1000]" :key="item" :class="{ sel: rechargeAmount === item }" @click="rechargeAmount = item">¥{{ item }}</button></view><button class="primary-button" @click="confirmRecharge">确认充值</button></view>
          <view v-else-if="sheet === 'identity'" class="identity-sheet"><small class="identity-sub">演示不同角色可见的功能权限</small><view class="identity-options"><button v-for="role in (['customer','staff','manager'] as Role[])" :key="role" :class="{ sel: store.role === role }" @click="chooseRole(role); sheet = null"><view><text>{{ role === 'customer' ? '👤' : role === 'staff' ? '🧑‍🍳' : '🧑‍💼' }} {{ roleNames[role] }}</text><small>{{ role === 'customer' ? '普通消费者 · 仅购物、预订与会员' : role === 'staff' ? '可见「店员专区」· 核销订单' : '设计包厢/土菜 + 选品上架 + 核销订单 · 管理本店' }}</small></view><span>{{ store.role === role ? '✓' : '›' }}</span></button></view><button class="outline-button" @click="sheet = null">取消</button></view>
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
            <button class="primary-button" @click="copyStaffPromoLink">📋 复制推广链接</button>
          </view>
          <view v-else class="poster-sheet"><small class="poster-sub">分享给好友，好友下单即可获得佣金</small><view class="ui-opt sel"><text>推广门店</text><span>{{ store.tenant?.name }}</span></view><button class="primary-button" @click="sharePromotion">📋 复制推广链接</button><button class="outline-button" @click="sheet = null">取消</button></view>
        </view>
      </view>
    </template>
  </view>
</template>

<style scoped lang="scss">
.app-shell { width:100%; min-height:100vh; background:var(--farm-bg); padding-bottom:calc(72px + env(safe-area-inset-bottom)); }
.loading { min-height:100vh;display:grid;place-items:center;color:var(--farm-muted); }
.page-pad { padding:0 16px; }.tab-page { min-height:100vh;padding-bottom:28px; }.home-page { padding-bottom:25px; }
.hero { height:248px;position:relative;overflow:hidden;background:linear-gradient(180deg,rgba(15,60,30,.05),rgba(15,40,22,.78)),linear-gradient(135deg,#3c7a45,#1d5a2a 60%,#114a22); }.hero-media { position:absolute;inset:0;width:100%;height:100%; }.hero-shade { position:absolute;inset:0;background:linear-gradient(to bottom,rgba(8,34,22,.14),rgba(8,34,22,.78)); }.hero-content { position:absolute;inset:0;display:flex;flex-direction:column;justify-content:flex-end;padding:0 18px 56px;color:#fff; }.location { position:absolute;top:54px;right:16px;display:inline-block;margin:0;padding:5px 12px;font-size:11.5px;font-weight:600;opacity:.95;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.3);border-radius:999px;backdrop-filter:blur(6px); }.hero-title { display:block;font-size:23px;font-weight:800;text-shadow:0 2px 12px rgba(0,0,0,.35); }.hero-sub { display:block;font-size:12px;margin-top:7px;opacity:.9; }
.store-summary { position:relative;margin:-46px 14px 0;padding:14px;background:#fff;border:1px solid var(--farm-line);border-radius:18px;display:grid;grid-template-columns:54px 1fr auto;gap:12px;align-items:center;box-shadow:0 18px 38px -26px rgba(20,60,30,.5); }.store-summary>image { width:54px;height:54px;border-radius:14px; }.item-title { display:block;font-size:14px;font-weight:800;line-height:1.35; }.rating { display:block;margin-top:4px;color:#9a722b;font-size:10px; }.tag-row { display:flex;gap:4px;margin-top:5px;flex-wrap:wrap; }.tag-row text { padding:3px 5px;border-radius:3px;background:var(--farm-green-soft);color:var(--farm-green);font-size:8px; }.call-button { height:34px;padding:0 10px;border-radius:5px;background:var(--farm-green);color:#fff;display:flex;align-items:center;gap:5px;font-size:11px;font-weight:700; }.call-button .ui-icon { filter:brightness(0) invert(1); }
.quick-grid { margin:14px 14px 0;display:grid;grid-template-columns:repeat(4,1fr);gap:6px;background:transparent;border:0;border-radius:0; }.quick-grid button { min-height:84px;background:#fff;border:1px solid var(--farm-line);border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;font-size:11px;color:var(--farm-ink); }.quick-grid .ui-icon { filter:invert(30%) sepia(18%) saturate(1320%) hue-rotate(98deg); }
.notice,.security-note,.supply-note { margin:14px 16px;padding:12px;background:#fff9e9;border:1px solid #ecdfbd;border-radius:7px;display:flex;align-items:flex-start;gap:8px;color:#765c27;font-size:10px;line-height:1.5; }.security-note,.supply-note { margin:14px 0;background:var(--farm-green-soft);border-color:#cfe2d6;color:#315e48; }
.section-head { padding:20px 16px 10px;display:flex;align-items:center;justify-content:space-between; }.section-head>view { display:flex;align-items:center;gap:7px; }.section-head span { width:3px;height:16px;background:var(--farm-green);border-radius:2px; }.section-head text { font-size:15px;font-weight:900; }.section-head button { color:var(--farm-muted);background:transparent;font-size:10px; }.section-head.compact { padding:0 0 12px; }
.food-scroll { width:100%;overflow-x:auto;overflow-y:hidden; }.food-list { padding:0 16px;display:flex;gap:10px;width:max-content; }.food-card { width:150px;background:#fff;border:1px solid var(--farm-line);border-radius:7px;overflow:hidden;padding-bottom:10px; }.food-card image { width:100%;height:100px;display:block; }.food-card text,.food-card small { display:block;padding:0 10px; }.food-card text { margin-top:9px;font-size:12px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }.food-card small { margin-top:4px;color:var(--farm-muted);font-size:9px; }
.room-list { padding:0 14px;display:grid;gap:12px; }.room-card { min-height:78px;padding:12px;background:#fff;border:1px solid var(--farm-line);border-radius:16px;display:grid;grid-template-columns:72px 1fr auto;gap:12px;align-items:center; }.room-card image { width:72px;height:58px;border-radius:5px; }.room-card text,.room-card small { display:block; }.room-card text { font-size:12px;font-weight:800; }.room-card small { margin-top:5px;font-size:9px;color:var(--farm-muted); }.room-card button,.small-button { padding:8px 11px;border-radius:5px;background:var(--farm-green);color:#fff;font-size:10px;font-weight:700; }
.mobile-head { padding-top:calc(20px + env(safe-area-inset-top));padding-bottom:16px; }.page-title { display:block;font-size:18px;font-weight:800; }.page-sub { display:block;margin-top:5px;color:var(--farm-muted);font-size:11px; }.segmented { display:grid;grid-template-columns:repeat(2,1fr);padding:3px;background:#e7e8e2;border-radius:7px;margin-bottom:14px; }.segmented button { height:38px;border-radius:5px;background:transparent;color:var(--farm-muted);font-size:12px;font-weight:700; }.segmented button.active { background:#fff;color:var(--farm-green);box-shadow:0 2px 7px rgba(0,0,0,.07); }
.reserve-showcase { background:#fff;border:1px solid var(--farm-line);border-radius:8px;overflow:hidden; }.reserve-showcase image { width:100%;height:168px;display:block; }.reserve-showcase view { padding:13px; }.reserve-showcase text,.reserve-showcase small,.reserve-showcase strong { display:block; }.reserve-showcase text { font-size:16px;font-weight:900; }.reserve-showcase small { margin-top:5px;color:var(--farm-muted);font-size:10px; }.reserve-showcase strong { margin-top:8px;color:var(--farm-green);font-size:15px; }
.booking-form,.role-block,.recharge-options { margin-top:13px;padding:15px;background:#fff;border:1px solid var(--farm-line);border-radius:8px; }.form-group { margin-bottom:17px; }.form-group>text,.recharge-options>text { display:block;margin-bottom:9px;font-size:11px;font-weight:800; }.choice-row { display:flex;gap:7px;flex-wrap:wrap; }.choice-row button { min-height:35px;padding:0 10px;border-radius:5px;background:#f2f3ee;color:var(--farm-muted);font-size:10px;border:1px solid transparent; }.choice-row button.active { background:var(--farm-green-soft);color:var(--farm-green);border-color:#bed7c8;font-weight:700; }.primary-button { width:100%;height:44px;border-radius:6px;background:var(--farm-green);color:#fff;font-weight:800;font-size:13px; }.record-link { width:100%;height:50px;margin-top:13px;padding:0 13px;background:#fff;border:1px solid var(--farm-line);border-radius:7px;display:flex;align-items:center;gap:9px;color:var(--farm-ink);font-size:11px;text-align:left; }.record-link .ui-icon:last-child { margin-left:auto; }
.referrer-banner{margin:10px 14px 0;padding:9px 12px;border-radius:10px;background:linear-gradient(135deg,#fff3d6,#ffe9b8);border:1px solid #eadcb8;color:#8a5b12;font-size:12px;font-weight:700;text-align:center}.staff-promo-sheet{padding:20px 6px 8px;text-align:center}.staff-promo-sheet .qr-box{width:200px;height:200px;margin:0 auto 14px;border:1px solid var(--farm-line);border-radius:16px;overflow:hidden;display:grid;place-items:center;background:#fff}.staff-promo-sheet .qr-box image{width:100%;height:100%}.staff-promo-title{display:block;font-size:16px;font-weight:900}.staff-promo-sub{display:block;margin-top:6px;color:var(--farm-muted);font-size:10px;line-height:1.6}.staff-promo-link{margin:14px 0 10px;padding:10px;border-radius:8px;background:#f2f4ee;color:var(--farm-muted);font-size:10px;word-break:break-all}.mobile-search { height:42px;padding:0 12px;background:#fff;border:1px solid var(--farm-line);border-radius:7px;display:flex;align-items:center;gap:8px; }.mobile-search input { flex:1;height:100%;font-size:11px; }.chip-scroll { margin:13px -16px 0;width:calc(100% + 32px);white-space:nowrap;overflow-x:auto;overflow-y:hidden; }.chips { width:max-content;padding:0 16px;display:flex;gap:7px; }.chips button { height:34px;padding:0 12px;border-radius:17px;background:#fff;border:1px solid var(--farm-line);font-size:10px;color:var(--farm-muted); }.chips button.active { color:#fff;background:var(--farm-green);border-color:var(--farm-green); }.product-grid { display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:12px;padding:0 14px; }.product-card { min-width:0;background:#fff;border:1px solid var(--farm-line);border-radius:16px;overflow:hidden; }.product-image { height:120px;position:relative; }.product-image image { width:100%;height:100%; }.product-image text { position:absolute;left:7px;top:7px;padding:4px 6px;border-radius:3px;background:var(--farm-green);color:#fff;font-size:8px;font-weight:700; }.product-body { padding:10px; }.product-body .muted { display:block;min-height:27px;margin-top:5px; }.muted { color:var(--farm-muted);font-size:9px; }.product-body>view { margin-top:9px;display:flex;align-items:center;justify-content:space-between; }.product-body strong { color:var(--farm-red);font-size:15px; }.product-body button { width:30px;height:30px;border-radius:50%;background:var(--farm-green);display:grid;place-items:center; }.product-body button .ui-icon { filter:brightness(0) invert(1); }
.member-page { background:#eef0e9; }.member-hero { padding:calc(28px + env(safe-area-inset-top)) 18px 20px;background:var(--farm-green-deep);color:#fff; }.member-top { display:flex;align-items:center;gap:10px; }.member-avatar { width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.14);display:grid;place-items:center; }.member-avatar .ui-icon { filter:brightness(0) invert(1); }.member-top text,.member-top small { display:block; }.member-top text { font-size:15px;font-weight:800; }.member-top small { font-size:9px;opacity:.75;margin-top:4px; }.balance { margin-top:24px;display:flex;align-items:flex-end;justify-content:space-between; }.balance small,.balance strong { display:block; }.balance small { font-size:10px;opacity:.72; }.balance strong { margin-top:6px;font-size:29px; }.balance button { height:34px;padding:0 14px;border-radius:5px;background:#fff;color:var(--farm-green);font-size:11px;font-weight:800; }.member-stats { margin-top:21px;display:grid;grid-template-columns:repeat(3,1fr); }.member-stats view { text-align:center;border-right:1px solid rgba(255,255,255,.16); }.member-stats view:last-child { border:0; }.member-stats text,.member-stats small { display:block; }.member-stats text { font-size:15px;font-weight:800; }.member-stats small { margin-top:4px;font-size:9px;opacity:.7; }.member-body { padding-top:14px; }.roles { grid-template-columns:repeat(3,1fr);margin:0; }.role-help { display:block;margin-top:11px;color:var(--farm-muted);font-size:9px;line-height:1.5; }
.promotion { margin-top:12px;padding:14px;background:#fff8e8;border:1px solid #eadcb8;border-radius:8px;display:flex;align-items:center;justify-content:space-between; }.promotion>view { display:grid;grid-template-columns:28px 1fr;column-gap:6px; }.promotion text,.promotion small { display:block; }.promotion text { font-size:12px;font-weight:800; }.promotion small { grid-column:2;margin-top:4px;color:#796a48;font-size:9px; }.promotion button { padding:8px 10px;border-radius:5px;background:var(--farm-gold);color:#fff;font-size:10px;font-weight:700; }.workbench { margin-top:14px;padding:16px;background:linear-gradient(135deg,#3a566f,#243a4f);border:1px solid #2e4760;border-radius:18px;color:#fff;box-shadow:0 20px 40px -24px rgba(20,40,70,.7); }.workbench>button { width:100%;min-height:58px;background:#fff;border:1px solid rgba(255,255,255,.35);border-radius:11px;display:flex;align-items:center;gap:10px;text-align:left;color:#28435c;padding:0 14px;margin-top:11px; }
  .mine-list button { width:100%;min-height:58px;background:#fff;border:1px solid var(--farm-line);border-radius:14px;display:flex;align-items:center;gap:10px;text-align:left;color:var(--farm-ink);padding:12px 14px; }.workbench>button>view,.mine-list button>view { flex:1; }.workbench text,.workbench small,.mine-list text,.mine-list small { display:block; }.workbench text { font-size:13px;font-weight:800; }
  .mine-list text { font-size:11px;font-weight:800; }.workbench small { margin-top:4px;color:#9fb4c6;font-size:9px; }
  .mine-list small { margin-top:4px;color:var(--farm-muted);font-size:9px; }.mine-list { margin-top:14px;padding:0;background:transparent;border:0;border-radius:0;display:grid;gap:10px; }.mine-list button:first-child { border:0; }.recharge-options { margin-bottom:10px; }.recharge-options .primary-button { margin-top:12px; }
.sub-head { padding-top:calc(18px + env(safe-area-inset-top));display:flex;align-items:center;gap:11px;min-height:70px; }.sub-head>view { flex:1; }.icon-button { width:38px;height:38px;border-radius:6px;background:#fff;border:1px solid var(--farm-line);display:grid;place-items:center; }.text-button { background:transparent;color:var(--farm-green);font-size:10px;font-weight:700; }.select-list { display:grid;gap:10px;padding-bottom:100px; }.select-item { padding:14px;background:#fff;border:1px solid var(--farm-line);border-radius:16px;display:grid;gap:12px; }.si-head { display:flex;align-items:center;gap:12px; }.si-title { flex:1;min-width:0; }.si-title .item-title { display:block;font-size:14px;font-weight:800;color:#23291f; }.si-sub { display:block;margin-top:4px;font-size:11px;color:var(--farm-muted); }.si-sub b { color:var(--farm-green);font-weight:800; }.si-status { flex:none;padding:3px 9px;border-radius:6px;background:var(--farm-green-soft);color:var(--farm-green);font-size:10px;font-weight:700; }.si-status:not(.listed) { background:#f2f3ee;color:#8a918a; }.si-pricing { display:flex;gap:12px;align-items:flex-end;padding-top:12px;border-top:1px solid #eef0eb; }.si-field { flex:1;min-width:0; }.si-field text { display:block;font-size:10px;color:var(--farm-muted);margin-bottom:6px; }.si-field text span { color:var(--farm-red);font-weight:800; }.si-field input { width:100%;height:38px;padding:0 10px;border:1px solid var(--farm-line);border-radius:8px;background:#fff;font-size:14px;box-sizing:border-box; }.si-margin { flex:0 0 116px;text-align:right; }.si-margin text { display:block;font-size:10px;color:var(--farm-muted);margin-bottom:6px; }.si-margin strong { display:block;font-size:13px;color:var(--farm-green);font-weight:800; }.metric-band { margin:8px 0 14px;display:grid;grid-template-columns:repeat(3,1fr);background:#fff;border:1px solid var(--farm-line);border-radius:8px; }.metric-band view { padding:13px 8px;text-align:center;border-right:1px solid var(--farm-line); }.metric-band view:last-child { border:0; }.metric-band text,.metric-band strong { display:block; }.metric-band text { color:var(--farm-muted);font-size:9px; }.metric-band strong { margin-top:5px;font-size:13px; }
.tabbar { position:fixed;left:0;right:0;bottom:0;height:calc(66px + env(safe-area-inset-bottom));padding-bottom:calc(8px + env(safe-area-inset-bottom));background:rgba(255,255,255,.96);backdrop-filter:blur(10px);border-top:1px solid var(--farm-line);display:grid;grid-template-columns:repeat(4,1fr);z-index:20; }.tabbar button { background:transparent;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:#8a918a;font-size:9px; }.tabbar button.active { color:var(--farm-green);font-weight:800; }.tabbar button.active .ui-icon { filter:invert(30%) sepia(18%) saturate(1320%) hue-rotate(98deg); }
.cart-bar { position:fixed;left:12px;right:12px;bottom:calc(72px + env(safe-area-inset-bottom));height:54px;padding:6px 7px 6px 12px;background:#183a2b;color:#fff;border-radius:8px;z-index:22;display:flex;align-items:center;gap:10px;box-shadow:0 8px 25px rgba(0,0,0,.2); }.cart-count { width:36px;height:36px;position:relative;border-radius:50%;background:#fff;display:grid;place-items:center; }.cart-count span { position:absolute;right:0;top:0;z-index:1;min-width:18px;height:18px;border-radius:9px;background:var(--farm-red);color:#fff;display:grid;place-items:center;font-size:8px; }.cart-bar>view { flex:1; }.cart-bar small,.cart-bar strong { display:block; }.cart-bar small { opacity:.7;font-size:8px; }.cart-bar strong { font-size:14px; }.cart-bar>button:last-child { height:40px;padding:0 16px;border-radius:6px;background:#d2ae5b;color:#2c271b;font-weight:800;font-size:11px; }
.sheet-mask { position:fixed;inset:0;background:rgba(14,25,19,.48);z-index:40;display:flex;align-items:flex-end; }.sheet { width:100%;max-height:82vh;overflow-y:auto;background:#fff;border-radius:14px 14px 0 0;padding:8px 16px calc(22px + env(safe-area-inset-bottom)); }.sheet-handle { width:38px;height:4px;border-radius:2px;background:#d8dbd4;margin:0 auto 9px; }.sheet-head { height:46px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #eef0eb; }.sheet-head>text { font-size:16px;font-weight:900; }.sheet-head button { width:34px;height:34px;background:#f2f3ee;border-radius:50%;display:grid;place-items:center; }.sheet-line { min-height:76px;padding:10px 0;border-bottom:1px solid #eef0eb;display:grid;grid-template-columns:54px 1fr auto;gap:9px;align-items:center; }.sheet-line image { width:54px;height:54px;border-radius:6px; }.sheet-line text,.sheet-line strong { display:block; }.sheet-line text { font-size:10px;line-height:1.35; }.sheet-line strong { margin-top:5px;color:var(--farm-red);font-size:11px; }.stepper { height:30px;display:grid;grid-template-columns:28px 28px 28px;border:1px solid var(--farm-line);border-radius:5px;overflow:hidden; }.stepper button,.stepper text { display:grid;place-items:center;background:#fff;font-size:12px;margin:0; }.stepper text { border-left:1px solid var(--farm-line);border-right:1px solid var(--farm-line); }.checkout-summary { padding-top:13px; }.checkout-summary>view { display:flex;justify-content:space-between;margin-bottom:9px;font-size:10px; }.checkout-summary .primary-button { margin-top:8px; }.empty { padding:50px 0;text-align:center;color:var(--farm-muted);font-size:11px; }
.records { display:grid;gap:9px;padding-top:12px; }.record { padding:13px;background:#f7f8f4;border:1px solid var(--farm-line);border-radius:7px; }.record>view:first-child { display:flex;justify-content:space-between;gap:8px; }.record text,.record small,.record strong { display:block; }.record text { font-size:11px;font-weight:800; }.record span { color:var(--farm-green);font-size:9px;font-weight:700; }.record small { margin-top:6px;color:var(--farm-muted);font-size:9px; }.record strong { margin-top:8px;font-size:12px; }.timeline { margin-top:10px;display:flex;gap:4px; }.timeline span { flex:1;height:4px;border-radius:2px;background:#dfe2dc; }.timeline span.done { background:var(--farm-green); }.outline-button { width:100%;height:34px;margin-top:10px;border-radius:5px;background:#fff;color:var(--farm-green);border:1px solid #bad3c4;font-size:10px;font-weight:700; }.poster>image { width:100%;height:220px;border-radius:8px;margin-top:12px; }.poster>view { margin:-50px 12px 12px;position:relative;padding:14px;background:#fff;border-radius:7px;box-shadow:0 8px 18px rgba(0,0,0,.12); }.poster text,.poster strong,.poster small { display:block; }.poster text { color:var(--farm-green);font-size:12px;font-weight:800; }.poster strong { margin-top:5px;font-size:18px; }.poster small { margin-top:6px;color:var(--farm-muted);font-size:9px; }
.food-scroll,.chip-scroll{scrollbar-width:none}.food-scroll::-webkit-scrollbar,.chip-scroll::-webkit-scrollbar{display:none}.call-button{height:40px}.section-head button{min-height:40px;padding:0 4px}.room-card button,.small-button{min-height:36px}.choice-row button,.chips button{min-height:38px}.product-body button{width:36px;height:36px}.tabbar button{min-height:48px}.sheet{overscroll-behavior:contain}.empty-page{min-height:230px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--farm-muted)}.empty-page text,.empty-page small{display:block}.empty-page text{margin-top:10px;font-size:12px;font-weight:800}.empty-page small{margin-top:5px;font-size:9px}.food-detail-list,.ledger-list{display:grid;gap:8px;padding-top:12px}.food-detail-list>view{min-height:72px;padding:8px;background:#f7f8f4;border:1px solid var(--farm-line);border-radius:7px;display:grid;grid-template-columns:58px 1fr auto auto;gap:9px;align-items:center}.food-detail-list image{width:58px;height:54px;border-radius:5px}.food-detail-list text,.food-detail-list small{display:block}.food-detail-list text{font-size:11px;font-weight:800}.food-detail-list small{margin-top:4px;color:var(--farm-muted);font-size:8px}.food-detail-list strong{font-size:11px;color:var(--farm-red)}.food-detail-list button{min-height:36px;padding:0 10px;border-radius:5px;background:var(--farm-green);color:#fff;font-size:10px}.ledger-list>view{min-height:62px;padding:11px;background:#f7f8f4;border:1px solid var(--farm-line);border-radius:7px;display:flex;align-items:center;justify-content:space-between;gap:12px}.ledger-list text,.ledger-list small{display:block}.ledger-list text{font-size:11px;font-weight:800}.ledger-list small{margin-top:5px;color:var(--farm-muted);font-size:8px}.ledger-list strong{font-size:12px;white-space:nowrap}.ledger-list strong.recharge{color:var(--farm-green)}.ledger-list strong.consume{color:var(--farm-red)}.promotion-history{margin:12px 0 0!important;box-shadow:none!important;border:1px solid var(--farm-line)!important}.promotion-history .link-text{word-break:break-all;line-height:1.45}
@media(min-width:700px){.app-shell{max-width:430px;margin:0 auto;box-shadow:0 0 0 1px #e1e3dc}.tabbar{left:50%;right:auto;width:430px;transform:translateX(-50%)}.cart-bar{left:50%;right:auto;width:406px;transform:translateX(-50%)}.sheet{max-width:430px;margin:0 auto}.sheet-mask{justify-content:center}}
.room-card button,.small-button,.choice-row button,.chips button,.outline-button{min-height:40px}.small-button.listed{background:#6f786f}.state-page{min-height:100vh;padding:24px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:var(--farm-muted);text-align:center}.state-page .primary-button{max-width:240px}.recharge-confirm{padding:28px 4px 8px;text-align:center}.recharge-confirm text,.recharge-confirm strong,.recharge-confirm small{display:block}.recharge-confirm text{font-size:14px;font-weight:800}.recharge-confirm strong{margin-top:12px;color:var(--farm-green);font-size:30px}.recharge-confirm small{margin-top:10px;color:var(--farm-muted);font-size:10px;line-height:1.6}.qr-placeholder{width:92px!important;height:92px!important;margin:12px auto!important;border:6px solid #fff!important;outline:1px solid var(--farm-line);background:repeating-linear-gradient(45deg,#173d2b 0 5px,#fff 5px 10px)!important;color:#fff!important;display:grid!important;place-items:center!important;font-size:9px!important;text-shadow:0 1px 2px #000;box-shadow:none!important}
.product-open{width:100%;padding:0;border-radius:0;background:transparent;display:block}.product-open::after{display:none}.small-button:disabled{opacity:.55}.sheet-line.shortage{background:#fff8f2}.sheet-line small{display:block;margin-top:4px;color:var(--farm-muted)}.cart-error{display:block;margin:10px 0 0;padding:10px;border-radius:6px;background:#fae8e4;color:var(--farm-red);font-size:12px}.stepper{height:40px;grid-template-columns:40px 40px 40px}.stepper button:disabled{background:#eef0eb;color:#a3aaa3}.order-items{margin-top:8px;padding:8px;border-radius:5px;background:#fff}.product-detail{padding-top:12px}.product-detail>image{width:100%;height:210px;border-radius:8px}.product-detail>text,.product-detail>small{display:block}.product-detail>text{margin-top:13px;font-size:17px;font-weight:900}.product-detail>small{margin-top:6px;color:var(--farm-muted)}.sku-options{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:14px}.sku-options button{min-height:56px;padding:11px 14px;border:1px solid #e0e4dd;border-radius:12px;background:#fff;text-align:left;display:flex;flex-direction:column;justify-content:center;transition:border-color .15s,background .15s}.sku-options button text,.sku-options button small{display:block}.sku-options button text{font-size:13px;font-weight:800;color:#23291f}.sku-options button small{margin-top:4px;font-size:10px;color:#8a918a}.sku-options button.active{border-color:var(--farm-green);background:var(--farm-green-soft);box-shadow:0 0 0 1px var(--farm-green)}.sku-options button.active text{color:var(--farm-green)}.sku-options button.active small{color:var(--farm-green)}.sku-options button:disabled{opacity:.5}.product-detail-actions{display:grid;grid-template-columns:1fr 1.4fr;gap:9px;margin-top:15px}.product-detail-actions .outline-button,.product-detail-actions .primary-button{margin:0;height:44px}.app-shell small{font-size:12px!important}.app-shell button,.app-shell input{font-size:13px!important}.app-shell .location,.app-shell .hero-sub,.app-shell .rating,.app-shell .notice,.app-shell .muted,.app-shell .role-help,.app-shell .price-line,.app-shell .pricing text,.app-shell .pricing strong,.app-shell .metric-band text,.app-shell .product-image text,.app-shell .tag-row text,.app-shell .cart-count span,.app-shell .record span{font-size:12px!important}.app-shell button:focus-visible,.app-shell input:focus-visible{outline:3px solid rgba(23,99,63,.28);outline-offset:2px}

/* ===== 原型 1:1 补充样式 ===== */
.food-card{position:relative}.food-price{display:flex;align-items:baseline;gap:5px;margin-top:4px;padding:0 10px}.food-price strong{color:var(--farm-red);font-size:14px;font-weight:800}.food-price del{color:#bbb;font-size:10px;font-weight:400}
.more-button{min-height:32px;padding:0 2px;background:none;border:none;color:var(--farm-green);font-size:11px}
.service-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;padding-top:4px}.service-grid>view{background:#fff;border:1px solid var(--farm-line);border-radius:10px;padding:13px 8px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:7px}.service-grid>view.s-hover{background:var(--farm-green-soft);transform:scale(.96);transition:transform .12s ease}.service-grid .ui-icon{color:var(--farm-green)}.service-grid text{font-size:11px;font-weight:800}.service-grid small{font-size:9px;color:var(--farm-muted);line-height:1.4}
.room-card{position:relative}.room-card span{display:block;margin-top:5px;font-size:9px;color:var(--farm-red);font-weight:700}.room-emoji{width:72px;height:58px;border-radius:5px}
.food-thumb,.room-emoji,.rimg,.ci,.select-emoji,.verify-emoji,.design-emoji,.s-emoji,.rec-ic{display:block;flex-shrink:0}
.room-form-image{width:64px;height:64px;border-radius:12px;flex-shrink:0}
.reserve-list{display:grid;gap:9px;padding-top:4px}.reserve-card{background:#fff;border:1px solid var(--farm-line);border-radius:11px;padding:10px;display:grid;grid-template-columns:82px 1fr auto;gap:10px;align-items:center}.reserve-card image{width:82px;height:74px;border-radius:8px}.reserve-card text{display:block;font-size:12.5px;font-weight:900}.reserve-card text span{display:inline-block;margin-left:6px;padding:1px 6px;border-radius:4px;background:var(--farm-green-soft);color:var(--farm-green);font-size:8.5px;font-weight:700;vertical-align:middle}.reserve-card text span.busy{background:#fae8e4;color:var(--farm-red)}.reserve-card small{display:block;margin-top:4px;color:var(--farm-muted);font-size:9px;line-height:1.5}.reserve-card .sessions{font-size:9px}.reserve-card strong{display:block;margin-top:5px;font-size:11px;color:var(--farm-green)}.reserve-card button{min-height:32px;padding:0 12px;border-radius:6px;background:var(--farm-green);color:#fff;font-size:10px;white-space:nowrap}
.reserve-note{margin:12px 2px;padding:9px 11px;border-radius:7px;background:var(--farm-green-soft);color:var(--farm-green);font-size:10px;line-height:1.6}
.dates button{min-width:56px;text-align:center}
.work-metric-band{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0}.work-metric-band>view{background:#fff;border:1px solid var(--farm-line);border-radius:9px;padding:10px 8px;text-align:center}.work-metric-band small{display:block;font-size:9.5px;color:var(--farm-muted)}.work-metric-band strong{display:block;margin-top:5px;font-size:15px;font-weight:900;color:var(--farm-green)}

.member-no{font-size:9px!important;color:rgba(255,255,255,.85)!important;margin-top:2px}
.identity-row{display:flex;align-items:center;justify-content:space-between;margin:9px 0 2px}.identity-row small{color:rgba(255,255,255,.9);font-size:11px}.identity-row button{min-height:30px;padding:0 14px;border-radius:999px;background:#fff;color:var(--farm-green);font-size:12px;font-weight:700;border:1px solid #bfd9c8}
.promo-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0}.promo-stats>view{background:#f7f8f4;border:1px solid var(--farm-line);border-radius:8px;padding:9px 6px;text-align:center}.promo-stats text{display:block;font-size:9px;color:var(--farm-muted)}.promo-stats strong{display:block;margin-top:4px;font-size:13px;color:var(--farm-green)}
.promotion{display:block}.promotion>view:first-child{display:grid;grid-template-columns:28px 1fr;column-gap:6px}.promotion>view.promo-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0;width:100%}.promotion>button{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;min-height:36px;margin-top:4px;padding:0 12px;border-radius:7px;background:var(--farm-green);color:#fff;font-size:10.5px}
.member-footer{margin:14px 2px 4px;padding-top:12px;border-top:1px dashed var(--farm-line);color:var(--farm-muted);font-size:9px;text-align:center;line-height:1.7}
.identity-sheet{padding:18px 4px 8px;display:grid;gap:12px}.identity-sheet>text{font-size:14px;font-weight:900}.identity-sheet>small{color:var(--farm-muted);font-size:10px;line-height:1.6}.choice-row.stacked{display:grid;gap:8px}.choice-row.stacked button{min-height:48px;border-radius:8px;justify-content:center;text-align:center;display:flex;flex-direction:column;align-items:center;gap:3px}.choice-row.stacked button small{font-size:9px;color:var(--farm-muted);font-weight:400}
.help-sheet{padding:16px 4px 8px;display:grid;gap:8px}.help-row{display:flex;align-items:center;gap:12px;padding:13px 10px;background:#f7f8f4;border:1px solid var(--farm-line);border-radius:8px}.help-row>view{flex:1}.help-row text{display:block;font-size:12px;font-weight:800}.help-row small{display:block;margin-top:4px;color:var(--farm-muted);font-size:9px}
.poster-meta{text-align:center;padding:8px 0 2px}.poster-meta text{display:block;font-size:15px;font-weight:900}.poster-meta strong{display:block;margin-top:5px;color:var(--farm-green);font-size:20px}.poster-meta small{display:block;margin-top:4px;color:var(--farm-muted);font-size:9.5px}



/* 按钮文字居中：操作类按钮 */
.call-button{justify-content:center}


/* ===== P1 样式调整（对照原型） ===== */
.hero-content .location{display:inline-block;background:rgba(15,30,22,.5);padding:4px 12px;border-radius:20px;backdrop-filter:blur(4px);margin-bottom:18px}
.store-summary{box-shadow:0 10px 26px rgba(26,50,36,.14)}
.tag-row{gap:10px}
.tag-row text{padding:4px 8px;border-radius:5px}
.food-card{border-radius:10px}
.food-card image{border-radius:10px 10px 0 0}
.food-card small{line-height:1.65}
.notice{background:#fff8e8;border-color:#f0e3c2}
.choice-row{gap:8px}
.choice-row.dates button{border-radius:8px;min-width:52px;padding:0 8px}
.choice-row.dates button.active{background:var(--farm-green);color:#fff;border-color:var(--farm-green)}
.reserve-list{gap:6px}
.reserve-card{border-color:#efece3}
.product-image text{border-radius:8px;padding:3px 8px;font-size:10px}
.product-body strong{font-size:15px;color:var(--farm-red)}
.chips button{color:#23291f}
.chips button.active{background:#15512f;border-color:#15512f}
.product-card{border-radius:16px}.product-card .product-body{padding:9px 10px 11px}
.member-page{background:#f5f4ee}
.member-hero{margin:14px;border-radius:20px;padding:18px;color:#fff;position:relative;overflow:hidden;background:linear-gradient(135deg,#1d6b44,#103f27);box-shadow:0 20px 40px -24px rgba(15,80,40,.7)}
.member-hero .lv{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.3);border-radius:999px;padding:4px 12px;font-size:12px!important;font-weight:700}
.member-hero .uname{display:block;font-size:18px!important;font-weight:800;margin-top:12px}
.member-hero .uid{display:block;font-size:11.5px!important;opacity:.8;margin-top:2px}
.member-hero .mbal{display:flex;gap:24px;margin-top:16px}
.member-hero .mbal small{display:block;font-size:11px;opacity:.85}
.member-hero .mbal strong{display:block;font-size:21px!important;font-weight:800;margin-top:2px;color:#fff}
.member-hero .recharge{position:absolute;right:16px;bottom:16px;background:#fff;color:var(--farm-green);border-radius:999px;padding:8px 16px;font-size:12px;font-weight:800}
.promotion{border-color:#f0e2c0;padding:16px}
.mine-list button{background:#fff;border:1px solid var(--farm-line);border-radius:14px;padding:12px 14px}


/* ===== 按钮靠左 + 文字居中（统一） ===== */
button, uni-button { text-align: center; }
.state-page { align-items: flex-start; }
.member-hero .balance { justify-content: flex-start; gap: 14px; }
.mine-list button, .workbench button, .record-link { justify-content: flex-start; text-align: left; }
.record-link .ui-icon:last-child { margin-left: auto; }

/* ===== 操作按钮水平垂直居中 + 清除默认边框（统一） ===== */
.chips uni-button, .choice-row uni-button, .segmented uni-button, .dates uni-button,
.call-button, .more-button, .room-card uni-button, .small-button, .reserve-card uni-button,
.primary-button, .outline-button, .design-upload-btn, .promotion>uni-button, .identity-row uni-button {
  display: inline-flex; align-items: center; justify-content: center; text-align: center;
}
.chips uni-button::after, .choice-row uni-button::after, .segmented uni-button::after,
.dates uni-button::after, .call-button::after, .room-card uni-button::after, .small-button::after,
.reserve-card uni-button::after, .primary-button::after, .outline-button::after,
.design-upload-btn::after, .quick-grid uni-button::after, .tabbar uni-button::after, .sheet-head uni-button::after,
.promotion>uni-button::after, .identity-row uni-button::after, .member-hero uni-button::after,
.mine-list uni-button::after, .workbench uni-button::after { border: none; }
.chips uni-button:active, .choice-row uni-button:active, .room-card uni-button:active,
.reserve-card uni-button:active, .primary-button:active, .outline-button:active,
.design-upload-btn:active, .quick-grid uni-button:active { opacity: .88; }




/* ===== emoji 商品/菜品占位（按截图） ===== */
.emoji-thumb{display:grid;place-items:center;background:#f2f4ee;border-radius:8px;font-size:34px;line-height:1}
.food-thumb{width:100%;height:100px}
.product-emoji{position:absolute;inset:0;width:100%;height:100%}
.select-emoji{width:48px;height:48px;font-size:24px;border-radius:12px;background:linear-gradient(135deg,#f0f6f0,#e0eede)}
.si-btn{width:100%;min-height:42px;border-radius:11px;background:linear-gradient(135deg,var(--farm-green),var(--farm-green-deep));color:#fff;font-size:13px;font-weight:800;display:inline-flex;align-items:center;justify-content:center}
.si-btn.listed{background:#eef1ec;color:#8a8a82}
.si-margin span{color:var(--farm-muted);font-weight:600}



/* ===== select/reserve 按截图 ===== */
.work-metric-band>view{background:#f7f9f4;border:none;box-shadow:none}
.work-metric-band small{display:flex;align-items:center;justify-content:center;gap:4px}
.pricing input{background:#eef5ee;border-color:#cfe2d6}


/* ===== 门店密度对齐截图 ===== */
.choice-row.dates{flex-wrap:nowrap;overflow-x:auto;padding-bottom:4px}
.reserve-card image{width:64px;height:60px}
.reserve-card{padding:8px}
.reserve-card strong{margin-top:3px}
.member-hero{border-radius:20px;box-shadow:0 20px 40px -24px rgba(15,80,40,.7)}
.promotion{margin-top:16px;border-radius:18px;background:linear-gradient(135deg,#fff6e9,#fff);border-color:#f3e0bd}


/* ===== 会员页切换身份独立白条（按截图） ===== */
.identity-row{display:flex;align-items:center;justify-content:space-between;margin:14px 14px 0;padding:11px 14px;background:#fff;border:1px solid var(--farm-line);border-radius:14px;color:var(--farm-ink);box-shadow:0 2px 8px rgba(26,50,36,.05)}
.identity-row small{color:var(--farm-muted);font-size:11px}
.identity-row button{min-height:28px;padding:0 10px;border-radius:6px;background:var(--farm-green);color:#fff;font-size:10px}


/* ===== 海报弹层按截图（深绿底） ===== */
.poster-hero{height:150px;display:grid;place-items:center;font-size:56px;background:linear-gradient(135deg,#15512f,#1d6b44);border-radius:8px;margin-top:12px}


/* ===== 弹层 1:1（电话/充值/订单） ===== */
.contact-sheet{padding:4px 2px 8px;text-align:left}
.contact-sub{display:block;font-size:12.5px!important;color:#8a8a82;margin:4px 0 14px;line-height:1.6}
.ui-opt{display:flex;align-items:center;justify-content:space-between;border:1px solid var(--farm-line);border-radius:12px;padding:12px 14px;margin-bottom:9px;font-size:13.5px;font-weight:600}
.ui-opt.sel{border-color:var(--farm-green);background:#eef5ef;color:#1a6b41}
.ui-opt span{font-weight:800}
.contact-sheet .primary-button,.contact-sheet .outline-button{width:100%;min-height:46px;margin-top:6px;border-radius:13px;font-size:14.5px!important;font-weight:800}
.contact-sheet .outline-button{background:#f1f1ec;color:#555;border:1px solid #f1f1ec}
.recharge-sub{display:block;font-size:12.5px!important;color:#8a8a82;margin:4px 0 14px;line-height:1.6}
.ui-chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.ui-chips button{min-height:38px;padding:0 14px;border-radius:10px;background:#fff;border:1px solid var(--farm-line);font-size:13px!important;font-weight:700;color:var(--farm-muted)}
.ui-chips button.sel{border-color:var(--farm-green);background:#eef5ef;color:#1a6b41}
.order-records{padding-top:2px;display:block}
.rec-sub{display:block;font-size:12.5px!important;color:#8a8a82;margin:4px 0 10px}
.rec-line{display:flex;align-items:center;gap:11px;padding:12px 0;border-bottom:1px solid var(--farm-line)}
.rec-ic{width:40px;height:40px;border-radius:11px;display:grid;place-items:center;font-size:20px;background:#f1f6ef;flex-shrink:0}
.rec-b{flex:1;min-width:0}
.rec-t{display:block;font-size:13.5px!important;font-weight:700;line-height:1.35}
.rec-s{display:block;font-size:11.5px!important;color:var(--farm-muted);margin-top:2px}
.rec-st{font-size:11px;color:#b45309;background:#fef3c7;border-radius:6px;padding:3px 9px;font-weight:700;flex-shrink:0}
.rebuy-button{display:inline-block;margin-top:5px;padding:0;background:none;border:none;color:var(--farm-green);font-size:11px;font-weight:700}
.order-records .outline-button{margin-top:14px;font-size:14.5px!important}
.identity-sheet{padding:4px 2px 8px}
.identity-sub{display:block;font-size:12.5px!important;color:#8a8a82;margin:4px 0 14px}
.identity-options{display:grid;gap:9px;margin-bottom:14px}
.identity-options button{width:100%;min-height:54px;padding:12px 14px;border:1px solid var(--farm-line);border-radius:12px;background:#fff;display:flex;align-items:center;justify-content:space-between;gap:10px;text-align:left}
.identity-options button.sel{border-color:var(--farm-green);background:#eef5ef}
.identity-options button>view{flex:1;min-width:0}
.identity-options text{display:block;font-size:13.5px!important;font-weight:800}
.identity-options small{display:block;margin-top:3px;font-size:11.5px!important;color:#8a8a82;font-weight:400}
.identity-options span{font-size:14px;font-weight:800;color:#cfcfc7}
.identity-options button.sel span{color:var(--farm-green)}
.identity-sheet .outline-button{width:100%;min-height:46px;margin-top:6px;border-radius:13px;font-size:14.5px!important;font-weight:800;background:#f1f1ec;color:#555;border:1px solid #f1f1ec}
.poster-sheet{padding:4px 2px 8px}
.poster-sub{display:block;font-size:12.5px!important;color:#8a8a82;margin:4px 0 14px}
.poster-sheet .primary-button,.poster-sheet .outline-button{width:100%;min-height:46px;margin-top:6px;border-radius:13px;font-size:14.5px!important;font-weight:800}
.poster-sheet .outline-button{background:#f1f1ec;color:#555;border:1px solid #f1f1ec}
.rec-st.ok{color:#1a6b41;background:#eef5ef}
.rec-st.go{color:#52617f;background:#e9ecf2}
.rec-st.after{color:#a34339;background:#f9e7e4}.si-local{margin-top:8px;border-top:1px dashed #e5e8e1;padding-top:8px}.si-stock{display:flex;gap:8px;flex-wrap:wrap}.si-stock-sku{display:flex;align-items:center;gap:4px}.si-stock-sku text{font-size:9px;color:var(--farm-muted)}.si-stock-sku input{width:52px;height:28px;border:1px solid var(--farm-line);border-radius:5px;padding:0 6px;font-size:11px}.si-local-actions{display:flex;gap:6px;margin-top:6px}.si-local-actions .si-confirm{margin:0}.si-local-actions .si-confirm.danger{background:#f9e7e4;color:#a34339}


/* ===== 预订页 1:1（日期胶囊/包厢/套餐） ===== */
.cats{display:flex;gap:8px;overflow-x:auto;padding:0 2px 4px;scrollbar-width:none;margin:-4px 0 4px}
.cats::-webkit-scrollbar{display:none}
.cats button{flex:0 0 auto;min-height:34px;padding:6px 14px;border-radius:999px;background:#fff;border:1px solid var(--farm-line);color:#566;font-size:12.5px!important;font-weight:600}
.cats button.on{background:var(--farm-green);color:#fff;border-color:var(--farm-green);font-weight:700}
.reserve-list{display:block;padding:0}
.room{display:flex;gap:12px;background:#fff;border:1px solid var(--farm-line);border-radius:16px;padding:12px;margin:0 0 12px}
.room .rimg{width:96px;height:78px;border-radius:12px;display:grid;place-items:center;font-size:34px;background:linear-gradient(135deg,#eef6ef,#e0eede);flex-shrink:0}
.room .rb{flex:1;min-width:0}
.room .rn{display:flex;align-items:center;gap:6px;font-size:14.5px!important;font-weight:800}
.room .rn text{font-size:10px!important;border-radius:5px;padding:1px 6px;font-weight:700}
.room .rn .status-free{color:var(--farm-green);background:var(--farm-green-soft)}
.room .rn .status-busy{color:#b45309;background:#fef3c7}
.room .rd{font-size:11.5px!important;color:var(--farm-muted);margin-top:3px}
.room .rfoot{display:flex;align-items:center;justify-content:space-between;margin-top:8px}
.booknow{min-height:32px;padding:7px 14px;border-radius:10px;background:linear-gradient(135deg,var(--farm-green),var(--farm-green-deep));color:#fff;font-size:12px!important;font-weight:700}
.combo-list{display:block;padding:0}
.combo{display:flex;gap:12px;align-items:center;background:#fff;border:1px solid var(--farm-line);border-radius:16px;padding:12px;margin:0 0 12px}
.combo .ci{width:64px;height:64px;border-radius:14px;background:linear-gradient(135deg,#fff1df,#ffe6c7);display:grid;place-items:center;font-size:30px;flex-shrink:0}
.combo .cb{flex:1;min-width:0}
.combo .cn{font-size:14px!important;font-weight:800}
.combo .cl{font-size:11px!important;color:var(--farm-muted);margin-top:3px}
.combo .cprice{color:var(--farm-red);font-weight:800;font-size:14px!important;margin-top:4px}
.booking-sheet{padding:4px 2px 8px}
.booking-sub{display:block;font-size:12.5px!important;color:#8a8a82;margin:4px 0 14px;line-height:1.6}
.booking-section{margin-bottom:14px}
.booking-section>text{display:block;font-size:12.5px!important;font-weight:700;margin-bottom:8px}
.booking-sheet .primary-button{width:100%;min-height:46px;border-radius:13px;font-size:14.5px!important;font-weight:800}.service-detail{padding:4px 2px 8px;text-align:center}.service-detail .s-emoji{width:64px;height:64px;margin:8px auto 12px;border-radius:16px;background:var(--farm-green-soft);display:grid;place-items:center;font-size:32px}.service-detail .s-name{font-size:17px;font-weight:900}.service-detail .s-desc{display:block;margin-top:6px;color:var(--farm-muted);font-size:11px;line-height:1.6}.service-detail .s-rows{margin-top:14px;display:grid;gap:8px;text-align:left}.service-detail .s-rows view{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 13px;background:#f7f8f4;border:1px solid var(--farm-line);border-radius:9px;font-size:11px}.service-detail .s-rows text{color:var(--farm-muted)}.service-detail .s-rows strong{font-weight:800}.service-detail .primary-button,.service-detail .outline-button{width:100%;min-height:46px;margin-top:8px;border-radius:13px;font-size:14.5px!important;font-weight:800}.service-detail .s-order{margin-top:14px;text-align:left}.service-detail .s-order>text{display:block;margin-bottom:8px;font-size:11px;font-weight:800}.service-detail .s-order .ui-chips{margin-bottom:0}.service-detail .s-fee{margin-top:12px;padding:11px 13px;background:#f7f8f4;border:1px solid var(--farm-line);border-radius:9px;display:flex;align-items:center;justify-content:space-between;font-size:11px}.service-detail .s-fee text{color:var(--farm-muted)}.service-detail .s-fee strong{color:var(--farm-red);font-weight:800}

/* ===== 分销推广区 1:1（原型 promo） ===== */
.promotion{display:block;margin:12px 16px 0;border-radius:18px;padding:16px;background:linear-gradient(135deg,#fff6e9,#fff);border:1px solid #f3e0bd}
.promotion>view:first-child{display:block}
.promotion>view:first-child text{display:inline-flex;align-items:center;gap:7px;font-size:15px;font-weight:800;color:var(--farm-ink)}
.promotion>view:first-child small{display:block;margin-top:6px;font-size:12px!important;color:#8a7340;line-height:1.6}
.promotion .promo-stats{display:flex;gap:10px;margin:12px 0 0;width:100%}
.promotion .promo-stats>view{flex:1;background:#fff;border:1px solid #f1e3c4;border-radius:12px;padding:10px 6px;text-align:center}
.promotion .promo-stats text{display:block;font-size:10.5px!important;color:var(--farm-muted)}
.promotion .promo-stats strong{display:block;margin-top:2px;font-size:18px!important;font-weight:800;color:#c2410c}
.promotion>button{width:100%;min-height:44px;margin-top:12px;padding:0 12px;background:#a8542b;color:#fff;border-radius:12px;font-size:13px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;gap:6px}

/* ===== 商城 1:1（提示条/副标题） ===== */
.supply-note{background:#fff9e9!important;border-color:#ecdfbd!important;color:#765c27!important}
.supply-note .note-emoji{font-size:18px;line-height:1;flex-shrink:0}
.policy-hint{margin:10px 0;padding:9px 12px;border-radius:7px;background:var(--farm-green-soft);border:1px solid #cfe2d6;color:#315e48;font-size:11px;font-weight:700;text-align:left}.policy-hint b{color:var(--farm-green)}
.supply-note b{color:#9a6b1f;font-weight:800}
.shop-page .muted{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.workbench .section-head text{color:#fff}
  .workbench .section-head span{background:rgba(255,255,255,.85)}
  .workbench .ui-icon{filter:brightness(0) invert(1)}
  .workbench button .ui-icon{filter:none}

/* ===== 1:1 复核调整（对照原型） ===== */
.quick-grid .ui-icon { width:19px;height:19px; }
.source-tag { display:inline-block;margin-top:5px;padding:1px 6px;border:1px solid #cdebd4;border-radius:5px;background:var(--farm-green-soft);color:var(--farm-green);font-size:10px;font-weight:600; }


/* ===== 按钮组靠左修复（uni-button 默认 margin:0 auto 会摊开） ===== */
.choice-row uni-button, .ui-chips uni-button, .cats uni-button, .chips uni-button { margin: 0; }


.section-head uni-button, .identity-row uni-button, .rfoot uni-button, .product-body>view uni-button { margin: 0; }


.sheet-head uni-button { margin: 0; }

/* ===== 文字水平居中兜底 ===== */

.chips uni-button, .cats uni-button, .choice-row uni-button, .ui-chips uni-button { text-align: center; }



/* ===== 按钮文字水平垂直居中（uni-button 默认 display:block 文字顶对齐） ===== */
.chips uni-button, .cats uni-button, .choice-row uni-button, .ui-chips uni-button,
.section-head uni-button, .identity-row uni-button, .rfoot uni-button,
.room-card uni-button, .small-button, .food-detail-list uni-button,
.cart-bar>button:last-child,
.segmented uni-button, .primary-button, .outline-button {
  display: inline-flex; align-items: center; justify-content: center;
}


/* ===== 弹层/图标按钮水平垂直居中（uni-button 默认 padding 14px 导致 grid 图标右偏） ===== */
.sheet-head uni-button, .icon-button, .product-body uni-button, .cart-count { padding: 0; }
/* ===== 登录 ===== */
.login-prompt{padding:60px 24px 30px}
.login-prompt-card{background:#fff;border:1px solid var(--farm-line);border-radius:20px;padding:34px 24px 28px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;box-shadow:0 18px 40px -28px rgba(15,80,40,.5)}
.login-prompt-icon{width:64px;height:64px;border-radius:18px;background:var(--farm-green-soft);display:grid;place-items:center;font-size:32px}
.login-prompt-title{font-size:18px;font-weight:800;color:var(--farm-ink)}
.login-prompt-sub{font-size:12px;color:var(--farm-muted);line-height:1.7}
.login-prompt .primary-button{width:100%;min-height:46px;margin-top:12px}
.login-sheet{padding:10px 6px 12px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center}
.login-sheet-icon{width:60px;height:60px;border-radius:16px;background:var(--farm-green-soft);display:grid;place-items:center;font-size:30px}
.login-sheet-title{font-size:17px;font-weight:800;color:var(--farm-ink)}
.login-sheet-sub{font-size:12px;color:var(--farm-muted);line-height:1.7;margin-bottom:6px}
.login-sheet .primary-button{width:100%;min-height:46px}
.login-sheet-tip{font-size:10.5px;color:#b3b3ab;margin-top:6px}
.login-sheet .login-roles{margin:2px 0 2px;width:100%}
.login-sheet .login-role-help{margin:0 0 4px}
.logout-help{color:#c0392b}

.si-price-row{display:flex;gap:8px;align-items:center}
.si-price-row input{flex:1;min-width:0}
.si-confirm{flex:none;min-height:38px;padding:0 16px;border-radius:8px;background:var(--farm-green);color:#fff;font-size:12px;font-weight:700;display:inline-flex;align-items:center;justify-content:center}
.si-confirm[disabled]{opacity:.55}
.si-margin strong.neg{color:var(--farm-red)}
/* ===== 经营工作台：核销 / 设计包厢 / 设计土菜 ===== */
.verify-list,.design-list{display:flex;flex-direction:column;gap:10px}
.verify-item,.design-item{display:flex;align-items:center;gap:10px;padding:12px;background:#fff;border:1px solid var(--farm-line);border-radius:14px}
.verify-emoji{width:44px;height:44px;border-radius:12px;background:var(--farm-green-soft);display:grid;place-items:center;font-size:22px;flex-shrink:0}
.design-emoji{width:64px;height:64px;border-radius:12px;background:var(--farm-green-soft);display:grid;place-items:center;font-size:26px;flex-shrink:0}
.design-upload-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.design-upload-actions{display:flex;gap:6px;flex-wrap:wrap}
.design-upload-btn{min-height:30px;padding:0 10px;border:1px solid #e5e1d6;border-radius:6px;background:#fff;color:var(--farm-green,#17633f);font-size:11px;margin:0}
.design-upload-btn.danger{color:#b23a2c}
.verify-main,.design-main{flex:1;min-width:0}
.verify-main small,.design-main small{display:block;margin-top:3px;color:var(--farm-muted);font-size:10.5px;line-height:1.5}
.verify-status{font-size:11px;font-weight:700;color:var(--farm-green);white-space:nowrap}
.verify-status.cancel{color:var(--farm-muted)}
.verify-status.ok{color:#2e8b57}
.verify-amount{width:92px;height:32px;display:flex;align-items:center;padding:0 8px;border:1px solid var(--farm-line);border-radius:8px;background:#fff;color:var(--farm-muted);font-size:12px}
.verify-amount input{min-width:0;flex:1;height:30px;padding:0 0 0 3px;border:0;background:transparent;color:var(--farm-ink);font-size:12px}
.verify-btn{min-height:30px;padding:0 12px;border-radius:8px;background:var(--farm-green);color:#fff;font-size:12px;font-weight:700;display:inline-flex;align-items:center;justify-content:center}
.verify-done{color:var(--farm-muted);font-size:12px;font-weight:700;width:34px;text-align:center}
.design-actions{display:flex;gap:6px;flex-shrink:0}
.design-actions button{min-height:28px;padding:0 10px;border-radius:7px;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center}
.design-edit{background:var(--farm-green-soft);color:var(--farm-green)}
.design-del{background:#fae8e4;color:var(--farm-red)}
.design-form{padding:6px 2px 8px}
.design-form .form-field{display:flex;flex-direction:column;gap:6px;margin-bottom:14px}
.design-form .form-field>text{font-size:12px;font-weight:700;color:#5a6a60}
.design-form .form-field input{height:44px;border:1px solid var(--farm-line);border-radius:10px;padding:0 12px;font-size:13px;background:#fafcfb}
.design-form .choice-row{display:flex;gap:8px}
.design-form .choice-row button{flex:1;min-height:40px;border:1px solid var(--farm-line);border-radius:9px;font-size:12px;font-weight:700;color:var(--farm-muted)}
.design-form .choice-row button.active{background:var(--farm-green-soft);border-color:var(--farm-green);color:var(--farm-green)}
.design-form .primary-button{width:100%;min-height:46px}

.home-empty{min-height:120px;margin:0 16px;border:1px dashed var(--farm-line);border-radius:14px;background:#fff}

/* ===== 列表搜索 / 菜品空占位 / 收货地址编辑 ===== */
.list-search{display:flex;align-items:center;gap:8px;margin:12px 0;padding:0 12px;height:40px;background:#fff;border:1px solid var(--farm-line);border-radius:8px}
.list-search input{flex:1;height:100%;font-size:12px}
.design-emoji.empty-box{background:#f2f4ee}
.address-edit-row{align-items:flex-start}
.address-edit-row .help-edit{flex:1;min-width:0}
.address-edit-row .help-edit text{display:block;font-size:12px;font-weight:800}
.address-edit-row .help-edit input{width:100%;height:36px;margin-top:6px;padding:0 10px;border:1px solid var(--farm-line);border-radius:7px;font-size:12px;background:#fff}
.address-save{min-height:32px;padding:0 12px;border-radius:7px;background:var(--farm-green);color:#fff;font-size:11px;font-weight:700;flex:none;display:inline-flex;align-items:center;justify-content:center;margin:0}
.address-save::after{border:none;background:none}

.product-tag-row{display:flex;flex-wrap:wrap;gap:5px;align-items:center}
.express-tag{font-size:10px;padding:1px 7px;border-radius:9px;background:#eaf3ff;color:#35658f}
.delivery-picker{padding:12px 16px;border-bottom:1px solid #e9eeea}
.delivery-label{display:block;font-size:12px;font-weight:800;margin-bottom:8px}
.store-summary>.business-image{width:54px;height:54px;border-radius:14px}.food-card .business-image{width:100%;height:100px}.room-card .business-image{width:72px;height:58px;border-radius:5px}.reserve-card .business-image{width:82px;height:74px;border-radius:8px}.sheet-line>.business-image{width:54px;height:54px;border-radius:6px}.product-detail>.business-image{width:100%;height:210px;border-radius:8px}.food-detail-list .business-image{width:58px;height:54px;border-radius:5px}
</style>
