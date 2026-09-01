import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('alliance withdrawal history UI', () => {
  const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8')

  it('renders platform withdrawal status, method, review note, operator, and timestamps', () => {
    const withdrawalSheet = source.match(/<view v-else-if="sheet === 'withdraw'"[\s\S]*?<view v-else-if="sheet === 'booking'/)?.[0] || ''
    expect(withdrawalSheet).toContain('store.withdrawalRecords')
    expect(withdrawalSheet).toContain('withdrawal.status')
    expect(withdrawalSheet).toContain('withdrawal.method')
    expect(withdrawalSheet).toContain('withdrawal.reviewedNote')
    expect(withdrawalSheet).toContain('withdrawal.operator')
    expect(withdrawalSheet).toContain('withdrawal.reviewedAt')
    expect(withdrawalSheet).toContain('withdrawal.createdAt')
  })
})
