// Pure assembly of Xuất MISA theo kỳ: every ca's own MISA build, read in the order the
// file lists them, folded into one file's rows and one preflight. No I/O — the route
// loads and builds each ca exactly as the one-ca export does, then hands them here.
import type { CashVoucherKind } from '@/lib/misa-export/build-cash-vouchers'
import type {
  FuelSummary,
  MisaBuildResult,
  MisaSalesRow,
  PreflightError,
  PreflightWarning,
} from '@/lib/misa-export/build-sales-voucher'

/** One ca of the khoảng, built. */
export type RangeShiftBuild = {
  shiftId: string
  stationCode: string
  shiftDate: Date
  result: MisaBuildResult
  cashCounts: Record<CashVoucherKind, number>
}

/** A ca of the khoảng that has something kế toán must fix or confirm, named as they read it. */
export type RangeShiftProblem = {
  shiftId: string
  stationCode: string
  shiftDate: string // yyyy-MM-dd
  errors: PreflightError[]
  warnings: PreflightWarning[]
}

export type MisaRangeExport = {
  shiftCount: number
  rows: MisaSalesRow[]
  fuelSummary: FuelSummary[]
  problems: RangeShiftProblem[]
  cashVoucherCounts: Record<CashVoucherKind, number>
}

/**
 * The khoảng as one Chứng từ bán hàng: each ca's rows after the one before, the litres per
 * nhiên liệu summed over every ca, and every ca with an error or a warning listed on its own
 * — so a blocked file says which ca blocks it. Xả gió stays null for a nhiên liệu no ca
 * purged, as the one-ca summary leaves it.
 */
export function buildMisaRangeExport(shifts: RangeShiftBuild[]): MisaRangeExport {
  const fuels = new Map<string, FuelSummary>()
  for (const { result } of shifts) {
    for (const f of result.fuelSummary) {
      const sum = fuels.get(f.fuelType)
      if (sum === undefined) {
        fuels.set(f.fuelType, { ...f })
        continue
      }
      sum.meteredLiters += f.meteredLiters
      sum.airPurgeLiters =
        sum.airPurgeLiters === null && f.airPurgeLiters === null
          ? null
          : (sum.airPurgeLiters ?? 0) + (f.airPurgeLiters ?? 0)
      sum.creditLiters += f.creditLiters
      sum.cashLiters += f.cashLiters
    }
  }

  return {
    shiftCount: shifts.length,
    rows: shifts.flatMap((s) => s.result.rows),
    fuelSummary: [...fuels.values()],
    problems: shifts
      .filter((s) => s.result.errors.length > 0 || s.result.warnings.length > 0)
      .map((s) => ({
        shiftId: s.shiftId,
        stationCode: s.stationCode,
        shiftDate: s.shiftDate.toISOString().slice(0, 10),
        errors: s.result.errors,
        warnings: s.result.warnings,
      })),
    cashVoucherCounts: {
      receipt: shifts.reduce((n, s) => n + s.cashCounts.receipt, 0),
      payment: shifts.reduce((n, s) => n + s.cashCounts.payment, 0),
    },
  }
}

/**
 * Several ca's Phiếu thu (or Phiếu chi) as one: the template header once, then each ca's
 * lines in turn. A ca with no line adds nothing.
 */
export function concatVoucherMatrices(
  header: readonly string[],
  matrices: (string | number | null)[][][]
): (string | number | null)[][] {
  return [[...header], ...matrices.flatMap((matrix) => matrix.slice(1))]
}
