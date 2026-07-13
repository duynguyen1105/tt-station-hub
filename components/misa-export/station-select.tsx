'use client'

import { usePathname, useRouter } from 'next/navigation'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type Station = { id: string; code: string; name: string }

export function StationSelect({ stations, value }: { stations: Station[]; value: string }) {
  const router = useRouter()
  const pathname = usePathname()

  return (
    <Select value={value} onValueChange={(id) => router.push(`${pathname}?station=${id}`)}>
      <SelectTrigger className="w-64">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {stations.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
