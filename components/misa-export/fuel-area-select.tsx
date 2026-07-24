'use client'

import { usePathname, useRouter } from 'next/navigation'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { type FuelArea } from '@/lib/generated/prisma/client'
import { vi } from '@/messages/vi'

const fuelAreaOptions = Object.entries(vi.fuelArea) as [FuelArea, string][]

export function FuelAreaSelect({ value }: { value: FuelArea }) {
  const router = useRouter()
  const pathname = usePathname()

  return (
    <Select value={value} onValueChange={(v) => router.push(`${pathname}?fuelArea=${v}`)}>
      <SelectTrigger className="w-64">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {fuelAreaOptions.map(([v, label]) => (
          <SelectItem key={v} value={v}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
