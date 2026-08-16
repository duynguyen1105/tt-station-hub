import { describe, expect, it } from 'vitest'

import { type StationAccess } from '@/lib/auth/station-access'
import { planStationAssignment } from '@/lib/auth/station-assignment'

const HUONG = 'a1000000-0000-0000-0000-000000000001'
const TUAN = 'a1000000-0000-0000-0000-000000000002'

// The shapes a trạm can have when Hương's phụ trách is being decided: already
// hers, someone else's, shared by both, nobody's — and one that is not on the
// screen at all.
const HERS: StationAccess = { id: 'st-1', accountantIds: [HUONG] }
const TUANS: StationAccess = { id: 'st-2', accountantIds: [TUAN] }
const SHARED: StationAccess = { id: 'st-3', accountantIds: [HUONG, TUAN] }
const ORPHAN: StationAccess = { id: 'st-4', accountantIds: [] }
const ALL = [HERS, TUANS, SHARED, ORPHAN]

describe('planStationAssignment', () => {
  it('claims a trạm nobody is phụ trách of', () => {
    const plan = planStationAssignment(HUONG, ALL, ['st-1', 'st-3', 'st-4'])
    expect(plan.claimed).toEqual(['st-4'])
    expect(plan.released).toEqual([])
  })

  it('claims a trạm another kế toán is on, and takes nothing from them', () => {
    const plan = planStationAssignment(HUONG, ALL, ['st-1', 'st-2', 'st-3'])
    expect(plan.claimed).toEqual(['st-2'])
    expect(plan.released).toEqual([])
  })

  it('releases only this kế toán from a shared trạm', () => {
    const plan = planStationAssignment(HUONG, ALL, ['st-1'])
    expect(plan.released).toEqual(['st-3'])
    expect(plan.claimed).toEqual([])
  })

  it('leaves a trạm she is already on and still ticks out of both lists', () => {
    const plan = planStationAssignment(HUONG, ALL, ['st-1', 'st-3'])
    expect(plan.claimed).toEqual([])
    expect(plan.released).toEqual([])
  })

  it('releases a trạm she is on and no longer ticks', () => {
    const plan = planStationAssignment(HUONG, ALL, [])
    expect(plan.released).toEqual(['st-1', 'st-3'])
    expect(plan.claimed).toEqual([])
  })

  it('leaves another kế toán’s trạm alone when it is not ticked', () => {
    const plan = planStationAssignment(HUONG, ALL, ['st-1', 'st-3'])
    expect(plan.claimed).not.toContain('st-2')
    expect(plan.released).not.toContain('st-2')
  })

  it('ignores a ticked identifier that is not among the supplied trạm', () => {
    // A closed trạm, or an id invented by a caller: neither is on the screen,
    // so neither is written.
    const plan = planStationAssignment(HUONG, ALL, ['st-1', 'st-3', 'st-nowhere'])
    expect(plan.claimed).toEqual([])
    expect(plan.released).toEqual([])
  })

  it('claims a trạm once however many times it is ticked', () => {
    const plan = planStationAssignment(HUONG, ALL, ['st-4', 'st-4'])
    expect(plan.claimed).toEqual(['st-4'])
  })

  it('gives a new kế toán, who is on nothing yet, only claims', () => {
    const plan = planStationAssignment('new-person', ALL, ['st-2', 'st-4'])
    expect(plan.claimed).toEqual(['st-2', 'st-4'])
    expect(plan.released).toEqual([])
  })

  it('plans nothing when nothing is ticked and nothing is held', () => {
    const plan = planStationAssignment('new-person', ALL, [])
    expect(plan).toEqual({ claimed: [], released: [] })
  })
})
