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

export function anomalyLabel(reason: string): string {
  return (vi.anomalyReasons as LabelMap)[reason] ?? reason
}

export function fuelTypeLabel(fuelType: string): string {
  return (vi.fuelType as LabelMap)[fuelType] ?? fuelType
}

export function shiftTypeLabel(shiftType: string): string {
  return (vi.shiftType as LabelMap)[shiftType] ?? shiftType
}
