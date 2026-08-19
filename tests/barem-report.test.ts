import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  type CatalogueFuel,
  type FuelWordResolver,
  type StationFuelMapping,
  fuelWordResolver,
} from '@/lib/fuels/catalogue'
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

// The danh mục and Đăk Nông 1's mã hàng, as seeded (prisma/seed.ts). The sheet's fuel
// column is read by the same rule a trụ plate is, so the fixture is the same one
// `resolvePlateFuel` is tested against.
const CATALOGUE: CatalogueFuel[] = [
  { fuelType: 'XANG_A95', name: 'Xăng A95', areaIndependent: false, isActive: true },
  { fuelType: 'E0', name: 'Xăng E0', areaIndependent: false, isActive: true },
  { fuelType: 'DO', name: 'Dầu DO', areaIndependent: false, isActive: true },
  { fuelType: 'DC', name: 'Dầu DC', areaIndependent: false, isActive: true },
  { fuelType: 'URE', name: 'URE (Adblue)', areaIndependent: true, isActive: true },
]
const DAKNONG1: StationFuelMapping[] = [
  { fuelType: 'DO', productCode: 'DO' },
  { fuelType: 'E0', productCode: 'XA E0' },
  { fuelType: 'DC', productCode: 'DO01' },
  { fuelType: 'XANG_A95', productCode: 'A95' },
  { fuelType: 'URE', productCode: 'URE' },
]

function resolverFor(catalogue: CatalogueFuel[] = CATALOGUE): FuelWordResolver {
  return fuelWordResolver(catalogue, DAKNONG1)
}

const resolveFuel = resolverFor()

describe('compareBaremToDispensers', () => {
  it('says nothing when the sheet and the dispensers agree', () => {
    expect(
      compareBaremToDispensers(
        [sheetTank('HAM_1', 'DO', 25000)],
        [dispenser('HAM_1', 'DO', 25), dispenser('HAM_1', 'DO', 25)],
        resolveFuel
      )
    ).toEqual([])
  })

  it('names both sides of a fuel disagreement', () => {
    expect(
      compareBaremToDispensers(
        [sheetTank('HAM_2', 'DC', 10000)],
        [dispenser('HAM_2', 'DO', 10)],
        resolveFuel
      )
    ).toEqual([
      {
        kind: 'fuel',
        tankCode: 'HAM_2',
        sheetFuel: 'DC',
        sheetFuelType: 'DC',
        dispenserFuels: ['DO'],
      },
    ])
  })

  // The fuel column is typed by whoever prepared the spreadsheet, so a Hầm's fuel is
  // as likely to be spelled with the tên as with the khóa. Both read, and so does the
  // mã hàng, exactly as they do on a trụ plate.
  it('resolves a sheet wording through the tên and the trạm mã hàng', () => {
    expect(
      compareBaremToDispensers(
        [sheetTank('HAM_1', 'Dầu DO', 25000), sheetTank('HAM_2', 'DO01', 10000)],
        [dispenser('HAM_1', 'DO', 25), dispenser('HAM_2', 'DC', 10)],
        resolveFuel
      )
    ).toEqual([])
  })

  // What the hard-coded regexes could not do: they sent every remaining "XĂNG" to A95,
  // so this sheet agreed with a Xăng A95 trụ and disagreed with the Xăng RON 98 one it
  // actually names.
  it('resolves a nhiên liệu added after the code was written', () => {
    const withRon98 = [
      ...CATALOGUE,
      { fuelType: 'XANG_RON_98', name: 'Xăng RON 98', areaIndependent: false, isActive: true },
    ]
    expect(
      compareBaremToDispensers(
        [sheetTank('HAM_1', 'Xăng RON 98', 15000)],
        [dispenser('HAM_1', 'XANG_RON_98', 15)],
        resolverFor(withRon98)
      )
    ).toEqual([])
  })

  // Unknown, never guessed: the sheet's own word is kept for the report, and the trụ
  // drawing from the Hầm is reported as disagreeing rather than silently agreeing.
  it('reports a fuel word the danh mục answers for nothing', () => {
    expect(
      compareBaremToDispensers(
        [sheetTank('HAM_1', 'Xăng RON 98', 15000)],
        [dispenser('HAM_1', 'XANG_A95', 15)],
        resolveFuel
      )
    ).toEqual([
      {
        kind: 'fuel',
        tankCode: 'HAM_1',
        sheetFuel: 'Xăng RON 98',
        sheetFuelType: null,
        dispenserFuels: ['XANG_A95'],
      },
    ])
  })

  it('does not resolve a nhiên liệu Trường Thịnh has stopped selling', () => {
    const stopped = CATALOGUE.map((fuel) =>
      fuel.fuelType === 'DC' ? { ...fuel, isActive: false } : fuel
    )
    expect(
      compareBaremToDispensers(
        [sheetTank('HAM_2', 'DC', 10000)],
        [dispenser('HAM_2', 'DC', 10)],
        resolverFor(stopped)
      )
    ).toEqual([
      {
        kind: 'fuel',
        tankCode: 'HAM_2',
        sheetFuel: 'DC',
        sheetFuelType: null,
        dispenserFuels: ['DC'],
      },
    ])
  })

  it('compares capacity in litres, since dispensers record it in thousands', () => {
    expect(
      compareBaremToDispensers(
        [sheetTank('HAM_2', 'DC', 5500)],
        [dispenser('HAM_2', 'DC', 5)],
        resolveFuel
      )
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
      compareBaremToDispensers(
        [sheetTank('HAM_1', 'DO', 25000)],
        [dispenser('HAM_1', 'DO', null)],
        resolveFuel
      )
    ).toEqual([])
  })

  it('reports a Hầm the Barem has and the dispensers do not', () => {
    expect(compareBaremToDispensers([sheetTank('HAM_4', 'E0', 6000)], [], resolveFuel)).toEqual([
      { kind: 'tank-missing-from-dispensers', tankCode: 'HAM_4' },
    ])
  })

  it('reports a Hầm the dispensers have and the Barem does not', () => {
    expect(compareBaremToDispensers([], [dispenser('HAM_5', 'DO', 10)], resolveFuel)).toEqual([
      { kind: 'tank-missing-from-sheet', tankCode: 'HAM_5', dispenserFuels: ['DO'] },
    ])
  })

  it('ignores dispensers that name no tank', () => {
    expect(compareBaremToDispensers([], [dispenser(null, 'DO', 25)], resolveFuel)).toEqual([])
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
        {
          kind: 'fuel',
          tankCode: 'HAM_2',
          sheetFuel: 'DC',
          sheetFuelType: 'DC',
          dispenserFuels: ['DO'],
        },
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

  it('quotes a fuel word it could not resolve instead of naming a khóa', () => {
    const unresolved = formatBaremReport(
      [
        checked('DAKNONG1', 'Trạm Đăk Nông 1', 'daknong1', daknong1, [
          {
            kind: 'fuel',
            tankCode: 'HAM_1',
            sheetFuel: 'Xăng RON 98',
            sheetFuelType: null,
            dispenserFuels: ['XANG_A95'],
          },
        ]),
      ],
      checkedAt
    )
    expect(unresolved).toContain('barem ghi "Xăng RON 98"')
    expect(unresolved).toContain('dispensers ghi XANG_A95')
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
