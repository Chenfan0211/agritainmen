import { readPlatformWithdrawals, writePlatformWithdrawal } from '@agritainment/shared'

export const demoAdminExportRecords = [
  { id: 'EX-DEMO-001', module: '订单履约', count: 18, createdAt: '2026-09-01 09:30' },
  { id: 'EX-DEMO-002', module: '佣金结算', count: 6, createdAt: '2026-08-28 16:10' },
  { id: 'EX-DEMO-003', module: '供应商对账', count: 4, createdAt: '2026-08-20 11:00' }
]

export function seedAdminDemoDataOnce(): boolean {
  const current = readPlatformWithdrawals() || {}
  if (current['WD-DEMO-T001-001']) return false
  return writePlatformWithdrawal({
    id: 'WD-DEMO-T001-001',
    requesterType: 'promoter',
    requesterId: 'T001',
    amount: 200,
    method: '微信零钱',
    status: 'pending',
    requestKey: 'demo-wd-t001-001',
    createdAt: '2026-09-01T10:00:00.000Z'
  }) && writePlatformWithdrawal({
    id: 'WD-DEMO-T001-002',
    requesterType: 'promoter',
    requesterId: 'T001',
    amount: 80,
    method: '微信零钱',
    status: 'pending',
    requestKey: 'demo-wd-t001-002',
    createdAt: '2026-09-02T10:00:00.000Z'
  })
}
