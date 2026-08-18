'use client'

import { useState } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useSaveAction } from '@/hooks/use-save-action'
import { cn } from '@/lib/utils'
import { vi } from '@/messages/vi'

export type StatusAccountant = {
  id: string
  fullName: string
  /** Whether the tài khoản still works — which of the two actions is offered. */
  isActive: boolean
}

/**
 * Ngưng hoạt động for someone who has left or gone on long leave, and Kích hoạt
 * for the day they come back. One control, because a person is only ever in one
 * of the two states and the other action would mean nothing on them.
 *
 * Both are asked twice. Ngưng hoạt động takes effect on the person's very next
 * request — they may be sitting at their desk with a screen open — and Kích hoạt
 * hands back everything they could read before, so neither is a click to make on
 * the way past.
 *
 * There is deliberately no Xóa beside it. A kế toán is stamped on every ca they
 * duyệt and every công nợ they settle; removing the row would leave that history
 * unable to say who did it.
 */
export function AccountantStatusForm({ accountant }: { accountant: StatusAccountant }) {
  const { busy, save } = useSaveAction()
  const [open, setOpen] = useState(false)
  const suspending = accountant.isActive

  function submit() {
    save(
      `/api/users/${accountant.id}`,
      {
        method: 'PATCH',
        // Only the state of the tài khoản. Họ tên and — above all — the trạm phụ
        // trách are left out, so ngưng hoạt động keeps the assignment and kích hoạt
        // gives the person back the same trạm they had.
        body: { isActive: !accountant.isActive },
        success: suspending ? vi.accountants.suspendDone : vi.accountants.restoreDone,
      },
      // Closes with the refresh, so the dialog holds its spinner until the fresh
      // row commits rather than vanishing the moment the PATCH is sent.
      { onSuccess: () => setOpen(false) }
    )
  }

  return (
    // Controlled so the click can be intercepted: the default Action closes the
    // dialog immediately, which would unmount the spinner on sight.
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          className={cn(
            suspending &&
              'text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40'
          )}
        >
          {suspending ? vi.accountants.suspend : vi.accountants.restore}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {suspending ? vi.accountants.suspendConfirmTitle : vi.accountants.restoreConfirmTitle}
          </AlertDialogTitle>
          {/* Whose tài khoản this is: the dialog looks the same for everybody,
              and this is the last thing read before it takes effect. */}
          <AlertDialogDescription>
            {accountant.fullName} —{' '}
            {suspending ? vi.accountants.suspendConfirmBody : vi.accountants.restoreConfirmBody}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{vi.common.cancel}</AlertDialogCancel>
          <AlertDialogAction
            loading={busy}
            onClick={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            {suspending ? vi.accountants.suspend : vi.accountants.restore}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
