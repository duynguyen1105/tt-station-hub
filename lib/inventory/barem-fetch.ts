// Reading one Trạm's Barem out of Trường Thịnh's spreadsheet, over the wire.
//
// This is the single definition of "the sheet could not be read", shared by the
// lookup that answers a kế toán's heights and the check command that reports the
// sheet's defects — so the two can never disagree about whether a tab is
// readable.
//
// Nothing here caches (ADR 0005). Every call fetches, because an admin's
// correction has to take effect on the very next height typed.
import { type BaremSheet, parseBaremSheet } from './barem'
import { type BaremSheetBinding, baremSheetCsvUrl } from './barem-sheets'

/** A kế toán waiting on an SL barem cell would rather be told to type it than
 *  watch an empty cell. One sheet is ~150 KB and fetches in ~1.2 s. */
const FETCH_TIMEOUT_MS = 5_000

/** The sheet, or why it could not be read. The reason is Vietnamese because it
 *  ends up in the report Trường Thịnh reads. */
export type BaremSheetRead = { ok: true; sheet: BaremSheet } | { ok: false; error: string }

/**
 * Fetches a binding's tab as CSV and parses it. Unreadable is never a per-Hầm
 * matter — it takes out every Hầm on the tab at once — so all four ways this can
 * fail come back the same way: the fetch fails, it times out, the response is
 * not CSV, or the sheet yields no Hầm at all.
 */
export async function fetchBaremSheet(binding: BaremSheetBinding): Promise<BaremSheetRead> {
  let csv: string
  try {
    const response = await fetch(baremSheetCsvUrl(binding.gid), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      // Said out loud rather than left to the framework's default: a cached
      // response is a second, older Barem (ADR 0005).
      cache: 'no-store',
    })
    if (!response.ok) {
      return {
        ok: false,
        error: `trang tính trả về HTTP ${response.status} ${response.statusText}`,
      }
    }
    // An unshared or deleted tab answers 200 with Google's sign-in page.
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('csv')) {
      return { ok: false, error: `trang tính không trả về CSV (content-type: ${contentType})` }
    }
    csv = await response.text()
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      return { ok: false, error: `trang tính không phản hồi trong ${FETCH_TIMEOUT_MS / 1000} giây` }
    }
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }

  // Zero Hầm is what a structural edit — an inserted column, a moved header row
  // — produces: the tab still downloads, and nothing in it is a Barem.
  const sheet = parseBaremSheet(csv)
  if (sheet.tanks.length === 0)
    return { ok: false, error: 'không đọc được Hầm nào trong trang tính' }
  return { ok: true, sheet }
}
