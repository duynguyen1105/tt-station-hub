import { describe, expect, it } from 'vitest'

import { stationTankOptions } from '@/lib/inventory/tank-options'

const fuelLabel = (fuelType: string) =>
  ({ XANG_E0: 'Xăng E0', DAU_DO: 'Dầu DO' })[fuelType] ?? fuelType

describe('stationTankOptions', () => {
  it('takes a hầm’s nhiên liệu and dung tích from Cấu hình over a trụ’s stale copy', () => {
    const options = stationTankOptions(
      {
        tanks: [{ code: 'HAM_1', fuelType: 'DAU_DO', capacityK: 25 }],
        dispensers: [{ tankCode: 'HAM_1', fuelType: 'XANG_E0', tankCapacityK: 15 }],
        dipTanks: [],
      },
      fuelLabel
    )
    expect(options).toEqual([
      { code: 'HAM_1', label: 'Hầm 1 — Dầu DO (25K)', fuelType: 'DAU_DO', capacityK: 25 },
    ])
  })

  it('lists a hầm created in Cấu hình before any trụ draws on it or any đo hầm names it', () => {
    const options = stationTankOptions(
      {
        tanks: [{ code: 'HAM_4', fuelType: 'XANG_E0', capacityK: 10 }],
        dispensers: [],
        dipTanks: [],
      },
      fuelLabel
    )
    expect(options.map((o) => o.label)).toEqual(['Hầm 4 — Xăng E0 (10K)'])
  })

  it('still answers a hầm Cấu hình does not know from its trụ, then from its đo hầm', () => {
    const options = stationTankOptions(
      {
        tanks: [],
        dispensers: [
          { tankCode: 'HAM_3', fuelType: 'DAU_DO', tankCapacityK: 25 },
          { tankCode: null, fuelType: 'URE', tankCapacityK: null },
        ],
        dipTanks: [
          { tankCode: 'HAM_3', fuelType: 'XANG_E0' },
          { tankCode: 'HAM_2', fuelType: null },
        ],
      },
      fuelLabel
    )
    expect(options).toEqual([
      { code: 'HAM_2', label: 'Hầm 2', fuelType: null, capacityK: null },
      { code: 'HAM_3', label: 'Hầm 3 — Dầu DO (25K)', fuelType: 'DAU_DO', capacityK: 25 },
    ])
  })
})
