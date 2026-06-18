# TT Station Hub — Hồ sơ Trạm (Module 5)

Station management for **Trường Thịnh** (petroleum distributor): AI meter reading
from Zalo photos, daily shift closing, legal documents, fuel inventory, per-trip
debt, MISA export, and an all-stations operations overview.

UI text is Vietnamese; source code is English.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind v4 · shadcn/ui ·
TanStack Query · Zustand · react-hook-form + zod · **Prisma 7** · Supabase
(Postgres / Auth / Storage) · Anthropic Claude (vision) · Zalo OA · pnpm.

## Quick start (local demo — no accounts needed)

```bash
pnpm install
pnpm exec prisma generate
docker compose up -d db            # or a local Postgres (see the guide)
cp .env.example .env               # then set the demo values from the guide
pnpm exec prisma db push && pnpm exec prisma db seed
pnpm exec tsx prisma/demo-data.ts  # optional sample shift/debt data
pnpm dev                           # http://localhost:3000
```

👉 **Full step-by-step:** [`docs/local-development.md`](docs/local-development.md)

## Docs

- [`docs/local-development.md`](docs/local-development.md) — run it locally (this is what teammates need)
- [`PROJECT_STATUS.md`](PROJECT_STATUS.md) — what's built, what's blocked on keys/clarification, and next steps
- [`docs/huong-dan-ke-toan.md`](docs/huong-dan-ke-toan.md) — accountant guide (Vietnamese)
- [`docs/huong-dan-nhan-vien-tram.md`](docs/huong-dan-nhan-vien-tram.md) — station-staff guide (Vietnamese)
- [`docs/huong-dan-zalo-oa.md`](docs/huong-dan-zalo-oa.md) — Zalo OA setup sheet (Vietnamese)

## Scripts

```bash
pnpm dev | build | start
pnpm type-check | lint | test | validate
pnpm db:push | db:seed | db:studio
```

CI (type-check + lint + test + build) runs on every push via GitHub Actions.
