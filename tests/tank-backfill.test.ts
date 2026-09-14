import { describe, expect, it } from 'vitest'

import { planTankBackfill } from '@/lib/dispensers/tank-backfill'

function pump(id: string, tankCode: string, fuelType: string, tankCapacityK: number | null) {
  return { id, stationId: 's1', displayName: `Trụ ${id}`, tankCode, fuelType, tankCapacityK }
}

describe('planTankBackfill', () => {
  it('creates one hầm per code, holding what its trụ pump', () => {
    const plan = planTankBackfill(
      [pump('1', 'HAM_3', 'DO', 25), pump('2', 'HAM_1', 'E0', 15), pump('6', 'HAM_3', 'DO', 25)],
      []
    )
    expect(plan.creates).toEqual([
      { stationId: 's1', code: 'HAM_3', fuelType: 'DO', capacityK: 25, dispenserIds: ['1', '6'] },
      { stationId: 's1', code: 'HAM_1', fuelType: 'E0', capacityK: 15, dispenserIds: ['2'] },
    ])
    expect(plan.conflicts).toEqual([])
  })

  it('keeps two trạm with the same hầm code apart', () => {
    const plan = planTankBackfill(
      [pump('1', 'HAM_1', 'DO', 25), { ...pump('2', 'HAM_1', 'E0', 15), stationId: 's2' }],
      []
    )
    expect(plan.creates.map((c) => [c.stationId, c.fuelType])).toEqual([
      ['s1', 'DO'],
      ['s2', 'E0'],
    ])
  })

  it('takes the dung tích one trụ knows when another left it blank', () => {
    const plan = planTankBackfill(
      [pump('1', 'HAM_2', 'DC', null), pump('2', 'HAM_2', 'DC', 10)],
      []
    )
    expect(plan.creates[0]).toMatchObject({ capacityK: 10, dispenserIds: ['1', '2'] })
  })

  it('reports trụ on one hầm pumping different nhiên liệu, and creates nothing for it', () => {
    const plan = planTankBackfill([pump('1', 'HAM_3', 'E0', 15), pump('2', 'HAM_3', 'DO', 15)], [])
    expect(plan.creates).toEqual([])
    expect(plan.conflicts).toEqual([
      { stationId: 's1', code: 'HAM_3', detail: 'Trụ 1 E0 15K, Trụ 2 DO 15K' },
    ])
  })

  it('reports trụ on one hầm stating different dung tích', () => {
    const plan = planTankBackfill([pump('1', 'HAM_3', 'E0', 15), pump('2', 'HAM_3', 'E0', 10)], [])
    expect(plan.conflicts).toHaveLength(1)
  })

  it('attaches to a hầm already there, learning a dung tích the row lacked', () => {
    const tank = { id: 't1', stationId: 's1', code: 'HAM_1', fuelType: 'E0', capacityK: null }
    const plan = planTankBackfill([pump('3', 'HAM_1', 'E0', 15)], [tank])
    expect(plan.creates).toEqual([])
    expect(plan.attaches).toEqual([{ tankId: 't1', capacityK: 15, dispenserIds: ['3'] }])
  })

  it('reports a trụ disagreeing with the hầm already there', () => {
    const tank = { id: 't1', stationId: 's1', code: 'HAM_1', fuelType: 'E0', capacityK: 15 }
    const plan = planTankBackfill([pump('3', 'HAM_1', 'DO', 15)], [tank])
    expect(plan.attaches).toEqual([])
    expect(plan.conflicts).toEqual([
      { stationId: 's1', code: 'HAM_1', detail: 'Trụ 3 DO 15K; hầm đã có: E0 15K' },
    ])
  })
})
