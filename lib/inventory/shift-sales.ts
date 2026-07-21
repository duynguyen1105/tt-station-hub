// When a shift is completed, the liters dispensed (electronic meter delta per
// dispenser) become 'sale' movements that reduce estimated stock per fuel type
// (build plan §3.2: estimated = opening + imports − sales). Each reading carries
// its own opening, so liters are derived from the reading alone — the dispenser
// contributes only its fuel type.

export type SaleReading = {
  dispenserId: string
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
// A meter's field is null when its delta was not positive, so its cache stays put.
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
 * minus its own opening; only a positive delta counts as a sale, and only a
 * positive delta advances the dispenser cache — so a decreased or opening-less
 * reading leaves the baseline untouched for the next shift.
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

    let newElectronicReading: number | null = null
    if (reading.electronicReading !== null && reading.openingElectronicReading !== null) {
      const liters = reading.electronicReading - reading.openingElectronicReading
      if (liters > 0) {
        litersByFuel.set(dispenser.fuelType, (litersByFuel.get(dispenser.fuelType) ?? 0) + liters)
        newElectronicReading = reading.electronicReading
      }
    }

    let newMechanicalReading: number | null = null
    const mechClosing = reading.mechanicalReading ?? null
    const mechOpening = reading.openingMechanicalReading ?? null
    if (mechClosing !== null && mechOpening !== null && mechClosing - mechOpening > 0) {
      newMechanicalReading = mechClosing
    }

    if (newElectronicReading !== null || newMechanicalReading !== null) {
      advances.push({ dispenserId: dispenser.id, newElectronicReading, newMechanicalReading })
    }
  }

  const sales = [...litersByFuel.entries()].map(([fuelType, liters]) => ({ fuelType, liters }))
  return { sales, advances }
}
