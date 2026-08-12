import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { STATION_ROSTERS, rosterForStation } from '@/lib/imports/station-rosters'

function tankTuples(stationCode: string) {
  return rosterForStation(stationCode)?.tanks.map((t) => [t.tankCode, t.fuel, t.capacityK])
}

function pumpTuples(stationCode: string) {
  return rosterForStation(stationCode)?.pumps.map((p) => [p.pumpCode, p.fuel])
}

describe('STATION_ROSTERS', () => {
  it('holds all 13 printed forms, keyed by the code on the form', () => {
    expect(STATION_ROSTERS.map((r) => r.stationCode)).toEqual([
      'CXGNH',
      'DAKNONG1',
      'DAKNONG2',
      'DAKNONG3',
      'DAKNONGVK',
      'DAKNONG5',
      'HTGDONGNAI',
      'LAMDONG01',
      'LAMDONG02',
      'NGANHA01',
      'NGUYENVUONG',
      'PHUCTIEN',
      'TANHOA',
    ])
  })

  it('reads no database — it is checked-in reference data', () => {
    const source = readFileSync(
      new URL('../lib/imports/station-rosters.ts', import.meta.url),
      'utf8'
    )
    // Nothing to run means nothing to query. Type-only imports are erased and
    // carry no such risk, so they stay allowed.
    expect(source).not.toMatch(/^import (?!type )/m)
  })

  it('registers the DAKNONG4 document under DAKNONGVK, the code it prints', () => {
    expect(rosterForStation('DAKNONGVK')?.sourceFile).toBe('BBGIAONHANXD_DAKNONG4.docx')
    expect(rosterForStation('DAKNONG4')).toBeUndefined()
  })

  it("matches DAKNONG1's configuration — the one roster we can verify today", () => {
    expect(tankTuples('DAKNONG1')).toEqual([
      ['HAM_1', 'E0', 15],
      ['HAM_2', 'DC', 10],
      ['HAM_3', 'DO', 25],
    ])
    expect(pumpTuples('DAKNONG1')).toEqual([
      ['TRU_1', 'DO'],
      ['TRU_2', 'E0'],
      ['TRU_3', 'E0'],
      ['TRU_4', 'DC'],
      ['TRU_5', 'DC'],
      ['TRU_6', 'DO'],
    ])
    const roster = rosterForStation('DAKNONG1')
    expect(roster?.tanks.some((t) => t.inferred)).toBe(false)
    expect(roster?.pumps.some((p) => p.inferred)).toBe(false)
  })

  it('infers LAMDONG02 hầm and trụ numbers from printed row order, and says so', () => {
    expect(tankTuples('LAMDONG02')).toEqual([
      ['HAM_1', 'DC', 9],
      ['HAM_2', 'DO', 9],
      ['HAM_3', 'E0', 25],
    ])
    expect(pumpTuples('LAMDONG02')).toEqual([
      ['TRU_1', 'DC'],
      ['TRU_2', 'DO'],
      ['TRU_3', 'E0'],
      ['TRU_4', 'E0'],
    ])
    const roster = rosterForStation('LAMDONG02')
    expect(roster?.tanks.every((t) => t.inferred)).toBe(true)
    expect(roster?.pumps.every((p) => p.inferred)).toBe(true)
  })

  it('infers only LAMDONG01 trụ numbers — its hầm are printed with theirs', () => {
    expect(tankTuples('LAMDONG01')).toEqual([
      ['HAM_1', 'E0', 12],
      ['HAM_2', 'E0', 12],
      ['HAM_3', 'DO', 25],
      ['HAM_4', 'DO', 25],
      ['HAM_5', 'DC', 12],
    ])
    expect(pumpTuples('LAMDONG01')).toEqual([
      ['TRU_1', 'E0'],
      ['TRU_2', 'E0'],
      ['TRU_3', 'DO'],
      ['TRU_4', 'DO'],
      ['TRU_5', 'E0'],
      ['TRU_6', 'DC'],
    ])
    const roster = rosterForStation('LAMDONG01')
    expect(roster?.tanks.some((t) => t.inferred)).toBe(false)
    expect(roster?.pumps.every((p) => p.inferred)).toBe(true)
  })

  it("keeps both of HTGDONGNAI's two hầm numbered 3, as printed (ADR 0003)", () => {
    expect(tankTuples('HTGDONGNAI')).toEqual([
      ['HAM_1', 'DC', 10],
      ['HAM_2', 'DO', 15],
      ['HAM_3', 'E0', 15],
      ['HAM_3', 'E0', 10],
    ])
    expect(rosterForStation('HTGDONGNAI')?.tanks.map((t) => t.printedLabel)).toEqual([
      '1. DC 10K',
      '2. DO 15K',
      '3. E0 15K',
      '3. E0 10K',
    ])
  })

  it('records every row with the label the form prints', () => {
    for (const roster of STATION_ROSTERS) {
      for (const row of [...roster.tanks, ...roster.pumps]) {
        expect(row.printedLabel.trim()).not.toBe('')
      }
    }
  })
})
