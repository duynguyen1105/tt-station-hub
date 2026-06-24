import { Skeleton } from '@/components/ui/skeleton'

/**
 * Skeleton for a station's tab content. The parent layout keeps the station header
 * and tab bar mounted, so switching tabs swaps only this content area — shown
 * instantly while the tab's data loads.
 */
export default function StationDetailLoading() {
  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 flex-1" />
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border">
        <div className="bg-muted/50 flex items-center gap-4 border-b px-3 py-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-3 flex-1" />
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, row) => (
          <div key={row} className="flex items-center gap-4 border-b px-3 py-3 last:border-0">
            {Array.from({ length: 4 }).map((_, col) => (
              <Skeleton key={col} className={col === 0 ? 'h-4 flex-1' : 'h-4 flex-1 opacity-70'} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
