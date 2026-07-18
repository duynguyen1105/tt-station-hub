// When a shift is completed, the liters dispensed (electronic meter delta per
// dispenser) become 'sale' movements that reduce estimated stock per fuel type
// (build plan §3.2: estimated = opening + imports − sales). Each reading carries
// its own opening, so liters are derived from the reading alone — the dispenser
// contributes only its fuel type.

export type SaleReading = {
  dispenserId: string
  openingElectronicReading: number | null
  electronicReading: number | null
}

export type SaleDispenser = {
  id: string
  fuelType: string
}

export type FuelSale = { fuelType: string; liters: number }
export type DispenserAdvance = { dispenserId: string; newReading: number }

export type ShiftSalesResult = {
  sales: FuelSale[]
  advances: DispenserAdvance[]
}

/**
 * Computes liters sold per fuel type from a shift's readings, plus the new
 * "last reading" each dispenser should advance to. Liters are the reading's
 * closing minus its own opening; only a positive delta counts as a sale, and
 * only a positive delta advances the dispenser cache — so a decreased or
 * opening-less reading leaves the baseline untouched for the next shift.
 */
export function computeShiftSales(
  readings: SaleReading[],
  dispensers: SaleDispenser[]
): ShiftSalesResult {
  const dispenserById = new Map(dispensers.map((d) => [d.id, d]))
  const litersByFuel = new Map<string, number>()
  const advances: DispenserAdvance[] = []

  for (const reading of readings) {
    if (reading.electronicReading === null || reading.openingElectronicReading === null) continue
    const dispenser = dispenserById.get(reading.dispenserId)
    if (!dispenser) continue

    const liters = reading.electronicReading - reading.openingElectronicReading
    if (liters > 0) {
      litersByFuel.set(dispenser.fuelType, (litersByFuel.get(dispenser.fuelType) ?? 0) + liters)
      advances.push({ dispenserId: dispenser.id, newReading: reading.electronicReading })
    }
  }

  const sales = [...litersByFuel.entries()].map(([fuelType, liters]) => ({ fuelType, liters }))
  return { sales, advances }
}
