import { cn } from '@/lib/utils'

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'muted'

const toneStyles: Record<Tone, { wrap: string; dot: string }> = {
  success: {
    wrap: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  warning: {
    wrap: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
  danger: {
    wrap: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300',
    dot: 'bg-rose-500',
  },
  info: {
    wrap: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-300',
    dot: 'bg-sky-500',
  },
  muted: {
    wrap: 'border-border bg-muted text-muted-foreground',
    dot: 'bg-muted-foreground/50',
  },
}

export function StatusBadge({ label, tone }: { label: string; tone: Tone }) {
  const style = toneStyles[tone]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        style.wrap
      )}
    >
      <span className={cn('size-1.5 rounded-full', style.dot)} />
      {label}
    </span>
  )
}
