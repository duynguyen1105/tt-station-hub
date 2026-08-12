import { describe, expect, it } from 'vitest'

import { bindPumpLabels, bindTankLabels, parsePaperLabel } from '@/lib/imports/binding-ladder'
import { type StationRoster, rosterForStation } from '@/lib/imports/station-rosters'

function roster(stationCode: string): StationRoster {
  const found = rosterForStation(stationCode)
  if (!found) throw new Error(`no roster for ${stationCode}`)
  return found
}

const cxgnh = roster('CXGNH')
const daknong2 = roster('DAKNONG2')
const daknong3 = roster('DAKNONG3')
const lamdong02 = roster('LAMDONG02')

describe('reading a printed label', () => {
  it('reads the number, the fuel and the capacity the row prints', () => {
    expect(parsePaperLabel('1. DO   10K')).toEqual({ number: 1, fuel: 'DO', capacityK: 10 })
    expect(parsePaperLabel('4.DO -25K')).toEqual({ number: 4, fuel: 'DO', capacityK: 25 })
    expect(parsePaperLabel('DC - 9K')).toEqual({ number: null, fuel: 'DC', capacityK: 9 })
    expect(parsePaperLabel('HẦM 1 XA')).toEqual({ number: 1, fuel: null, capacityK: null })
  })

  it('needs a separator after a leading number, so a capacity never reads as one', () => {
    expect(parsePaperLabel('10K')).toEqual({ number: null, fuel: null, capacityK: 10 })
    expect(parsePaperLabel('2.E0 - 12K')).toEqual({ number: 2, fuel: 'E0', capacityK: 12 })
  })
})

describe('the numbered rung', () => {
  it('binds a standard biên bản row by its printed number', () => {
    // CXGNH prints "1. DO 10K"; LAMDONG01 prints "2.E0 - 12K".
    expect(bindTankLabels(['1. DO   10K'], cxgnh.tanks)).toEqual([
      { bound: true, tankCode: 'HAM_1', verified: true },
    ])
    expect(bindTankLabels(['2.E0 - 12K'], roster('LAMDONG01').tanks)).toEqual([
      { bound: true, tankCode: 'HAM_2', verified: true },
    ])
  })

  it('still binds the old "HẦM n" shape, so a drawer of old sheets keeps working', () => {
    expect(bindTankLabels(['HẦM 2 12K'], daknong2.tanks)).toEqual([
      { bound: true, tankCode: 'HAM_2', verified: true },
    ])
    expect(bindTankLabels(['Hầm 03', 'HAM 1 15K', 'HẦM 2 DC'], daknong2.tanks)).toEqual([
      { bound: true, tankCode: 'HAM_3', verified: true },
      { bound: true, tankCode: 'HAM_1', verified: true },
      { bound: false, reason: 'roster-mismatch' },
    ])
  })

  it('refuses a number the printed fuel or capacity contradicts', () => {
    // DAKNONG2's Hầm 1 is DO 15K and its Hầm 2 is E0 12K.
    expect(bindTankLabels(['1. DO 12K', '2. DC 12K'], daknong2.tanks)).toEqual([
      { bound: false, reason: 'roster-mismatch' },
      { bound: false, reason: 'roster-mismatch' },
    ])
  })
})

