import { UploadBoard } from '@/components/upload/upload-board'
import { requireRole } from '@/lib/auth/session'
import { reachableStationIds } from '@/lib/auth/station-guard'
import { todayKey } from '@/lib/debts/load-ledger'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

export default async function UploadPage() {
  const user = await requireRole(['admin', 'accountant'])
  const ids = await reachableStationIds(user)
  const stations = await prisma.station.findMany({
    where: { isActive: true, id: { in: ids } },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true },
  })

  return (
    <div className="space-y-4">
      <div>
        <p className="label-micro">{vi.upload.subtitle}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{vi.upload.title}</h1>
      </div>
      <UploadBoard stations={stations} today={todayKey()} />
    </div>
  )
}
