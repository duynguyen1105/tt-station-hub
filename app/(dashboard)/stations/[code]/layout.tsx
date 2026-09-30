import { StationInfoForm } from '@/components/stations/station-info-form'
import { StationTabs } from '@/components/stations/station-tabs'
import { Badge } from '@/components/ui/badge'
import { loadStationBySlug, requireStationAccess } from '@/lib/auth/station-guard'
import { vi } from '@/messages/vi'

export default async function StationLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const station = await loadStationBySlug(code)
  const user = await requireStationAccess(station.id)

  return (
    <div className="space-y-4">
      <header>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">{station.code}</h1>
          <Badge variant="secondary">{vi.fuelArea[station.fuelArea]}</Badge>
          {user.role === 'admin' && <StationInfoForm station={station} />}
        </div>
        <p className="text-muted-foreground text-sm">
          {[station.name, station.branch, station.address].filter(Boolean).join(' · ')}
        </p>
      </header>
      <StationTabs stationCode={station.code} />
      <div>{children}</div>
    </div>
  )
}