describe('the unnumbered rung', () => {
  it('binds LAMDONG02, which numbers nothing, by fuel and capacity', () => {
    expect(bindTankLabels(['DC - 9K', 'DO - 9K', 'E0 - 25K'], lamdong02.tanks)).toEqual([
      { bound: true, tankCode: 'HAM_1', verified: true },
      { bound: true, tankCode: 'HAM_2', verified: true },
      { bound: true, tankCode: 'HAM_3', verified: true },
    ])
  })

  it('picks nobody when the pair names several Hầm, and nobody when it names none', () => {
    // NGANHA01's Hầm 3 and Hầm 4 are both E0 6K — two matches is no answer.
    expect(bindTankLabels(['E0 6K'], roster('NGANHA01').tanks)).toEqual([
      { bound: false, reason: 'unidentified' },
    ])
    // DAKNONG3's Hầm 1, 2 and 3 are all E0 9K — nor is three.
    expect(bindTankLabels(['E0 - 9K', 'E0 - 9K'], daknong3.tanks)).toEqual([
      { bound: false, reason: 'unidentified' },
      { bound: false, reason: 'unidentified' },
    ])
    // DAKNONG2 has no DC Hầm at all.
    expect(bindTankLabels(['DC - 9K', ''], daknong2.tanks)).toEqual([
      { bound: false, reason: 'unidentified' },
      { bound: false, reason: 'unidentified' },
    ])
  })
})

describe('one Hầm, one row', () => {
  it("leaves HTGDONGNAI's second `3.` unbound and its first bound", () => {
    // The form prints two different Hầm both `3.` — a defect the roster records
    // as printed, and which the ladder must not resolve by guessing.
    const labels = ['1. DC 10K', '2. DO 15K', '3. E0 15K', '3. E0 10K']
    expect(bindTankLabels(labels, roster('HTGDONGNAI').tanks)).toEqual([
      { bound: true, tankCode: 'HAM_1', verified: true },
      { bound: true, tankCode: 'HAM_2', verified: true },
      { bound: true, tankCode: 'HAM_3', verified: true },
      { bound: false, reason: 'duplicate-number' },
    ])
  })

  it('refuses a second unnumbered row that lands on a Hầm already claimed', () => {
    expect(bindTankLabels(['DC - 9K', 'DC - 9K'], lamdong02.tanks)).toEqual([
      { bound: true, tankCode: 'HAM_1', verified: true },
      { bound: false, reason: 'duplicate-number' },
    ])
  })
})

describe('a Trạm nobody has set up', () => {
  it('binds a numbered row against no roster at all, marked unverified', () => {
    expect(bindTankLabels(['1. DO 10K', 'HẦM 2 12K'], [])).toEqual([
      { bound: true, tankCode: 'HAM_1', verified: false },
      { bound: true, tankCode: 'HAM_2', verified: false },
    ])
  })

  it('has nothing to bind an unnumbered row to', () => {
    expect(bindTankLabels(['DC - 9K'], [])).toEqual([{ bound: false, reason: 'unidentified' }])
  })

  it('binds a number the roster does not list, unverified', () => {
    // DAKNONG2 has three Hầm on paper. A fourth row is the roster's business to
    // explain (`pnpm roster:check`), not a reason to lose the delivery.
    expect(bindTankLabels(['4. DO 15K'], daknong2.tanks)).toEqual([
      { bound: true, tankCode: 'HAM_4', verified: false },
    ])
  })
})

describe('the same ladder for Trụ', () => {
  it('binds a numbered Trụ, the old `TRỤ n` shape, and an unnumbered one', () => {
    expect(bindPumpLabels(['1- DO', 'TRỤ 3'], daknong2.pumps)).toEqual([
      { bound: true, pumpCode: 'TRU_1', verified: true },
      { bound: true, pumpCode: 'TRU_3', verified: true },
    ])
    // LAMDONG02 prints no Trụ numbers: DC, DO, E0, E0.
    expect(bindPumpLabels(['DC', 'DO'], lamdong02.pumps)).toEqual([
      { bound: true, pumpCode: 'TRU_1', verified: true },
      { bound: true, pumpCode: 'TRU_2', verified: true },
    ])
  })

  it("leaves LAMDONG02's two unnumbered E0 Trụ unbound rather than guessing", () => {
    expect(bindPumpLabels(['E0', 'E0'], lamdong02.pumps)).toEqual([
      { bound: false, reason: 'unidentified' },
      { bound: false, reason: 'unidentified' },
    ])
  })
})
