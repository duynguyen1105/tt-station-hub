/**
 * Implied decimals on the LÍT row of a Trường Thịnh pump when the trạm has no
 * override (`Station.litersDecimals`). Three, because the 6-cell LÍT row must be
 * able to show a 182 L truck fill ("182.000" — seen lit on LAMDONG01, 26/08) and
 * four decimals would cap the row at 99.9999 L.
 */
export const DEFAULT_LITERS_DECIMALS = 3

/** The conventions a trạm may be configured with. */
export const LITERS_DECIMALS_OPTIONS = [2, 3, 4] as const
export type LitersDecimals = (typeof LITERS_DECIMALS_OPTIONS)[number]
