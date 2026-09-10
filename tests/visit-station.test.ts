import { describe, expect, it } from 'vitest'

import { type PhotoStationSource, resolveVisitStation } from '@/lib/matching/visit-station'

const A = 'station-a'
const B = 'station-b'
const UNKNOWN = 'station-unknown'

type Case = {
  name: string
  visitStationId: string
  photoStationId: string
  photoStationSource: PhotoStationSource
  expected: string
}

const cases: Case[] = [
  {
    name: 'a pump photo whose plate names another station takes the visit with it',
    visitStationId: A,
    photoStationId: B,
    photoStationSource: 'pump_plate',
    expected: B,
  },
  {
    // The regression test: the vehicle branch used to overwrite the station of
    // the visit it joined with its own inherited guess, undoing the plate.
    name: 'a vehicle photo joining with an inherited guess never moves the visit',
    visitStationId: B,
    photoStationId: A,
    photoStationSource: 'inherited',
    expected: B,
  },
  {
    // Report #6: "công nợ daknong1" typed for this fill outranks a plate read off
    // a tank label that happened to be in the pump photo's frame.
    name: 'a station the sender declared for this message moves the visit',
    visitStationId: B,
    photoStationId: A,
    photoStationSource: 'declared',
    expected: A,
  },
  {
    name: 'neither half carries a station of its own: the visit keeps what it has',
    visitStationId: A,
    photoStationId: A,
    photoStationSource: 'inherited',
    expected: A,
  },
  {
    name: 'a plate confirming the station the visit already has changes nothing',
    visitStationId: A,
    photoStationId: A,
    photoStationSource: 'pump_plate',
    expected: A,
  },
  {
    name: 'a joining photo parked on the unknown station never overwrites',
    visitStationId: A,
    photoStationId: UNKNOWN,
    photoStationSource: 'inherited',
    expected: A,
  },
  {
    name: 'a visit parked on the unknown station is adopted by the joining station',
    visitStationId: UNKNOWN,
    photoStationId: A,
    photoStationSource: 'inherited',
    expected: A,
  },
]

describe('resolveVisitStation', () => {
  it.each(cases)('$name', ({ visitStationId, photoStationId, photoStationSource, expected }) => {
    expect(
      resolveVisitStation({
        visitStationId,
        photoStationId,
        photoStationSource,
        unknownStationId: UNKNOWN,
      })
    ).toBe(expected)
  })
})
