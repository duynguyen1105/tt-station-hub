import { describe, expect, it } from 'vitest'

import {
  type RosterStationOutcome,
  compareRosterToStation,
  formatRosterReport,
  rosterDefects,
} from '@/lib/imports/roster-check'
import { type StationRoster, rosterForStation } from '@/lib/imports/station-rosters'

const daknong1 = roster('DAKNONG1')
const htgdongnai = roster('HTGDONGNAI')
const lamdong01 = roster('LAMDONG01')
const lamdong02 = roster('LAMDONG02')
const daknongvk = roster('DAKNONGVK')

function roster(stationCode: string): StationRoster {
  const found = rosterForStation(stationCode)
  if (!found) throw new Error(`no roster for ${stationCode}`)
  return found
}

function dispenser(
  code: string,
  fuelType: string,
  tankCode: string | null,
  tankCapacityK: number | null
) {
  return { code, fuelType, tankCode, tankCapacityK }
}

/** DAKNONG1's fuel trụ exactly as the database holds them today. */
const DAKNONG1_DISPENSERS = [
  dispenser('TRU_1', 'DO', 'HAM_3', 25),
  dispenser('TRU_2', 'E0', 'HAM_1', 15),
  dispenser('TRU_3', 'E0', 'HAM_1', 15),
  dispenser('TRU_4', 'DC', 'HAM_2', 10),
  dispenser('TRU_5', 'DC', 'HAM_2', 10),
  dispenser('TRU_6', 'DO', 'HAM_3', 25),
]

/** …and the two urê dispensers it also has, which no biên bản prints. */
const DAKNONG1_URE_DISPENSERS = [
  dispenser('URE_1', 'URE', null, null),
  dispenser('URE_2', 'URE', null, null),
]

const LAMDONG02_DISPENSERS = [
  dispenser('TRU_1', 'DC', 'HAM_1', 9),
  dispenser('TRU_2', 'DO', 'HAM_2', 9),
  dispenser('TRU_3', 'E0', 'HAM_3', 25),
  dispenser('TRU_4', 'E0', 'HAM_3', 25),
]

describe('rosterDefects', () => {
  it('finds nothing wrong with a form that numbers every row once', () => {
    expect(rosterDefects(daknong1)).toEqual([])
  })

  it('names the number HTGDONGNAI printed on two different hầm', () => {
    expect(rosterDefects(htgdongnai)).toEqual([
      {
        kind: 'duplicate-tank-number',
        tankCode: 'HAM_3',
        printedLabels: ['3. E0 15K', '3. E0 10K'],
      },
    ])
  })

  it('reports inferred hầm and trụ numbering separately', () => {
    expect(rosterDefects(lamdong02)).toEqual([
      { kind: 'inferred-tank-numbers', count: 3 },
      { kind: 'inferred-pump-numbers', count: 4 },
    ])
    expect(rosterDefects(lamdong01)).toEqual([{ kind: 'inferred-pump-numbers', count: 6 }])
  })

  it('reports the file named for one Trạm that prints another code', () => {
    expect(rosterDefects(daknongvk)).toEqual([
      { kind: 'file-name-mismatch', fileCode: 'DAKNONG4', stationCode: 'DAKNONGVK' },
    ])
  })
})

