import { z } from 'zod'

import { type NextRequest } from 'next/server'

import { badRequest, forbidden, notFound, ok, unauthorized } from '@/lib/api/response'
import { writeAudit } from '@/lib/auth/audit'
import { hasRole } from '@/lib/auth/permissions'
import { getCurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { FuelArea } from '@/lib/generated/prisma/client'
import { UNKNOWN_STATION_CODE } from '@/lib/matching/station-label'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

const updateSchema = z
  .object({
    fuelArea: z.nativeEnum(FuelArea),
    code: z
      .string()
      .trim()
      .min(1)
      .transform((value) => value.toUpperCase()),
    name: z.string().trim().min(1),
    branch: z.string().trim().nullable(),
    address: z.string().trim().nullable(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0)

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (!hasRole(user.role, ['admin', 'accountant'])) return forbidden()
  const { id } = await params

  const parsed = updateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(undefined, parsed.error.flatten())
  if (user.role !== 'admin' && Object.keys(parsed.data).some((key) => key !== 'fuelArea'))
    return forbidden()
  if (parsed.data.code === UNKNOWN_STATION_CODE) return badRequest(vi.stations.reservedCode)

  const station = await prisma.station.findUnique({ where: { id } })
  if (!station) return notFound()
  if (!(await canReachStation(user, station.id))) return forbidden()

  let updated
  try {
    updated = await prisma.station.update({
      where: { id },
      data: parsed.data,
    })
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'P2002')
      return badRequest(vi.stations.duplicateCode)
    throw error
  }

  await writeAudit({
    userId: user.id,
    action: 'station.update',
    entity: 'station',
    entityId: id,
    metadata: {
      from: {
        fuelArea: station.fuelArea,
        code: station.code,
        name: station.name,
        branch: station.branch,
        address: station.address,
      },
      to: parsed.data,
    },
  })
  return ok(updated)
}
