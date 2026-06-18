# TT Station Hub — Project Status

_Module 5 — Hồ sơ Trạm (Công ty Hóa dầu Trường Thịnh). Last updated: 2026-06-17._

This document tracks **what is built**, **what is blocked on keys/credentials**, and
**what is blocked on clarification**. Source code is in English; user-facing UI text is
Vietnamese (centralized in `messages/vi.ts`).

---

## 0. How to run / verify

```bash
pnpm install
pnpm exec prisma generate     # generates the typed client into lib/generated/prisma
pnpm type-check               # tsc --noEmit       ✅ passes
pnpm lint                     # eslint             ✅ passes
pnpm test                     # vitest (50 tests)  ✅ passes
pnpm build                    # next build         ✅ passes
pnpm dev                      # local dev server
```

To run **end-to-end** you must provide credentials (see §3) and run `prisma migrate dev`

- `prisma db seed`.

**Mock modes** (develop with no external services):

- `AI_MOCK=true` — meter extraction returns fixtures from `test-fixtures/expected-extractions.json`.
- `ZALO_MOCK=true` — the webhook accepts a POST with header `x-mock-secret: <ZALO_OA_WEBHOOK_SECRET>` and replies via console log.

---

## 1. Tech stack (mirrors the `omnicasa-web` repo)

Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind v4 · shadcn/ui
(radix base + vega preset) · TanStack Query · Zustand · react-hook-form + zod v3 ·
dayjs · sonner · pnpm · Prettier (no-semi / single-quote / 2-space / 100-width) +
ESLint flat config. **Backend** (not in omnicasa-web, per plan): Supabase (Postgres +
Auth + Storage) + **Prisma 7** (new `prisma-client` generator + pg driver adapter).

---

## 2. What is BUILT (and verified: build + lint + types + tests all green)

### Foundation

- Next 16 project, Be Vietnam Pro font (`vietnamese` subset), `lang="vi"`, providers
  (TanStack Query + theme + sonner). `lib/format.ts` (VND / liters / date formatting).
- Prisma 7 schema — all 13 models from the plan with snake_case columns + indexes
  (`prisma/schema.prisma`), generated client, idempotent seed for **ĐAKNONG_1**
  (`prisma/seed.ts`).
- Supabase clients: browser, server (async cookies for Next 16), service-role admin.

### Auth & layout

- **`proxy.ts`** (Next 16 renamed `middleware` → `proxy`) + `lib/supabase/update-session.ts`:
  session refresh + page gating.
- `lib/auth/session.ts` (`getCurrentUser` / `requireUser` / `requireRole`),
  `lib/auth/permissions.ts`, `lib/auth/audit.ts`.
- Login page + form; dashboard shell with shadcn sidebar (5 nav items) + logout.

### AI Vision (`lib/ai/`)

- `claude-vision.ts` — Anthropic wrapper, 3× retry + backoff, JSON extraction.
- `prompts.ts` — router / electronic / mechanical / **debt-meter** / vehicle prompts
  (English instructions quoting the Vietnamese on-meter terms TRẠM/TRU/HẦM/ĐỒNG/LÍT).
- `extract-meter.ts` — shift pipeline (classify → read → normalize).
- `extract-visit.ts` — **debt pipeline with anti-truncation (§5.6)**: amount = liters ×
  unit price, reconciled against the truncated display; also reads plate.
- `image-prep.ts` (sharp resize ≤1568px, JPEG 85), `confidence.ts` (§5.7 thresholds),
  `mock.ts` (AI_MOCK).

### Domain logic (`lib/matching`, `lib/inventory`, `lib/documents`, `lib/debts`)

- `anomaly-detection.ts` — 5 rules (decreased, large delta, meters diverge, low
  confidence, missing photo).
- `photo-to-reading.ts` — match photo → dispenser + meter slot.
- `visit-pairing.ts` — pair vehicle + meter photos for a credit fill.
- `stock-calculator.ts` — estimated stock, variance, low-stock.
- `expiry-checker.ts` — document status + 60/30/15-day reminder marks.
- `aging.ts` — debt balance, aging buckets, FIFO payment allocation.

### Integration

- **Zalo webhook** (`app/api/zalo/webhook/route.ts` + `lib/zalo/*`): signature verify,
  event parse, download → Storage, find/create shift, classify shift-vs-debt by caption,
  fire-and-forget AI. `ZALO_MOCK` supported.

### API routes (zod + auth/role + audit log)

`stations`, `shifts/[id]` (+`complete`), `readings/[id]/{approve,correct,reject}`
(**correct preserves the original AI value**), `documents`, `inventory` (+`movements`
with balance update), `debts/payments` (FIFO), `shifts/[id]/export-misa`.

### Ops & docs

- Cron: `document-reminders` (status + 60/30/15 reminders), `scheduled-tasks` stub
  (both guarded by `CRON_SECRET`).
- `Dockerfile` + `docker-compose.yml` + `.dockerignore`.
- Vietnamese docs: `docs/huong-dan-ke-toan.md`, `docs/huong-dan-nhan-vien-tram.md`.

### Tests (50, all passing)

format, AI extraction + fixtures, anti-truncation, anomaly rules, photo matching,
visit pairing, stock, expiry, debt aging, Zalo classify/parse/signature.

---

## 3. BLOCKED on keys / credentials

