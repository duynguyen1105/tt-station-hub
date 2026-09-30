/**
 * The addresses of a trạm's pages. A trạm is named in the URL by its mã,
 * lowercased (`/stations/daknong1`), and a ca by its ngày
 * (`/stations/daknong1/shifts/2026-09-30`) — every ca is `full_day`, so a trạm
 * has one per day. Pure, so client components build their links from it too.
 */
export function stationSlug(code: string): string {
  return code.toLowerCase()
}

export function stationHref(code: string): string {
  return `/stations/${stationSlug(code)}`
}

export function shiftHref(code: string, shiftDate: Date | string): string {
  const day = typeof shiftDate === 'string' ? shiftDate : shiftDate.toISOString().slice(0, 10)
  return `${stationHref(code)}/shifts/${day}`
}

/** A khách hàng's sổ công nợ, by its per-trạm số (`/stations/daknong1/debts/7`). */
export function customerHref(code: string, no: number): string {
  return `${stationHref(code)}/debts/${no}`
}

/** A biên bản nhập hàng, by its per-trạm số (`/stations/daknong1/imports/12`). */
export function importReceiptHref(code: string, no: number): string {
  return `${stationHref(code)}/imports/${no}`
}
