import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

import { PrismaClient } from '../lib/generated/prisma/client'
import { submitterKey } from '../lib/matching/submitter'
import {
  DEBT_PAIR_WINDOW_MS,
  type VisitPhoto,
  pairVisitPhotos,
} from '../lib/matching/visit-pairing'
import { resolveVisitStation } from '../lib/matching/visit-station'

// One-off repair for the debt visits that pairing has already split in two: one
// card holding the money with no plate, another holding the plate with no money,
// attributed to two different stations, neither approvable as it stands. Where
// both halves survive they are merged; where only the vehicle half is left, its
// pump photo was already swept into shift closing before the sweep was frozen —
// that is reported for a human to judge rather than guessed at.
//
// Run deliberately, by hand, ONCE — AFTER the pairing fix is deployed and BEFORE
// the review area is opened again, or it races the thing it repairs. It is wired
// into no page render and no webhook.
//
//   pnpm tsx scripts/repair-split-debt-visits.ts            # rehearsal, no writes
//   pnpm tsx scripts/repair-split-debt-visits.ts --apply    # writes
//
// Self-contained (no `@/` alias), mirroring the other scripts. Both decisions it
// makes are the shipped ones, imported rather than restated: pairVisitPhotos says
// which halves are one fill, resolveVisitStation says which station the merged
// visit keeps. See docs/adr/0001-pair-debt-photos-by-submitter.md.
//
// Safe to re-run: a merged visit holds both photos and so is no longer a
// candidate. Reversing an already-swept photo is deliberately not attempted —
// undoing a shift reading touches sales figures that may already be closed or
// exported, which is a judgement call and not a mechanical one.

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' })
const prisma = new PrismaClient({ adapter })

/** One surviving half of a split fill: the visit, and the single photo it holds. */
type Half = {
  visitId: string
  photoId: string
  kind: 'vehicle' | 'debt_meter'
  submitter: string | null
  receivedAt: number
}

const HCM = 'Asia/Ho_Chi_Minh'

/** "YYYY-MM-DD HH:MM" in station-local time. */
function when(date: Date): string {
  return date.toLocaleString('sv-SE', { timeZone: HCM }).slice(0, 16)
}

function day(date: Date): string {
  return date.toLocaleString('sv-SE', { timeZone: HCM }).slice(0, 10)
}

function short(id: string): string {
  return id.slice(0, 8)
}

