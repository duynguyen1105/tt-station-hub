import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  type BaremColumn,
  type BaremSheet,
  type BaremTank,
  baremIntake,
  lookupBaremLiters,
  parseBaremSheet,
} from '@/lib/inventory/barem'

function fixture(name: string): string {
  return readFileSync(new URL(`../test-fixtures/barem/${name}.csv`, import.meta.url), 'utf8')
}

function tank(sheet: BaremSheet, tankCode: string): BaremTank {
  const found = sheet.tanks.find((candidate) => candidate.tankCode === tankCode)
  if (!found) throw new Error(`${sheet.stationHeader} has no ${tankCode}`)
  return found
}

const daknong1 = parseBaremSheet(fixture('DAKNONG1'))
const lamdong01 = parseBaremSheet(fixture('LAMDONG01'))
const daknongvk = parseBaremSheet(fixture('DAKNONGVK'))

describe('parseBaremSheet', () => {
  it('reads DAKNONG1 as three Hầm with their fuel, nominal capacity and height range', () => {
    expect(daknong1.stationHeader).toBe('DAKNONG1')
    expect(
      daknong1.tanks.map((t) => ({
        tankCode: t.tankCode,
        fuel: t.fuel,
        nominalCapacityLiters: t.nominalCapacityLiters,
        minHeightMm: t.minHeightMm,
        maxHeightMm: t.maxHeightMm,
      }))
    ).toEqual([
      {
        tankCode: 'HAM_1',
        fuel: 'E0',
        nominalCapacityLiters: 15000,
        minHeightMm: 10,
        maxHeightMm: 2460,
      },
      {
        tankCode: 'HAM_2',
        fuel: 'DC',
        nominalCapacityLiters: 10000,
        minHeightMm: 10,
        maxHeightMm: 2460,
      },
      {
        tankCode: 'HAM_3',
        fuel: 'DO',
        nominalCapacityLiters: 25000,
        minHeightMm: 10,
        maxHeightMm: 2460,
      },
    ])
  })

  it('keeps the full-height volume the sheet gives, above the nominal capacity', () => {
    // DO 25,000 holds 25,507 L at 2460 mm — capacity is provenance, not a ceiling.
    expect(tank(daknong1, 'HAM_3').points.get(2460)).toBe(25507)
  })

  it('gives each Hầm its own maximum height', () => {
    // LAMDONG01 Hầm 1–2 are shorter tanks, not columns with missing data.
    expect(lamdong01.tanks.map((t) => t.maxHeightMm)).toEqual([1900, 1900, 2300, 2300])
    expect(tank(lamdong01, 'HAM_1').points.get(1900)).toBe(12759)
    expect(tank(lamdong01, 'HAM_3').points.get(2300)).toBe(25344)
  })

  it('reports the height LAMDONG01 skipped in Hầm 3 (50 → 52)', () => {
    const ham3 = tank(lamdong01, 'HAM_3')
    expect(ham3.defects).toContainEqual({
      kind: 'skipped-heights',
      afterHeightMm: 50,
      nextHeightMm: 52,
    })
    expect(ham3.points.has(51)).toBe(false)
    expect(ham3.points.get(50)).toBe(137)
    expect(ham3.points.get(52)).toBe(146)
  })

  it("reports DAKNONGVK Hầm 3's gap and stops its Barem where the litres stop", () => {
    const ham3 = tank(daknongvk, 'HAM_3')
    expect(ham3.maxHeightMm).toBe(2070)
    expect(tank(daknongvk, 'HAM_1').maxHeightMm).toBe(2380)
    expect(tank(daknongvk, 'HAM_4').maxHeightMm).toBe(2380)
    expect(ham3.defects).toContainEqual({
      kind: 'missing-points',
      fromHeightMm: 2071,
      toHeightMm: 2380,
      count: 310,
    })
    // The gap runs to the end of the column, so those heights are above this
    // tank's Barem — reported as a defect, answered as out of range.
    expect(lookupBaremLiters(ham3, 2200)).toEqual({ ok: false, reason: 'above-maximum' })
  })

  it('reports the 1282 mm drop in DAKNONG1 Hầm 3 — the defect that costs money', () => {
    expect(tank(daknong1, 'HAM_3').defects).toContainEqual({
      kind: 'litres-fell',
      heightMm: 1282,
      liters: 13413,
      previousHeightMm: 1281,
      previousLiters: 13532,
    })
  })

  it('reports a repeated height and keeps the first litres', () => {
    // No supplied sheet repeats a height; the rule is asserted on a sheet shaped
    // like the real ones so the defect has a defined answer if one ever does.
    const sheet = parseBaremSheet(
      [
        'TRAM X,',
        'HẦM 1,',
        'E0,"  6,000 "',
        'Chiều cao (mm),Thể tích (lít)',
        '10,100',
        '11,110',
        '11,999',
      ].join('\r\n')
    )
    const ham1 = tank(sheet, 'HAM_1')
    expect(ham1.points.get(11)).toBe(110)
    expect(ham1.defects).toContainEqual({
      kind: 'duplicate-height',
      heightMm: 11,
      liters: 999,
      keptLiters: 110,
    })
  })

  it('parses a defective sheet successfully, points as written (ADR 0003)', () => {
    const ham3 = tank(daknong1, 'HAM_3')
    expect(ham3.points.get(1281)).toBe(13532)
    expect(ham3.points.get(1282)).toBe(13413)
  })
})

