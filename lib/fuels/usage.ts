// What is holding a nhiên liệu. Every table below stores the khóa as a plain string —
// the danh mục is a catalogue, not a foreign key — so this is the only thing that knows
// a nhiên liệu is still in use. The counts go straight to decideFuelRemoval, which
// decides what they mean; nothing is decided here.
import { type FuelUsageCounts } from '@/lib/fuels/catalogue'
import { prisma } from '@/lib/prisma'

/** Counts every kind of row that would be orphaned by deleting `fuelType`. */
export async function countFuelUsage(fuelType: string): Promise<FuelUsageCounts> {
  const [
    fuelMaps,
    dispensers,
    kyDates,
    inventory,
    movements,
    openingBalances,
    imports,
    tankDips,
    debtVisits,
  ] = await Promise.all([
    prisma.misaFuelMap.count({ where: { fuelType } }),
    prisma.dispenser.count({ where: { fuelType } }),
    // Counted by ngày áp dụng rather than by row: a nhiên liệu bán một giá toàn quốc
    // writes both vùng on each kỳ, and kế toán keyed one kỳ, not two.
    prisma.misaRetailPrice.groupBy({ by: ['effectiveDate'], where: { fuelType } }),
    prisma.inventoryBalance.count({ where: { fuelType } }),
    // The ledger behind the tồn kho, counted apart from it: a trạm that stopped
    // carrying the nhiên liệu can have no balance row left and still have the nhập
    // and xuất that got it there.
    prisma.inventoryMovement.count({ where: { fuelType } }),
    prisma.inventoryOpeningBalance.count({ where: { fuelType } }),
    prisma.fuelImport.count({ where: { fuelType } }),
    prisma.tankDipRecord.count({ where: { fuelType } }),
    prisma.debtVehicleVisit.count({ where: { fuelType } }),
  ])

  return {
    fuelMaps,
    dispensers,
    prices: kyDates.length,
    inventory,
    movements,
    openingBalances,
    imports,
    tankDips,
    debtVisits,
  }
}
