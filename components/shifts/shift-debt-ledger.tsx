import Link from 'next/link'

import { CustomerMisaCode } from '@/components/shared/customer-misa-code'
import { debtDay } from '@/lib/debts/ledger'
import { loadLedgers } from '@/lib/debts/load-ledger'
import { formatVND } from '@/lib/format'
import { customerHref } from '@/lib/stations/href'
import { vi } from '@/messages/vi'

const num = 'p-2 text-right font-mono whitespace-nowrap'

/**
 * The Công nợ block of a ca's phiếu chốt: each khách's sổ on the ca's ngày — the same
 * `debtDay` the Công nợ tab prints — narrowed to the khách with anything to say, so
 * the phiếu lists who owes or moved rather than the whole danh sách.
 *
 * Loads its own rows so the page can stream it: the sổ is read in full per khách.
 */
export async function ShiftDebtLedger({
  stationId,
  stationCode,
  day,
}: {
  stationId: string
  stationCode: string
  day: string
}) {
  const ledgers = await loadLedgers({ stationId, isActive: true })
  const rows = ledgers.flatMap(({ customer, txs }) => {
    const ofDay = debtDay(customer.anchor, txs, day)
    if (!ofDay) return []
    const charged = ofDay.charged + ofDay.advanced
    if (ofDay.opening === 0 && charged === 0 && ofDay.paid === 0 && ofDay.closing === 0) return []
    return [
      {
        id: customer.id,
        no: customer.no,
        name: customer.name,
        misaCode: customer.misaCode,
        ...ofDay,
        charged,
      },
    ]
  })
  const total = { opening: 0, charged: 0, paid: 0, closing: 0 }
  for (const row of rows) {
    total.opening += row.opening
    total.charged += row.charged
    total.paid += row.paid
    total.closing += row.closing
  }

  return (
    <>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{vi.shifts.debtLedger.empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="p-2">{vi.shifts.debtLedger.customer}</th>
                <th className={num}>{vi.shifts.debtLedger.opening}</th>
                <th className={num}>{vi.shifts.debtLedger.charged}</th>
                <th className={num}>{vi.shifts.debtLedger.paid}</th>
                <th className={num}>{vi.shifts.debtLedger.closing}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b">
                  <td className="p-2">
                    {row.no === null ? (
                      <CustomerMisaCode misaCode={row.misaCode} name={row.name} />
                    ) : (
                      <Link
                        href={customerHref(stationCode, row.no)}
                        className="underline-offset-2 hover:underline"
                      >
                        <CustomerMisaCode misaCode={row.misaCode} name={row.name} />
                      </Link>
                    )}
                  </td>
                  <td className={num}>{formatVND(row.opening)}</td>
                  <td className={num}>{row.charged ? formatVND(row.charged) : '—'}</td>
                  <td className={num}>{row.paid ? formatVND(row.paid) : '—'}</td>
                  <td className={`${num} font-semibold`}>{formatVND(row.closing)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="p-2">{vi.shifts.sumTotal}</td>
                <td className={num}>{formatVND(total.opening)}</td>
                <td className={num}>{formatVND(total.charged)}</td>
                <td className={num}>{formatVND(total.paid)}</td>
                <td className={num}>{formatVND(total.closing)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  )
}
