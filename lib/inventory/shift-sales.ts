// When a shift is completed, the liters sold (electronic meter delta per dispenser,
// less that trụ's Xả gió) become 'sale' movements that reduce estimated stock per fuel
// type (build plan §3.2: estimated = opening + imports − sales). Each reading carries
// its own opening, its own nhiên liệu and its own Xả gió, so the liters, the fuel they
// count against and what comes off them all come from the reading alone; the trụ only
// says which meter cache to advance.
import { electronicGap, soldLiters } from '@/lib/shifts/reading-totals'

export type SaleReading = {
  dispenserId: string
  // The nhiên liệu stamped on the reading when it was created — required, so a
  // caller cannot quietly fall back to what the trụ pumps today.
  fuelType: string
  openingElectronicReading: number | null
  electronicReading: number | null
  // The Xả gió recorded against this reading, null where none was — required for the
  // same reason as fuelType: a caller that forgot to read the column would hand kế toán
  // a MISA file billing air and drop the hầm by litres still in it, and never be told.
  airPurgeLiters: number | null
  // Only callers that advance the mechanical cache (ca completion) supply these;
  // the export path reads liters off the electronic meter alone and omits them.
  openingMechanicalReading?: number | null
  mechanicalReading?: number | null
}

export type SaleDispenser = {
  id: string
  fuelType: string
}

export type FuelSale = { fuelType: string; liters: number }
// A meter's field is null only when the reading has no closing for it, so its cache stays put.
export type DispenserAdvance = {
  dispenserId: string
  newElectronicReading: number | null
  newMechanicalReading: number | null
}

export type ShiftSalesResult = {
  sales: FuelSale[]
  advances: DispenserAdvance[]
}

/**
 * Computes liters sold per fuel type from a shift's readings, plus the new
 * "last reading" each meter should advance to. Liters are what the reading sold —
 * its closing minus its own opening, less its Xả gió — through the same soldLiters
 * the ca screen's Tổng tiền is priced from, so the hầm, the MISA bán lẻ line and the
 * screen can never subtract a Xả gió differently.
 *
 * Whether a reading sold at all is still asked of the raw meter: only a positive delta
 * counts as a sale. Every closing advances the dispenser cache, whatever its delta — a
 * trụ that sold 0 L, or whose read the kế toán duyệt'd below its opening, still ends the
 * day at that closing, and that is where the next ca opens from. (The cache is only the
 * fallback opening; lib/shifts/opening-reading.ts reads the duyệt'd closing itself.) It
 * advances to the raw closing even under a Xả gió — that is genuinely what the totalizer
 * now reads. And the purged fuel went back into the hầm, so this single already-net
 * deduction is the whole of it: nothing is written back to compensate.
 *
 * Only the electronic meter's liters feed inventory; the mechanical meter is a
 * cross-check, so it produces an advance (to carry its opening into the next ca,
 * where the two meters are compared) but never a sale. Each meter advances
 * independently, so one may move while the other holds.
 */
export function computeShiftSales(
  readings: SaleReading[],
  dispensers: SaleDispenser[]
): ShiftSalesResult {
  const dispenserById = new Map(dispensers.map((d) => [d.id, d]))
  const litersByFuel = new Map<string, number>()
  const advances: DispenserAdvance[] = []

  for (const reading of readings) {
    const dispenser = dispenserById.get(reading.dispenserId)
    if (!dispenser) continue

    const newElectronicReading = reading.electronicReading
    const metered = electronicGap(reading)
    // soldLiters has an answer exactly when electronicGap does, so the second null check
    // is the type-checker's and not the rule's.
    const sold = soldLiters(reading, reading.airPurgeLiters)
    if (metered !== null && sold !== null && metered > 0) {
      litersByFuel.set(reading.fuelType, (litersByFuel.get(reading.fuelType) ?? 0) + sold)
    }
    const newMechanicalReading = reading.mechanicalReading ?? null

    if (newElectronicReading !== null || newMechanicalReading !== null) {
      advances.push({ dispenserId: dispenser.id, newElectronicReading, newMechanicalReading })
    }
  }

  const sales = [...litersByFuel.entries()].map(([fuelType, liters]) => ({ fuelType, liters }))
  return { sales, advances }
}
