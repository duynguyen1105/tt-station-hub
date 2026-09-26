import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NextRequest } from 'next/server'

import { DELETE as deleteDocument, PATCH as editDocument } from '@/app/api/documents/[id]/route'
import {
  DELETE as deleteMovement,
  PATCH as editMovement,
} from '@/app/api/inventory/movements/[id]/route'
import { PATCH as editStation } from '@/app/api/stations/[id]/route'

const { state, db, audit, storage } = vi.hoisted(() => {
  const movement = {
    id: '00000000-0000-4000-8000-000000000001',
    stationId: '00000000-0000-4000-8000-000000000002',
    sourceRef: null as string | null,
    createdBy: 'admin',
    fuelType: 'RON95',
    quantity: '10.125',
    movementType: 'import',
    movementDate: new Date('2026-09-25'),
    note: null,
  }
  const document = {
    id: '00000000-0000-4000-8000-000000000003',
    stationId: movement.stationId,
    docType: 'business_license',
    docName: 'Giấy phép',
    docNumber: '1',
    issuedDate: null,
    expiryDate: null,
    issuingAuthority: null,
    notes: null,
    fileUrl: `OLD/documents/00000000-0000-4000-8000-000000000003.pdf`,
    status: 'valid',
  }
  const station = {
    id: movement.stationId,
    code: 'OLD',
    name: 'Cũ',
    branch: null,
    address: null,
    fuelArea: 'FUEL_AREA_1',
  }
  const db = {
    inventoryMovement: {
      findUnique: vi.fn(async () => movement),
      findUniqueOrThrow: vi.fn(async () => movement),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...movement,
        ...data,
      })),
      delete: vi.fn(async () => movement),
    },
    inventoryBalance: {
      upsert: vi.fn<
        (args: {
          where: { stationId_fuelType: { fuelType: string } }
          update: { estimatedStock: { increment: { toString(): string } } }
        }) => Promise<undefined>
      >(async () => undefined),
    },
    stationDocument: {
      findUnique: vi.fn(async () => document),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...document,
        ...data,
      })),
      delete: vi.fn(async () => document),
    },
    station: {
      findUnique: vi.fn(async () => station),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...station,
        ...data,
      })),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
  }
  return {
    state: { role: 'admin', reachable: true },
    movement,
    document,
    station,
    db,
    audit: vi.fn(),
    storage: { deletePhoto: vi.fn(async () => undefined), uploadPhoto: vi.fn() },
  }
})

vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: async () => ({ id: 'admin', role: state.role }),
}))
vi.mock('@/lib/auth/station-guard', () => ({ canReachStation: async () => state.reachable }))
vi.mock('@/lib/auth/audit', () => ({ writeAudit: audit }))
vi.mock('@/lib/fuels/load-catalogue', () => ({ stationFuelRefusal: async () => null }))
vi.mock('@/lib/storage/photo-storage', () => storage)

