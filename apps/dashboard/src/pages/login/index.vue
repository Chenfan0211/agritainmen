<script setup lang="ts">
import logInIcon from 'lucide-static/icons/log-in.svg?url'
import shieldIcon from 'lucide-static/icons/shield-check.svg?url'
import { onMounted, ref } from 'vue'
import { useDashboardStore } from '../../stores/dashboard'

const store = useDashboardStore()
const account = ref('')
const password = ref('')
const error = ref('')
const submitting = ref(false)

function enterDashboard() {
  uni.reLaunch({ url: '/pages/index/index' })
}

function submit() {
  error.value = ''
  submitting.value = true
  if (store.login(account.value, password.value)) enterDashboard()
  else {
    error.value = '账号或密码错误'
    submitting.value = false
  }
}

onMounted(() => {
  if (store.restoreSession()) enterDashboard()
})
</script>

<template>
  <main class="dashboard-login">
    <section class="login-brand" aria-label="产业数据驾驶舱">
      <view class="brand-symbol"><span></span><span></span><span></span></view>
      <p>AGRICULTURAL INDUSTRY DATA CENTER</p>
      <h1>产业数据监管与赋能驾驶舱</h1>
      <view class="brand-metrics"><span>产业画像</span><i></i><span>监管监测</span><i></i><span>产业赋能</span></view>
    </section>

    <section class="login-panel" aria-labelledby="login-title">
      <header>
        <img :src="shieldIcon" alt="" />
        <view><h2 id="login-title">账号登录</h2><p>区域权限随登录主体自动生效</p></view>
      </header>
      <form @submit.prevent="submit">
        <label><span>账号</span><input v-model.trim="account" aria-label="账号" autocomplete="username" placeholder="请输入账号" /></label>
        <label><span>密码</span><input v-model="password" aria-label="密码" type="password" autocomplete="current-password" placeholder="请输入密码" /></label>
        <p v-if="error" class="login-error" role="alert">{{ error }}</p>
        <button type="button" role="button" :disabled="submitting || !account || !password" @click="submit">
          <img :src="logInIcon" alt="" /><span>{{ submitting ? '登录中' : '登录驾驶舱' }}</span>
        </button>
      </form>
      <footer>
        <span>演示账号</span>
        <code>leader / regulator / service</code>
        <code>密码 123456</code>
      </footer>
    </section>
  </main>
</template>

<style scoped lang="scss">
.dashboard-login {
  width: 100vw; min-width: 1024px; min-height: 100vh; display: grid; grid-template-columns: minmax(520px, 1.35fr) minmax(420px, .65fr);
  color: #e9f4f6; background: #07111c;
  background-image: linear-gradient(rgba(33, 67, 84, .14) 1px, transparent 1px), linear-gradient(90deg, rgba(33, 67, 84, .12) 1px, transparent 1px); background-size: 36px 36px;
}
.login-brand { padding: clamp(70px, 10vh, 130px) clamp(60px, 8vw, 150px); display: flex; flex-direction: column; justify-content: center; border-right: 1px solid #1e3c4d; position: relative; overflow: hidden; }
.login-brand::after { content: ''; position: absolute; width: 420px; height: 420px; right: -210px; bottom: -210px; border: 1px solid #225667; transform: rotate(45deg); }
.brand-symbol { width: 54px; height: 54px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; align-items: end; padding: 10px; border: 1px solid #317283; }
.brand-symbol span { height: 52%; background: #24d4c4; }.brand-symbol span:nth-child(2) { height: 100%; background: #48a8ff; }.brand-symbol span:nth-child(3) { height: 74%; background: #f3b33d; }
.login-brand > p { margin: 38px 0 12px; color: #5f8291; font-size: 11px; letter-spacing: 2px; }.login-brand h1 { max-width: 700px; margin: 0; color: #edf8fa; font-size: clamp(34px, 3vw, 56px); line-height: 1.25; letter-spacing: 0; }
.brand-metrics { margin-top: 34px; display: flex; align-items: center; gap: 14px; color: #8aa7b3; font-size: 12px; }.brand-metrics i { width: 28px; height: 1px; background: #2b7180; }
.login-panel { width: min(390px, calc(100% - 64px)); align-self: center; justify-self: center; border-top: 2px solid #24d4c4; background: #0c1b28; box-shadow: 0 28px 80px rgba(0,0,0,.32); padding: 32px; }
.login-panel header { display: flex; align-items: center; gap: 13px; padding-bottom: 24px; border-bottom: 1px solid #1d3948; }.login-panel header img { width: 25px; height: 25px; filter: invert(76%) sepia(60%) saturate(465%) hue-rotate(126deg); }.login-panel h2 { margin: 0; font-size: 21px; letter-spacing: 0; }.login-panel header p { margin: 5px 0 0; color: #708d9b; font-size: 11px; }
form { display: grid; gap: 18px; margin-top: 25px; }label span { display: block; margin-bottom: 7px; color: #9db2bc; font-size: 11px; }input { box-sizing: border-box; width: 100%; height: 42px; border: 1px solid #294858; border-radius: 0; padding: 0 12px; outline: none; color: #e9f4f6; background: #091722; font-size: 13px; }input:focus { border-color: #24d4c4; }
form button { height: 43px; margin: 3px 0 0; border: 0; border-radius: 0; display: flex; align-items: center; justify-content: center; gap: 8px; color: #06141d; background: #24d4c4; font-weight: 700; cursor: pointer; }form button:disabled { cursor: not-allowed; opacity: .45; }form button img { width: 17px; height: 17px; }
.login-error { margin: -7px 0 -4px; color: #ff8181; font-size: 11px; }.login-panel footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #1d3948; display: flex; flex-wrap: wrap; gap: 7px 12px; color: #607d8b; font-size: 12px; }.login-panel footer span { width: 100%; color: #8da7b5; }.login-panel code { color: #6f9cab; font-family: Consolas, monospace; }
@media (max-height: 800px) { .login-panel { padding: 24px 28px; }.login-brand { padding-top: 50px; padding-bottom: 50px; }.login-brand > p { margin-top: 25px; } }
</style>
