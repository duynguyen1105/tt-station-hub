'use client'

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
  /** Whether the tài khoản still works — which of the two actions the row offers. */
  isActive: boolean
}

/**
 * Ngưng hoạt động for someone who has left or gone on long leave, and Kích hoạt
 * for the day they come back. One control, because a row is only ever in one of
 * the two states and the other action would mean nothing on it.
 *
 * Both are asked twice. Ngưng hoạt động takes effect on the person's very next
 * request — they may be sitting at their desk with a screen open — and Kích hoạt
 * hands back everything they could read before, so neither is a click to make by
 * passing the mouse over the wrong row.
 *
 * There is deliberately no Xóa beside it. A kế toán is stamped on every ca they
 * duyệt and every công nợ they settle; removing the row would leave that history
 * unable to say who did it.
 */
export function AccountantStatusForm({ accountant }: { accountant: StatusAccountant }) {
  const { busy, save } = useSaveAction()
  const suspending = accountant.isActive

  function submit() {
    save(`/api/users/${accountant.id}`, {
      method: 'PATCH',
      // Only the state of the tài khoản. Họ tên, số điện thoại and — above all —
      // the trạm phụ trách are left out, so ngưng hoạt động keeps the assignment
      // and kích hoạt gives the person back the same trạm they had.
      body: { isActive: !accountant.isActive },
      success: suspending ? vi.accountants.suspendDone : vi.accountants.restoreDone,
    })
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
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
          {/* Whose row this is: the dialog looks the same on every one of them. */}
          <AlertDialogDescription>
            {accountant.fullName} —{' '}
            {suspending ? vi.accountants.suspendConfirmBody : vi.accountants.restoreConfirmBody}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{vi.common.cancel}</AlertDialogCancel>
          <AlertDialogAction onClick={submit}>
            {suspending ? vi.accountants.suspend : vi.accountants.restore}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
