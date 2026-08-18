'use client'

import { useState } from 'react'

import { AccountantStationChecklist } from '@/components/accountants/accountant-station-checklist'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useSaveAction } from '@/hooks/use-save-action'
import type { StationWithHolders } from '@/lib/accountants/station-holders'
import { vi } from '@/messages/vi'

/**
 * Creates a kế toán. Correcting one happens on that person's own page, not here:
 * this form asks for two things editing never touches — a tên đăng nhập, fixed
 * from then on, and a first password — and is a one-time form, so it stays a
 * dialog on the list rather than becoming a route for somebody who does not
 * exist yet.
 *
 * The quản trị viên reads that first password out; nobody here has a mailbox, so
 * no invitation goes anywhere. No role is offered: everyone on this screen is a
 * kế toán.
 *
 * The trạm checklist is offered while creating, so a new hire is phụ trách of
 * something the moment they sign in.
 *
 * Nothing is checked here. The route's schema already names every rule in
 * Vietnamese and its refusal arrives as a toast, so restating them would only
 * give two sets of rules to keep in step.
 */
export function AccountantForm({ stations }: { stations: readonly StationWithHolders[] }) {
  const { busy, save } = useSaveAction()
  const [open, setOpen] = useState(false)
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [selected, setSelected] = useState<string[]>([])

  // Cleared on the way in as well as out: the dialog stays mounted while it fades,
  // so a password read to one kế toán would otherwise still be on screen while the
  // next person is being added.
  function openChange(next: boolean) {
    if (next) {
      setFullName('')
      setUsername('')
      // A new kế toán starts holding nothing.
      setSelected([])
    }
    setPassword('')
    setOpen(next)
  }

  function submit() {
    save(
      '/api/users',
      {
        method: 'POST',
        body: {
          fullName: fullName.trim(),
          username: username.trim(),
          password,
          stationIds: selected,
        },
        success: vi.accountants.created,
      },
      { onSuccess: () => openChange(false) }
    )
  }

  return (
    <Dialog open={open} onOpenChange={openChange}>
      <DialogTrigger asChild>
        <Button size="sm">{vi.common.add}</Button>
      </DialogTrigger>
      {/* Thirteen trạm make this the one dialog in the app taller than a laptop
          screen. Capped and scrolled here rather than in the shared component,
          and as one scrolling region rather than a checklist scrolling inside a
          dialog that does not. */}
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{vi.accountants.addTitle}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Field>
            <FieldLabel htmlFor="acc-full-name">{vi.accountants.fullName}</FieldLabel>
            <Input
              id="acc-full-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="acc-username">{vi.accountants.username}</FieldLabel>
            <Input
              id="acc-username"
              autoComplete="off"
              placeholder="ten@truongthinh.local"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <FieldDescription>{vi.accountants.usernameHint}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="acc-password">{vi.accountants.password}</FieldLabel>
            {/* Plain text on purpose: the quản trị viên reads it out to the
                kế toán, so masking it would only hide it from the one person
                who has to say it. */}
            <Input
              id="acc-password"
              type="text"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <FieldDescription>{vi.accountants.passwordHint}</FieldDescription>
          </Field>
          {/* No accountantId, because there is no person yet — so nothing is ever
              released here and everything ticked is a claim. */}
          <AccountantStationChecklist
            stations={stations}
            selected={selected}
            onChange={setSelected}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => openChange(false)}>
            {vi.common.cancel}
          </Button>
          <Button onClick={submit} loading={busy}>
            {vi.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