const context = (id: string) => ({ params: Promise.resolve({ id }) })
const movementId = '00000000-0000-4000-8000-000000000001'
const documentId = '00000000-0000-4000-8000-000000000003'
const stationId = '00000000-0000-4000-8000-000000000002'
const request = (method: string, body?: unknown) =>
  new NextRequest('http://localhost/api/edit', {
    method,
    ...(body
      ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
  })

describe('admin edits of existing records', () => {
  beforeEach(() => {
    state.role = 'admin'
    state.reachable = true
    vi.clearAllMocks()
  })

  it.each(['viewer', 'accountant'])(
    'rejects %s on all new mutation paths; fuel area remains editable by accountant',
    async (role) => {
      state.role = role
      expect(
        (await editMovement(request('PATCH', { quantity: 3 }), context(movementId))).status
      ).toBe(403)
      expect((await deleteMovement(request('DELETE'), context(movementId))).status).toBe(403)
      expect(
        (await editDocument(request('PATCH', { docName: 'Mới' }), context(documentId))).status
      ).toBe(403)
      expect((await deleteDocument(request('DELETE'), context(documentId))).status).toBe(403)
      expect(
        (await editStation(request('PATCH', { code: 'NEW' }), context(stationId))).status
      ).toBe(403)
      if (role === 'accountant')
        expect(
          (await editStation(request('PATCH', { fuelArea: 'FUEL_AREA_2' }), context(stationId)))
            .status
        ).toBe(200)
    }
  )

  it('reconciles the old and new fuel stocks atomically; cannot edit automated movements', async () => {
    const res = await editMovement(
      request('PATCH', { fuelType: 'DO', quantity: -2.375 }),
      context(movementId)
    )
    expect(res.status).toBe(200)
    expect(
      db.inventoryBalance.upsert.mock.calls.map(([arg]) => [
        arg.where.stationId_fuelType.fuelType,
        arg.update.estimatedStock.increment.toString(),
      ])
    ).toEqual([
      ['RON95', '-10.125'],
      ['DO', '-2.375'],
    ])
    vi.mocked(db.inventoryMovement.findUnique).mockResolvedValueOnce({
      id: movementId,
      stationId,
      sourceRef: 'shift-id',
      createdBy: 'admin',
      fuelType: 'RON95',
      quantity: '10.125',
      movementType: 'sale',
      movementDate: new Date(),
      note: null,
    })
    expect((await deleteMovement(request('DELETE'), context(movementId))).status).toBe(400)
    expect(db.inventoryMovement.delete).not.toHaveBeenCalled()
  })

  it('recomputes document expiry and removes only a document-owned scan on delete', async () => {
    expect(
      (
        await editDocument(
          request('PATCH', { expiryDate: '2020-01-01', notes: 'Đã cập nhật' }),
          context(documentId)
        )
      ).status
    ).toBe(200)
    expect(db.stationDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'expired' }) })
    )
    expect((await deleteDocument(request('DELETE'), context(documentId))).status).toBe(200)
    expect(storage.deletePhoto).toHaveBeenCalledWith(`OLD/documents/${documentId}.pdf`)
    storage.deletePhoto.mockClear()
    db.stationDocument.findUnique.mockResolvedValueOnce({
      id: documentId,
      stationId,
      docType: 'business_license',
      docName: 'Giấy phép',
      docNumber: '1',
      issuedDate: null,
      expiryDate: null,
      issuingAuthority: null,
      notes: null,
      fileUrl: `https://example.com/documents/${documentId}.pdf`,
      status: 'valid',
    })
    expect((await deleteDocument(request('DELETE'), context(documentId))).status).toBe(200)
    expect(storage.deletePhoto).not.toHaveBeenCalled()
  })

  it('replaces a scan with a fresh path and deletes the prior owned file', async () => {
    const form = new FormData()
    form.set('scan', new File(['scan'], 'scan.pdf', { type: 'application/pdf' }))
    const res = await editDocument(
      new NextRequest('http://localhost/api/documents/id', { method: 'PATCH', body: form }),
      context(documentId)
    )
    expect(res.status).toBe(200)
    expect(storage.uploadPhoto).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^OLD/documents/${documentId}-.*\\.pdf$`)),
      expect.any(Buffer),
      'application/pdf'
    )
    expect(storage.deletePhoto).toHaveBeenCalledWith(`OLD/documents/${documentId}.pdf`)
  })

  it('normalizes station code, rejects the reserved code and reports a uniqueness conflict', async () => {
    expect(
      (await editStation(request('PATCH', { code: ' new ', name: 'Tên mới' }), context(stationId)))
        .status
    ).toBe(200)
    expect(db.station.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ code: 'NEW' }) })
    )
    expect(
      (await editStation(request('PATCH', { code: 'unknown' }), context(stationId))).status
    ).toBe(400)
    db.station.update.mockRejectedValueOnce(
      Object.assign(new Error('duplicate'), { code: 'P2002' })
    )
    expect(
      (await editStation(request('PATCH', { code: 'DUPLICATE' }), context(stationId))).status
    ).toBe(400)
  })
})
