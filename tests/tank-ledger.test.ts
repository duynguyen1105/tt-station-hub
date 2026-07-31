import { describe, expect, it } from 'vitest'

import { computeTankFlows } from '@/lib/inventory/tank-ledger'

describe('computeTankFlows', () => {
  const dispensers = [
    { id: 'd1', tankCode: 'HAM_1' },
    { id: 'd2', tankCode: 'HAM_2' },
    { id: 'd3', tankCode: 'HAM_2' }, // two pumps drawing from the same tank
    { id: 'd4', tankCode: null },
  ]

  it('sums sales per tank from electronic deltas across its pumps', () => {
    const flows = computeTankFlows({
      dispensers,
      readings: [
        { dispenserId: 'd1', openingElectronicReading: 1000, electronicReading: 1500 },
        { dispenserId: 'd2', openingElectronicReading: 200, electronicReading: 350 },
        { dispenserId: 'd3', openingElectronicReading: 400, electronicReading: 460 },
      ],
      imports: [],
    })
    expect(flows.get('HAM_1')).toEqual({ imported: 0, sold: 500 })
    expect(flows.get('HAM_2')).toEqual({ imported: 0, sold: 210 })
  })

  it('sums imports per tank and merges with sales', () => {
    const flows = computeTankFlows({
      dispensers,
      readings: [{ dispenserId: 'd1', openingElectronicReading: 1000, electronicReading: 1400 }],
      imports: [
        { tankCode: 'HAM_1', litersActual: 8000 },
        { tankCode: 'HAM_1', litersActual: 2000 },
        { tankCode: 'HAM_3', litersActual: 5000 }, // reserve tank: import only
      ],
    })
    expect(flows.get('HAM_1')).toEqual({ imported: 10000, sold: 400 })
    expect(flows.get('HAM_3')).toEqual({ imported: 5000, sold: 0 })
  })

  it('skips incomplete readings, unmapped pumps, and negative deltas', () => {
    const flows = computeTankFlows({
      dispensers,
      readings: [
        { dispenserId: 'd1', openingElectronicReading: null, electronicReading: 1500 },
        { dispenserId: 'd4', openingElectronicReading: 10, electronicReading: 20 },
        { dispenserId: 'd2', openingElectronicReading: 500, electronicReading: 400 },
      ],
      imports: [],
    })
    expect(flows.get('HAM_1')).toBeUndefined()
    expect(flows.get('HAM_2')).toEqual({ imported: 0, sold: 0 })
  })
})
