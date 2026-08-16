import { describe, expect, it } from 'vitest'

import { type StationAccess } from '@/lib/auth/station-access'
import { planStationAssignment } from '@/lib/auth/station-assignment'

const HUONG = 'a1000000-0000-0000-0000-000000000001'
const TUAN = 'a1000000-0000-0000-0000-000000000002'

// The four shapes a trạm can have when Hương's phụ trách is being decided:
// already hers, someone else's, nobody's — and one that is not on the screen
// at all.
const HERS: StationAccess = { id: 'st-1', assignedAccountantId: HUONG }
const TUANS: StationAccess = { id: 'st-2', assignedAccountantId: TUAN }
const ORPHAN: StationAccess = { id: 'st-3', assignedAccountantId: null }
const ALL = [HERS, TUANS, ORPHAN]

describe('planStationAssignment', () => {
  it('claims a trạm nobody is phụ trách of', () => {
    const plan = planStationAssignment(HUONG, ALL, ['st-1', 'st-3'])
    expect(plan.claimed).toEqual(['st-3'])
    expect(plan.released).toEqual([])
    expect(plan.takenOver).toEqual([])
  })

  it('leaves a trạm she already holds and still holds out of both lists', () => {
    const plan = planStationAssignment(HUONG, ALL, ['st-1'])
    expect(plan.claimed).toEqual([])
    expect(plan.released).toEqual([])
  })

  it('releases a trạm she holds and no longer ticks', () => {
    const plan = planStationAssignment(HUONG, ALL, [])
    expect(plan.released).toEqual(['st-1'])
    expect(plan.claimed).toEqual([])
  })

  it('moves a trạm another kế toán holds, and names who is losing it', () => {
    const plan = planStationAssignment(HUONG, ALL, ['st-1', 'st-2'])
    expect(plan.claimed).toEqual(['st-2'])
    expect(plan.takenOver).toEqual([{ stationId: 'st-2', fromAccountantId: TUAN }])
  })

  it('leaves another kế toán’s trạm alone when it is not ticked', () => {
    const plan = planStationAssignment(HUONG, ALL, ['st-1'])
    expect(plan.claimed).not.toContain('st-2')
    expect(plan.released).not.toContain('st-2')
  })

  it('ignores a ticked identifier that is not among the supplied trạm', () => {
    // A closed trạm, or an id invented by a caller: neither is on the screen,
    // so neither is written.
    const plan = planStationAssignment(HUONG, ALL, ['st-3', 'st-nowhere'])
    expect(plan.claimed).toEqual(['st-3'])
  })

  it('claims a trạm once however many times it is ticked', () => {
    const plan = planStationAssignment(HUONG, ALL, ['st-3', 'st-3'])
    expect(plan.claimed).toEqual(['st-3'])
  })

  it('gives a new kế toán, who holds nothing yet, only claims', () => {
    const plan = planStationAssignment('new-person', ALL, ['st-2', 'st-3'])
    expect(plan.claimed).toEqual(['st-2', 'st-3'])
    expect(plan.released).toEqual([])
    expect(plan.takenOver).toEqual([{ stationId: 'st-2', fromAccountantId: TUAN }])
  })

  it('plans nothing when nothing is ticked and nothing is held', () => {
    const plan = planStationAssignment('new-person', ALL, [])
    expect(plan).toEqual({ claimed: [], released: [], takenOver: [] })
  })
})