describe('compareRosterToStation', () => {
  it('says nothing when the paper and the database agree', () => {
    expect(compareRosterToStation(daknong1, DAKNONG1_DISPENSERS, [])).toEqual([])
  })

  it('shows both sides of a fuel disagreement, repairing neither', () => {
    const mismatches = compareRosterToStation(
      daknong1,
      DAKNONG1_DISPENSERS.map((d) => (d.tankCode === 'HAM_2' ? { ...d, fuelType: 'DO' } : d)),
      []
    )
    expect(mismatches).toContainEqual({
      kind: 'tank-fuel',
      tankCode: 'HAM_2',
      paperFuel: 'DC',
      dbFuels: ['DO'],
    })
    expect(mismatches).toContainEqual({
      kind: 'pump-fuel',
      pumpCode: 'TRU_4',
      paperFuel: 'DC',
      dbFuel: 'DO',
    })
  })

  it('accepts a Hầm whose trụ disagree among themselves if the paper matches one', () => {
    // Several trụ draw from one Hầm; the paper only has to agree with one of them.
    expect(
      compareRosterToStation(
        daknong1,
        DAKNONG1_DISPENSERS.map((d) => (d.code === 'TRU_4' ? { ...d, fuelType: 'DO' } : d)),
        []
      )
    ).toEqual([{ kind: 'pump-fuel', pumpCode: 'TRU_4', paperFuel: 'DC', dbFuel: 'DO' }])
  })

  it('shows both sides of a capacity disagreement', () => {
    expect(
      compareRosterToStation(
        daknong1,
        DAKNONG1_DISPENSERS.map((d) => (d.tankCode === 'HAM_3' ? { ...d, tankCapacityK: 20 } : d)),
        []
      )
    ).toEqual([
      { kind: 'tank-capacity', tankCode: 'HAM_3', paperCapacityK: 25, dbCapacitiesK: [20] },
    ])
  })

  it('names a hầm the paper has and the database does not, and the reverse', () => {
    expect(
      compareRosterToStation(
        daknong1,
        DAKNONG1_DISPENSERS.filter((d) => d.tankCode !== 'HAM_2').concat(
          dispenser('TRU_4', 'DC', 'HAM_9', 10),
          dispenser('TRU_5', 'DC', 'HAM_9', 10)
        ),
        []
      )
    ).toEqual([
      { kind: 'tank-missing-from-db', tankCode: 'HAM_2' },
      { kind: 'tank-missing-from-paper', tankCode: 'HAM_9', dbFuels: ['DC'], dipOnly: false },
    ])
  })

  it('counts a hầm seen only through dip records as one the database knows', () => {
    expect(
      compareRosterToStation(
        daknong1,
        DAKNONG1_DISPENSERS.map((d) =>
          d.tankCode === 'HAM_2' ? { ...d, tankCode: null, tankCapacityK: null } : d
        ),
        [{ tankCode: 'HAM_2', fuelType: 'DC', capacityK: 10 }]
      )
    ).toEqual([])
  })

  it('reports a dip-only hầm the paper never mentions as dip-only', () => {
    expect(
      compareRosterToStation(daknong1, DAKNONG1_DISPENSERS, [
        { tankCode: 'HAM_7', fuelType: 'DO', capacityK: 5 },
      ])
    ).toEqual([
      { kind: 'tank-missing-from-paper', tankCode: 'HAM_7', dbFuels: ['DO'], dipOnly: true },
    ])
  })

  it('ignores dispensers of a fuel the biên bản never prints', () => {
    // DAKNONG1 sells urê from two dispensers. The form's goods columns are
    // E0/EA/DO/DC, so urê is outside what it describes — not missing from it.
    expect(
      compareRosterToStation(daknong1, [...DAKNONG1_DISPENSERS, ...DAKNONG1_URE_DISPENSERS], [])
    ).toEqual([])
  })

  it('names a trụ the paper has and the database does not, and the reverse', () => {
    expect(
      compareRosterToStation(
        daknong1,
        DAKNONG1_DISPENSERS.filter((d) => d.code !== 'TRU_6').concat(
          dispenser('TRU_7', 'DO', 'HAM_3', 25)
        ),
        []
      )
    ).toEqual([
      { kind: 'pump-missing-from-db', pumpCode: 'TRU_6', paperFuel: 'DO' },
      { kind: 'pump-missing-from-paper', pumpCode: 'TRU_7', dbFuel: 'DO' },
    ])
  })

  it("compares HTGDONGNAI's duplicated number once, not twice", () => {
    const mismatches = compareRosterToStation(htgdongnai, [], [])
    expect(mismatches.filter((m) => m.kind === 'tank-missing-from-db')).toEqual([
      { kind: 'tank-missing-from-db', tankCode: 'HAM_1' },
      { kind: 'tank-missing-from-db', tankCode: 'HAM_2' },
      { kind: 'tank-missing-from-db', tankCode: 'HAM_3' },
    ])
  })
})

