'use client'

import { useState } from 'react'

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
import { vi } from '@/messages/vi'

export type AccountantFormAccountant = {
  id: string
  fullName: string
  /** Held in the email column, but it is a tên đăng nhập everywhere a person reads it. */
  username: string
  phone: string | null
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
 * Nothing is checked here. The route's schema already names every rule in
 * Vietnamese and its refusal arrives as a toast, so restating them would only
 * give two sets of rules to keep in step.
 */
export function AccountantForm({ accountant }: { accountant?: AccountantFormAccountant }) {
  const { busy, save } = useSaveAction()
  const [open, setOpen] = useState(false)
  const [fullName, setFullName] = useState(accountant?.fullName ?? '')
  const [username, setUsername] = useState('')
  const [phone, setPhone] = useState(accountant?.phone ?? '')
  const [password, setPassword] = useState('')

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
    }
    setPassword('')
    setOpen(next)
  }

  function submit() {
    save(
      accountant ? `/api/users/${accountant.id}` : '/api/users',
      {
        method: accountant ? 'PATCH' : 'POST',
        body: accountant
          ? { fullName: fullName.trim(), phone: phone.trim() }
          : {
              fullName: fullName.trim(),
              username: username.trim(),
              phone: phone.trim(),
              password,
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
      <DialogContent>
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
