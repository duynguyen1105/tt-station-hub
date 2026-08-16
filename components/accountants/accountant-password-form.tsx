'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useSaveAction } from '@/hooks/use-save-action'
import { vi } from '@/messages/vi'

export type PasswordResetAccountant = {
  id: string
  fullName: string
  /** Held in the email column, but it is a tên đăng nhập everywhere a person reads it. */
  username: string
}

/**
 * Gives one kế toán a new password, on their own page beside everything else
 * done to them. There is no forgotten-password link to follow and no mailbox to
 * send one to, so this is the whole of the promise the kế toán guide makes: they
 * ring the quản trị viên, who types a password here and reads it back to them.
 *
 * Nothing is checked here — the route's rule names both refusals in Vietnamese
 * and they arrive as a toast — but the password is asked for twice, because the
 * only copy of it is the one being read down a telephone.
 */
export function AccountantPasswordForm({ accountant }: { accountant: PasswordResetAccountant }) {
  const { busy, save } = useSaveAction()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Cleared in both directions, as on the create dialog: it stays mounted while
  // it fades out, so the password would otherwise still be on screen a moment
  // after the dialog carrying it has gone.
  function openChange(next: boolean) {
    setPassword('')
    setConfirmPassword('')
    setOpen(next)
  }

  function submit() {
    save(
      `/api/users/${accountant.id}/password`,
      {
        method: 'POST',
        body: { password, confirmPassword },
        success: vi.accountants.passwordResetDone,
      },
      { onSuccess: () => openChange(false) }
    )
  }

  return (
    <Dialog open={open} onOpenChange={openChange}>
      <DialogTrigger asChild>
        {/* Outline, not ghost: on a page these two stand on their own instead of
            being the quiet end of a table row, and a bare label there reads as
            text rather than as something to press. */}
        <Button size="sm" variant="outline">
          {vi.accountants.resetPassword}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{vi.accountants.resetPassword}</DialogTitle>
          {/* Who is about to be read this password, and the tên đăng nhập that
              goes with it down the same telephone call. */}
          <DialogDescription>
            {accountant.fullName} — {accountant.username}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Field>
            <FieldLabel htmlFor="acc-new-password">{vi.accountants.newPassword}</FieldLabel>
            {/* Plain text on purpose, as when a kế toán is created: the quản trị
                viên reads it out, so masking it would only hide it from the one
                person who has to say it. */}
            <Input
              id="acc-new-password"
              type="text"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <FieldDescription>{vi.accountants.passwordHint}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="acc-confirm-password">{vi.accountants.confirmPassword}</FieldLabel>
            <Input
              id="acc-confirm-password"
              type="text"
              autoComplete="off"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
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