describe('lookupBaremLiters', () => {
  const ham3 = tank(daknong1, 'HAM_3')

  it('returns the litres at an exact millimetre', () => {
    expect(lookupBaremLiters(ham3, 10)).toEqual({ ok: true, liters: 12 })
    expect(lookupBaremLiters(ham3, 1500)).toEqual({ ok: true, liters: 16290 })
    expect(lookupBaremLiters(ham3, 2460)).toEqual({ ok: true, liters: 25507 })
  })

  it('rounds a fractional height to the nearest millimetre', () => {
    expect(lookupBaremLiters(ham3, 1281.4)).toEqual({ ok: true, liters: 13532 })
    expect(lookupBaremLiters(ham3, 1281.6)).toEqual({ ok: true, liters: 13413 })
  })

  it('refuses a height below the tank minimum', () => {
    expect(lookupBaremLiters(ham3, 9)).toEqual({ ok: false, reason: 'below-minimum' })
  })

  it("refuses a height above that tank's own maximum", () => {
    // 2000 mm is inside Hầm 3 of LAMDONG01 and above the top of Hầm 1.
    expect(lookupBaremLiters(tank(lamdong01, 'HAM_1'), 2000)).toEqual({
      ok: false,
      reason: 'above-maximum',
    })
    expect(lookupBaremLiters(tank(lamdong01, 'HAM_3'), 2000)).toEqual({ ok: true, liters: 23399 })
  })

  it('refuses a missing point inside the range', () => {
    // Shaped like NGANHA01 Hầm 2, whose litres are missing from 2441 to 2470.
    const withInteriorGap: BaremColumn = {
      minHeightMm: 10,
      maxHeightMm: 30,
      points: new Map([
        [10, 100],
        [11, 110],
        [30, 300],
      ]),
    }
    expect(lookupBaremLiters(withInteriorGap, 20)).toEqual({ ok: false, reason: 'missing-point' })
  })

  it('refuses a Hầm the sheet does not have', () => {
    expect(
      lookupBaremLiters(
        daknong1.tanks.find((t) => t.tankCode === 'HAM_9'),
        1000
      )
    ).toEqual({ ok: false, reason: 'unknown-tank' })
  })
})

describe('baremIntake', () => {
  const ham3 = tank(daknong1, 'HAM_3')

  function at(heightMm: number) {
    return lookupBaremLiters(ham3, heightMm)
  }

  it('fills the difference when the level rose', () => {
    // 9,735 L at 1000 mm, 16,290 L at 1500 mm.
    expect(baremIntake(at(1000), at(1500))).toEqual({ fill: true, liters: 6555 })
  })

  it('does not fill when the tank took nothing', () => {
    expect(baremIntake(at(1000), at(1000))).toEqual({ fill: false, reason: 'no-change' })
  })

  it('reports a tank that fell instead of filling', () => {
    expect(baremIntake(at(1500), at(1000))).toEqual({
      fill: false,
      reason: 'tank-fell',
      deltaLiters: -6555,
    })
  })

  it('passes a refusal on either side through to the caller', () => {
    expect(baremIntake(at(9), at(1500))).toEqual({
      fill: false,
      reason: 'below-minimum',
      side: 'before',
    })
    expect(baremIntake(at(1000), at(2500))).toEqual({
      fill: false,
      reason: 'above-maximum',
      side: 'after',
    })
  })
})
