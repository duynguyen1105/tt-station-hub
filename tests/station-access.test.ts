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

// Three trạm covering the only three shapes the rule can see: held by the
// person asking, held by someone else, and held by nobody.
const OWN: StationAccess = { id: 'st-1', assignedAccountantId: HUONG }
const OTHERS: StationAccess = { id: 'st-2', assignedAccountantId: TUAN }
const ORPHAN: StationAccess = { id: 'st-3', assignedAccountantId: null }
const ALL = [OWN, OTHERS, ORPHAN]

const huong = { id: HUONG, role: 'accountant' as const }
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
    expect(canAccessStation(admin, OTHERS)).toBe(true)
    expect(canAccessStation(admin, ORPHAN)).toBe(true)
  })

  it('lets a người xem into every trạm', () => {
    expect(canAccessStation(viewer, OWN)).toBe(true)
    expect(canAccessStation(viewer, OTHERS)).toBe(true)
    expect(canAccessStation(viewer, ORPHAN)).toBe(true)
  })

  it('lets a kế toán into the trạm they are phụ trách of', () => {
    expect(canAccessStation(huong, OWN)).toBe(true)
  })

  it('refuses a kế toán the trạm another kế toán is phụ trách of', () => {
    expect(canAccessStation(huong, OTHERS)).toBe(false)
  })

  it('refuses a kế toán a trạm with no phụ trách', () => {
    expect(canAccessStation(huong, ORPHAN)).toBe(false)
  })
})

describe('accessibleStationIds', () => {
  it('returns exactly the trạm a kế toán is phụ trách of', () => {
    expect(accessibleStationIds(huong, ALL)).toEqual(['st-1'])
  })

  it('returns nothing for a kế toán who is phụ trách of none', () => {
    expect(accessibleStationIds(huong, [OTHERS, ORPHAN])).toEqual([])
    expect(accessibleStationIds(huong, [])).toEqual([])
  })

  it('returns the whole list unchanged for a quản trị viên and a người xem', () => {
    expect(accessibleStationIds(admin, ALL)).toEqual(['st-1', 'st-2', 'st-3'])
    expect(accessibleStationIds(viewer, ALL)).toEqual(['st-1', 'st-2', 'st-3'])
  })
})

describe('isStationUncovered', () => {
  const active: AccountantAccess[] = [
    { id: HUONG, isActive: true },
    { id: TUAN, isActive: true },
  ]

  it('counts a trạm with no phụ trách as uncovered', () => {
    expect(isStationUncovered(ORPHAN, active)).toBe(true)
  })

  it('counts a trạm whose phụ trách is suspended as uncovered', () => {
    const suspended: AccountantAccess[] = [
      { id: HUONG, isActive: false },
      { id: TUAN, isActive: true },
    ]
    expect(isStationUncovered(OWN, suspended)).toBe(true)
    expect(isStationUncovered(OTHERS, suspended)).toBe(false)
  })

  it('does not count a trạm whose phụ trách is active as uncovered', () => {
    expect(isStationUncovered(OWN, active)).toBe(false)
    expect(isStationUncovered(OTHERS, active)).toBe(false)
  })

  it('counts a trạm held by nobody in the supplied list as uncovered', () => {
    // The column points at a profile that is not among the kế toán handed in —
    // a người who has changed role, or a row that no longer exists.
    expect(isStationUncovered(OWN, [{ id: TUAN, isActive: true }])).toBe(true)
    expect(isStationUncovered(OWN, [])).toBe(true)
  })
})
