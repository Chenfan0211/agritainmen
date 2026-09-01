import { describe, expect, it, vi } from 'vitest'
import type { PlatformJournalEntry, PlatformRecoveryTask } from './index'
import { createStrictSnapshotRecoveryHandlerRegistration } from './index'

describe('strict portal snapshot recovery factory', () => {
  const journal = {
    operationId: 'portal-operation',
    collections: ['portal-a', 'portal-b'],
    original: { first: { value: 1 }, second: { value: 2 } },
    target: { first: { value: 3 }, second: { value: 4 } },
    recoveryHandlerKey: 'store-order-v1',
    recoverySchema: 'test-v1',
    completedSteps: [],
    status: 'recovery-pending',
    createdAt: '2026-08-30T10:00:00.000Z',
    updatedAt: '2026-08-30T10:00:00.000Z'
  } as PlatformJournalEntry
  const task = { handlerKey: 'store-order-v1' } as PlatformRecoveryTask

  it('rejects a third-state field without writing any snapshot', () => {
    const writeSnapshot = vi.fn(() => true)
    const registration = createStrictSnapshotRecoveryHandlerRegistration({
      key: 'store-order-v1',
      fields: ['first', 'second'] as const,
      validateJournal: () => true,
      readStable: () => ({ snapshot: { first: { value: 99 }, second: { value: 2 } }, token: 7 }),
      isStillStable: () => true,
      writeSnapshot
    })

    expect(registration.handler.execute(task, journal)).toBe(false)
    expect(writeSnapshot).not.toHaveBeenCalled()
  })
})
