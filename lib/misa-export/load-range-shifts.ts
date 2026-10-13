import type { StationViewer } from '@/lib/auth/station-access'
import { reachableStationIds } from '@/lib/auth/station-guard'
import { misaRangeSelection } from '@/lib/misa-export/report-selection'
import { prisma } from '@/lib/prisma'

/**
 * The ca a Xuất MISA theo kỳ request covers (`?from&to&station=<id,id>`), trạm by trạm
 * in mã order and each trạm's ca by ngày bán — the order every file of the khoảng lists
 * them in — with the trạm they belong to and the stem of the files' names.
 *
 * Null when the khoảng is missing an end or names no real ngày. Trạm outside the viewer's
 * reach are dropped like everywhere else on Báo cáo MISA, never answered with.
 */
export async function loadRangeShifts(searchParams: URLSearchParams, viewer: StationViewer) {
  const selection = misaRangeSelection(
    {
      from: searchParams.get('from') ?? undefined,
      to: searchParams.get('to') ?? undefined,
      station: searchParams.get('station') ?? undefined,
    },
    await reachableStationIds(viewer)
  )
  if (selection === null) return null

  const shifts = await prisma.shift.findMany({
    where: selection.where,
    orderBy: selection.orderBy,
  })
  const stations = await prisma.station.findMany({
    where: { id: { in: [...new Set(shifts.map((s) => s.stationId))] } },
    select: { id: true, code: true, fuelArea: true },
  })
  const codeById = new Map(stations.map((s) => [s.id, s.code]))
  const codeOf = (stationId: string) => codeById.get(stationId) ?? stationId
  // Stable: each trạm's ca keep the ngày order the query gave them.
  const ordered = [...shifts].sort((a, b) => codeOf(a.stationId).localeCompare(codeOf(b.stationId)))

  // One trạm picked names the files after it; several, or all, leave the name to the khoảng.
  const onlyStation =
    selection.stations.length === 1 ? (codeById.get(selection.stations[0] ?? '') ?? null) : null
  const fileStem = `${onlyStation ? `${onlyStation}-` : ''}${selection.from}_${selection.to}`

  return {
    shifts: ordered.map((shift) => ({ shift, stationCode: codeOf(shift.stationId) })),
    stations,
    fileStem,
  }
}
