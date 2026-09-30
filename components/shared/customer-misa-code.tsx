import { StatusBadge } from '@/components/shared/status-badge'
import { vi } from '@/messages/vi'

/**
 * A khách hàng as the ca's phiếu chốt names them: by mã MISA. A khách not given one
 * yet reads by tên, muted and flagged, so the row is still known and the gap is seen.
 */
export function CustomerMisaCode({ misaCode, name }: { misaCode: string | null; name: string }) {
  if (misaCode) return <span className="font-mono">{misaCode}</span>
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="text-muted-foreground truncate">{name}</span>
      <StatusBadge label={vi.shifts.noMisaCode} tone="danger" />
    </span>
  )
}
