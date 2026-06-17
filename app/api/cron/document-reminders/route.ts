import { type NextRequest, NextResponse } from 'next/server'

import { documentStatus, dueReminderThreshold } from '@/lib/documents/expiry-checker'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

/**
 * Daily cron: recomputes document status and surfaces those crossing the
 * 60/30/15-day reminder marks. Protect with `x-cron-secret: $CRON_SECRET`.
 */
export async function GET(req: NextRequest) {
  if (req.headers.get('x-cron-secret') !== (process.env.CRON_SECRET ?? '')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const documents = await prisma.stationDocument.findMany({ where: { expiryDate: { not: null } } })

  const reminders: { id: string; docName: string; daysLeft: number }[] = []
  for (const doc of documents) {
    const status = documentStatus(doc.expiryDate, now)
    if (status !== doc.status) {
      await prisma.stationDocument.update({ where: { id: doc.id }, data: { status } })
    }
    const due = dueReminderThreshold(doc.expiryDate, now)
    if (due !== null) {
      reminders.push({ id: doc.id, docName: doc.docName, daysLeft: due })
    }
  }

  // TODO: deliver reminders (Zalo OA / email) once channels are configured.
  logger.info({ checked: documents.length, reminders: reminders.length }, 'document-reminders cron')
  return NextResponse.json({ checked: documents.length, reminders })
}
