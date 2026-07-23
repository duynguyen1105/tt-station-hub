import type { Prisma } from '@/lib/generated/prisma/client'
import { fuelTypeLabel } from '@/lib/ui/status'

const VN_OFFSET_MS = 7 * 60 * 60 * 1000

/** The review states whose debt visits belong to a ca's MISA credit lines. */
export const APPROVED_VISIT_STATUSES = ['approved', 'corrected']

/**
 * The Vietnam-offset calendar-day bounds for a ca.
 *
 * `shiftDate` is stored as UTC-midnight labelled with the Vietnam (GMT+7) calendar
 * day (see `shiftDateFor` in lib/photos/ingest.ts), but debt `visitDate` is the raw
 * UTC instant. Shift the 24h window back 7h so it spans the Vietnam calendar day,
 * not local 07:00→07:00. Half-open: select with `visitDate >= start && < end`.
 */
export function shiftDayWindow(shiftDate: Date): { start: Date; end: Date } {
  return {
    start: new Date(shiftDate.getTime() - VN_OFFSET_MS),
    end: new Date(shiftDate.getTime() + 24 * 60 * 60 * 1000 - VN_OFFSET_MS),
  }
}

/**
 * The `findMany` args that select a ca's debt visits: this station, an
 * approved/corrected review status, and a `visitDate` inside the ca's day window,
 * ordered chronologically. The single predicate used by both the MISA export route
 * and the on-page bán-nợ list, so the two can't select different visits (spec §4).
 */
export function debtVisitSelection(
  stationId: string,
  shiftDate: Date
): Prisma.DebtVehicleVisitFindManyArgs {
  const { start, end } = shiftDayWindow(shiftDate)
  return {
    where: {
      stationId,
      reviewStatus: { in: APPROVED_VISIT_STATUSES },
      visitDate: { gte: start, lt: end },
    },
    orderBy: [{ visitDate: 'asc' }, { id: 'asc' }],
  }
}

/** One debt visit as consumed by the on-page bán-nợ list (a projection of DebtVehicleVisit). */
export type DebtVisitInput = {
  customerId: string | null
  visitDate: Date
  fuelType: string | null
  litersRead: number | null
  plateRead: string | null
  plateConfirmed: string | null
  // Signed URLs of the visit's photos — shown on the page so the reviewer can
  // check the pair without leaving the shift. Optional: the MISA route omits them.
  vehiclePhotoUrl?: string | null
  meterPhotoUrl?: string | null
}

/** The customer fields the list needs, keyed by id in `customersById`. */
export type DebtCustomerInput = {
  name: string
  misaCode: string | null
}

/** One row of the bán-nợ list. `id` is the column-1 display value (empty when missing). */
export type DebtListRow = {
  id: string
  idIsMissing: boolean
  customerName: string
  fuelLabel: string
  liters: number | null
  vehiclePhotoUrl: string | null
  meterPhotoUrl: string | null
}

/**
 * Build the read-only "Bán nợ trong ca" list from a ca's approved/corrected debt
 * visits. Pure: caller selects the visits (station + `shiftDayWindow` + status) and
 * supplies their customers. Rows are ordered by `visitDate` ascending.
 *
 * Column-1 id is the truck plate (`plateConfirmed ?? plateRead`), else the customer's
 * MISA code; `idIsMissing` is true when neither yields a value — such a row still
 * appears (flagged red on the page) because it blocks the MISA export.
 */
export function buildDebtsList(
  visits: DebtVisitInput[],
  customersById: Map<string, DebtCustomerInput>
): DebtListRow[] {
  return [...visits]
    .sort((a, b) => a.visitDate.getTime() - b.visitDate.getTime())
    .map((v) => {
      const customer = v.customerId !== null ? customersById.get(v.customerId) : undefined
      const id = v.plateConfirmed ?? v.plateRead ?? customer?.misaCode ?? ''
      return {
        id,
        idIsMissing: id === '',
        customerName: customer?.name ?? '',
        fuelLabel: v.fuelType ? fuelTypeLabel(v.fuelType) : '',
        liters: v.litersRead,
        vehiclePhotoUrl: v.vehiclePhotoUrl ?? null,
        meterPhotoUrl: v.meterPhotoUrl ?? null,
      }
    })
}
