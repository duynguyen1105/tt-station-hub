// When a shift is completed, the liters dispensed (electronic meter delta per
// dispenser) become 'sale' movements that reduce estimated stock per fuel type
// (build plan §3.2: estimated = opening + imports − sales). Each reading carries
// its own opening and its own nhiên liệu, so both the liters and the fuel they
// count against come from the reading alone; the trụ only says which meter cache
// to advance.

export type SaleReading = {
  dispenserId: string
  // The nhiên liệu stamped on the reading when it was created — required, so a
  // caller cannot quietly fall back to what the trụ pumps today.
  fuelType: string
  openingElectronicReading: number | null
  electronicReading: number | null
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
 * "last reading" each meter should advance to. Liters are the reading's closing
 * minus its own opening; only a positive delta counts as a sale. Every closing
 * advances the dispenser cache, whatever its delta — a trụ that sold 0 L, or whose
 * read the kế toán duyệt'd below its opening, still ends the day at that closing,
 * and that is where the next ca opens from. (The cache is only the fallback
 * opening; lib/shifts/opening-reading.ts reads the duyệt'd closing itself.)
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
    if (reading.electronicReading !== null && reading.openingElectronicReading !== null) {
      const liters = reading.electronicReading - reading.openingElectronicReading
      if (liters > 0) {
        litersByFuel.set(reading.fuelType, (litersByFuel.get(reading.fuelType) ?? 0) + liters)
      }
    }
    const newMechanicalReading = reading.mechanicalReading ?? null

    if (newElectronicReading !== null || newMechanicalReading !== null) {
      advances.push({ dispenserId: dispenser.id, newElectronicReading, newMechanicalReading })
    }
  }

  const sales = [...litersByFuel.entries()].map(([fuelType, liters]) => ({ fuelType, liters }))
  return { sales, advances }
}
