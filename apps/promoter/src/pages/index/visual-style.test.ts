import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(import.meta.dirname, 'index.vue'), 'utf8')
const template = source.slice(source.indexOf('<template>') + '<template>'.length, source.indexOf('<style'))
const styles = source.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] || ''

function rule(selector: string): string {
  return [...styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((match) => match[1].split(',').map((part) => part.trim()).includes(selector))
    .map((match) => match[2])
    .join(';')
}

describe('promoter mobile visual contract', () => {

  it('全局样式不引入小程序不支持的裸 select 标签选择器', () => {
    const globalStyles = readFileSync(resolve(import.meta.dirname, '../../styles/global.scss'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(globalStyles).not.toMatch(/(^|[,{}])\s*select\s*(?=[,{])/m)
  })
  it('uses UiIcon instead of decorative emoji', () => {
    const decorativeEmoji = ['🏪', '🏬', '📍', '⭐', '🎯', '🧑‍💼', '🧑‍🍳', '👑', '💰', '🔗', '🎁', '📦', '📋']

    for (const emoji of decorativeEmoji) expect(template, emoji).not.toContain(emoji)
    expect(template).not.toMatch(/\p{Extended_Pictographic}/u)
    expect(template).toContain('<UiIcon name="user-round"')
    expect(template).toContain('<UiIcon name="link"')
  })

  it('uses the shared forest-green and warm-red tokens without decorative gradients', () => {
    const globalStyles = readFileSync(resolve(import.meta.dirname, '../../styles/global.scss'), 'utf8')
    expect(globalStyles).toContain('design-tokens.css')
    expect(globalStyles).toContain('--mobile-brand: var(--color-brand-primary)')
    expect(rule('.app-shell')).toContain('background:var(--color-bg)')
    expect(rule('.promoter-head')).toContain('background:var(--gradient-brand)')
    expect(rule('.wallet-top strong')).toContain('color:var(--color-price)')
    expect(styles).not.toMatch(/(?:linear|radial|conic)-gradient/i)
    expect(styles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)

    for (const retiredColor of ['#c83245', '#fdeef1', '#3a566f', '#243a4f']) {
      expect(styles.toLowerCase(), retiredColor).not.toContain(retiredColor)
    }
  })

  it('keeps cards compact and primary controls touch friendly', () => {
    expect(rule('.login-card')).toContain('min-height:100vh')
    expect(rule('.login-panel')).toContain('border-radius:var(--radius-card) var(--radius-card) 0 0')
    expect(rule('.primary-button')).toContain('border-radius:var(--radius-pill)')
    expect(rule('.primary-button')).toMatch(/min-height:\s*var\(--control-size\)/)
    expect(rule('.login-field input')).toMatch(/height:\s*var\(--control-size\)/)
  })

  it('contains long content at 375px without horizontal page overflow', () => {
    expect(rule('.app-shell')).toMatch(/width:\s*100%/)
    expect(rule('.app-shell')).toMatch(/overflow-x:\s*hidden/)
    expect(rule('.app-shell')).toContain('padding-bottom:0')
    expect(rule('.app-shell')).toContain('background:var(--color-bg)')
    expect(rule('.live-list')).toContain('var(--mobile-bottom-safe)')
    expect(rule('.live-list')).toContain('padding:0 var(--space-page)')
    expect(rule('.empty')).toContain('margin:0 var(--space-page)')
    expect(rule('.quick-tools')).toContain('margin:var(--space-section) var(--space-page) 0')
    expect(rule('.quick-tools')).toContain('grid-template-columns:repeat(3,minmax(0,1fr))')
    expect(rule('.quick-tools button')).not.toContain('min-height:80px')
    expect(rule('.section-head')).toContain('margin:22px var(--space-page) 10px')
    expect(styles).toMatch(/\.head-row\{[^}]*min-width:0/)
    expect(styles).toMatch(/\.profile\{[^}]*min-width:0/)
    expect(rule('.live-actions')).toContain('grid-template-columns:repeat(3,minmax(0,1fr))')
    expect(rule('.live-actions .mini.share-action')).toContain('grid-column:1/-1')
    expect(rule('.data-list>view')).toContain('grid-template-columns:44px minmax(0,1fr) auto')
    expect(rule('.sheet')).toContain('max-width:100%')
  })

  it('keeps the live section title on one readable line', () => {
    expect(template).toContain('class="section-title"')
    expect(template).toContain('class="section-title-label"')
    expect(rule('.section-title')).toMatch(/flex:\s*1/)
    expect(rule('.section-title')).toMatch(/min-width:\s*0/)
    expect(rule('.section-title-label')).toContain('white-space:nowrap')
    expect(rule('.section-title-label')).toContain('flex:none')
    expect(rule('.section-title-label')).toContain('min-width:4em')
  })

  it('exposes all four business sheets to visual regression checks', () => {
    for (const state of ['create-live', 'share', 'shares', 'bound-users']) {
      expect(template).toContain(`data-visual-state="promoter-${state}"`)
    }
    expect(rule('.sheet')).toContain('overflow:hidden')
    expect(rule('.sheet--create-live')).toContain('max-height:var(--mobile-sheet-max-height)')
    expect(styles).toMatch(/@media\(min-width:431px\)[\s\S]*?\.sheet\{[^}]*max-width:430px/)
    expect(rule('.sheet-head')).toContain('min-height:var(--mobile-sheet-header-height)')
    expect(rule('.create-live')).toContain('min-width:0')
    expect(rule('.share-sheet')).toContain('min-width:0')
    expect(rule('.data-list')).toContain('min-width:0')
    expect(rule('.sheet-mask')).toContain('align-items:flex-end')
    expect(rule('.sheet-foot')).toContain('env(safe-area-inset-bottom)')
  })

  it('直播封面保持稳定的 16:9 比例', () => {
    expect(rule('.live-card')).toContain('padding:var(--space-gap)')
    expect(rule('.live-cover-wrap')).toContain('aspect-ratio:16/9')
    expect(rule('.live-cover-wrap')).toContain('border-radius:var(--radius-card)')
    expect(rule('.live-cover')).toContain('width:100%')
    expect(template).toMatch(/class="live-cover-wrap"[\s\S]*class="live-cover-status"/)
  })

  it('登录页在自定义导航下避开状态栏，图标不靠滤镜着色', () => {
    expect(styles).toMatch(/\.login-page\s*\{[^}]*padding:0/s)
    expect(styles).toMatch(/\/\* #ifdef MP-WEIXIN \*\/[\s\S]*\.login-page\{padding-top:calc\(24px \+ var\(--status-bar-height\)\)/)
    expect(styles).toMatch(/\/\* #ifdef MP-WEIXIN \*\/[\s\S]*\.promoter-head\{padding-top:calc\(12px \+ var\(--status-bar-height\)\)/)
    expect(styles).not.toMatch(/\.promoter-head,\.login-page\{padding-top:calc\(12px/)
    expect(styles).not.toMatch(/filter:brightness\(0\) invert\(1\)/)
    expect(rule('.login-hero')).toContain('background:var(--gradient-brand)')
    expect(rule('.login-panel')).toContain('background:var(--color-card)')
    expect(rule('.login-body')).toMatch(/padding:\s*var\(--space-card\) var\(--space-page\)/)
    expect(template).toContain('class="login-phone-valid"')
    expect(template).toContain('name="check"')
    expect(template).toContain('passwordVisible')
    expect(template).toContain(":name=\"passwordVisible ? 'eye-off' : 'eye'\"")
    expect(styles).not.toMatch(/\.login-icon\{/)
    expect(styles).not.toMatch(/\.login-title\{/)
    expect(styles).toMatch(/\/\* #ifdef MP-WEIXIN \*\/[\s\S]*\.promoter-head\{padding-top:calc\(12px \+ var\(--status-bar-height\)\);padding-right:96px\}/)
    expect(styles).toMatch(/\.promoter-head\{background:[\s\S]*padding:calc\(12px \+ env\(safe-area-inset-top\)\) var\(--space-page\) 42px\}/)
  })

  it('does not flatten the shared uploader choose tile', () => {
    expect(styles).not.toContain('.create-live .business-uploader__choose')
    expect(rule('.upload-btn')).toContain('var(--mobile-control-compact)')
  })

  it('uses the shared compact-control token for secondary sheet actions', () => {
    for (const selector of ['.live-actions .mini', '.upload-btn', '.chips button']) {
      expect(rule(selector), selector).toContain('var(--mobile-control-compact)')
    }
    expect(rule('.sheet-head')).toContain('padding:var(--space-gap) var(--space-page)')
    expect(rule('.sheet-head button')).toMatch(/width:var\(--control-size\)/)
    expect(rule('.sheet-head button')).toMatch(/height:var\(--control-size\)/)
  })

  it('H5 画框包在条件编译内，小程序复位画框宽度', () => {
    expect(styles).toMatch(/\/\* #ifdef H5 \*\/[\s\S]*@media\(min-width:431px\)[\s\S]*\/\* #endif \*\//)
    expect(styles).toMatch(/\/\* #ifdef MP-WEIXIN \*\/[\s\S]*\.app-shell,\.sheet\{max-width:100%\}/)
    expect(styles).not.toContain('!important')
  })

  it('短弹层随内容收缩，不再写死 80vh 高度', () => {
    expect(rule('.sheet-scroll')).toMatch(/height:\s*auto/)
    expect(rule('.sheet-scroll')).toMatch(/max-height:\s*calc\(80vh/)
    expect(rule('.sheet-scroll')).not.toMatch(/(?<!max-)height:\s*calc\(80vh/)
  })

  it('创建直播 mask 贴底且表单间距收紧，foot 始终可见', () => {
    expect(rule('.sheet-mask')).not.toContain('padding-top:24px')
    expect(rule('.sheet-mask')).toContain('align-items:flex-end')
    expect(rule('.field')).toMatch(/margin-top:\s*var\(--space-gap\)/)
    expect(template).toContain('class="sheet-foot"')
  })

  it('创建直播去掉内层双滚动，分享主按钮贴在 sheet-foot', () => {
    expect(rule('.create-live')).not.toMatch(/overflow-y:\s*auto/)
    expect(rule('.share-sheet')).not.toMatch(/overflow-y:\s*auto/)
    expect(rule('.data-list')).not.toMatch(/overflow-y:\s*auto/)
    expect(template).toMatch(/sheet === 'share'[\s\S]*class="sheet-foot"[\s\S]*复制直播间链接/)
    expect(template).toContain('class="sheet-handle"')
    expect(rule('.sheet-handle')).toMatch(/display:none/)
  })

  it('套餐空态使用统一 pc-empty 图标块', () => {
    expect(template).toMatch(/class="pkg-empty pc-empty"/)
    expect(template).toMatch(/class="pkg-empty pc-empty"[\s\S]*该门店暂无套餐券商品/)
  })

  it('首页快捷入口与直播操作按参考图分栏', () => {
    expect(template).toContain('class="quick-tools pc-tile-grid"')
    expect(template).toContain('class="pc-tile pc-tile--green"')
    expect(template).toContain('class="pc-tile pc-tile--amber"')
    expect(template).toContain('class="pc-tile pc-tile--blue"')
    expect(template).toContain('class="live-actions"')
    expect(template).toContain('class="mini toggle"')
    expect(template).toContain('class="mini edit"')
    expect(template).toContain('class="mini danger"')
    expect(template).toContain('share-action')
    expect(template).toContain('class="live-cover-status"')
  })

  it('创建直播使用横向封面、三列门店和可识别的选中标识', () => {
    expect(template).toContain('class="cover-row"')
    expect(template).toContain('class="cover-upload"')
    expect(rule('.farm-grid')).toContain('grid-template-columns:repeat(3,minmax(0,1fr))')
    expect(template).toContain('class="selection-badge"')
    expect(template).toContain('class="pkg-selection-badge"')
    expect(rule('.selection-badge')).toContain('display:grid')
    expect(rule('.pkg-selection-badge')).toContain('display:grid')
  })

  it('弹层列表与分享内容使用参考图 token', () => {
    expect(rule('.share-sheet')).toContain('padding:var(--space-card) var(--space-page)')
    expect(rule('.qr-box')).toContain('aspect-ratio:1/1')
    expect(rule('.qr-box')).toContain('max-width:220px')
    expect(rule('.data-list')).toContain('padding:var(--space-card) var(--space-page)')
    expect(rule('.data-list')).toContain('var(--mobile-bottom-safe)')
    expect(rule('.data-list>view')).toContain('background:var(--color-brand-primary-soft)')
    expect(rule('.data-list strong.income')).toContain('color:var(--color-price)')
    expect(rule('.data-list span.bound')).toContain('background:var(--color-brand-primary-soft)')
    expect(rule('.data-list span.pending')).toContain('background:var(--color-warning-soft)')
  })

  it('页面样式不新增硬编码颜色或强制覆盖', () => {
    expect(styles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(styles).not.toContain('!important')
  })
})
