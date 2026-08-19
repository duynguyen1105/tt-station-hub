// The danh mục as a server component reads it. One query, shared by everything that
// renders in a single request — the layout that hands it to the client side and every
// page and tab underneath it.
import { cache } from 'react'

import { type CatalogueFuel, fuelTypeLabelFrom } from '@/lib/fuels/catalogue'
import { prisma } from '@/lib/prisma'

/**
 * Every nhiên liệu in the danh mục, oldest first — the order it was seeded in, so a
 * nhiên liệu added today comes last.
 *
 * Nhiên liệu đã ngừng are here too: this is what labels are resolved against, and a
 * ca, phiếu nhập or công nợ row from before Trường Thịnh stopped selling one must
 * still read its tên. Callers that offer a choice rather than read a label — the ô
 * chọn — narrow this through `selectableFuels`.
 *
 * Wrapped in React `cache()` so the danh mục is read once per request no matter how
 * many components ask for it, the way `getCurrentUser` already does for the profile.
 * Everything server-side asks here — a page, a route handler, a module the export
 * builds on — and only the client side goes through the provider.
 */
export const loadFuelCatalogue = cache(
  async (): Promise<CatalogueFuel[]> =>
    prisma.fuel.findMany({
      orderBy: { createdAt: 'asc' },
      select: { fuelType: true, name: true, areaIndependent: true, isActive: true },
    })
)

/**
 * The label helper as a server component, page or route handler calls it — the twin of
 * `useFuelTypeLabel` on the client side, reading the same danh mục through the loader
 * above rather than through the provider. Awaited once at the top of a render, then
 * called for each khóa the screen shows.
 */
export async function fuelTypeLabeller(): Promise<(fuelType: string) => string> {
  const catalogue = await loadFuelCatalogue()
  return (fuelType: string) => fuelTypeLabelFrom(catalogue, fuelType)
}
