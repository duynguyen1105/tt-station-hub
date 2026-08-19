import Link from 'next/link'

import { vi } from '@/messages/vi'

/**
 * What stands where a fuel picker would, at a trạm that has declared no nhiên liệu.
 * Every picker inside a trạm narrows to its Map nhiên liệu rows, so a trạm with none
 * has nothing to offer — and an empty dropdown says nothing about why. This says it,
 * and points at the Cấu hình tab where the first nhiên liệu is declared.
 */
export function NoStationFuels({ stationId }: { stationId: string }) {
  return (
    <p className="text-muted-foreground text-sm">
      {vi.misaSettings.noStationFuels}{' '}
      <Link
        href={`/stations/${stationId}/config`}
        className="text-primary underline underline-offset-2"
      >
        {vi.misaSettings.noStationFuelsLink}
      </Link>
    </p>
  )
}
