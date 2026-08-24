import { describe, expect, it } from 'vitest'
import * as tenantModule from './tenant'

type RuntimeTenantResolver = (
  farm?: unknown,
  location?: { search?: string; hash?: string }
) => { code: string; farmId: string; name: string }

const resolveRuntimeTenant = (tenantModule as unknown as {
  resolveRuntimeTenant: RuntimeTenantResolver
}).resolveRuntimeTenant

describe('farmhouse runtime tenant selection', () => {
  it('selects F002 from the H5 search query', () => {
    expect(resolveRuntimeTenant(undefined, {
      search: '?farm=F002',
      hash: '#/pages/index/index'
    })).toMatchObject({ code: 'yunshang', farmId: 'F002', name: '云上人家山景农庄' })
  })

  it('selects F002 from the H5 hash query', () => {
    expect(resolveRuntimeTenant(undefined, {
      search: '',
      hash: '#/pages/index/index?farm=F002'
    })).toMatchObject({ code: 'yunshang', farmId: 'F002', name: '云上人家山景农庄' })
  })

  it('falls back to F001 for an unknown runtime tenant', () => {
    expect(resolveRuntimeTenant('F999', { search: '', hash: '' })).toMatchObject({
      code: 'shibanxi',
      farmId: 'F001',
      name: '石板溪农家乐'
    })
  })
})
