# Next.js App Router & Client Components

## CRITICAL: 'use client' Directive Rules

**You MUST add `'use client'` at the top of any file that:**

1. **Uses React Hooks**
   - `useState`, `useEffect`, `useContext`, `useReducer`, etc.
   - Custom hooks that use any React hooks

2. **Uses Browser APIs**
   - `window`, `document`, `localStorage`, `navigator`
   - `addEventListener`, `fetch` (client-side only)
   - Any browser-only global

3. **Uses React Context**
   - `createContext()` - ALWAYS requires 'use client'
   - `useContext()` - consuming context

4. **Has Event Handlers**
   - `onClick`, `onChange`, `onSubmit`, etc.
   - Any interactive component

5. **Uses Third-Party Client Libraries**
   - `react-i18next` (useTranslation)
   - `next-themes` (useTheme)
   - Any library that depends on browser APIs

6. **Re-exports Client Components (Barrel Files)**
   - If `index.ts` re-exports from a `'use client'` file
   - The barrel file MUST also have `'use client'`

## Checklist for New Files

Before creating any new `.tsx` or `.ts` file, ask:

- [ ] Does this file use React hooks? → Add `'use client'`
- [ ] Does this file use browser APIs? → Add `'use client'`
- [ ] Does this file use `createContext`? → Add `'use client'`
- [ ] Does this file have event handlers? → Add `'use client'`
- [ ] Does this file import from client-only libraries? → Add `'use client'`
- [ ] Is this a barrel file re-exporting client components? → Add `'use client'`

## Examples

```typescript
// ✅ Good - Has 'use client' directive
'use client'

import { useState } from 'react'

export function Counter() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>{count}</button>
}
```

```typescript
// ❌ Bad - Missing 'use client' directive
import { useState } from 'react'

export function Counter() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>{count}</button>
}
```

```typescript
// ✅ Good - Barrel file re-exporting client component
'use client'

export { Counter } from './counter'
export { useCounter } from './use-counter'
```

```typescript
// ❌ Bad - Barrel file missing directive
export { Counter } from './counter' // Counter has 'use client' but this file doesn't
export { useCounter } from './use-counter'
```

## Server Components (Default)

Files WITHOUT `'use client'` are Server Components by default:

- Can run async/await at component level
- Can directly access databases
- Cannot use hooks or browser APIs
- Better for performance (less JavaScript sent to client)

**Use Server Components when possible.** Only add `'use client'` when you need client-side features.

## Common Patterns

| Pattern                  | Needs 'use client'? | Reason                               |
| ------------------------ | ------------------- | ------------------------------------ |
| Page with static content | ❌ No               | Server Component by default          |
| Page with `useState`     | ✅ Yes              | Uses React hooks                     |
| Layout with `children`   | ❌ No               | Can be Server Component              |
| Component with `onClick` | ✅ Yes              | Interactive/event handler            |
| API route handler        | ❌ No               | Different context (not a component)  |
| Utility function         | ❌ No               | Pure function, no React              |
| i18n provider            | ✅ Yes              | Uses `createContext` and hooks       |
| i18n config              | ✅ Yes              | Uses browser APIs (LanguageDetector) |
| Theme provider           | ✅ Yes              | Uses `createContext` and hooks       |

## ESLint Enforcement

The project uses ESLint rules to catch missing 'use client' directives:

```javascript
// eslint.config.mjs
rules: {
  '@next/next/no-async-client-component': 'error',
  'react-hooks/rules-of-hooks': 'error',
  'react-hooks/exhaustive-deps': 'warn',
}
```

Run `pnpm lint` to check.
