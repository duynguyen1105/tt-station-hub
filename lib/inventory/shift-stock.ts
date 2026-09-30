// The Tồn kho block of a ca's phiếu chốt: each hầm's height before and after the ca's
// ngày, read against the Barem, and each nhiên liệu's sổ sách for that ngày set beside
// what the hầm hold. Pure — the page reads the rows and the sheet, this decides.
import { byTankCode } from '@/lib/dispensers/tank-links'

import { type BaremColumn, type BaremLookup, lookupBaremLiters } from './barem'
import { type BookMovement, dailyLedger } from './book-stock'
import { dipFuel } from './tank-fuel'

const dayKey = (d: Date) => d.toISOString().slice(0, 10)

/** One nhiên liệu's sổ sách over one ngày. */
export type BookDay = {
  opening: number
  imported: number
  sold: number
  adjusted: number
  closing: number
}

/**
 * The sổ sách of `day` (YYYY-MM-DD): the day's own row of `dailyLedger` when it moved,
 * else the last closing before it carried through unchanged. Null for a day before
 * the đầu kỳ, which the sổ does not reach.
 */
export function bookDayOf(
  openingLiters: number,
  effectiveDate: Date,
  movements: BookMovement[],
  day: string
): BookDay | null {
  if (day < dayKey(effectiveDate)) return null
  const [latest] = dailyLedger(
    openingLiters,
    effectiveDate,
    movements.filter((m) => dayKey(m.movementDate) <= day)
  )
  if (latest?.date === day) {
    return {
      opening: latest.openingOfDay,
      imported: latest.importedLiters,
      sold: latest.soldLiters,
      adjusted: latest.adjustedLiters,
      closing: latest.closingOfDay,
    }
  }
  const carried = latest?.closingOfDay ?? openingLiters
  return { opening: carried, imported: 0, sold: 0, adjusted: 0, closing: carried }
}

/** A counted đo hầm, as much of it as the table needs. */
export type TankDip = { tankCode: string; dipValue: number; fuelType: string | null }

/** One side of a hầm's row: the height read, and its litres — or why the Barem has none.
 *  `lookup` is null where there is no Barem to ask at all. */
export type TankSide = { mm: number; lookup: BaremLookup | null }

export type ShiftTankRow = {
  tankCode: string
  fuelType: string | null
  capacityK: number | null
  /** The last counted dip before the ca's ngày. */
  before: TankSide | null
  /** The last counted dip on the ca's ngày. */
  after: TankSide | null
}

/**
 * One row per hầm — every hầm Cấu hình names, plus any a dip names that it does not —
 * with the dip before the ca's ngày and the last one on it, each read against the
 * Barem. The nhiên liệu is Cấu hình's, else the dip's own.
 */
export function shiftTankRows({
  tanks,
  before,
  after,
  barem,
}: {
  tanks: readonly { code: string; fuelType: string; capacityK: number | null }[]
  before: readonly TankDip[]
  after: readonly TankDip[]
  barem: ReadonlyMap<string, BaremColumn> | null
}): ShiftTankRow[] {
  const configured = new Map(tanks.map((t) => [t.code, t]))
  const configuredFuel = new Map(tanks.map((t) => [t.code, t.fuelType]))
  const beforeByTank = new Map(before.map((d) => [d.tankCode, d]))
  const afterByTank = new Map(after.map((d) => [d.tankCode, d]))
  const side = (dip: TankDip | undefined): TankSide | null =>
    dip
      ? {
          mm: dip.dipValue,
          lookup: barem ? lookupBaremLiters(barem.get(dip.tankCode), dip.dipValue) : null,
        }
      : null
  const codes = [
    ...new Set([...configured.keys(), ...beforeByTank.keys(), ...afterByTank.keys()]),
  ].sort(byTankCode)
  return codes.map((code) => {
    const b = beforeByTank.get(code)
    const a = afterByTank.get(code)
    return {
      tankCode: code,
      fuelType: dipFuel(configuredFuel, code, a?.fuelType ?? b?.fuelType ?? null),
      capacityK: configured.get(code)?.capacityK ?? null,
      before: side(b),
      after: side(a),
    }
  })
}

export type FuelStockRow = {
  fuelType: string
  /** Null for a ngày before the nhiên liệu's đầu kỳ. */
  book: BookDay | null
  /** The hầm's litres at the ngày's last dip, or null unless every hầm of the fuel
   *  has one the Barem resolves — a part-measured fuel cannot honestly be compared. */
  barem: number | null
  /** Barem − Tồn cuối sổ sách. */
  variance: number | null
}

/**
 * One row per nhiên liệu. `provisionalSold` is the litres this ca has sold but not
 * yet booked — sales reach the sổ only at Chốt ca — so an open ca's Tồn cuối already
 * reads as it will once chốt'd.
 */
export function fuelStockRows({
  fuels,
  bookByFuel,
  provisionalSold,
  tankRows,
}: {
  fuels: readonly string[]
  bookByFuel: ReadonlyMap<string, BookDay | null>
  provisionalSold: ReadonlyMap<string, number>
  tankRows: readonly ShiftTankRow[]
}): FuelStockRow[] {
  return fuels.map((fuelType) => {
    const booked = bookByFuel.get(fuelType) ?? null
    const pending = provisionalSold.get(fuelType) ?? 0
    const book = booked && {
      ...booked,
      sold: booked.sold + pending,
      closing: booked.closing - pending,
    }
    const fuelTanks = tankRows.filter((t) => t.fuelType === fuelType)
    let barem: number | null = fuelTanks.length > 0 ? 0 : null
    for (const tank of fuelTanks) {
      const lookup = tank.after?.lookup
      barem = barem !== null && lookup?.ok ? barem + lookup.liters : null
    }
    return {
      fuelType,
      book,
      barem,
      variance: barem !== null && book ? barem - book.closing : null,
    }
  })
}
