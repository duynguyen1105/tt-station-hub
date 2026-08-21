import type { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * What the Lịch sử nhập hàng bộ lọc offers, and what the URL is narrowed against.
 *
 * Read off the phiếu nhập themselves rather than off the trạm's cấu hình, which is the
 * opposite of what the Đo bồn bộ lọc does — and deliberately. A hầm is only ever a
 * `tankCode` string on the rows that mention it, and a phiếu nhập may carry a mã hầm typed
 * by hand ("Hầm khác...") that no trụ and no đo hầm knows about; a nhiên liệu may be one
 * the trạm has since stopped selling; a người nhập may be a quản trị viên, or a kế toán
 * moved to another trạm, and so in no `station_accountants` row today. Offering the trạm's
 * cấu hình would hide every one of those, while offering what the slips actually say
 * guarantees the other half too: every option on the menu matches at least one row.
 */
export type ImportFilterOptions = {
  /** Mã hầm seen on this trạm's phiếu nhập, sorted. */
  tanks: string[]
  /** Khóa nhiên liệu seen on this trạm's phiếu nhập, sorted. */
  fuels: string[]
  /** Whoever recorded one, by tên — a phiếu nhập with no người nhập contributes none. */
  creators: { id: string; name: string }[]
}

/**
 * The three lists, from the phiếu nhập of whatever trạm are in scope.
 *
 * `stationId` is the whole where-input field rather than a `string`, for the same reason
 * `importSelection` takes it that way: the tab hands in one trạm by its route, while the
 * Xuất Excel route falls back to every trạm the viewer can reach. Access is decided by the
 * caller, before this is reached.
 *
 * `created_by` is nullable, so the ids are sifted before the tên are looked up. A người
 * nhập whose hồ sơ has since gone is dropped rather than listed unnamed: an option nobody
 * can read is an option nobody can pick.
 */
export async function loadImportFilterOptions(
  stationId: Prisma.FuelImportWhereInput['stationId']
): Promise<ImportFilterOptions> {
  const [tankRows, fuelRows, creatorRows] = await Promise.all([
    prisma.fuelImport.findMany({
      where: { stationId },
      select: { tankCode: true },
      distinct: ['tankCode'],
    }),
    prisma.fuelImport.findMany({
      where: { stationId },
      select: { fuelType: true },
      distinct: ['fuelType'],
    }),
    prisma.fuelImport.findMany({
      where: { stationId, createdBy: { not: null } },
      select: { createdBy: true },
      distinct: ['createdBy'],
    }),
  ])
  const creatorIds = creatorRows.map((row) => row.createdBy).filter((id): id is string => !!id)
  const profiles =
    creatorIds.length > 0
      ? await prisma.profile.findMany({
          where: { id: { in: creatorIds } },
          select: { id: true, fullName: true },
          orderBy: { fullName: 'asc' },
        })
      : []
  return {
    tanks: tankRows.map((row) => row.tankCode).sort(),
    fuels: fuelRows.map((row) => row.fuelType).sort(),
    creators: profiles.map((profile) => ({ id: profile.id, name: profile.fullName })),
  }
}
