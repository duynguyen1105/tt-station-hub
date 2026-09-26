import { describe, expect, it, vi } from 'vitest'

import { Prisma } from '@/lib/generated/prisma/client'
import { LaterShiftCompletedError, propagateApprovedClosing } from '@/lib/shifts/opening-reading'

// Day 1's duyệt'd cuối ca has just become 110 (was 100). Day 2's reading of the same trụ
// was snapshotted with đầu 100. If day 2 keeps 100, re-chốt of day 1 sells the extra
// 10 lít and day 2 sells them again.
const dec = (n: number) => new Prisma.Decimal(n)

function dbWith(later: { shiftStatus: string; reviewStatus: string; opening: number }) {
  const row = {
    id: 'r2',
    reviewStatus: later.reviewStatus,
    openingElectronicReading: dec(later.opening),
    openingMechanicalReading: dec(500),
    electronicReading: dec(130),
    mechanicalReading: dec(520),
    aiElectronicConfidence: 99,
    aiMechanicalConfidence: 99,
    electronicPhotoId: 'p1',
    mechanicalPhotoId: 'p2',
  }
  const update = vi.fn(async () => row)
  const db = {
    shift: { findUniqueOrThrow: async () => ({ shiftDate: new Date('2026-09-25T00:00:00Z') }) },
    dispenser: { update: vi.fn(async () => ({})), findUnique: async () => null },
    shiftReading: { findUniqueOrThrow: async () => row, update },
    // Stands in for Postgres: a later-readings query that filters on review status
    // (the old pending-only carry-forward) does not see a duyệt'd row.
    $queryRaw: async (sql: TemplateStringsArray) => {
      const text = sql.join('')
      if (text.includes('FOR UPDATE')) return [{ status: later.shiftStatus }]
      if (!text.includes('AS reading_id')) return [{ electronic: dec(110), mechanical: dec(500) }]
      if (
        text.includes('r.review_status IN') &&
        !['pending', 'needs_review'].includes(row.reviewStatus)
      )
        return []
      return [{ reading_id: 'r2', shift_id: 's2', shift_date: new Date('2026-09-26T00:00:00Z') }]
    },
  }
  return { db: db as unknown as Prisma.TransactionClient, update }
}

const dispenser = { id: 'd1', hasElectronicMeter: true, hasMechanicalMeter: true }

describe('propagateApprovedClosing', () => {
  it("moves a later duyệt'd đầu to the corrected cuối and keeps its verdict", async () => {
    const { db, update } = dbWith({
      shiftStatus: 'pending_review',
      reviewStatus: 'approved',
      opening: 100,
    })
    await propagateApprovedClosing(dispenser, 's1', db)
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ openingElectronicReading: 110, reviewStatus: 'approved' }),
      })
    )
  })

  it("refuses when the later ca is already chốt'd", async () => {
    const { db, update } = dbWith({
      shiftStatus: 'completed',
      reviewStatus: 'approved',
      opening: 100,
    })
    await expect(propagateApprovedClosing(dispenser, 's1', db)).rejects.toBeInstanceOf(
      LaterShiftCompletedError
    )
    expect(update).not.toHaveBeenCalled()
  })

  it("leaves a chốt'd ca alone when its đầu does not move", async () => {
    const { db, update } = dbWith({
      shiftStatus: 'completed',
      reviewStatus: 'approved',
      opening: 110,
    })
    await propagateApprovedClosing(dispenser, 's1', db)
    expect(update).not.toHaveBeenCalled()
  })
})
