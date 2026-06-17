import { StatusBadge } from '@/components/shared/status-badge'
import { docStatusInfo } from '@/lib/ui/status'

export function ExpiryBadge({ status }: { status: string }) {
  const { label, tone } = docStatusInfo(status)
  return <StatusBadge label={label} tone={tone} />
}
