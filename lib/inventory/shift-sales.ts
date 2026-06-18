// When a shift is completed, the liters dispensed (electronic meter delta per
// dispenser) become 'sale' movements that reduce estimated stock per fuel type
// (build plan §3.2: estimated = opening + imports − sales).

export type SaleReading = {
  dispenserId: string
  electronicReading: number | null
}

export type SaleDispenser = {
  id: string
  fuelType: string
  lastElectronicReading: number | null
}

export type FuelSale = { fuelType: string; liters: number }
export type DispenserAdvance = { dispenserId: string; newReading: number }

export type ShiftSalesResult = {
  sales: FuelSale[]
  advances: DispenserAdvance[]
}

/**
 * Computes liters sold per fuel type from a shift's readings, plus the new
 * "last reading" each dispenser should advance to. Only positive deltas count
 * as sales (a decrease is an anomaly handled elsewhere).
 */
export function computeShiftSales(
  readings: SaleReading[],
  dispensers: SaleDispenser[]
): ShiftSalesResult {
  const dispenserById = new Map(dispensers.map((d) => [d.id, d]))
  const litersByFuel = new Map<string, number>()
  const advances: DispenserAdvance[] = []

  for (const reading of readings) {
    if (reading.electronicReading === null) continue
    const dispenser = dispenserById.get(reading.dispenserId)
    if (!dispenser) continue

    if (dispenser.lastElectronicReading !== null) {
      const liters = reading.electronicReading - dispenser.lastElectronicReading
      if (liters > 0) {
        litersByFuel.set(dispenser.fuelType, (litersByFuel.get(dispenser.fuelType) ?? 0) + liters)
      }
    }
    advances.push({ dispenserId: dispenser.id, newReading: reading.electronicReading })
  }

  const sales = [...litersByFuel.entries()].map(([fuelType, liters]) => ({ fuelType, liters }))
  return { sales, advances }
}
