import { z } from 'zod'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { type ShiftStatus, canReviewShift } from '@/lib/auth/reading-policy'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { CONFIRM_REQUIRED_ANOMALIES, hasMissingOpening } from '@/lib/matching/anomaly-detection'
import { prisma } from '@/lib/prisma'
import { propagateApprovedClosing } from '@/lib/shifts/opening-reading'
import { anomalyLabel } from '@/lib/ui/status'
import { vi } from '@/messages/vi'

// The body is optional: a plain Duyệt sends none; one past a confirm-gated anomaly
// says so.
const approveSchema = z.object({ confirm: z.boolean().optional() })

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id } = await params

  const parsed = approveSchema.safeParse((await req.json().catch(() => null)) ?? {})
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())

  const reading = await prisma.shiftReading.findUnique({ where: { id } })
  if (!reading) return notFound()
  const shift = await prisma.shift.findUnique({ where: { id: reading.shiftId } })
  if (!shift) return notFound()
  // The ca's own trạm decides, not the queue the row was reached from.
  if (!(await canReachStation(user, shift.stationId))) return forbidden()
  if (!canReviewShift(user.role, shift.status as ShiftStatus)) return forbidden()

  // A meter with a closing reading but no opening books zero liters. Hard-block
  // approval until the accountant enters it — the number is on the pump and in
  // the paper book, so there is no legitimate confirm-anyway path.
  if (hasMissingOpening(reading)) return badRequest(vi.errors.missingOpening)

  // A meter that went backwards, two meters that disagree, a number with no photo
  // behind it, a decimal point the system guessed: each may be a misread the photo
  // would show, so the kế toán duyệts past them only by saying they checked.
  const blocking = reading.anomalyReasons.filter((r) => CONFIRM_REQUIRED_ANOMALIES.includes(r))
  if (blocking.length > 0 && parsed.data.confirm !== true) {
    return badRequest(vi.errors.confirmAnomalies(blocking.map(anomalyLabel)), {
      code: 'confirm_required',
      anomalies: blocking,
    })
  }

  const updated = await prisma.shiftReading.update({
    where: { id },
    data: { reviewStatus: 'approved', reviewedBy: user.id, reviewedAt: new Date() },
  })
  await writeAudit({
    userId: user.id,
    action: 'reading.approve',
    entity: 'shift_reading',
    entityId: id,
    metadata: blocking.length > 0 ? { confirmedAnomalies: blocking } : undefined,
  })
  // This closing is now what the next ngày opens from: refresh the trụ's cache and
  // any later ngày whose photos landed while this ca was still chờ duyệt.
  const dispenser = await prisma.dispenser.findUnique({
    where: { id: reading.dispenserId },
    select: { id: true, hasElectronicMeter: true, hasMechanicalMeter: true },
  })
  if (dispenser) await propagateApprovedClosing(dispenser, reading.shiftId)
  return ok(updated)
}
