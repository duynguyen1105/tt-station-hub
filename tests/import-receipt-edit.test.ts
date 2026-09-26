import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NextRequest } from 'next/server'

import { PATCH } from '@/app/api/imports/receipts/[id]/route'

const { state, db, audit, child } = vi.hoisted(() => {
  const receipt = {
    id: '00000000-0000-4000-8000-000000000001',
    stationId: '00000000-0000-4000-8000-000000000002',
    receiptDate: new Date('2026-09-24T00:00:00Z'),
    products: [{ productLabel: 'Dầu', warehouse: 'Kho 1', exportSlipNo: 'PXK 1' }],
    tankChecks: [
      {
        tankLabel: 'Hầm 1',
        tankCode: 'HAM_1',
        fuelType: 'E0',
        importedLiters: 100,
        before: { baremLiters: 100 },
        after: { baremLiters: 200 },
      },
    ],
  }
  const child = {
    id: '00000000-0000-4000-8000-000000000003',
    receiptId: receipt.id,
    stationId: receipt.stationId,
    tankCode: 'HAM_1',
    fuelType: 'E0',
    litersActual: 100,
    importedAt: new Date('2026-09-24T00:00:00Z'),
    canceledAt: null as Date | null,
  }
  const movement = { id: '00000000-0000-4000-8000-000000000004', sourceRef: child.id }
  return {
    child,
    state: { role: 'viewer', reachable: true },
    db: {
      fuelImportReceipt: { findUnique: vi.fn(async () => receipt), update: vi.fn() },
      fuelImport: { findMany: vi.fn(async () => [child]), update: vi.fn() },
      station: { findUnique: vi.fn(async () => ({ code: 'DAKNONG1' })) },
      tank: {
        findMany: vi.fn(async () => [
          { code: 'HAM_1', fuelType: 'E0' },
          { code: 'HAM_3', fuelType: 'DO' },
        ]),
      },
      inventoryMovement: { findMany: vi.fn(async () => [movement]), update: vi.fn() },
      inventoryBalance: { upsert: vi.fn() },
      $queryRaw: vi.fn(),
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
    },
    audit: vi.fn(),
  }
})

vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: async () => ({ id: 'admin-id', role: state.role }),
}))
vi.mock('@/lib/auth/station-guard', () => ({ canReachStation: async () => state.reachable }))
vi.mock('@/lib/fuels/load-catalogue', () => ({ stationFuelRefusal: async () => null }))
vi.mock('@/lib/auth/audit', () => ({ writeAudit: audit }))

const params = { params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000001' }) }
function request() {
  return new NextRequest('http://localhost/api/imports/receipts/1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      importedAt: '2026-09-25T10:00:00+07:00',
      staffName: 'A',
      driverName: 'B',
      truckPlate: 'C',
      vehicleCheck: null,
      sealNo: null,
      note: null,
      invoiceNo: null,
      products: [{ index: 0, warehouse: 'Kho 1', exportSlipNo: 'PXK 2' }],
      lines: [
        {
          id: '00000000-0000-4000-8000-000000000003',
          tankIndex: 0,
          tankCode: 'HAM_3',
          litersActual: 120,
          beforeBaremLiters: 100,
          measuredLiters: 115,
        },
      ],
    }),
  })
}

describe('saved receipt edit', () => {
  beforeEach(() => {
    state.role = 'viewer'
    state.reachable = true
    vi.clearAllMocks()
  })

  it.each(['viewer', 'accountant'])('refuses %s before reading the receipt', async (role) => {
    state.role = role
    expect((await PATCH(request(), params)).status).toBe(403)
    expect(db.fuelImportReceipt.findUnique).not.toHaveBeenCalled()
  })

  it('refuses an admin outside the station and a receipt with a cancelled line', async () => {
    state.role = 'admin'
    state.reachable = false
    expect((await PATCH(request(), params)).status).toBe(403)
    expect(db.$transaction).not.toHaveBeenCalled()
    state.reachable = true
    db.fuelImport.findMany
      .mockResolvedValueOnce([child])
      .mockResolvedValueOnce([{ ...child, canceledAt: new Date() }])
    expect((await PATCH(request(), params)).status).toBe(400)
    expect(db.inventoryMovement.update).not.toHaveBeenCalled()
    expect(db.inventoryBalance.upsert).not.toHaveBeenCalled()
  })

  it('changes the one posted movement and reverses/books stock on the two fuel keys, with audit', async () => {
    state.role = 'admin'
    expect((await PATCH(request(), params)).status).toBe(200)
    expect(db.inventoryMovement.update).toHaveBeenCalledTimes(1)
    expect(db.inventoryMovement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fuelType: 'DO',
          quantity: 120,
          movementDate: new Date('2026-09-25T00:00:00Z'),
        }),
      })
    )
    expect(db.inventoryBalance.upsert).toHaveBeenCalledTimes(2)
    expect(
      db.inventoryBalance.upsert.mock.calls.map(([arg]) => [
        arg.where.stationId_fuelType.fuelType,
        arg.update.estimatedStock.increment,
      ])
    ).toEqual([
      ['E0', -100],
      ['DO', 120],
    ])
    expect(db.fuelImportReceipt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tankChecks: [
            expect.objectContaining({
              tankCode: 'HAM_3',
              importedLiters: 120,
              after: expect.objectContaining({ baremLiters: 215 }),
            }),
          ],
        }),
      })
    )
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ from: expect.any(Object), to: expect.any(Object) }),
      }),
      db
    )
  })
})
