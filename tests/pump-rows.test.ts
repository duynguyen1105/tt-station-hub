import { describe, expect, it } from 'vitest'

import { type ReceiptPumpCheck } from '@/lib/imports/bien-ban'
import { type StationPump, movedLiters, reviewPumpRows, tankTaints } from '@/lib/imports/pump-rows'
import { rosterForStation } from '@/lib/imports/station-rosters'

/** The Trụ the Trạm's own pre-printed biên bản lists. */
function paperRoster(stationCode: string) {
  const found = rosterForStation(stationCode)
  if (!found) throw new Error(`no roster for ${stationCode}`)
  return found.pumps
}

/** One Trụ row as the AI read it off the paper. */
function paperPump(pumpLabel: string | null, electronic: [number, number]): ReceiptPumpCheck {
  return {
    pumpLabel,
    before: { electronic: electronic[0], mechanical: null },
    after: { electronic: electronic[1], mechanical: null },
  }
}

describe('section (d) is the Trạm’s Trụ, not whatever the AI happened to read', () => {
  it('shows all six DAKNONG1 Trụ when the paper yielded four', () => {
    const rows = reviewPumpRows(
      [],
      [
        paperPump('1- DO', [30255694, 30255694]),
        paperPump('2- E0', [18885574, 18885586]),
        paperPump('3- E0', [1000, 1000]),
        paperPump('4- DC', [2000, 2000]),
      ],
      paperRoster('DAKNONG1')
    )
    expect(rows).toHaveLength(6)
    expect(rows.map((r) => r.pumpCode)).toEqual([
      'TRU_1',
      'TRU_2',
      'TRU_3',
      'TRU_4',
      'TRU_5',
      'TRU_6',
    ])
    // The two the AI never read are empty rows, not missing ones.
    expect(rows[4]).toMatchObject({ pumpLabel: 'Trụ 5', checks: null })
    expect(rows[5]).toMatchObject({ pumpLabel: 'Trụ 6', checks: null })
    expect(rows[1]?.checks?.after.electronic).toBe(18885586)
    expect(rows[1]?.pumpLabel).toBe('2- E0')
  })

  it('keeps a Trụ the roster does not know rather than dropping it', () => {
    const rows = reviewPumpRows([], [paperPump('9- DO', [10, 20])], paperRoster('DAKNONG1'))
    expect(rows).toHaveLength(7)
    expect(rows[6]).toMatchObject({ pumpLabel: '9- DO', pumpCode: 'TRU_9', tankCode: null })
  })

  it('keeps a row the ladder could not attribute at all', () => {
    // LAMDONG02 prints two E0 Trụ and no numbers, so a bare `E0` names neither.
    const rows = reviewPumpRows([], [paperPump('E0', [10, 20])], paperRoster('LAMDONG02'))
    expect(rows).toHaveLength(5)
    expect(rows[4]).toMatchObject({ pumpLabel: 'E0', pumpCode: null, tankCode: null })
    expect(rows[4]?.checks?.after.electronic).toBe(20)
  })
})

describe('a configured Trạm — the database is the roster, and it knows the Hầm', () => {
  const stationPumps: StationPump[] = [
    { pumpCode: 'TRU_1', fuelType: 'DO', tankCode: 'HAM_3' },
    { pumpCode: 'TRU_2', fuelType: 'E0', tankCode: 'HAM_1' },
    { pumpCode: 'TRU_3', fuelType: 'E0', tankCode: 'HAM_1' },
    { pumpCode: 'TRU_4', fuelType: 'DC', tankCode: 'HAM_2' },
  ]

  it('binds the paper rows onto the Trạm’s own Trụ, carrying the Hầm each draws from', () => {
    const rows = reviewPumpRows(
      stationPumps,
      [paperPump('2- E0', [18885574, 18885586])],
      paperRoster('DAKNONG1')
    )
    expect(rows).toHaveLength(4)
    expect(rows[1]).toMatchObject({ pumpLabel: '2- E0', pumpCode: 'TRU_2', tankCode: 'HAM_1' })
    expect(rows[0]?.checks).toBeNull()
  })

  it('binds an unnumbered row by its fuel, as the ladder does for a Hầm', () => {
    const rows = reviewPumpRows(
      stationPumps,
      [paperPump('DC', [500, 500])],
      paperRoster('LAMDONG02')
    )
    expect(rows[3]).toMatchObject({ pumpCode: 'TRU_4', tankCode: 'HAM_2' })
  })

  it('never writes back into the extraction it was given', () => {
    const extracted = [paperPump('1- DO', [10, 20])]
    const snapshot = structuredClone(extracted)
    reviewPumpRows(stationPumps, extracted, [])
    expect(extracted).toEqual(snapshot)
  })
})

describe('whether a Trụ moved at all', () => {
  it('answers with the electronic totaliser, the one the app counts sales by', () => {
    expect(movedLiters(12, 0)).toBe(12)
  })

  it('answers with the mechanical one where the paper gave no electronic pair', () => {
    expect(movedLiters(null, 12)).toBe(12)
  })

  it('does not let a still electronic totaliser silence a mechanical one that moved', () => {
    expect(movedLiters(0, 12)).toBe(12)
  })

  it('says nothing where neither totaliser gave a pair to subtract', () => {
    expect(movedLiters(null, null)).toBeNull()
  })

  it('is zero where both agree the Trụ stood still', () => {
    expect(movedLiters(0, 0)).toBe(0)
  })
})

describe('what a moving Trụ means for the Hầm it drew from', () => {
  it('taints nothing when every Trụ stood still', () => {
    const taints = tankTaints([
      { pumpCode: 'TRU_1', tankCode: 'HAM_3', movedLiters: 0 },
      { pumpCode: 'TRU_2', tankCode: 'HAM_1', movedLiters: 0 },
    ])
    expect(taints.size).toBe(0)
  })

  it('names the Trụ and its litres on the Hầm it draws from', () => {
    const taints = tankTaints([
      { pumpCode: 'TRU_1', tankCode: 'HAM_3', movedLiters: 0 },
      { pumpCode: 'TRU_2', tankCode: 'HAM_1', movedLiters: 12 },
    ])
    expect([...taints.keys()]).toEqual(['HAM_1'])
    expect(taints.get('HAM_1')).toEqual([{ pumpCode: 'TRU_2', liters: 12 }])
  })

  it('reports two Trụ on one Hầm together, not as competing warnings', () => {
    const taints = tankTaints([
      { pumpCode: 'TRU_2', tankCode: 'HAM_1', movedLiters: 12 },
      { pumpCode: 'TRU_3', tankCode: 'HAM_1', movedLiters: 5 },
    ])
    expect(taints.get('HAM_1')).toEqual([
      { pumpCode: 'TRU_2', liters: 12 },
      { pumpCode: 'TRU_3', liters: 5 },
    ])
  })

  it('taints nothing for a Trụ whose Hầm the Trạm never configured', () => {
    const taints = tankTaints([{ pumpCode: 'TRU_2', tankCode: null, movedLiters: 12 }])
    expect(taints.size).toBe(0)
  })

  it('taints nothing where the paper gave no totals to compare', () => {
    const taints = tankTaints([{ pumpCode: 'TRU_2', tankCode: 'HAM_1', movedLiters: null }])
    expect(taints.size).toBe(0)
  })

  it('reports a Trụ that ran backwards — a total that fell is not a total that agreed', () => {
    const taints = tankTaints([{ pumpCode: 'TRU_2', tankCode: 'HAM_1', movedLiters: -8 }])
    expect(taints.get('HAM_1')).toEqual([{ pumpCode: 'TRU_2', liters: -8 }])
  })
})
