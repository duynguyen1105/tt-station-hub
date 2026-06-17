import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'muted'

const toneClass: Record<Tone, string> = {
  success: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  danger: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  muted: 'bg-muted text-muted-foreground',
}

export function StatusBadge({ label, tone }: { label: string; tone: Tone }) {
  return (
    <Badge variant="outline" className={cn('border-transparent font-medium', toneClass[tone])}>
      {label}
    </Badge>
  )
}
