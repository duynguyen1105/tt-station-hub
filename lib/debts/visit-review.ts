import type { AppRole } from '@/lib/auth/permissions'

export function canEditDebtVisit(role: AppRole, status: string): boolean {
  return (
    role === 'admin' || (role === 'accountant' && status !== 'approved' && status !== 'rejected')
  )
}

/** A decided visit keeps its verdict when edited; only a verdict change posts/removes a charge. */
export function debtVisitDecision(
  status: string,
  action: 'approve' | 'correct' | 'reject'
): { reviewStatus: string; charge: 'create' | 'update' | 'delete' | 'none' } | null {
  if (
    (action === 'approve' && status === 'approved') ||
    (action === 'reject' && status === 'rejected')
  )
    return null
  if (action === 'approve') return { reviewStatus: 'approved', charge: 'create' }
  if (action === 'reject')
    return { reviewStatus: 'rejected', charge: status === 'approved' ? 'delete' : 'none' }
  return {
    reviewStatus: status === 'approved' || status === 'rejected' ? status : 'corrected',
    charge: status === 'approved' ? 'update' : 'none',
  }
}
