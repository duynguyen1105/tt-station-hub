'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { planStationAssignment } from '@/lib/auth/station-assignment'
import { vi } from '@/messages/vi'

export type AccountantFormAccountant = {
  id: string
  fullName: string
  /** Held in the email column, but it is a tên đăng nhập everywhere a person reads it. */
  username: string
  phone: string | null
}

/** A trạm as the checklist needs it: what it is called, and who is on it today. */
export type AccountantFormStation = {
  id: string
  name: string
  /** The kế toán phụ trách of it now — any number of them, all equals. */
  heldBy: { id: string; fullName: string }[]
}

/**
 * Creates a kế toán, or corrects one — `accountant` set is what tells the two
 * apart. The fields are the same either way, so one dialog serves both rather
 * than two copies drifting from each other.
 *
 * Creating asks for the username and the first password, and the quản trị viên
 * reads that password out — nobody here has a mailbox, so no invitation goes
 * anywhere. Editing shows the username but does not let it be changed, and never
 * touches the password. No role is offered in either mode: everyone on this
 * screen is a kế toán.
 *
 * The trạm checklist is offered in both modes, so a new hire can be phụ trách of
 * something before their first sign-in. A trạm has any number of phụ trách, so
 * ticking one somebody else is on adds this person beside them and unticking one
 * removes only this person — nothing is taken off anybody, and so nothing here
 * warns about it.
 *
 * Nothing is checked here. The route's schema already names every rule in
 * Vietnamese and its refusal arrives as a toast, so restating them would only
 * give two sets of rules to keep in step.
 */
export function AccountantForm({
  accountant,
  stations,
}: {
  accountant?: AccountantFormAccountant
  stations: readonly AccountantFormStation[]
}) {
  const { busy, save } = useSaveAction()
  const [open, setOpen] = useState(false)
  const [fullName, setFullName] = useState(accountant?.fullName ?? '')
  const [username, setUsername] = useState('')
  const [phone, setPhone] = useState(accountant?.phone ?? '')
  const [password, setPassword] = useState('')
  const [selected, setSelected] = useState<string[]>([])

  // What saving would do, worked out by the same function the route will run, so
  // what is marked on screen is the writes themselves rather than a second opinion
  // about them. A kế toán being created has no id yet and no trạm can carry one,
  // which is exactly the plan wanted: everything ticked is a claim.
  const plan = planStationAssignment(
    accountant?.id ?? '',
    stations.map((station) => ({
      id: station.id,
      accountantIds: station.heldBy.map((holder) => holder.id),
    })),
    selected
  )
  const released = new Set(plan.released)

  // The boxes are seeded on the way in rather than on the way out: a save is
  // followed by a refresh that brings the row's new values with it, and resetting
  // as the dialog closes would pin them to what the person was called before the
  // edit. The password is the exception, cleared in both directions — the dialog
  // stays mounted while it fades out, so one read to a kế toán would otherwise be
  // on screen a moment longer than the person it belongs to.
  function openChange(next: boolean) {
    if (next) {
      setFullName(accountant?.fullName ?? '')
      setUsername('')
      setPhone(accountant?.phone ?? '')
      // A new kế toán starts holding nothing; an existing one starts from what they
      // hold now, so an untouched checklist saves the same assignment back.
      setSelected(
        accountant
          ? stations
              .filter((s) => s.heldBy.some((holder) => holder.id === accountant.id))
              .map((s) => s.id)
          : []
      )
    }
    setPassword('')
    setOpen(next)
  }

  function toggleStation(stationId: string, ticked: boolean) {
    setSelected((current) =>
      ticked ? [...current, stationId] : current.filter((id) => id !== stationId)
    )
  }

  function submit() {
    save(
      accountant ? `/api/users/${accountant.id}` : '/api/users',
      {
        method: accountant ? 'PATCH' : 'POST',
        body: accountant
          ? { fullName: fullName.trim(), phone: phone.trim(), stationIds: selected }
          : {
              fullName: fullName.trim(),
              username: username.trim(),
              phone: phone.trim(),
              password,
              stationIds: selected,
            },
        success: accountant ? vi.accountants.updated : vi.accountants.created,
      },
      { onSuccess: () => openChange(false) }
    )
  }

  return (
    <Dialog open={open} onOpenChange={openChange}>
      <DialogTrigger asChild>
        {accountant ? (
          <Button size="sm" variant="ghost">
            {vi.common.edit}
          </Button>
        ) : (
          <Button size="sm">{vi.common.add}</Button>
        )}
      </DialogTrigger>
      {/* Thirteen trạm make this the one dialog in the app taller than a laptop
          screen. Capped and scrolled here rather than in the shared component,
          and as one scrolling region rather than a checklist scrolling inside a
          dialog that does not. */}
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {accountant ? vi.accountants.editTitle : vi.accountants.addTitle}
          </DialogTitle>
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
            {accountant ? (
              // Shown so the quản trị viên can read it out over the phone, but read
              // only — changing it would have to be written to the authentication
              // system too. readOnly rather than disabled so it can still be
              // selected and copied.
              <Input
                id="acc-username"
                readOnly
                className="text-muted-foreground"
                value={accountant.username}
              />
            ) : (
              <Input
                id="acc-username"
                autoComplete="off"
                placeholder="ten@truongthinh.local"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            )}
            <FieldDescription>
              {accountant ? vi.accountants.usernameLocked : vi.accountants.usernameHint}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="acc-phone">{vi.accountants.phone}</FieldLabel>
            <Input
              id="acc-phone"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>
          {!accountant && (
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
          )}
          <Field>
            <FieldLabel>{vi.accountants.assignedStations}</FieldLabel>
            <FieldDescription>{vi.accountants.stationsHint}</FieldDescription>
            {stations.length === 0 ? (
              <p className="text-muted-foreground text-sm">{vi.stations.empty}</p>
            ) : (
              <div className="space-y-1 rounded-md border p-3">
                {/* One flat list in the order the trạm arrive, which is by mã trạm.
                    A row says the trạm's name, and adds something only when there
                    is something to say — a trạm nobody is on is not an opportunity
                    to take one, so it says nothing at all. */}
                {stations.map((station) => {
                  // The people already on it besides the one being edited —
                  // ticking is adding a name beside theirs, not taking it.
                  const others = station.heldBy.filter((holder) => holder.id !== accountant?.id)
                  return (
                    <label
                      key={station.id}
                      className="flex items-start gap-2 py-1 text-sm leading-tight"
                    >
                      <Checkbox
                        className="mt-0.5"
                        checked={selected.includes(station.id)}
                        onCheckedChange={(state) => toggleStation(station.id, state === true)}
                      />
                      {/* The space belongs to what follows the name, not to the
                          name: a row that says nothing more ends at its own last
                          letter. */}
                      <span>
                        {station.name}
                        {released.has(station.id) ? (
                          <span className="text-amber-700 dark:text-amber-400">
                            {' '}
                            {vi.accountants.stationRelease}
                          </span>
                        ) : (
                          others.length > 0 && (
                            <span className="text-muted-foreground">
                              {' '}
                              {vi.accountants.stationHeldBy}{' '}
                              {others.map((holder) => holder.fullName).join(', ')}
                            </span>
                          )
                        )}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => openChange(false)}>
            {vi.common.cancel}
          </Button>
          <Button onClick={submit} disabled={busy}>
            {vi.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
