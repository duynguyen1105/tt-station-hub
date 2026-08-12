import { describe, expect, it } from 'vitest'

import { type StationIdentity, stationOnPaper } from '@/lib/imports/station-on-paper'
import { STATION_ROSTERS } from '@/lib/imports/station-rosters'

// The Trạm being imported into, as the database holds it. Codes carry the
// underscore the schema comments use; the paper never prints one.
const daknong1: StationIdentity = { code: 'DAKNONG_1', name: 'Trạm Đăk Nông 1' }

const others: StationIdentity[] = [
  { code: 'DAKNONG2', name: 'Trạm Đăk Nông 2' },
  { code: 'DAKNONG3', name: 'Trạm Đăk Nông 3' },
  { code: 'NGANHA01', name: 'Trạm Ngân Hà 01' },
  // Present on paper only — `STATION_ROSTERS` knows it, the database does not.
  { code: 'HTGDONGNAI', name: '' },
]

/** The header of a biên bản chuẩn, as `tests/extract-bien-ban.test.ts` has it. */
function header(code: string): string {
  return `CỬA HÀNG BÁN LẺ XĂNG DẦU TRƯỜNG THỊNH SỐ 2 (${code})`
}

describe('a header that names another Trạm', () => {
  it('refuses, and names both the Trạm on the paper and the one being imported into', () => {
    expect(stationOnPaper(header('DAKNONG2'), daknong1, others)).toEqual({
      verdict: 'mismatch',
      paperLabel: header('DAKNONG2'),
      paperCode: 'DAKNONG2',
      paperName: 'Trạm Đăk Nông 2',
      currentCode: 'DAKNONG_1',
      currentName: 'Trạm Đăk Nông 1',
    })
  })

  it('refuses for a Trạm known only from the printed rosters, which has no name', () => {
    // A delivery to a Trạm nobody has configured is still not a delivery here.
    expect(stationOnPaper(header('HTGDONGNAI'), daknong1, others)).toMatchObject({
      verdict: 'mismatch',
      paperCode: 'HTGDONGNAI',
      paperName: null,
    })
  })

  it('refuses an old sheet that prints the name without brackets', () => {
    expect(stationOnPaper('BIÊN BẢN GIAO NHẬN — Trạm Đăk Nông 3', daknong1, others)).toMatchObject({
      verdict: 'mismatch',
      paperCode: 'DAKNONG3',
    })
  })
})

describe('a header that names this Trạm', () => {
  it('accepts the bracketed code, underscore and diacritics notwithstanding', () => {
    expect(stationOnPaper(header('DAKNONG1'), daknong1, others)).toEqual({ verdict: 'match' })
    expect(stationOnPaper(header('ĐAKNONG 1'), daknong1, others)).toEqual({ verdict: 'match' })
  })

  it('accepts the name alone, as the older sheets print it', () => {
    expect(stationOnPaper('Đắk Nông 1', daknong1, others)).toEqual({ verdict: 'match' })
    expect(stationOnPaper('  TRẠM ĐĂK NÔNG 1  ', daknong1, others)).toEqual({ verdict: 'match' })
  })

  it('collapses zero padding, so a printed "NGÂN HÀ 1" is the Trạm coded NGANHA01', () => {
    const nganha: StationIdentity = { code: 'NGANHA01', name: 'Trạm Ngân Hà 01' }
    expect(stationOnPaper(header('NGÂN HÀ 1'), nganha, [daknong1])).toEqual({ verdict: 'match' })
  })

  it('reads DAKNONG3’s title, which prints the code with a space its body omits', () => {
    const daknong3: StationIdentity = { code: 'DAKNONG3', name: 'Trạm Đăk Nông 3' }
    expect(stationOnPaper(header('DAKNONG 3'), daknong3, [daknong1])).toEqual({ verdict: 'match' })
  })

  it('wins over an incidental hit on a sibling, whatever order the others come in', () => {
    // "DAKNONG1" and "DAKNONG10" both sit inside a header naming the latter.
    const daknong10: StationIdentity = { code: 'DAKNONG10', name: 'Trạm Đăk Nông 10' }
    expect(stationOnPaper(header('DAKNONG10'), daknong10, [daknong1])).toEqual({
      verdict: 'match',
    })
  })
})

