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

/**
 * Creates a kế toán. The quản trị viên types the username and the initial
 * password themselves and reads the password out — nobody here has a mailbox, so
 * no invitation goes anywhere. No role is offered: everything created here is a
 * kế toán.
 *
 * Nothing is checked here. The route's schema already names every rule in
 * Vietnamese and its refusal arrives as a toast, so restating them would only
 * give two sets of rules to keep in step.
 */
export function AccountantForm() {
  const { busy, save } = useSaveAction()
  const [open, setOpen] = useState(false)
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')

  // The one way out, whichever way it is taken — saved, cancelled, Escape — so a
  // password read out to one person is never still in the box when the dialog is
  // opened for the next.
  function close() {
    setOpen(false)
    setFullName('')
    setUsername('')
    setPhone('')
    setPassword('')
  }

  function submit() {
    save(
      '/api/users',
      {
        method: 'POST',
        body: {
          fullName: fullName.trim(),
          username: username.trim(),
          phone: phone.trim(),
          password,
        },
        success: vi.accountants.created,
      },
      { onSuccess: close }
    )
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogTrigger asChild>
        <Button size="sm">{vi.common.add}</Button>
      </DialogTrigger>
      <DialogContent>
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
            <FieldLabel htmlFor="acc-phone">{vi.accountants.phone}</FieldLabel>
            <Input
              id="acc-phone"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
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
