import { describe, expect, it } from 'vitest'

import { computeTankFlows } from '@/lib/inventory/tank-ledger'

const dispensers = [
  { id: 'd1', tankCodes: ['HAM_1'] },
  { id: 'd2', tankCodes: ['HAM_3', 'HAM_4'] },
  { id: 'd3', tankCodes: ['HAM_4', 'HAM_3'] },
  { id: 'd4', tankCodes: [] },
]

describe('computeTankFlows', () => {
  it('keeps sales on a single hầm separate', () => {
    const flows = computeTankFlows({
      dispensers,
      readings: [{ dispenserId: 'd1', openingElectronicReading: 1000, electronicReading: 1500 }],
      imports: [],
    })
    expect(flows.get('HAM_1')).toEqual({ imported: 0, sold: 500, sharedWith: [] })
    expect(flows.get('HAM_3')).toEqual({ imported: 0, sold: 0, sharedWith: ['HAM_4'] })
  })

  it('shows the group total on both hầm while keeping imports per hầm', () => {
    const flows = computeTankFlows({
      dispensers,
      readings: [
        { dispenserId: 'd2', openingElectronicReading: 200, electronicReading: 350 },
        { dispenserId: 'd3', openingElectronicReading: 400, electronicReading: 460 },
      ],
      imports: [
        { tankCode: 'HAM_3', litersActual: 8000 },
        { tankCode: 'HAM_3', litersActual: 2000 },
        { tankCode: 'HAM_4', litersActual: 5000 },
      ],
    })
    expect(flows.get('HAM_3')).toEqual({ imported: 10000, sold: 210, sharedWith: ['HAM_4'] })
    expect(flows.get('HAM_4')).toEqual({ imported: 5000, sold: 210, sharedWith: ['HAM_3'] })
  })

  it('connects transitive shared hầm without doubling imports or sales', () => {
    const flows = computeTankFlows({
      dispensers: [
        { id: 'a', tankCodes: ['HAM_1', 'HAM_2'] },
        { id: 'b', tankCodes: ['HAM_2', 'HAM_3'] },
      ],
      readings: [
        { dispenserId: 'a', openingElectronicReading: 10, electronicReading: 20 },
        { dispenserId: 'b', openingElectronicReading: 10, electronicReading: 30 },
      ],
      imports: [],
    })
    expect(flows.get('HAM_1')).toEqual({ imported: 0, sold: 30, sharedWith: ['HAM_2', 'HAM_3'] })
    expect(flows.get('HAM_3')).toEqual({ imported: 0, sold: 30, sharedWith: ['HAM_1', 'HAM_2'] })
  })

  it('skips incomplete readings, unlinked trụ, and negative deltas', () => {
    const flows = computeTankFlows({
      dispensers,
      readings: [
        { dispenserId: 'd1', openingElectronicReading: null, electronicReading: 1500 },
        { dispenserId: 'd4', openingElectronicReading: 10, electronicReading: 20 },
        { dispenserId: 'd2', openingElectronicReading: 500, electronicReading: 400 },
      ],
      imports: [{ tankCode: 'HAM_5', litersActual: 100 }],
    })
    expect(flows.get('HAM_1')).toEqual({ imported: 0, sold: 0, sharedWith: [] })
    expect(flows.get('HAM_3')).toEqual({ imported: 0, sold: 0, sharedWith: ['HAM_4'] })
    expect(flows.get('HAM_4')).toEqual({ imported: 0, sold: 0, sharedWith: ['HAM_3'] })
    expect(flows.get('HAM_5')).toEqual({ imported: 100, sold: 0, sharedWith: [] })
  })
})