async function main() {
  const apply = process.argv.includes('--apply')

  // Every debt visit holding exactly one photo — the whole population the ticket
  // measures, fetched in one query and split below by what may be done with it.
  const singlePhotoVisits = await prisma.debtVehicleVisit.findMany({
    where: {
      OR: [
        { vehiclePhotoId: null, meterPhotoId: { not: null } },
        { meterPhotoId: null, vehiclePhotoId: { not: null } },
      ],
    },
    orderBy: { visitDate: 'asc' },
  })

  // Approval is what posts the charge, so an approved half is the one thing a
  // merge could double-count: it is named, never touched. Rejected halves ARE
  // candidates — rejecting is what a reviewer does with a half-record they cannot
  // approve, so excluding them would make this repair a no-op against most of the
  // backlog it exists for.
  const approvedHalves = singlePhotoVisits.filter((v) => v.reviewStatus === 'approved')
  const visits = singlePhotoVisits.filter((v) => v.reviewStatus !== 'approved')
  const visitById = new Map(visits.map((v) => [v.id, v]))

  const photos = await prisma.shiftPhoto.findMany({
    where: { id: { in: visits.map((v) => (v.vehiclePhotoId ?? v.meterPhotoId)!) } },
    select: {
      id: true,
      source: true,
      zaloSenderUserId: true,
      zaloReceivedAt: true,
      createdAt: true,
    },
  })
  const photoById = new Map(photos.map((p) => [p.id, p]))

  // The submitter is derived from the photo the visit references, never from the
  // submitted_by column the pairing fix added — that column is not backfilled,
  // which is exactly why these rows need repairing. A web upload records no
  // uploader on the photo, so its submitter cannot be derived: it stays null and
  // pairs with nothing, because an absent submitter must never match another
  // absent submitter.
  const halves: Half[] = visits.map((visit) => {
    const photoId = (visit.vehiclePhotoId ?? visit.meterPhotoId)!
    const photo = photoById.get(photoId)
    return {
      visitId: visit.id,
      photoId,
      kind: visit.vehiclePhotoId ? 'vehicle' : 'debt_meter',
      submitter: photo?.source === 'zalo' ? submitterKey('zalo', photo.zaloSenderUserId) : null,
      receivedAt: (photo?.zaloReceivedAt ?? photo?.createdAt ?? visit.visitDate).getTime(),
    }
  })
  const halfByPhotoId = new Map(halves.map((h) => [h.photoId, h]))

  // Group by submitter first, then pair within each group — same submitter,
  // within the window, opposite halves.
  const bySubmitter = new Map<string, VisitPhoto[]>()
  const unpaired: Half[] = []
  for (const half of halves) {
    if (!half.submitter) {
      unpaired.push(half)
      continue
    }
    const group = bySubmitter.get(half.submitter) ?? []
    group.push({ id: half.photoId, kind: half.kind, receivedAt: half.receivedAt })
    bySubmitter.set(half.submitter, group)
  }

  const merges: { meter: Half; vehicle: Half }[] = []
  for (const group of bySubmitter.values()) {
    for (const pair of pairVisitPhotos(group, DEBT_PAIR_WINDOW_MS)) {
      const vehicle = pair.vehiclePhotoId ? halfByPhotoId.get(pair.vehiclePhotoId) : undefined
      const meter = pair.meterPhotoId ? halfByPhotoId.get(pair.meterPhotoId) : undefined
      if (vehicle && meter) merges.push({ meter, vehicle })
      else unpaired.push((vehicle ?? meter)!)
    }
  }

  const stations = await prisma.station.findMany({ select: { id: true, code: true } })
  const codeOf = (id: string) => stations.find((s) => s.id === id)?.code ?? '?'
  const unknownStationId = stations.find((s) => s.code === 'UNKNOWN')?.id ?? ''

  console.log(
    apply
      ? 'Repairing split debt visits — WRITING.'
      : 'Repairing split debt visits — REHEARSAL, no writes. Re-run with --apply to write.'
  )
  console.log(`Scanned ${visits.length} debt visits holding exactly one photo.\n`)
  console.log(`Recovered ${merges.length} split pairs into one visit each:`)

  for (const { meter, vehicle } of merges) {
    const meterVisit = visitById.get(meter.visitId)!
    const vehicleVisit = visitById.get(vehicle.visitId)!

    // Which station the merged visit keeps, decided by the shipped rule. The
    // meter half's station is already the pump plate's conclusion wherever the
    // plate named one — that disagreement is precisely what split the pair — and
    // where it named none both halves inherited the same station anyway, so the
    // answer is the same either way. The rule still refuses to move the visit
    // onto the unknown station.
    const stationId = resolveVisitStation({
      visitStationId: vehicleVisit.stationId,
      photoStationId: meterVisit.stationId,
      stationFromPumpPlate: true,
      unknownStationId,
    })
    // The meter half is the row that survives: it carries the money, the AI read
    // behind it and the review state derived from that read. Nothing from the
    // vehicle half is dropped — its photo, plate and any customer it had already
    // matched move across, and the pair keeps the time of whichever half arrived
    // first, which is the row the arrival path would itself have kept.
    // A half a reviewer rejected was rejected for being unapprovable as it stood —
    // a plate with no money against it, or money with no plate. Repairing it
    // answers that objection, so the recovered fill goes back to the reviewer
    // instead of staying written off: the debt review page lists only pending and
    // needs_review, so leaving it rejected would recover the row into a place no
    // accountant ever looks. It returns as needs_review, never as approved —
    // approval is what posts the charge, and that stays a human's decision.
    const reviewStatus =
      meterVisit.reviewStatus === 'rejected' || vehicleVisit.reviewStatus === 'rejected'
        ? 'needs_review'
        : meterVisit.reviewStatus
    const data = {
      reviewStatus,
      stationId,
      visitDate:
        vehicleVisit.visitDate < meterVisit.visitDate
          ? vehicleVisit.visitDate
          : meterVisit.visitDate,
      vehiclePhotoId: vehicleVisit.vehiclePhotoId,
      plateRead: meterVisit.plateRead ?? vehicleVisit.plateRead,
      plateConfirmed: meterVisit.plateConfirmed ?? vehicleVisit.plateConfirmed,
      customerId: meterVisit.customerId ?? vehicleVisit.customerId,
      zaloCaption: meterVisit.zaloCaption ?? vehicleVisit.zaloCaption,
    }

    if (apply) {
      await prisma.$transaction([
        prisma.debtVehicleVisit.delete({ where: { id: vehicleVisit.id } }),
        prisma.debtVehicleVisit.update({ where: { id: meterVisit.id }, data }),
      ])
    }

    const amount = meterVisit.computedAmount ?? meterVisit.displayedAmount
    const moved =
      vehicleVisit.stationId === stationId
        ? ''
        : ` (plate half was on ${codeOf(vehicleVisit.stationId)})`
    console.log(
      `  ${when(data.visitDate)}  ${codeOf(stationId)}  ` +
        `plate ${data.plateConfirmed ?? data.plateRead ?? '—'}  amount ${amount?.toString() ?? '—'}  ` +
        `[${meterVisit.reviewStatus === reviewStatus ? reviewStatus : `${meterVisit.reviewStatus} → ${reviewStatus}`}]  ` +
        `kept ${short(meterVisit.id)}, absorbed ${short(vehicleVisit.id)}${moved}`
    )
  }

  // A vehicle half with no partner is the fingerprint of a debt that is gone: its
  // pump photo was swept into shift closing before the sweep was frozen, taking
  // the amount owed with it. Reported, not touched.
  const strandedVehicles = unpaired.filter((h) => h.kind === 'vehicle')
  console.log(
    `\nNot recovered — ${strandedVehicles.length} vehicle-photo-only visits. Their pump photo was ` +
      `already swept into\nshift closing, so the amount owed is no longer in the record. These need a human decision:`
  )
  for (const half of strandedVehicles) {
    const visit = visitById.get(half.visitId)!
    console.log(
      `  ${when(visit.visitDate)}  ${codeOf(visit.stationId)}  ` +
        `plate ${visit.plateConfirmed ?? visit.plateRead ?? '—'}  ` +
        `[${visit.reviewStatus}]  visit ${short(visit.id)}`
    )
  }

  // A meter half with no partner still holds its amount and stays in the debt
  // queue. It is missing a plate, not a repair.
  const strandedMeters = unpaired.filter((h) => h.kind === 'debt_meter')
  console.log(
    `\nNot recovered — ${strandedMeters.length} pump-photo-only visits with no vehicle photo to pair. ` +
      `They keep their\namount and stay in the debt queue:`
  )
  for (const half of strandedMeters) {
    const visit = visitById.get(half.visitId)!
    const amount = visit.computedAmount ?? visit.displayedAmount
    console.log(
      `  ${when(visit.visitDate)}  ${codeOf(visit.stationId)}  ` +
        `amount ${amount?.toString() ?? '—'}  [${visit.reviewStatus}]  visit ${short(visit.id)}`
    )
  }

  if (approvedHalves.length) {
    console.log(
      `\nLeft alone — ${approvedHalves.length} half-records a reviewer already approved. Approval ` +
        `posts the\ncharge, so merging one could double-count it. Judge these by hand:`
    )
    for (const visit of approvedHalves) {
      console.log(
        `  ${when(visit.visitDate)}  ${codeOf(visit.stationId)}  visit ${short(visit.id)}`
      )
    }
  }

  // The measure of whether pairing is actually fixed: after this repair the
  // single-photo count per day should fall to approximately zero. If it does not,
  // either pairing is still splitting or lone photos are arriving for a reason
  // nobody has identified yet. Every half left holding one photo counts, including
  // the approved ones this repair declines to touch.
  const perDay = new Map<string, number>()
  const stillSingle = [
    ...unpaired.map((half) => visitById.get(half.visitId)!.visitDate),
    ...approvedHalves.map((visit) => visit.visitDate),
  ]
  for (const date of stillSingle.map(day)) perDay.set(date, (perDay.get(date) ?? 0) + 1)
  console.log('\nSingle-photo visits still unpaired, per day (GMT+7):')
  for (const [date, count] of [...perDay].sort()) console.log(`  ${date}  ${count}`)

  console.log(
    apply
      ? `\nDone. ${merges.length} fills recovered, ${unpaired.length} half-records left for a human.`
      : `\nRehearsal only — nothing was written. ${merges.length} fills would be recovered.`
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
