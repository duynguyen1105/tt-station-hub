'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { vi } from '@/messages/vi'

/**
 * The trạm that did not fit in the cell, behind a `+N` the reader opens.
 *
 * It is handed only the ones it hides, never the whole list: the first few are
 * already spelled out beside it on the server, and `+5` promises five more, so
 * five is exactly what opening it shows. Sending all of them would be the same
 * names twice down the wire to say the same thing once.
 */
export function StationOverflow({ names }: { names: readonly string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/* The house button rather than a styled span: this is something the
            reader tabs to and presses, and Radix says so on it. */}
        <Button variant="ghost" size="xs" className="text-muted-foreground font-normal">
          {vi.accountants.moreStations(names.length)}
        </Button>
      </PopoverTrigger>
      {/* Tighter than the panel's own gap-4: that spacing is for a panel of
          separate things, and a caption belongs to the list under it. */}
      <PopoverContent align="start" className="w-auto max-w-xs gap-2">
        <p className="text-muted-foreground text-xs">{vi.accountants.otherStations}</p>
        {/* Capped rather than however tall the list is: a kế toán phụ trách of
            forty trạm would otherwise open a panel taller than the screen. */}
        <ul className="max-h-64 space-y-0.5 overflow-y-auto text-sm">
          {names.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
