# Architecture

How TT Station Hub fits together. Read this once before diving into the code.
For run instructions see [local-development.md](local-development.md); for current
status/blockers see [../PROJECT_STATUS.md](../PROJECT_STATUS.md).

## What it does

A single Next.js app turns each fuel station into a "record" with six areas:

1. **Shift closing** — AI reads dispenser meters from photos uploaded on Tải ảnh; accountants approve.
2. **Legal documents** — store + expiry reminders (60/30/15 days).
3. **Inventory** — estimated stock (from approved shifts) vs physical (tank dip).
4. **Per-trip debt** — AI reads liters + unit price per vehicle fill, computes the amount.
5. **MISA export** — Excel for MISA Nội bộ import.
6. **Overview** — all stations + centralised alerts.

## Data flow (the core loop)

```
Accountant / admin (Tải ảnh, /upload)
      │ choose Trạm + Ngày; add Chốt ca, Công nợ or Đo bồn photos
      ▼
app/api/uploads (auth + station access + validation)
      ▼
lib/photos/upload (one photo or one công nợ pair per request)
      ▼
Supabase Storage + ShiftPhoto
      ▼
lib/photos/ingest → lib/ai/* (draft readings / visits / tank dips)
      ▼
Cần duyệt / Tồn kho → accountant reviews and corrects
      │
      └─ approved shift → lib/inventory/shift-sales → MISA export
```

**Key rule:** AI produces a _draft_; the accountant is the final approver
(human-in-the-loop). The Tải ảnh page is the only photo intake; stored photos
flow through AI to the review queues and inventory.

## Request lifecycle & auth

- **`proxy.ts`** (Next 16's renamed middleware) runs on every page request →
  `lib/supabase/update-session.ts` refreshes the Supabase session cookie and
  redirects unauthenticated users to `/login`.
- Pages call **`requireUser()` / `requireRole()`** (`lib/auth/session.ts`), which
  resolves the Supabase auth user → the `profiles` row (role: admin / accountant / viewer).
- **`DEMO_MODE=true`** bypasses Supabase auth (acts as the seeded admin) for local demos.
- Mutations go through **API route handlers** (zod-validated, auth-checked, audit-logged).

## Data model (Prisma 7 → `prisma/schema.prisma`)

13 tables, snake_case columns. FKs are kept as **scalar columns (no Prisma
relations)** to mirror the build plan — join in code, not via `include`.

- `profiles` (= Supabase auth user id) · `stations` · `dispensers`
- `shifts` · `shift_readings` · `shift_photos`
- `station_documents`
- `inventory_balances` · `inventory_movements`
- `debt_customers` · `debt_vehicle_visits` · `debt_transactions`
- `audit_logs`

Meter readings are stored as **strings** (preserve leading zeros) and converted to
numbers only for arithmetic. Money is `Decimal`.

## Module map

| Path                | Responsibility                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| `app/(auth)/`       | Login (atmospheric, public)                                                                               |
| `app/(dashboard)/`  | Overview, stations + tabs, Tải ảnh (`/upload`), review queues, reports, settings (auth-gated)             |
| `app/api/`          | Route handlers (uploads at `/api/uploads`, stations, shifts, readings, documents, inventory, debts, cron) |
| `proxy.ts`          | Session refresh + page gating                                                                             |
| `lib/ai/`           | Claude Vision wrapper, prompts, shift + debt extraction, confidence, mock                                 |
| `lib/matching/`     | photo→dispenser, anomaly detection (5 rules)                                                              |
| `lib/inventory/`    | stock calculator, shift-sales (deduction on complete)                                                     |
| `lib/documents/`    | expiry status + reminder buckets                                                                          |
| `lib/debts/`        | balance, aging buckets, FIFO payment allocation                                                           |
| `lib/photos/upload` | Store upload items and pass them to the photo readers                                                     |
| `lib/storage/`      | Supabase Storage upload / signed URLs                                                                     |
| `lib/supabase/`     | browser / server / admin clients, session refresh                                                         |
| `lib/auth/`         | session, permissions, audit                                                                               |
| `lib/misa-export/`  | shift → Excel (SheetJS; **placeholder layout** until §13.1 template)                                      |
| `lib/format.ts`     | VND / liters / date formatting (dayjs)                                                                    |
| `messages/vi.ts`    | All Vietnamese UI strings (code stays English)                                                            |
| `prisma/`           | schema, seed, generated client (`lib/generated/prisma`, gitignored)                                       |
| `test-fixtures/`    | expected meter extractions for AI_MOCK + accuracy tuning                                                  |

## The two AI pipelines (`lib/ai/`)

- **Shift (`extract-meter.ts`)** — classify the photo (router prompt) → read with the
  electronic or mechanical prompt → normalize. Confidence thresholds (§5.7) decide
  auto-approve vs review.
- **Debt (`extract-visit.ts`)** — read **liters + unit price** (never the displayed
  amount, which the meter truncates on large totals). Compute `amount = liters ×
unitPrice` and reconcile against the display with `checkAmountMatch` (anti-truncation,
  §5.6); a mismatch flags the visit for review.

## Design principles (from the build plan)

- **Human-in-the-loop** — AI drafts, accountant approves; never auto-approve a wrong value.
- **Don't trust photo metadata** — GPS/timestamp watermarks can be faked. Use
  server receive time or the chosen Ngày (past days count at 23:59:59.999 GMT+7);
  use the chosen Trạm, except a printed trạm label overrides it for Chốt ca and Đo bồn.
- **Save the original on correction** — editing an AI reading keeps the original value.
- **Config, not code, to add a station** — one codebase serves all 13 stations.
- **Debt amount = computed, not displayed** — the displayed total can be truncated.

## Mock & demo modes

| Flag                | Effect                                                                 |
| ------------------- | ---------------------------------------------------------------------- |
| `DEMO_MODE=true`    | Skip Supabase auth; act as the seeded admin (local only)               |
| `AI_MOCK=true`      | Meter extraction returns fixtures (no Anthropic key)                   |
| `STORAGE_MOCK=true` | Store photos under `public/dev-storage/` (no Supabase Storage project) |

## Conventions

Mirror `omnicasa-web`: TypeScript strict, Prettier (no-semi / single-quote / 2-space
/ 100-width), the per-feature folder layout, and TanStack-Query/Route-Handler patterns.
Detailed rules live in [`../.claude/standards/`](../.claude/standards) and `CLAUDE.md`.
