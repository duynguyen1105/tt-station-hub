# TT Station Hub

Disposable Next.js 16 / React 19 front-end shell. The Station Records system helps to review shift numbers read by AI, manage paperwork, inventory, and accounts receivable by vehicle trip.

## This is NOT the Next.js you know

Next.js 16 has breaking changes from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code. Heed deprecation notices.

## Commands

Package manager: **pnpm**. All scripts run through **Doppler** for env vars.

- `pnpm dev` — HTTPS dev server on `https://localhost:3000`
- `pnpm build` — production build
- `pnpm start` — serve the production build
- `pnpm lint` — ESLint
- `pnpm format` — Prettier write

No test runner is installed; tests are out of scope for this milestone.

## Working Principles

1. **Think Before Coding** — surface assumptions, ask when unclear, don't pick silently between interpretations.
2. **Simplicity First** — minimum code that solves the problem; no speculative features, abstractions, or error handling for impossible cases.
3. **Surgical Changes** — every changed line should trace to the request; don't refactor adjacent code or remove pre-existing dead code.
4. **Goal-Driven Execution** — define verifiable success up front; with no test runner, success = observable runtime behavior on `https://localhost:3000` + `pnpm lint` clean.

Full text: [.claude/standards/working-principles.md](.claude/standards/working-principles.md)

## Detailed Standards

For comprehensive guidelines with examples, see the individual files in `.claude/standards/`:

| Topic                                     | File                                                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Why this repo exists & lifecycle          | [.claude/standards/product-context.md](.claude/standards/product-context.md)                   |
| TypeScript conventions                    | [.claude/standards/typescript.md](.claude/standards/typescript.md)                             |
| `'use client'` rules                      | [.claude/standards/nextjs-client-components.md](.claude/standards/nextjs-client-components.md) |
| UI components & icons                     | [.claude/standards/ui-components.md](.claude/standards/ui-components.md)                       |
| File / folder / DB naming                 | [.claude/standards/naming.md](.claude/standards/naming.md)                                     |
| Tailwind & styling helpers                | [.claude/standards/styling.md](.claude/standards/styling.md)                                   |
| Performance budgets                       | [.claude/standards/performance.md](.claude/standards/performance.md)                           |
| Working principles                        | [.claude/standards/working-principles.md](.claude/standards/working-principles.md)             |
