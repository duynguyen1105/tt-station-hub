const VN_OFFSET_MS = 7 * 60 * 60 * 1000

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
