# TT Station Hub — Hồ sơ Trạm (Module 5)

Full-stack station-management app for **Trường Thịnh** (petroleum distributor): AI
meter reading from Zalo photos, daily shift closing, legal documents, fuel
inventory, per-trip debt, MISA export, and an all-stations operations overview.
Source code is in English; user-facing UI text is Vietnamese (`messages/vi.ts`).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind v4 ·
shadcn/ui (radix-vega) · TanStack Query · Zustand · react-hook-form + zod ·
**Prisma 7** · **Supabase** (Postgres / Auth / Storage) · Anthropic Claude
(vision) · Zalo OA · pnpm.

## This is NOT the Next.js you know

Next.js 16 has breaking changes from your training data — e.g. the `middleware`
convention is now **`proxy.ts`**, and `cookies()` is async. Read the relevant
guide in `node_modules/next/dist/docs/` before writing Next.js code; heed
deprecation notices. **Prisma 7** also differs: the `prisma-client` generator
emits to `lib/generated/prisma`, uses a driver adapter, and is configured in
`prisma.config.ts`.

## Commands

Package manager: **pnpm**. Env vars come from a plain `.env` (gitignored;
template in `.env.example`).

- `pnpm dev` — dev server on `http://localhost:3000`
- `pnpm build` / `pnpm start` — production build / serve
- `pnpm lint` · `pnpm format` · `pnpm type-check`
- `pnpm test` — **Vitest** unit tests for the domain logic (currently 53 passing)
- `pnpm validate` — type-check + lint
- `pnpm db:push` · `pnpm db:seed` · `pnpm db:studio` — Prisma

Run it locally: see **[docs/local-development.md](docs/local-development.md)**.
Project state, what's built, and what's blocked: **[PROJECT_STATUS.md](PROJECT_STATUS.md)**.

## Working Principles

1. **Think Before Coding** — surface assumptions, ask when unclear, don't pick silently between interpretations.
2. **Simplicity First** — minimum code that solves the problem; no speculative features, abstractions, or error handling for impossible cases.
3. **Surgical Changes** — every changed line should trace to the request; don't refactor adjacent code or remove pre-existing dead code.
4. **Goal-Driven Execution** — define verifiable success up front: `pnpm type-check && pnpm lint && pnpm test && pnpm build` green, plus observable behavior at `http://localhost:3000`.

Full text: [.claude/standards/working-principles.md](.claude/standards/working-principles.md)

## Detailed Standards

For comprehensive guidelines with examples, see the files in `.claude/standards/`:

| Topic                      | File                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| TypeScript conventions     | [.claude/standards/typescript.md](.claude/standards/typescript.md)                             |
| `'use client'` rules       | [.claude/standards/nextjs-client-components.md](.claude/standards/nextjs-client-components.md) |
| UI components & icons      | [.claude/standards/ui-components.md](.claude/standards/ui-components.md)                       |
| File / folder / DB naming  | [.claude/standards/naming.md](.claude/standards/naming.md)                                     |
| Tailwind & styling helpers | [.claude/standards/styling.md](.claude/standards/styling.md)                                   |
| Performance budgets        | [.claude/standards/performance.md](.claude/standards/performance.md)                           |
| Working principles         | [.claude/standards/working-principles.md](.claude/standards/working-principles.md)             |
