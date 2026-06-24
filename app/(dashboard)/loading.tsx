import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Instant navigation feedback: Next.js streams this skeleton the moment a link is
 * clicked, then swaps in the real page once its server data resolves. Shapes match
 * the common dashboard layout (heading → summary cards → table) so the transition
 * feels continuous rather than a blank freeze.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-7 w-56" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="relative overflow-hidden">
            <span className="bg-brass/40 absolute inset-x-0 top-0 h-1" />
            <CardHeader className="pt-5 pb-1">
              <Skeleton className="h-3 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border">
        <div className="bg-muted/50 flex items-center gap-4 border-b px-3 py-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-3 flex-1" />
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, row) => (
          <div key={row} className="flex items-center gap-4 border-b px-3 py-3 last:border-0">
            {Array.from({ length: 5 }).map((_, col) => (
              <Skeleton key={col} className={col === 0 ? 'h-4 flex-1' : 'h-4 flex-1 opacity-70'} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
