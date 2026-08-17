import { describe, expect, it } from 'vitest'

import {
  type AccountantAccess,
  type StationAccess,
  accessibleStationIds,
  canAccessStation,
  isStationUncovered,
  readsEveryStation,
} from '@/lib/auth/station-access'

const HUONG = 'a1000000-0000-0000-0000-000000000001'
const TUAN = 'a1000000-0000-0000-0000-000000000002'

// The shapes the rule can see now that a trạm holds a set: Hương's alone,
// somebody else's, shared by the two of them, and nobody's.
const OWN: StationAccess = { id: 'st-1', accountantIds: [HUONG] }
const OTHERS: StationAccess = { id: 'st-2', accountantIds: [TUAN] }
const SHARED: StationAccess = { id: 'st-3', accountantIds: [HUONG, TUAN] }
const ORPHAN: StationAccess = { id: 'st-4', accountantIds: [] }
const ALL = [OWN, OTHERS, SHARED, ORPHAN]

const huong = { id: HUONG, role: 'accountant' as const }
const tuan = { id: TUAN, role: 'accountant' as const }
const admin = { id: 'admin-id', role: 'admin' as const }
const viewer = { id: 'viewer-id', role: 'viewer' as const }

describe('readsEveryStation', () => {
  it('says a quản trị viên and a người xem read the whole company', () => {
    expect(readsEveryStation(admin)).toBe(true)
    expect(readsEveryStation(viewer)).toBe(true)
  })

  it('says a kế toán does not, whatever they are phụ trách of', () => {
    expect(readsEveryStation(huong)).toBe(false)
  })
})

describe('canAccessStation', () => {
  it('lets a quản trị viên into every trạm, including one with no phụ trách', () => {
    expect(canAccessStation(admin, OWN)).toBe(true)
    expect(canAccessStation(admin, SHARED)).toBe(true)
    expect(canAccessStation(admin, ORPHAN)).toBe(true)
  })

  it('lets a người xem into every trạm', () => {
    expect(canAccessStation(viewer, OWN)).toBe(true)
    expect(canAccessStation(viewer, SHARED)).toBe(true)
    expect(canAccessStation(viewer, ORPHAN)).toBe(true)
  })

  it('lets a kế toán into the trạm they are phụ trách of', () => {
    expect(canAccessStation(huong, OWN)).toBe(true)
  })

  it('lets both kế toán phụ trách of one trạm into it', () => {
    expect(canAccessStation(huong, SHARED)).toBe(true)
    expect(canAccessStation(tuan, SHARED)).toBe(true)
  })

  it('refuses a kế toán a trạm they are not on, whoever else is', () => {
    expect(canAccessStation(huong, OTHERS)).toBe(false)
  })

  it('refuses a kế toán a trạm with no phụ trách', () => {
    expect(canAccessStation(huong, ORPHAN)).toBe(false)
  })
})

describe('accessibleStationIds', () => {
  it('returns every trạm a kế toán is phụ trách of and nothing else', () => {
    expect(accessibleStationIds(huong, ALL)).toEqual(['st-1', 'st-3'])
    expect(accessibleStationIds(tuan, ALL)).toEqual(['st-2', 'st-3'])
  })

  it('returns nothing for a kế toán who is phụ trách of none', () => {
    expect(accessibleStationIds(huong, [OTHERS, ORPHAN])).toEqual([])
    expect(accessibleStationIds(huong, [])).toEqual([])
  })

  it('returns the whole list unchanged for a quản trị viên and a người xem', () => {
    expect(accessibleStationIds(admin, ALL)).toEqual(['st-1', 'st-2', 'st-3', 'st-4'])
    expect(accessibleStationIds(viewer, ALL)).toEqual(['st-1', 'st-2', 'st-3', 'st-4'])
  })
})

describe('isStationUncovered', () => {
  const active: AccountantAccess[] = [
    { id: HUONG, isActive: true },
    { id: TUAN, isActive: true },
  ]
  const huongSuspended: AccountantAccess[] = [
    { id: HUONG, isActive: false },
    { id: TUAN, isActive: true },
  ]

  it('counts a trạm with no phụ trách as uncovered', () => {
    expect(isStationUncovered(ORPHAN, active)).toBe(true)
  })

  it('counts a trạm whose only kế toán is suspended as uncovered', () => {
    expect(isStationUncovered(OWN, huongSuspended)).toBe(true)
  })

  it('does not count a trạm with one active kế toán beside one suspended as uncovered', () => {
    expect(isStationUncovered(SHARED, huongSuspended)).toBe(false)
  })

  it('counts a trạm all of whose kế toán are suspended as uncovered', () => {
    const bothSuspended: AccountantAccess[] = [
      { id: HUONG, isActive: false },
      { id: TUAN, isActive: false },
    ]
    expect(isStationUncovered(SHARED, bothSuspended)).toBe(true)
  })

  it('does not count a trạm whose kế toán are active as uncovered', () => {
    expect(isStationUncovered(OWN, active)).toBe(false)
    expect(isStationUncovered(SHARED, active)).toBe(false)
  })

  it('counts a trạm held only by people missing from the supplied list as uncovered', () => {
    // The join rows point at a profile that is not among the kế toán handed in —
    // somebody who has changed role, or a row that no longer exists.
    expect(isStationUncovered(OWN, [{ id: TUAN, isActive: true }])).toBe(true)
    expect(isStationUncovered(OWN, [])).toBe(true)
    // …and one live name beside such a ghost still covers the trạm.
    expect(isStationUncovered(SHARED, [{ id: TUAN, isActive: true }])).toBe(false)
  })
})
