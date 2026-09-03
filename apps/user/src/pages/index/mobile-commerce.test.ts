import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('用户端移动商城契约', () => {
  const source = readFileSync(resolve(import.meta.dirname, 'index.vue'), 'utf8')
  const pages = readFileSync(resolve(import.meta.dirname, '../../pages.json'), 'utf8')

  it('使用四栏导航并将订单入口收进个人中心', () => {
    expect(source).toContain("activeTab === 'home'")
    expect(source).toContain("activeTab === 'category'")
    expect(source).toContain("activeTab === 'cart'")
    expect(source).toContain('<text>首页</text>')
    expect(source).toContain('<text>分类</text>')
    expect(source).toContain('<text>购物车</text>')
    expect(source).toContain('查看全部订单')
  })

  it('分销身份显示四个运营入口且商品分享带推广人与商品参数', () => {
    expect(source).toContain('我的收入')
    expect(source).toContain('我的粉丝')
    expect(source).toContain('团队订单')
    expect(source).toContain('团队业绩')
    expect(source).toContain('promoter=${store.currentDistributor.promoterId}')
    expect(source).toContain('product=${product.id}')
    expect(pages).toContain('pages/operations/index')
  })
})
