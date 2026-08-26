import { beforeEach, describe, expect, it } from 'vitest'
import type { CommissionLedgerEntry, SupplierSettlementRecord, VoucherOrder } from './index'
import {
  PLATFORM_COMMISSION_LEDGER_MIGRATED_STORAGE_KEY,
  PLATFORM_COMMISSION_LEDGER_STORAGE_KEY,
  PLATFORM_SUPPLIER_SETTLEMENTS_STORAGE_KEY,
  PLATFORM_VOUCHERS_STORAGE_KEY,
  migrateLegacyCommissionsToLedger,
  readPlatformCommissionLedger,
  readPlatformSupplierSettlements,
  readPlatformVoucherOrders,
  reverseCommissionLedgerEntry,
  transitionVoucherOrder,
  writePlatformCommissionLedgerEntry,
  writePlatformSupplierSettlement,
  writePlatformVoucherOrder
} from './index'

if (!globalThis.localStorage) {
  const storage = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, String(value)) },
    removeItem: (key: string) => { storage.delete(key) },
    clear: () => storage.clear(),
    key: () => null,
    get length() { return storage.size }
  } as Storage
}

function ledgerEntry(overrides: Partial<CommissionLedgerEntry> = {}): CommissionLedgerEntry {
  return { id: 'L1', sourceOrderId: 'O1', beneficiaryType: 'promoter', beneficiaryId: 'T001', role: 'promoter', amount: 10, status: 'pending', createdAt: '2026-08-24 12:00', ...overrides }
}

function settlement(overrides: Partial<SupplierSettlementRecord> = {}): SupplierSettlementRecord {
  return { id: 'ST1', period: '2026-08', supplierIds: ['S002'], orderIds: ['O1'], amount: 100, createdAt: '2026-08-24 12:00', items: [{ supplierId: 'S002', supplierName: '联调供应商', orderIds: ['O1'], amount: 100 }], ...overrides }
}

function voucher(overrides: Partial<VoucherOrder> = {}): VoucherOrder {
  return { id: 'V1', userId: 'U1', promoterId: 'T001', liveId: 'LIVE1', farmId: 'F001', productId: 'P007', skuId: 'P007-4P', quantity: 1, amount: 288, status: 'paid', createdAt: '2026-08-24 12:00', ...overrides }
}

describe('commission ledger', () => {
  beforeEach(() => localStorage.clear())

  it('writes and reads ledger entries and reverses idempotently', () => {
    expect(writePlatformCommissionLedgerEntry(ledgerEntry())).toBe(true)
    expect(readPlatformCommissionLedger()?.['L1']).toMatchObject({ beneficiaryId: 'T001', amount: 10 })
    expect(reverseCommissionLedgerEntry('L1', 'O1', 'T001', 10, '2026-08-24 13:00')).toBe(true)
    expect(Object.values(readPlatformCommissionLedger() || {}).filter((item) => item.status === 'reversed')).toHaveLength(1)
    expect(reverseCommissionLedgerEntry('L1', 'O1', 'T001', 10, '2026-08-24 13:00')).toBe(false)
    expect(localStorage.getItem(PLATFORM_COMMISSION_LEDGER_STORAGE_KEY)).toContain('reversed')
  })

  it('migrates legacy records once with a marker', () => {
    localStorage.setItem('agritainment-platform-c-commissions', JSON.stringify([{ id: 'CC1', orderId: 'O1', subOrderId: 'S1', beneficiaryId: 'T001', beneficiaryLevel: 'level2', amount: 5, status: 'pending', createdAt: '2026-08-24 12:00' }]))
    expect(migrateLegacyCommissionsToLedger()).toBe(true)
    expect(readPlatformCommissionLedger()?.['CC1']).toMatchObject({ beneficiaryId: 'T001', amount: 5 })
    expect(localStorage.getItem(PLATFORM_COMMISSION_LEDGER_MIGRATED_STORAGE_KEY)).not.toBeNull()
    expect(migrateLegacyCommissionsToLedger()).toBe(false)
  })
})

describe('supplier settlements', () => {
  beforeEach(() => localStorage.clear())

  it('writes and reads shared supplier settlements', () => {
    expect(writePlatformSupplierSettlement(settlement())).toBe(true)
    expect(readPlatformSupplierSettlements()?.['ST1']).toMatchObject({ status: 'pending', amount: 100 })
    expect(localStorage.getItem(PLATFORM_SUPPLIER_SETTLEMENTS_STORAGE_KEY)).toContain('ST1')
  })
})

describe('voucher orders', () => {
  beforeEach(() => localStorage.clear())

  it('creates vouchers and transitions paid -> redeemed -> refunded', () => {
    expect(writePlatformVoucherOrder(voucher())).toBe(true)
    expect(readPlatformVoucherOrders()?.['V1']?.status).toBe('paid')
    expect(transitionVoucherOrder('V1', 'redeemed', '2026-08-24 14:00')).toBe(true)
    expect(readPlatformVoucherOrders()?.['V1']).toMatchObject({ status: 'redeemed', redeemedAt: '2026-08-24 14:00' })
    expect(transitionVoucherOrder('V1', 'refunded', '2026-08-24 15:00')).toBe(true)
    expect(readPlatformVoucherOrders()?.['V1']?.refundedAt).toBe('2026-08-24 15:00')
    expect(localStorage.getItem(PLATFORM_VOUCHERS_STORAGE_KEY)).toContain('refunded')
  })
})
