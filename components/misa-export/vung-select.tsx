'use client'

import { usePathname, useRouter } from 'next/navigation'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { type Vung } from '@/lib/generated/prisma/client'
import { vi } from '@/messages/vi'

const vungOptions = Object.entries(vi.vung) as [Vung, string][]

export function VungSelect({ value }: { value: Vung }) {
  const router = useRouter()
  const pathname = usePathname()

  return (
    <Select value={value} onValueChange={(v) => router.push(`${pathname}?vung=${v}`)}>
      <SelectTrigger className="w-64">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {vungOptions.map(([v, label]) => (
          <SelectItem key={v} value={v}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
