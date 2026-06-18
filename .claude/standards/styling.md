# Styling

- **Tailwind utility classes only** — no CSS modules, no styled-components.
- Use the `cn()` helper from `lib/utils.ts` for conditional class merging.
- Reuse existing CSS custom properties from `app/globals.css` before introducing new ones.

```typescript
import { cn } from '@/lib/utils'

function Badge({ active, className }: Props) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-xs',
        active ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground',
        className,
      )}
    />
  )
}
```
