'use client'

import { Pencil } from 'lucide-react'

import { useState } from 'react'

import { usePathname, useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useSaveAction } from '@/hooks/use-save-action'
import { stationHref } from '@/lib/stations/href'
import { vi } from '@/messages/vi'

export function StationInfoForm({
  station,
}: {
  station: { id: string; code: string; name: string; branch: string | null; address: string | null }
}) {
  const { busy, save } = useSaveAction()
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState(station.code)
  const [name, setName] = useState(station.name)
  const [branch, setBranch] = useState(station.branch ?? '')
  const [address, setAddress] = useState(station.address ?? '')

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={vi.stations.editInfo}
              className="text-muted-foreground"
            >
              <Pencil />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>{vi.stations.editInfo}</TooltipContent>
      </Tooltip>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{vi.stations.editInfo}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Field>
            <FieldLabel htmlFor="station-code">{vi.stations.code}</FieldLabel>
            <Input
              id="station-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="station-name">{vi.stations.name}</FieldLabel>
            <Input
              id="station-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="station-branch">{vi.stations.branch}</FieldLabel>
            <Input
              id="station-branch"
              value={branch}
              onChange={(event) => setBranch(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="station-address">{vi.stations.address}</FieldLabel>
            <Input
              id="station-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {vi.common.cancel}
          </Button>
          <Button
            loading={busy}
            onClick={() =>
              save(
                `/api/stations/${station.id}`,
                {
                  method: 'PATCH',
                  body: { code, name, branch: branch || null, address: address || null },
                  success: vi.stations.saved,
                },
                {
                  onSuccess: () => {
                    setOpen(false)
                    // The page address names the trạm by its mã, so a new mã moves it.
                    const moved = pathname.replace(
                      stationHref(station.code),
                      stationHref(code.trim())
                    )
                    if (moved !== pathname) router.replace(moved)
                  },
                }
              )
            }
          >
            {vi.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
