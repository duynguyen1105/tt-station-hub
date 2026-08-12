import {
  type StationIdentity,
  type StationOnPaper,
  stationOnPaper,
} from '@/lib/imports/station-on-paper'
import { STATION_ROSTERS, rosterForStation } from '@/lib/imports/station-rosters'
import { prisma } from '@/lib/prisma'

/**
 * Places the station header the AI read against the Trạm the import is being
 * made into (ADR 0006). The thin database half of `stationOnPaper`: it decides
 * nothing itself, it only says who the app knows about.
 *
 * The Trạm to compare against are the active stations plus the codes printed on
 * the 13 biên bản chuẩn, so a form belonging to a Trạm nobody has configured is
 * still recognised as not ours.
 */
export async function checkStationOnPaper(
  stationId: string,
  paperLabel: string | null | undefined
): Promise<StationOnPaper> {
  if (!paperLabel?.trim()) return { verdict: 'unknown' }

  const stations = await prisma.station.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true },
  })
  const current = stations.find((station) => station.id === stationId)
  // Nothing to compare against. The receipts route rejects an unknown Trạm on
  // its own account; refusing here as well would be guessing at the reason.
  if (!current) return { verdict: 'unknown' }

  const others: StationIdentity[] = stations
    .filter((station) => station.id !== stationId)
    .map((station) => ({ code: station.code, name: station.name }))

  // The printed codes are added only when this Trạm is among them. A Trạm whose
  // database code is not a code any form prints — `BBGIAONHANXD_DAKNONG4.docx`
  // prints `DAKNONGVK`, so the two could diverge — cannot be told apart from a
  // Trạm the forms call something else, and refusing its own biên bản would be
  // far worse than missing one belonging to a Trạm nobody has configured.
  // Paper-only Trạm carry no name; `stationOnPaper` reports `paperName: null`.
  if (rosterForStation(current.code)) {
    for (const roster of STATION_ROSTERS) {
      others.push({ code: roster.stationCode, name: '' })
    }
  }

  return stationOnPaper(paperLabel, { code: current.code, name: current.name }, others)
}
