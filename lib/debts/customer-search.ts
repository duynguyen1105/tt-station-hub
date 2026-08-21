import { normalizePlate } from '@/lib/debts/plate'

/**
 * Finding one khách hàng in the Công nợ list, by whichever of their details is to
 * hand.
 *
 * The three columns worth searching are searched together in one box rather than
 * one each: whoever is looking has exactly one of them — a name half-heard, a
 * biển số a lái xe just read out, a mã MISA copied from MISA — and should not
 * have to say which kind it is before typing it.
 *
 * Every rule that decides whether a row survives lives here, so it needs no
 * database and no browser to test.
 */

/** The bộ lọc as the URL carries it — untrusted, both criteria optional. */
export type DebtCustomerParams = { q?: string; owing?: string }

/** The bộ lọc as applied: the query as it will be matched, and the toggle. */
export type DebtCustomerFilter = { q?: string; owing: boolean }

/** The parts of a khách hàng the bộ lọc reads. */
export type SearchableCustomer = {
  name: string
  misaCode: string | null
  knownPlates: string[]
  balance: number
}

/**
 * Combining marks, which `normalize('NFD')` splits a dấu off into. Hoisted because
 * folding runs once per khách hàng per keystroke and a literal in the function
 * would build this afresh every time.
 */
const COMBINING_MARKS = /[\u0300-\u036f]/g

/**
 * A name reduced to what two people typing it would agree on: no dấu, no case.
 *
 * `đ` is the one Vietnamese letter NFD leaves alone — it is a letter in its own
 * right, not a `d` wearing a stroke — so it is mapped by hand. Without that,
 * "Dũng" typed as "dung" would find nothing on a station whose khách hàng is
 * "Đũng".
 */
function foldVietnamese(raw: string): string {
  return raw.toLowerCase().normalize('NFD').replace(COMBINING_MARKS, '').replaceAll('đ', 'd')
}

/**
 * The bộ lọc the URL is asking for, or no filter at all for anything it can't read.
 *
 * A query of nothing but spaces is not a filter — it would empty the table and
 * leave no visible reason why — so it is dropped rather than matched.
 */
export function debtCustomerFilter(params: DebtCustomerParams): DebtCustomerFilter {
  const q = params.q?.trim()
  return { ...(q ? { q } : {}), owing: params.owing === '1' }
}

/** Whether anything is actually narrowing the list — what Xóa bộ lọc is offered for. */
export function hasDebtCustomerFilter(filter: DebtCustomerFilter): boolean {
  return Boolean(filter.q) || filter.owing
}

/**
 * Whether one khách hàng survives the bộ lọc.
 *
 * The query matches a *part* of any of the three, not the whole: half a name and
 * the last digits of a biển số are what people actually remember. Biển số are
 * compared through `normalizePlate`, so "50h21010" finds "50H-210.10" — the punctuation
 * is a way of writing the plate, not part of it.
 *
 * Còn nợ means strictly above zero. A khách hàng who has overpaid is not owing,
 * so a negative dư nợ is out too.
 */
export function matchesDebtCustomer(
  customer: SearchableCustomer,
  filter: DebtCustomerFilter
): boolean {
  if (filter.owing && customer.balance <= 0) return false
  if (!filter.q) return true
  const needle = foldVietnamese(filter.q)
  if (foldVietnamese(customer.name).includes(needle)) return true
  if (customer.misaCode && foldVietnamese(customer.misaCode).includes(needle)) return true
  const plate = normalizePlate(filter.q)
  if (!plate) return false
  return customer.knownPlates.some((known) => normalizePlate(known)?.includes(plate) ?? false)
}

/**
 * The khách hàng left after the bộ lọc, in the order they arrived.
 *
 * An empty filter hands back the very same array: the tab opens unfiltered, and
 * that most common case should cost nothing.
 */
export function filterDebtCustomers<T extends SearchableCustomer>(
  customers: T[],
  filter: DebtCustomerFilter
): T[] {
  if (!hasDebtCustomerFilter(filter)) return customers
  return customers.filter((customer) => matchesDebtCustomer(customer, filter))
}