| Need                                                                                                                                           | Used for           | How to unblock                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Supabase project** (`DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`) | DB, Auth, Storage  | Create the project → fill `.env` → `prisma migrate dev` → `prisma db seed` → create private bucket `station-photos` → create Supabase Auth users matching the seeded profile IDs |
| **`ANTHROPIC_API_KEY`**                                                                                                                        | Live meter reading | Add to `.env`; until then `AI_MOCK=true`                                                                                                                                         |
| **Zalo OA** (`ZALO_OA_APP_ID`, `ZALO_OA_ACCESS_TOKEN`, `ZALO_OA_WEBHOOK_SECRET`)                                                               | Receiving photos   | Register OA, set webhook URL; until then `ZALO_MOCK=true`                                                                                                                        |

Everything above is **coded and type-checked** — it runs as soon as the values are present.

---

## 4. BLOCKED on clarification (questions for Trường Thịnh)

| #     | Question                                                             | Impact                           | Current handling                                                                                                                               |
| ----- | -------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| §12.2 | Debt meter liters format: is `"430000"` = **43.0 L** or **4.3 L**?   | Computed amount for credit sales | `checkAmountMatch` flags any liters/price that can't reconcile with the display (catches the 10× error); needs confirmation to set the default |
| §13.1 | **MISA Nội bộ Excel template** (exact columns, retail + credit)      | MISA export                      | `lib/misa-export/shift-to-excel.ts` uses a **placeholder layout** with a clean seam to drop in the real template                               |
| §12.3 | Does the Zalo OA receive **group** webhooks, or must staff chat 1-1? | Webhook routing                  | Group mapping built; 1-1 needs a sender→station map (TODO marked)                                                                              |
| §12.4 | Standard caption for credit fills; are the 2 photos always adjacent? | Visit pairing accuracy           | Heuristic (caption + 5-min window) — pilot-tunable                                                                                             |
| §12.5 | Exact shift (ca) time windows                                        | Auto shift assignment            | Assumed morning <12:00 / afternoon <18:00 / night, GMT+7 — TODO marked                                                                         |
| §12.6 | Tank dip → liters conversion (barem bồn)                             | Physical stock entry             | Physical count entered directly for now                                                                                                        |
| §12.7 | Partially-readable mechanical meter: write `"?"` or force review?    | Edge handling                    | AI writes `"?"`, flagged low-confidence → review                                                                                               |

Anomaly thresholds (max delta, meter divergence) are set to sensible defaults in
`DEFAULT_ANOMALY_CONFIG` and are meant to be **tuned during the 3-day pilot** with real data.

---

## 5. Remaining work (not blocked — buildable now)

- **UI screens (Phase D)** — the API + logic are ready; the React screens still to build:
  station tabs (overview/shifts/documents/inventory/debts), shift detail + reading rows +
  photo viewer + correction dialog, the two review queues, document table + form, inventory
  cards + movement form, debt customer list + visit review + payment form, and the
  all-stations overview with centralized alerts. (Login + dashboard shell + overview exist.)
- A few remaining API routes follow the same pattern (dispensers CRUD, debt visit
  approve/correct, debt customers CRUD, document update/delete).
- Wire shift-completion → inventory `sale` postings (uses `stock-calculator`).
- Deliver reminders over a real channel (Zalo/email) from the cron.

---

## 6. Notable framework specifics handled

- Next 16: `middleware.ts` → **`proxy.ts`**; async `cookies()`; stricter
  `react-hooks/set-state-in-effect` (fixed `use-mobile` with `useSyncExternalStore`).
- Prisma 7: `prisma-client` generator (output `lib/generated/prisma`), Query Compiler +
  **pg driver adapter**, config in `prisma.config.ts`.
- shadcn: radix-vega preset; the old RHF `form` is replaced by the `field` primitive.

---

## 7. UI (Phase D) — BUILT

The app is now fully navigable (no 404s). Server components read Prisma directly; small
client islands call the API routes then `router.refresh()`.

- **All-stations overview** (`/`) — global alert cards + per-station table (pending /
  expiring docs / low stock / debt balance).
- **Stations list** (`/stations`) and **station profile** with tabs
  (`/stations/[id]` + `…/shifts`, `…/documents`, `…/inventory`, `…/debts`).
- **Shift detail** — reading table with **Approve / Correct / Reject** (correction dialog
  preserves the original AI value) + **Complete shift** (guarded while reviews pending).
- **Review queues** — `/review/shifts` and `/review/debts`.
- **MISA export** page (`/reports/misa-export`) — completed-shift list with download links.
- **Settings** pages (`/settings/{stations,dispensers,users,zalo}`) — admin-gated.
- Shared: `StatusBadge`, `ExpiryBadge`, `StationTabs`, `ReadingRow`, status/label helpers.

### Data-entry forms — BUILT

- **Add document** (`document-form`), **add inventory movement** (`movement-form`, signs the
  quantity: sales negative), **record payment** (`payment-form`, per customer).
- **Debt visit review** (`visit-review`): assign customer + **Approve** (charges the debt
  ledger in a transaction) + **Correct** dialog (plate/liters/unit-price → recomputes amount).
  Backed by `app/api/debts/visits/[id]/{approve,correct}`.

### Remaining UI polish (not blocked)

- Settings management screens (currently informative placeholders).
- Photo viewer (signed-URL image) in the shift detail.
- Document edit/delete (create is done).
