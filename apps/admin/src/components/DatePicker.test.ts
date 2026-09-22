import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./DatePicker.vue', import.meta.url), 'utf8')

describe('admin DatePicker', () => {
  it('opens a teleported calendar with token-only chrome', () => {
    expect(source).toContain('<Teleport to="body">')
    expect(source).toContain('<UiIcon name="calendar-days"')
    expect(source).toContain('class="date-picker__trigger filter-control picker-field"')
    expect(source).toContain('清除')
    expect(source).toContain('今天')
    expect(source).toContain('height: var(--admin-control-height)')
    expect(source).toContain('background: var(--color-brand-primary)')
    expect(source).toContain('color: var(--color-on-brand)')
    expect(source).toContain('background: var(--color-brand-primary-soft)')
    expect(source).toContain('color: var(--admin-muted)')
    expect(source).not.toMatch(/#[0-9A-Fa-f]{3,8}/)
    expect(source).not.toContain('type="date"')
    expect(source).not.toContain('mode="date"')
  })

  it('binds a YYYY-MM-DD string through v-model', () => {
    expect(source).toContain("emit('update:modelValue', value)")
    expect(source).toContain('placeholder: \'请选择日期\'')
  })
})
