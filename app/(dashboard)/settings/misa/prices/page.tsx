import { RetailPriceForm } from '@/components/misa-export/retail-price-form'
import { VungSelect } from '@/components/misa-export/vung-select'
import { Badge } from '@/components/ui/badge'
import { formatDate, formatVND } from '@/lib/format'
import { Vung } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { fuelTypeLabel } from '@/lib/ui/status'
import { vi } from '@/messages/vi'

export default async function MisaPricesPage({
  searchParams,
}: {
  searchParams: Promise<{ vung?: string }>
}) {
  const { vung: vungParam } = await searchParams
  const vung = vungParam === Vung.VUNG_2 ? Vung.VUNG_2 : Vung.VUNG_1

  const prices = await prisma.misaRetailPrice.findMany({
    where: { vung },
    orderBy: [{ fuelType: 'asc' }, { effectiveDate: 'desc' }],
  })

  // Prices are ordered effectiveDate-desc within each fuel, so the first row seen
  // for a fuel is its current (latest-effective) price.
  const seen = new Set<string>()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <VungSelect value={vung} />
        <RetailPriceForm vung={vung} />
      </div>

      {prices.length === 0 ? (
        <p className="text-muted-foreground text-sm">{vi.misaSettings.noPrices}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left">
              <th className="p-2">{vi.misaSettings.fuel}</th>
              <th className="p-2">{vi.misaSettings.effectiveDate}</th>
              <th className="p-2 text-right">{vi.misaSettings.unitPrice}</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {prices.map((price) => {
              const isCurrent = !seen.has(price.fuelType)
              seen.add(price.fuelType)
              return (
                <tr key={price.id} className="border-b">
                  <td className="p-2">{fuelTypeLabel(price.fuelType)}</td>
                  <td className="p-2">{formatDate(price.effectiveDate)}</td>
                  <td className="readout p-2 text-right">{formatVND(Number(price.unitPrice))}</td>
                  <td className="p-2">
                    {isCurrent && <Badge variant="secondary">{vi.misaSettings.current}</Badge>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
