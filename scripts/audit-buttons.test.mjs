import { describe, expect, it } from 'vitest'
import { AUDIT_FILES, auditButtons, auditButtonsSource } from './audit-buttons.mjs'

const onlyButton = (attributes) => `<template><button ${attributes}>提交</button></template>`

describe('auditButtonsSource', () => {
  it('recognizes handlers behind click modifiers such as @click.stop', () => {
    const result = auditButtonsSource(onlyButton('class="cat-add" @click.stop="addProduct(product)"'), 'sample.vue')

    expect(result.failures).toEqual([])
    expect(result.matrix.surface).toBe(1)
  })

  it('classifies quantity stepper handlers as surface behaviour', () => {
    const result = auditButtonsSource([
      '<template>',
      '<button @click="changeCartQuantity(item, -1)">-</button>',
      '<button @click="changeDetailQuantity(1)">+</button>',
      '</template>'
    ].join('\n'), 'sample.vue')

    expect(result.failures).toEqual([])
    expect(result.matrix.surface).toBe(2)
  })

  it('still reports buttons that carry no click binding at all', () => {
    const result = auditButtonsSource(onlyButton('class="submit"'), 'sample.vue')

    expect(result.failures).toEqual(['sample.vue:1 <button class="submit">'])
  })

  it('still reports handlers that only raise a toast', () => {
    const result = auditButtonsSource(onlyButton('@click="toast(\'敬请期待\')"'), 'sample.vue')

    expect(result.failures).toEqual(['sample.vue:1 仅显示提示，未产生数据或界面变化'])
  })

  it('separates store calls, surface functions and local state mutations', () => {
    const result = auditButtonsSource([
      '<template>',
      '<button @click="store.toggleCheckoutSelection(item)">选</button>',
      '<button @click="openDetail(product.id)">详情</button>',
      '<button @click="quantity++">加</button>',
      '<button @click="changeCartQuantity(item, 1)">加购</button>',
      '</template>'
    ].join('\n'), 'sample.vue')

    expect(result.failures).toEqual([])
    expect(result.matrix).toEqual({ store: 1, surface: 2, localState: 1 })
  })
})

describe('auditButtons', () => {
  it('keeps every audited page free of unhandled buttons', () => {
    const { failures, matrix, fileCount } = auditButtons()

    expect(failures).toEqual([])
    expect(fileCount).toBe(AUDIT_FILES.length)
    expect(matrix.store + matrix.surface + matrix.localState).toBeGreaterThan(0)
  })
})