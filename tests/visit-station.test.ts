import { describe, expect, it } from 'vitest'

import { resolveVisitStation } from '@/lib/matching/visit-station'

const A = 'station-a'
const B = 'station-b'
const UNKNOWN = 'station-unknown'

type Case = {
  name: string
  visitStationId: string
  photoStationId: string
  stationFromPumpPlate: boolean
  expected: string
}

const cases: Case[] = [
  {
    name: 'a Pump Photo whose plate names another station takes the visit with it',
    visitStationId: A,
    photoStationId: B,
    stationFromPumpPlate: true,
    expected: B,
  },
  {
    // The regression test: the vehicle branch used to overwrite the station of
    // the visit it joined with its own inherited guess, undoing the plate.
    name: 'a vehicle photo joining never moves a plate-derived station',
    visitStationId: B,
    photoStationId: A,
    stationFromPumpPlate: false,
    expected: B,
  },
  {
    name: 'neither half read a plate: the visit keeps the station it has',
    visitStationId: A,
    photoStationId: A,
    stationFromPumpPlate: false,
    expected: A,
  },
  {
    name: 'a plate confirming the station the visit already has changes nothing',
    visitStationId: A,
    photoStationId: A,
    stationFromPumpPlate: true,
    expected: A,
  },
  {
    name: 'a joining photo parked on the unknown station never overwrites',
    visitStationId: A,
    photoStationId: UNKNOWN,
    stationFromPumpPlate: false,
    expected: A,
  },
  {
    name: 'a visit parked on the unknown station is adopted by the joining station',
    visitStationId: UNKNOWN,
    photoStationId: A,
    stationFromPumpPlate: false,
    expected: A,
  },
]

describe('resolveVisitStation', () => {
  it.each(cases)('$name', ({ visitStationId, photoStationId, stationFromPumpPlate, expected }) => {
    expect(
      resolveVisitStation({
        visitStationId,
        photoStationId,
        stationFromPumpPlate,
        unknownStationId: UNKNOWN,
      })
    ).toBe(expected)
  })
})
