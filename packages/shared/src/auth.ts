/**
 * 登录演示辅助（纯前端工程、无后端）：
 * 账号密码 / 手机号 / 验证码 / 微信 openid 均本地模拟。
 */

export const DEMO_ACCOUNT = 'admin'
export const DEMO_PASSWORD = '123456'
export const DEMO_PHONE = '13800000000'
export const DEMO_SMS_CODE = '123456'

export function validateAccountPassword(account: string, password: string): boolean {
  return account.trim() === DEMO_ACCOUNT && password === DEMO_PASSWORD
}

export function validatePhone(phone: string): boolean {
  return /^1[3-9]\d{9}$/.test(phone.trim())
}

export function validateSmsCode(code: string): boolean {
  return code.trim() === DEMO_SMS_CODE
}

interface WechatUni {
  getSystemInfoSync?: () => { uniPlatform?: string }
  login?: (options: {
    provider?: string
    success: (result: { code?: string }) => void
    fail?: (error: unknown) => void
  }) => void
}

/**
 * 模拟微信授权登录：
 * - 微信小程序端先 uni.login 取 code，再本地映射为 mock openid；
 * - H5 / 测试环境直接返回 mock openid。
 */
export function simulateWechatLogin(): Promise<{ openid: string }> {
  return new Promise((resolve) => {
    const finish = (code?: string) => {
      const seed = (code || 'h5').slice(0, 10).replace(/[^a-zA-Z0-9]/g, '') || 'h5'
      resolve({ openid: `mock_openid_${seed}_${Math.random().toString(36).slice(2, 8)}` })
    }
    const uniRef = (globalThis as unknown as { uni?: WechatUni }).uni
    const isMpWeixin = uniRef?.getSystemInfoSync?.().uniPlatform === 'mp-weixin'
    if (isMpWeixin && typeof uniRef?.login === 'function') {
      uniRef.login({
        provider: 'weixin',
        success: (result) => finish(result.code),
        fail: () => finish()
      })
    } else {
      finish()
    }
  })
}
