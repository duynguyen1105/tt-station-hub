import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { type BaremSheet, parseBaremSheet } from '@/lib/inventory/barem'
import {
  type BaremStationOutcome,
  compareBaremToDispensers,
  formatBaremReport,
} from '@/lib/inventory/barem-report'

function fixture(name: string): string {
  return readFileSync(new URL(`../test-fixtures/barem/${name}.csv`, import.meta.url), 'utf8')
}

const daknong1 = parseBaremSheet(fixture('DAKNONG1'))
const daknongvk = parseBaremSheet(fixture('DAKNONGVK'))

function sheetTank(tankCode: string, fuel: string, nominalCapacityLiters: number | null) {
  return { tankCode, fuel, nominalCapacityLiters }
}

function dispenser(tankCode: string | null, fuelType: string, tankCapacityK: number | null) {
  return { tankCode, fuelType, tankCapacityK }
}

describe('compareBaremToDispensers', () => {
  it('says nothing when the sheet and the dispensers agree', () => {
    expect(
      compareBaremToDispensers(
        [sheetTank('HAM_1', 'DO', 25000)],
        [dispenser('HAM_1', 'DO', 25), dispenser('HAM_1', 'DO', 25)]
      )
    ).toEqual([])
  })

  it('names both sides of a fuel disagreement', () => {
    expect(
      compareBaremToDispensers([sheetTank('HAM_2', 'DC', 10000)], [dispenser('HAM_2', 'DO', 10)])
    ).toEqual([{ kind: 'fuel', tankCode: 'HAM_2', sheetFuel: 'DC', dispenserFuels: ['DO'] }])
  })

  it('compares capacity in litres, since dispensers record it in thousands', () => {
    expect(
      compareBaremToDispensers([sheetTank('HAM_2', 'DC', 5500)], [dispenser('HAM_2', 'DC', 5)])
    ).toEqual([
      {
        kind: 'capacity',
        tankCode: 'HAM_2',
        sheetCapacityLiters: 5500,
        dispenserCapacitiesLiters: [5000],
      },
    ])
  })

  it('is silent on capacity when no dispenser records one', () => {
    expect(
      compareBaremToDispensers([sheetTank('HAM_1', 'DO', 25000)], [dispenser('HAM_1', 'DO', null)])
    ).toEqual([])
  })

  it('reports a Hầm the Barem has and the dispensers do not', () => {
    expect(compareBaremToDispensers([sheetTank('HAM_4', 'E0', 6000)], [])).toEqual([
      { kind: 'tank-missing-from-dispensers', tankCode: 'HAM_4' },
    ])
  })

  it('reports a Hầm the dispensers have and the Barem does not', () => {
    expect(compareBaremToDispensers([], [dispenser('HAM_5', 'DO', 10)])).toEqual([
      { kind: 'tank-missing-from-sheet', tankCode: 'HAM_5', dispenserFuels: ['DO'] },
    ])
  })

  it('ignores dispensers that name no tank', () => {
    expect(compareBaremToDispensers([], [dispenser(null, 'DO', 25)])).toEqual([])
  })
})

const checkedAt = new Date('2026-08-11T15:00:00.000Z')

function checked(
  stationCode: string,
  stationName: string,
  tab: string,
  sheet: BaremSheet,
  mismatches: ReturnType<typeof compareBaremToDispensers> = []
): BaremStationOutcome {
  return { ok: true, stationCode, stationName, tab, sheet, mismatches }
}

describe('formatBaremReport', () => {
  const report = formatBaremReport(
    [
      checked('DAKNONG1', 'Trạm Đăk Nông 1', 'daknong1', daknong1, [
        { kind: 'fuel', tankCode: 'HAM_2', sheetFuel: 'DC', dispenserFuels: ['DO'] },
      ]),
      checked('DAKNONGVK', 'Đăk Nông VK', 'daknongvk', daknongvk),
      {
        ok: false,
        stationCode: 'PHUCTIEN',
        stationName: 'Phúc Tiến',
        tab: 'phuctien',
        error: 'HTTP 404',
      },
    ],
    checkedAt
  )

  it('names the Trạm and the Hầm, not row indices', () => {
    expect(report).toContain('Trạm Đăk Nông 1 (DAKNONG1)')
    expect(report).toContain('Hầm 3 — DO')
    expect(report).not.toMatch(/dòng thứ|row \d+/i)
  })

  it('names the 1282 mm cliff with the heights and the litres on both sides', () => {
    expect(report).toContain('1,281 mm = 13,532 L → 1,282 mm = 13,413 L')
  })

  it('names DAKNONGVK Hầm 3’s interior gap as a height range', () => {
    expect(report).toContain('2,071–2,380 mm')
    expect(report).toContain('310')
  })

  it('lists the disagreement with the dispensers table without correcting either side', () => {
    expect(report).toContain('barem ghi DC, dispensers ghi DO')
  })

  it('names a sheet it could not read and leaves it out of the count', () => {
    expect(report).toContain('Phúc Tiến (PHUCTIEN)')
    expect(report).toContain('KHÔNG ĐỌC ĐƯỢC — HTTP 404')
    expect(report).toContain('Trang tính đọc được: 2/3')
  })

  it('ends with a summary of sheets, Hầm, points and defects', () => {
    const tanks = daknong1.tanks.length + daknongvk.tanks.length
    const points = [...daknong1.tanks, ...daknongvk.tanks].reduce((n, t) => n + t.points.size, 0)
    const defects = [...daknong1.tanks, ...daknongvk.tanks].reduce(
      (n, t) => n + t.defects.length,
      0
    )
    expect(report).toContain(`Hầm đọc được: ${tanks}`)
    expect(report).toContain(`Điểm chiều cao → lít: ${points.toLocaleString('en-US')}`)
    expect(report).toContain(`Lỗi trong nguồn: ${defects}`)
  })

  // The litres are served as written (ADR 0003) — a Barem is written in whole
  // litres, so a fraction is worth naming, and naming it is all the report does.
  it('names a non-integer number of litres, and still reports the Hầm it sits in', () => {
    const sheet: BaremSheet = {
      stationHeader: 'DAKNONG3',
      tanks: [
        {
          tankCode: 'HAM_5',
          fuel: 'DO',
          nominalCapacityLiters: 25000,
          minHeightMm: 681,
          maxHeightMm: 683,
          points: new Map([
            [681, 2311],
            [682, 2316.5],
            [683, 2317.456789],
          ]),
          defects: [],
        },
      ],
    }
    const withFraction = formatBaremReport(
      [checked('DAKNONG3', 'Trạm Đăk Nông 3', 'daknong3', sheet)],
      checkedAt
    )

    expect(withFraction).toContain('Số lít không nguyên: 682 mm = 2,316.5 L')
    // Written out to the last digit: the cell to correct is named exactly, and a
    // rounded figure would be a litre value the trang tính does not contain.
    expect(withFraction).toContain('Số lít không nguyên: 683 mm = 2,317.456789 L')
    expect(withFraction).toContain('Hầm 5 — DO')
    expect(withFraction).toContain('Trang tính đọc được: 1/1')
    expect(withFraction).toContain('Lỗi trong nguồn: 2')
  })
})
