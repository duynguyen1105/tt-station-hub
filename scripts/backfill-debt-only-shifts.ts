import 'dotenv/config'

import { type DebtDay, debtDaysMissingShift } from '@/lib/debts/debt-only-shifts'
import { formatDate } from '@/lib/format'
import { UNKNOWN_STATION_CODE } from '@/lib/matching/station-label'
import { findOrCreateShift } from '@/lib/photos/ingest'
import { prisma } from '@/lib/prisma'

// One-off, idempotent backfill for issue 02 (mỗi ngày có công nợ đều có ca):
// gives every (trạm, ngày GMT+7) that holds lượt xe công nợ the ca row it is
// missing, so those lượt xe stop being invisible. Until a công nợ photo opens the
// day's ca on its own, only a shift-route photo ever created one — so a day the
// trạm sent nothing but công nợ photos has no page for its duyệt'd lượt xe to
// appear on. The charge was always real; only the ca was absent.
//
//   pnpm tsx scripts/backfill-debt-only-shifts.ts
//
// No lượt xe is touched. A lượt xe carries no ca id — it is read into a ca by
// trạm and by its thời điểm falling inside that ca's GMT+7 day — so creating the
// ca row is the whole fix: no re-duyệt, no re-import, no ledger write.
//
// Unlike its sibling scripts this one is NOT self-contained: the ca must be born
// through the same `findOrCreateShift` the photo intake uses, so that it carries
// the same key, ngày, loại ca and trạng thái as a ca born from a photo — and that
// routine writes through the app's own Prisma client, which this script therefore
// reads through too rather than opening a second one.
//
// Safe to re-run: a day that already has a ca — of any loại — is reported as
// skipped and nothing is created for it, with `findOrCreateShift`'s (trạm, ngày,
// loại ca) unique constraint as the backstop underneath.
//
// Accepted cost (decided in the spec): an old công nợ-only day comes back as a ca
// that is đang thu ảnh and cannot be chốt'd until someone types its số liệu trụ
// bơm in by hand. That is the correct state for it — the day was never closed.

async function main() {
  const [visits, shifts, stations] = await Promise.all([
    // A từ chối'd lượt xe was decided against and leaves the duyệt queue for good,
    // so no ca will ever show it and a day holding only those needs none. Every
    // other trạng thái can still be duyệt'd, and then it needs its ca to land in.
    prisma.debtVehicleVisit.findMany({
      where: { reviewStatus: { not: 'rejected' } },
      select: { stationId: true, visitDate: true },
    }),
    // Any loại ca counts as the day having one: the Bán nợ trong ca list keys on
    // trạm + ngày alone, so a legacy morning ca already shows the day's lượt xe —
    // and adding a second, full-day ca beside it would list the same bán nợ twice.
    prisma.shift.findMany({ select: { stationId: true, shiftDate: true } }),
    prisma.station.findMany({ select: { id: true, code: true } }),
  ])

  const codeOf = new Map(stations.map((s) => [s.id, s.code]))

  /** The trạm as the reader knows it from the page; its uuid if it has gone missing. */
  function stationCode(stationId: string): string {
    return codeOf.get(stationId) ?? stationId
  }

  // Lượt xe parked on the UNKNOWN holding station belong to no trạm yet, so no ca
  // would make them visible; the review card's station dropdown is where they are
  // resolved, and once resolved they land on a real trạm's day.
  const parked = visits.filter((v) => stationCode(v.stationId) === UNKNOWN_STATION_CODE)
  const placed = visits.filter((v) => stationCode(v.stationId) !== UNKNOWN_STATION_CODE)

  const { missing, skipped } = debtDaysMissingShift(placed, shifts)

  // Printed (and created) in the order the reader knows their trạm by — the code
  // on the page, not the uuid the grouping is keyed on.
  function byStationCode(a: DebtDay, b: DebtDay): number {
    return (
      stationCode(a.stationId).localeCompare(stationCode(b.stationId)) ||
      a.shiftDate.getTime() - b.shiftDate.getTime()
    )
  }
  missing.sort(byStationCode)
  skipped.sort(byStationCode)

  for (const day of skipped) {
    console.log(
      `SKIP    ${stationCode(day.stationId)}  ${formatDate(day.shiftDate)}  ` +
        `${day.visitCount} lượt xe  — ca đã có`
    )
  }

  for (const day of missing) {
    const shift = await findOrCreateShift(day.stationId, day.firstVisitDate.getTime())
    console.log(
      `CREATED ${stationCode(day.stationId)}  ${formatDate(day.shiftDate)}  ` +
        `${day.visitCount} lượt xe  → ca ${shift.id}`
    )
  }

  console.log(
    `\n${missing.length} ca created, ${skipped.length} days already had one` +
      (parked.length > 0
        ? `, ${parked.length} lượt xe left on ${UNKNOWN_STATION_CODE} (assign a trạm in duyệt công nợ first).`
        : '.')
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
