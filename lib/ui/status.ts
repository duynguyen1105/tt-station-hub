import type { Tone } from '@/components/shared/status-badge'
import { vi } from '@/messages/vi'

type LabelMap = Record<string, string>

export function reviewStatusInfo(status: string): { label: string; tone: Tone } {
  const tones: Record<string, Tone> = {
    pending: 'muted',
    auto_approved: 'success',
    needs_review: 'warning',
    approved: 'success',
    rejected: 'danger',
    corrected: 'info',
  }
  return { label: (vi.reviewStatus as LabelMap)[status] ?? status, tone: tones[status] ?? 'muted' }
}

export function shiftStatusInfo(status: string): { label: string; tone: Tone } {
  const tones: Record<string, Tone> = {
    open: 'muted',
    collecting_photos: 'info',
    ai_processing: 'info',
    pending_review: 'warning',
    completed: 'success',
    cancelled: 'danger',
  }
  return { label: (vi.shiftStatus as LabelMap)[status] ?? status, tone: tones[status] ?? 'muted' }
}

export function docStatusInfo(status: string): { label: string; tone: Tone } {
  const tones: Record<string, Tone> = {
    valid: 'success',
    expiring_soon: 'warning',
    expired: 'danger',
  }
  return { label: (vi.docStatus as LabelMap)[status] ?? status, tone: tones[status] ?? 'muted' }
}

/**
 * Whether a kế toán's tài khoản still works. Two states rather than a status
 * column, but read in two places now — the list and the person's page, which is
 * where it is changed — so the pair is settled here once.
 */
export function accountantStatusInfo(isActive: boolean): { label: string; tone: Tone } {
  return isActive
    ? { label: vi.accountants.active, tone: 'success' }
    : { label: vi.accountants.suspended, tone: 'muted' }
}

export function anomalyLabel(reason: string): string {
  return (vi.anomalyReasons as LabelMap)[reason] ?? reason
}

export function fuelTypeLabel(fuelType: string): string {
  return (vi.fuelType as LabelMap)[fuelType] ?? fuelType
}

export function shiftTypeLabel(shiftType: string): string {
  return (vi.shiftType as LabelMap)[shiftType] ?? shiftType
}
