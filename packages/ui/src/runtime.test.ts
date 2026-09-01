import { describe, expect, it } from 'vitest'
import { configureMediaRuntime, getMediaRuntime, type MediaRuntime } from './runtime'

describe('media runtime registry', () => {
  it('stores the configured runtime on a global keyed registry', () => {
    const runtime = { storage: {} as MediaRuntime['storage'], chooseImages: async () => [], fallback: { source: 'builtin', path: '/fallback' } } satisfies MediaRuntime
    configureMediaRuntime(runtime)
    expect(getMediaRuntime()).toBe(runtime)
    expect(Symbol.for('agritainment.ui.mediaRuntime')).toBeDefined()
  })
})
