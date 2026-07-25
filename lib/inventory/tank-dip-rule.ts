// A RESERVE tank (no dispenser draws from it) holds still between dips, so any
// real movement is evaporation-scale. Trường Thịnh's rule: warn when the dip
// changes "too much" versus the previous measurement. The dip unit is whatever
// the station writes (cm on the stick until the barem table lands), so the
// tolerance is relative with a small absolute floor for near-empty tanks.

export const RESERVE_DIP_TOLERANCE_PCT = 5
export const RESERVE_DIP_TOLERANCE_MIN = 2

export function reserveDipExceedsTolerance(previous: number, next: number): boolean {
  const tolerance = Math.max(
    (Math.abs(previous) * RESERVE_DIP_TOLERANCE_PCT) / 100,
    RESERVE_DIP_TOLERANCE_MIN
  )
  return Math.abs(next - previous) > tolerance
}
