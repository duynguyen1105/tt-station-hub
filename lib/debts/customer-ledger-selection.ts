import { readDayKey, readPicks } from '@/lib/filters/params'

/** What a line of the sổ công nợ is, in the words of the Nội dung column. */
export const LEDGER_KINDS = ['sale', 'advance', 'payment'] as const
export type LedgerKind = (typeof LEDGER_KINDS)[number]

/** The parts of a sổ công nợ line the bộ lọc reads; the page's own fields ride along. */
export type CustomerLedgerRow = {
  /** The ngày the giao dịch belongs to, `YYYY-MM-DD`. */
  date: string
  kind: LedgerKind
  /** The biển số of the lượt xe a Bán nợ came from, or null for anything else. */
  plate: string | null
  amount: number
  /** Dư nợ after this line, chained over every line before it. */
  balance: number
}

/** What the sổ công nợ URL carries, exactly as it carries it — untrusted. */
export type CustomerLedgerParams = {
  from?: string
  to?: string
  /** Loại giao dịch, comma-joined `LedgerKind`s. */
  type?: string
  /** Biển số, comma-joined. */
  plate?: string
}

export type CustomerLedgerSelection<R extends CustomerLedgerRow> = {
  /** The lines that match, oldest first. */
  rows: R[]
  /** The true Dư nợ before Từ ngày — every line before it counted, filtered or not. */
  openingOfRange: number
  /** Nợ and Trả summed over the matching lines only. */
  totals: { charge: number; payment: number }
  /** The true Dư nợ at the end of Đến ngày (or of the sổ), filtered or not. */
  closingOfRange: number
  /** Every biển số the sổ holds a line for — what the bộ lọc offers. */
  plateOptions: string[]
  types: LedgerKind[]
  plates: string[]
  from?: string
  to?: string
}

/**
 * The lines of one khách hàng's sổ công nợ that kế toán asked for, and the balances
 * either side of them.
 *
 * The rows are handed in **already chained**, oldest first, for the same reason as
 * `ledgerSelection`: narrowing at the query would restart Dư nợ at nợ đầu kỳ and put a
 * wrong but plausible balance on every line. Each kept line therefore still shows the
 * true Dư nợ after it, and the two range balances are read off the unfiltered chain —
 * picking one biển số narrows the lines, never what the khách actually owes.
 *
 * `plateOptions` is read off the rows and never off the filter, so ticking one biển số
 * cannot empty the menu that un-ticks it.
 */
export function customerLedgerSelection<R extends CustomerLedgerRow>(
  params: CustomerLedgerParams,
  opening: number,
  rows: R[]
): CustomerLedgerSelection<R> {
  const from = readDayKey(params.from)
  const to = readDayKey(params.to)
  const plateOptions = [...new Set(rows.flatMap((row) => (row.plate ? [row.plate] : [])))].sort()
  const types = readPicks(params.type, LEDGER_KINDS)
  const plates = readPicks(params.plate, plateOptions)
  const wantedTypes = types.length ? new Set<string>(types) : null
  const wantedPlates = plates.length ? new Set(plates) : null

  let openingOfRange = opening
  let closingOfRange: number | null = null
  const matched: R[] = []
  const totals = { charge: 0, payment: 0 }
  for (const row of rows) {
    if (from && row.date < from) {
      openingOfRange = row.balance
      continue
    }
    if (to && row.date > to) continue
    closingOfRange = row.balance
    if (wantedTypes && !wantedTypes.has(row.kind)) continue
    if (wantedPlates && !(row.plate && wantedPlates.has(row.plate))) continue
    matched.push(row)
    if (row.kind === 'payment') totals.payment += row.amount
    else totals.charge += row.amount
  }

  return {
    rows: matched,
    openingOfRange,
    totals,
    closingOfRange: closingOfRange ?? openingOfRange,
    plateOptions,
    types,
    plates,
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  }
}

/** Whether the sổ is narrowed, read off the filter as applied rather than as typed. */
export function hasCustomerLedgerFilter(
  filter: Pick<CustomerLedgerSelection<CustomerLedgerRow>, 'from' | 'to' | 'types' | 'plates'>
): boolean {
  return Boolean(filter.from || filter.to || filter.types.length || filter.plates.length)
}
