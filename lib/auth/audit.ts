import { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'

/** Records a mutation in the audit log. Every API mutation should call this. */
export async function writeAudit(params: {
  userId?: string | null
  action: string
  entity?: string
  entityId?: string
  metadata?: unknown
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: params.userId ?? null,
      action: params.action,
      entity: params.entity ?? null,
      entityId: params.entityId ?? null,
      metadata: (params.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    },
  })
}
