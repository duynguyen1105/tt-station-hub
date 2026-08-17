import { notFound } from 'next/navigation'

import { StationTabs } from '@/components/stations/station-tabs'
import { Badge } from '@/components/ui/badge'
import { requireStationAccess } from '@/lib/auth/station-guard'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

export default async function StationLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  await requireStationAccess(id)
  const station = await prisma.station.findUnique({ where: { id } })
  if (!station) notFound()

  return (
    <div className="space-y-4">
      <header>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">{station.name}</h1>
          <Badge variant="secondary">{vi.fuelArea[station.fuelArea]}</Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          {[station.branch, station.address].filter(Boolean).join(' · ') || station.code}
        </p>
      </header>
      <StationTabs stationId={id} />
      <div>{children}</div>
    </div>
  )
}
