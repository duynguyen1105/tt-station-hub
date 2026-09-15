import { FuelArea } from '@/lib/generated/prisma/client'
import { type RetailPrice } from '@/lib/misa-export/build-sales-voucher'
import { prisma } from '@/lib/prisma'

/** Every giá bán lẻ row of a vùng — prices are set per vùng, not per trạm. */
export async function loadAreaPrices(fuelArea: FuelArea): Promise<RetailPrice[]> {
  const rows = await prisma.misaRetailPrice.findMany({ where: { fuelArea } })
  return rows.map((p) => ({
    fuelType: p.fuelType,
    effectiveDate: p.effectiveDate,
    unitPrice: p.unitPrice.toNumber(),
  }))
}

/** The bảng giá of the vùng a trạm sits in (the UNKNOWN trạm falls back to Vùng 1). */
export async function loadStationPrices(stationId: string): Promise<RetailPrice[]> {
  const station = await prisma.station.findUnique({
    where: { id: stationId },
    select: { fuelArea: true },
  })
  return loadAreaPrices(station?.fuelArea ?? FuelArea.FUEL_AREA_1)
}
