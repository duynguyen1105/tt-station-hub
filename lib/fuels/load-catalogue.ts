// The danh mục as a server component reads it. One query, shared by everything that
// renders in a single request — the layout that hands it to the client side and every
// page and tab underneath it.
import { cache } from 'react'

import {
  type CatalogueFuel,
  type StationFuelMapping,
  fuelTypeLabelFrom,
  resolvePlateFuel,
  stationFuels,
} from '@/lib/fuels/catalogue'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

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

/**
 * What one trạm sells, in danh mục order — the danh mục narrowed to the nhiên liệu the
 * trạm has a Map nhiên liệu row for. Every fuel picker that sits inside a trạm reads
 * this rather than the whole danh mục, so a kế toán at Đăk Nông 1 is offered the three
 * nhiên liệu that trạm holds and not the company's whole list.
 *
 * Cached per request like `loadFuelCatalogue`, and keyed by trạm, so a page that both
 * renders a picker and validates a write pays for one query.
 */
export const loadStationFuels = cache(async (stationId: string): Promise<CatalogueFuel[]> => {
  const [catalogue, maps] = await Promise.all([
    loadFuelCatalogue(),
    prisma.misaFuelMap.findMany({ where: { stationId }, select: { fuelType: true } }),
  ])
  return stationFuels(
    catalogue,
    maps.map((map) => map.fuelType)
  )
})

/**
 * The refusal a route gives for a khóa the trạm does not sell, or null when it does —
 * the server-side half of the narrowing, so a payload naming a nhiên liệu no ô chọn
 * offered is turned away rather than written. It is the same rule the picker draws, and
 * it catches an unknown or ngừng khóa on the way through, because neither can be among
 * what a trạm sells.
 *
 * The refusal names the nhiên liệu by its tên where the danh mục knows one, and by the
 * bare khóa where it does not.
 */
export async function stationFuelRefusal(
  stationId: string,
  fuelType: string
): Promise<string | null> {
  const [sold, catalogue] = await Promise.all([loadStationFuels(stationId), loadFuelCatalogue()])
  return sold.some((fuel) => fuel.fuelType === fuelType)
    ? null
    : vi.misaSettings.notStationFuel(fuelTypeLabelFrom(catalogue, fuelType))
}

/**
 * One trạm's mã hàng, one row per nhiên liệu it sells — its Map nhiên liệu rows as the
 * plate resolver reads them. Separate from `loadStationFuels` because that one answers
 * what may be chosen and this one what a printed word means, and the second needs the
 * mã hàng the first has no use for.
 */
export const loadStationFuelMappings = cache(
  async (stationId: string): Promise<StationFuelMapping[]> =>
    prisma.misaFuelMap.findMany({
      where: { stationId },
      select: { fuelType: true, productCode: true },
    })
)

/**
 * What a fuel word printed on a trụ or hầm plate means at one trạm — the database half
 * of `resolvePlateFuel`, reading the danh mục and that trạm's mã hàng.
 *
 * The ingest pipeline calls this with the trạm the photo is FINALLY assigned to, after
 * a printed plate has had its chance to override the sender's trạm. Both queries are
 * cached per request, so the photos of one burst pay for them once.
 */
export async function resolveStationPlateFuel(
  stationId: string,
  word: string | null | undefined
): Promise<string | null> {
  if (!word) return null
  const [catalogue, mappings] = await Promise.all([
    loadFuelCatalogue(),
    loadStationFuelMappings(stationId),
  ])
  return resolvePlateFuel(catalogue, mappings, word)
}
