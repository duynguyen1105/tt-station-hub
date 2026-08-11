// Which sheet of Trường Thịnh's Barem spreadsheet holds which Trạm's Barem.
//
// The binding is explicit and checked in, because neither thing the document
// offers can be trusted to identify a station: a tab name is something anyone
// with edit access can change, and cell A1 has been wrong in the past — the
// `tanhoa` tab carried `PHUCTIEN` in A1 while holding an entirely different set
// of tanks (it reads `TANHOA` as of this import; the tanks are what settle it).
//
// A Trạm with no entry here simply has no Barem, which is the safe failure: the
// review form then behaves exactly as it does for an out-of-range height.
export const BAREM_SPREADSHEET_ID = '1cHWR7z-gImZXjldyLBSES0NgY5c9QmwPkibHuSqVwis'

export type BaremSheetBinding = {
  /** `stations.code` — the Trạm this sheet's Barem belongs to. */
  stationCode: string
  /** The tab as it is named in the spreadsheet; recorded as the Barem's provenance. */
  tab: string
  /** The tab's stable id, which is what the CSV export takes and what a rename does not change. */
  gid: string
}

/** All 12 sheets, in the order the spreadsheet lists them. */
export const BAREM_SHEETS: BaremSheetBinding[] = [
  { stationCode: 'DAKNONG1', tab: 'daknong1', gid: '1364858867' },
  { stationCode: 'DAKNONG2', tab: 'daknong2', gid: '1252113746' },
  { stationCode: 'DAKNONG3', tab: 'daknong3', gid: '574926214' },
  { stationCode: 'DAKNONGVK', tab: 'daknongvk', gid: '718729817' },
  { stationCode: 'DAKNONG5', tab: 'daknong5', gid: '144326745' },
  { stationCode: 'HTGDONGNAI', tab: 'htgdongnai', gid: '931339717' },
  { stationCode: 'LAMDONG01', tab: 'lamdong01', gid: '1806647546' },
  { stationCode: 'LAMDONG02', tab: 'lamdong02', gid: '1065714476' },
  { stationCode: 'NGANHA01', tab: 'nganha01', gid: '1175170869' },
  { stationCode: 'NGUYENVUONG', tab: 'nguyenvuong', gid: '570374761' },
  { stationCode: 'PHUCTIEN', tab: 'phuctien', gid: '24554498' },
  { stationCode: 'TANHOA', tab: 'tanhoa', gid: '2061306672' },
]

/** The sheet as CSV. The spreadsheet is shared read-only, so no credentials. */
export function baremSheetCsvUrl(gid: string): string {
  return `https://docs.google.com/spreadsheets/d/${BAREM_SPREADSHEET_ID}/export?format=csv&gid=${gid}`
}
