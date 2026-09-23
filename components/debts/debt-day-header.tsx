'use client'

import { toast } from 'sonner'

import { useState } from 'react'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { vi } from '@/messages/vi'

/**
 * The day the Công nợ tab shows, and that day's ca: thu nợ is typed into its Thu chi
 * table, so a day without a ca offers to open one.
 */
export function DebtDayHeader({
  stationId,
  day,
  today,
  shiftId,
  canOpenShift,
}: {
  stationId: string
  day: string
  today: string
  shiftId: string | null
  canOpenShift: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [busy, setBusy] = useState(false)

  function goTo(date: string | null) {
    // Read at click time: the search box rewrites q/owing with history.replaceState.
    const params = new URLSearchParams(window.location.search)
    if (date) params.set('date', date)
    else params.delete('date')
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  async function openShift() {
    setBusy(true)
    const res = await fetch('/api/shifts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stationId, date: day }),
    })
    const json = (await res.json().catch(() => null)) as {
      data?: { id: string }
      error?: string
    } | null
    setBusy(false)
    if (!res.ok || !json?.data) {
      toast.error(json?.error ?? vi.errors.generic)
      return
    }
    router.push(`/stations/${stationId}/shifts/${json.data.id}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="flex items-center gap-2">
        <span className="text-muted-foreground">{vi.debts.dayLabel}</span>
        <Input
          type="date"
          max={today}
          value={day}
          onChange={(e) => {
            if (e.target.value) goTo(e.target.value)
          }}
          className="w-40"
        />
      </label>
      {day !== today ? (
        <Button variant="outline" size="sm" onClick={() => goTo(null)}>
          {vi.debts.today}
        </Button>
      ) : null}
      {shiftId ? (
        <Link
          href={`/stations/${stationId}/shifts/${shiftId}`}
          className="underline-offset-2 hover:underline"
        >
          {vi.debts.dayCashLink}
        </Link>
      ) : (
        <>
          <span className="text-muted-foreground">{vi.debts.noShift}</span>
          {canOpenShift ? (
            <Button size="sm" onClick={openShift} loading={busy}>
              {vi.debts.openShift}
            </Button>
          ) : null}
        </>
      )}
    </div>
  )
}