describe('formatRosterReport', () => {
  const checkedAt = new Date('2026-08-12T03:00:00Z')

  function report(outcomes: RosterStationOutcome[]): string {
    return formatRosterReport(outcomes, checkedAt)
  }

  function outcome(
    stationRoster: StationRoster,
    dispensers: typeof DAKNONG1_DISPENSERS | null
  ): RosterStationOutcome {
    const defects = rosterDefects(stationRoster)
    return dispensers
      ? {
          configured: true,
          stationCode: stationRoster.stationCode,
          roster: stationRoster,
          defects,
          mismatches: compareRosterToStation(stationRoster, dispensers, []),
        }
      : {
          configured: false,
          stationCode: stationRoster.stationCode,
          roster: stationRoster,
          defects,
        }
  }

  it('reports a matching Trạm as matching', () => {
    const text = report([outcome(daknong1, DAKNONG1_DISPENSERS)])
    expect(text).toContain('DAKNONG1')
    expect(text).toContain('✓ 3 hầm, 6 trụ — khớp')
  })

  it('still says the two sides match when the paper has a defect of its own', () => {
    // LAMDONG02's numbers are inferred, but the reader still needs to know
    // whether the roster itself agrees with the database.
    const text = report([outcome(lamdong02, LAMDONG02_DISPENSERS)])
    expect(text).toContain('giấy không đánh số hầm')
    expect(text).toContain('✓ 3 hầm, 4 trụ — khớp')
  })

  it('counts the hầm it could compare, not the rows the paper printed', () => {
    // HTGDONGNAI prints four rows under three numbers; the fourth went unchecked.
    const text = report([
      outcome(htgdongnai, [
        dispenser('TRU_1', 'DO', 'HAM_2', 15),
        dispenser('TRU_2', 'E0', 'HAM_3', 15),
        dispenser('TRU_3', 'E0', 'HAM_3', 15),
        dispenser('TRU_4', 'DC', 'HAM_1', 10),
      ]),
    ])
    expect(text).toContain('chỉ đối chiếu được một dòng với DB')
    expect(text).toContain('✓ 3 hầm, 4 trụ — khớp')
  })

  it('names a Trạm with no configuration in the database', () => {
    expect(report([outcome(roster('CXGNH'), null)])).toContain('chưa cấu hình trạm trong DB')
  })

  it('names each paper defect in Vietnamese', () => {
    const text = report([
      outcome(htgdongnai, null),
      outcome(lamdong02, null),
      outcome(daknongvk, null),
    ])
    expect(text).toContain('giấy đánh số trùng')
    expect(text).toContain('"3."')
    expect(text).toContain('giấy không đánh số hầm')
    expect(text).toContain('giấy không đánh số trụ')
    expect(text).toContain('suy ra theo thứ tự dòng')
    expect(text).toContain('tên file là DAKNONG4, mã trên giấy là DAKNONGVK')
  })

  it('shows both sides when the database disagrees with the paper', () => {
    const text = report([
      outcome(
        daknong1,
        DAKNONG1_DISPENSERS.map((d) => (d.tankCode === 'HAM_2' ? { ...d, fuelType: 'DO' } : d))
      ),
    ])
    expect(text).toContain('Hầm 2: nhiên liệu — giấy ghi DC, DB ghi DO')
    expect(text).not.toContain('✓')
  })

  it('says it wrote nothing', () => {
    expect(report([outcome(daknong1, null)])).toContain('Không ghi gì vào cơ sở dữ liệu')
  })
})