describe('against the 13 printed rosters, as station-check.ts assembles them', () => {
  // The Trạm the seed configures, plus every code the standard forms print.
  const daknong1FromSeed: StationIdentity = { code: 'DAKNONG1', name: 'Trạm Đăk Nông 1' }
  const printed: StationIdentity[] = STATION_ROSTERS.filter(
    (roster) => roster.stationCode !== daknong1FromSeed.code
  ).map((roster) => ({ code: roster.stationCode, name: '' }))

  it('refuses every one of the other twelve forms', () => {
    const refused = printed.map((station) => {
      const verdict = stationOnPaper(header(station.code), daknong1FromSeed, printed)
      return verdict.verdict === 'mismatch' ? verdict.paperCode : `NOT REFUSED: ${station.code}`
    })
    expect(refused).toEqual(printed.map((station) => station.code))
  })

  it('accepts its own form', () => {
    expect(stationOnPaper(header('DAKNONG1'), daknong1FromSeed, printed)).toEqual({
      verdict: 'match',
    })
  })
})

describe('the same Trạm reached twice', () => {
  // `station-check.ts` hands over the active stations *and* the 13 printed
  // roster codes, so a configured Trạm appears on both lists. Two hits on one
  // Trạm must not read as "the header names two Trạm" and fall to silence.
  const both: StationIdentity[] = [
    { code: 'DAKNONG_2', name: 'Trạm Đăk Nông 2' }, // database
    { code: 'DAKNONG2', name: '' }, // printed roster
  ]

  it('counts as one refusal, and reports the database row that carries the name', () => {
    expect(stationOnPaper(header('DAKNONG2'), daknong1, both)).toMatchObject({
      verdict: 'mismatch',
      paperCode: 'DAKNONG_2',
      paperName: 'Trạm Đăk Nông 2',
    })
  })
})

describe('a header that places nobody', () => {
  it('says nothing when the paper prints no station at all', () => {
    // The older station-specific sheets carry no code, and a header the AI could
    // not read comes back null. Neither is evidence of anything.
    expect(stationOnPaper(null, daknong1, others)).toEqual({ verdict: 'unknown' })
    expect(stationOnPaper('', daknong1, others)).toEqual({ verdict: 'unknown' })
    expect(stationOnPaper('   ', daknong1, others)).toEqual({ verdict: 'unknown' })
    expect(stationOnPaper('()', daknong1, others)).toEqual({ verdict: 'unknown' })
  })

  it('says nothing for a Trạm in neither the database nor the printed rosters', () => {
    expect(stationOnPaper(header('BUONMATHUOT9'), daknong1, others)).toEqual({
      verdict: 'unknown',
    })
  })

  it('says nothing for DAKNONG4, which is a file name and not a code', () => {
    // The form in `BBGIAONHANXD_DAKNONG4.docx` prints `(DAKNONGVK)`. Should a
    // sheet ever print the file name instead, it places nobody and must not
    // cost that Trạm its delivery.
    expect(stationOnPaper(header('DAKNONG4'), daknong1, others)).toEqual({ verdict: 'unknown' })
  })

  it('says nothing when a bracket holds something that is not a station', () => {
    expect(stationOnPaper('BIÊN BẢN GIAO NHẬN XĂNG DẦU (Mẫu số 02)', daknong1, others)).toEqual({
      verdict: 'unknown',
    })
  })

  it('says nothing when the header reads as more than one Trạm', () => {
    // Two Trạm named is no identification, and refusing on a coin flip would
    // name the wrong one back to the reviewer.
    expect(stationOnPaper(`${header('DAKNONG2')} / (DAKNONG3)`, daknong1, others)).toMatchObject({
      // The first bracket that places a Trạm decides — brackets are the header's
      // own identity field and are read in printed order.
      verdict: 'mismatch',
      paperCode: 'DAKNONG2',
    })
    expect(stationOnPaper('Trạm Đăk Nông 2 và Trạm Đăk Nông 3', daknong1, others)).toEqual({
      verdict: 'unknown',
    })
  })
})
