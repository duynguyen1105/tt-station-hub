import { describe, expect, it, vi } from 'vitest'

import { NextRequest } from 'next/server'

// Người xem is read-only: every write the UI hides from them must also be refused by
// the route, or a direct request would still change data.
vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: async () => ({
    id: '00000000-0000-0000-0000-000000000001',
    email: 'viewer@truongthinh.local',
    fullName: 'Người xem',
    role: 'viewer',
  }),
}))

const visitParams = { params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000002' }) }
function post(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api', { method: 'POST', body: JSON.stringify(body) })
}

describe('người xem cannot write', () => {
  it.each([
    ['duyệt lượt xe công nợ', () => import('@/app/api/debts/visits/[id]/approve/route')],
    ['sửa số lượt xe công nợ', () => import('@/app/api/debts/visits/[id]/correct/route')],
    ['từ chối lượt xe công nợ', () => import('@/app/api/debts/visits/[id]/reject/route')],
  ])('%s', async (_, load) => {
    const { POST } = await load()
    expect((await POST(post({}), visitParams)).status).toBe(403)
  })

  it.each([
    ['ghi biến động tồn kho', () => import('@/app/api/inventory/movements/route')],
    ['thêm giấy tờ pháp lý', () => import('@/app/api/documents/route')],
  ])('%s', async (_, load) => {
    const { POST } = await load()
    expect((await POST(post({}))).status).toBe(403)
  })
})
