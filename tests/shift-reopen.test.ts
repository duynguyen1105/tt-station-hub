import { beforeEach, describe, expect, it, vi } from 'vitest'

import { POST } from '@/app/api/shifts/[id]/reopen/route'
import { Prisma } from '@/lib/generated/prisma/client'

const { state, db, audit } = vi.hoisted(() => {
  const shift = {
    id: 'shift',
    stationId: 'station',
    shiftDate: new Date('2026-09-25'),
    status: 'completed',
    completedAt: new Date('2026-09-25'),
    reviewedBy: 'admin',
  }
  const state = {
    shift,
    role: 'admin',
    reachable: true,
    stock: null as unknown as Prisma.Decimal,
    rows: [] as { fuelType: string; quantity: Prisma.Decimal }[],
  }
  const db = {
    shift: {
      findUnique: vi.fn(async () => shift),
      findUniqueOrThrow: vi.fn(async () => ({ ...shift })),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { status: string }
          data: { status: string; completedAt: null; reviewedBy: null }
        }) => {
          if (shift.status !== where.status) return { count: 0 }
          Object.assign(shift, data)
          return { count: 1 }
        }
      ),
    },
    inventoryMovement: {
      findMany: vi.fn(async () => state.rows),
      deleteMany: vi.fn(async () => {
        state.rows = []
        return { count: 1 }
      }),
    },
    inventoryBalance: {
      updateMany: vi.fn(
        async ({ data }: { data: { estimatedStock: { increment: Prisma.Decimal } } }) => {
          state.stock = state.stock.plus(data.estimatedStock.increment)
          return { count: 1 }
        }
      ),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
  }
  return { state, db, audit: vi.fn() }
})

vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: async () => ({ id: 'admin', role: state.role }),
}))
vi.mock('@/lib/auth/station-guard', () => ({ canReachStation: async () => state.reachable }))
vi.mock('@/lib/auth/audit', () => ({ writeAudit: audit }))

const context = { params: Promise.resolve({ id: 'shift' }) }
const request = () => new Request('http://localhost/api/shifts/shift/reopen', { method: 'POST' })

describe('reopening a completed ca', () => {
  beforeEach(() => {
    state.role = 'admin'
    state.reachable = true
    state.shift.status = 'completed'
    state.shift.completedAt = new Date('2026-09-25')
    state.shift.reviewedBy = 'admin'
    state.stock = new Prisma.Decimal(940)
    state.rows = [{ fuelType: 'diesel', quantity: new Prisma.Decimal(-60) }]
    vi.clearAllMocks()
  })

  it('reverses the posted sale, clears the posting, and cannot reverse twice', async () => {
    expect((await POST(request(), context)).status).toBe(200)
    expect(state.stock.equals(1000)).toBe(true)
    expect(state.rows).toEqual([])
    expect(state.shift.status).toBe('pending_review')
    expect(state.shift.completedAt).toBeNull()
    expect(state.shift.reviewedBy).toBeNull()
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'shift.reopen' }), db)
    expect((await POST(request(), context)).status).toBe(400)
    expect(state.stock.equals(1000)).toBe(true)
  })

  it('does not reopen a ca for kế toán or an unreachable trạm', async () => {
    state.role = 'accountant'
    expect((await POST(request(), context)).status).toBe(403)
    state.role = 'admin'
    state.reachable = false
    expect((await POST(request(), context)).status).toBe(403)
    expect(state.rows).toHaveLength(1)
  })
})
