type ImportStock = { stationId: string; fuelType: string; liters: number }

/** The only stock changes an edited import needs; its day and hầm affect the movement, not this total. */
export function importStockDeltas(before: ImportStock, after: ImportStock) {
  if (before.stationId === after.stationId && before.fuelType === after.fuelType) {
    const liters = Math.round((after.liters - before.liters) * 1000) / 1000
    return liters === 0 ? [] : [{ stationId: after.stationId, fuelType: after.fuelType, liters }]
  }
  return [
    { stationId: before.stationId, fuelType: before.fuelType, liters: -before.liters },
    { stationId: after.stationId, fuelType: after.fuelType, liters: after.liters },
  ]
}
