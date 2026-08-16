import Link from 'next/link'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireUser } from '@/lib/auth/session'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

export default async function StationsPage() {
  await requireUser()
  const stations = await prisma.station.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
  })

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{vi.stations.listTitle}</h1>
      {stations.length === 0 ? (
        <p className="text-muted-foreground text-sm">{vi.stations.empty}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stations.map((station) => (
            <Link key={station.id} href={`/stations/${station.id}`}>
              <Card className="hover:border-primary/50 transition-colors">
                <CardHeader>
                  <CardTitle className="text-base">{station.name}</CardTitle>
                  <p className="text-muted-foreground text-xs">{station.code}</p>
                </CardHeader>
                <CardContent className="text-muted-foreground text-sm">
                  {[station.branch, station.address].filter(Boolean).join(' · ') || '—'}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
