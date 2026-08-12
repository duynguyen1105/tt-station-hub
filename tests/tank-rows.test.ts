import { describe, expect, it } from 'vitest'

import { type ReceiptTankCheck } from '@/lib/imports/bien-ban'
import { rosterForStation } from '@/lib/imports/station-rosters'
import { type StationTank, reviewTankRows } from '@/lib/imports/tank-rows'

/** The paper roster the ladder falls back on when the Trạm is not configured. */
function paperRoster(stationCode: string) {
  const found = rosterForStation(stationCode)
  if (!found) throw new Error(`no roster for ${stationCode}`)
  return found.tanks
}

/** One Hầm row as the AI read it off the paper. */
function paperTank(tankLabel: string, heights: [number, number]): ReceiptTankCheck {
  return {
    tankLabel,
    before: { temperatureC: 28, heightMm: heights[0], bookLiters: 5000, baremLiters: 5010 },
    after: { temperatureC: 29, heightMm: heights[1], bookLiters: 11000, baremLiters: 11010 },
  }
}

describe('a Trạm nobody has configured, so the printed roster answers', () => {
  it('binds all three DAKNONG2 rows and carries the paper roster’s fuel', () => {
    const rows = reviewTankRows(
      [],
      [
        paperTank('1. DO 15K', [1200, 2400]),
        paperTank('2. E0 12K', [800, 1500]),
        paperTank('3. E0 10K', [500, 900]),
      ],
      paperRoster('DAKNONG2')
    )
    expect(rows.map((r) => [r.tankCode, r.fuelType, r.refusal])).toEqual([
      ['HAM_1', 'DO', null],
      ['HAM_2', 'E0', null],
      ['HAM_3', 'E0', null],
    ])
    expect(rows[0]?.checks?.after.heightMm).toBe(2400)
  })

  it('binds LAMDONG02, whose paper prints no Hầm numbers at all', () => {
    const rows = reviewTankRows(
      [],
      [
        paperTank('DC - 9K', [300, 700]),
        paperTank('DO - 9K', [400, 800]),
        paperTank('E0 - 25K', [900, 1800]),
      ],
      paperRoster('LAMDONG02')
    )
    expect(rows.map((r) => r.tankCode)).toEqual(['HAM_1', 'HAM_2', 'HAM_3'])
    expect(rows.every((r) => r.refusal === null)).toBe(true)
  })
})

describe('a configured Trạm — the database is the roster', () => {
  const stationTanks: StationTank[] = [
    { tankCode: 'HAM_1', fuelType: 'E0', capacityK: 15 },
    { tankCode: 'HAM_2', fuelType: 'DC', capacityK: 10 },
    { tankCode: 'HAM_3', fuelType: 'DO', capacityK: 25 },
  ]

  it('binds an old-format sheet onto the Trạm’s own rows', () => {
    const rows = reviewTankRows(stationTanks, [paperTank('HẦM 2 10K', [600, 1400])], [])
    expect(rows.map((r) => r.tankCode)).toEqual(['HAM_1', 'HAM_2', 'HAM_3'])
    expect(rows[1]).toMatchObject({ tankLabel: 'HẦM 2 10K', fuelType: 'DC', refusal: null })
    expect(rows[1]?.checks?.before.heightMm).toBe(600)
    // A Hầm the biên bản said nothing about keeps its row and stays empty.
    expect(rows[0]?.checks).toBeNull()
    expect(rows[0]?.tankLabel).toBe('Hầm 1')
  })

  it('lets the database contradict the printed form', () => {
    // DAKNONG1's paper prints Hầm 2 as DC 10K; a sheet claiming E0 12K for it is
    // contradicted by the Trạm's own configuration, not bound to it.
    const rows = reviewTankRows(stationTanks, [paperTank('2. E0 12K', [600, 1400])], [])
    expect(rows[3]).toMatchObject({ tankCode: null, refusal: 'roster-mismatch' })
  })

  it('appends a Hầm the paper names and the database does not, unbound to no row', () => {
    const rows = reviewTankRows(stationTanks, [paperTank('4. DO 10K', [600, 1400])], [])
    expect(rows).toHaveLength(4)
    expect(rows[3]).toMatchObject({ tankCode: 'HAM_4', refusal: null, fuelType: null })
  })
})

describe('a row that cannot be attributed', () => {
  const htgdongnai = paperRoster('HTGDONGNAI')

  it('keeps HTGDONGNAI’s second `3.` with its measurements and the ladder’s reason', () => {
    const rows = reviewTankRows(
      [],
      [
        paperTank('1. DC 10K', [100, 200]),
        paperTank('2. DO 15K', [300, 400]),
        paperTank('3. E0 15K', [500, 600]),
        paperTank('3. E0 10K', [700, 800]),
      ],
      htgdongnai
    )
    expect(rows.map((r) => r.tankCode)).toEqual(['HAM_1', 'HAM_2', 'HAM_3', null])
    const unbound = rows[3]!
    expect(unbound.refusal).toBe('duplicate-number')
    expect(unbound.tankLabel).toBe('3. E0 10K')
    expect(unbound.checks).toEqual({
      before: { temperatureC: 28, heightMm: 700, bookLiters: 5000, baremLiters: 5010 },
      after: { temperatureC: 29, heightMm: 800, bookLiters: 11000, baremLiters: 11010 },
    })
  })

  it('leaves a row nothing identifies unbound rather than guessing', () => {
    const rows = reviewTankRows([], [paperTank('E0 6K', [100, 200])], paperRoster('NGANHA01'))
    expect(rows[0]).toMatchObject({ tankCode: null, refusal: 'unidentified' })
  })
})

describe('what the AI read stays what the AI read', () => {
  it('never writes back into the extraction it was given', () => {
    const extracted = [paperTank('1. DO 15K', [1200, 2400])]
    const snapshot = structuredClone(extracted)
    reviewTankRows([], extracted, paperRoster('DAKNONG2'))
    expect(extracted).toEqual(snapshot)
  })
})
