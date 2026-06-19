# TT Station Hub — Project Status

_Module 5 — Hồ sơ Trạm (Công ty Hóa dầu Trường Thịnh). Last updated: 2026-06-18._

This document tracks **what is built**, **external-service status**, and **what is
blocked on clarification**. Source code is in English; user-facing UI text is
Vietnamese (centralized in `messages/vi.ts`).

---

## 0. How to run / verify

```bash
pnpm install
pnpm exec prisma generate     # generates the typed client into lib/generated/prisma
pnpm type-check               # tsc --noEmit       ✅ passes
pnpm lint                     # eslint             ✅ passes
pnpm test                     # vitest (53 tests)  ✅ passes
pnpm build                    # next build         ✅ passes
pnpm dev                      # http://localhost:3000
```

The shared Trường Thịnh **Supabase** project is connected (see §3). For a fresh DB,
fill `.env` from `.env.example`, then `pnpm exec prisma db push` + `pnpm exec prisma db seed`.
Local-only demo (no accounts): see [`docs/local-development.md`](docs/local-development.md).

**Mock modes** (develop without external services):

- `DEMO_MODE=true` — skip Supabase auth, act as the seeded admin (local only).
- `AI_MOCK=true` — meter extraction returns fixtures from `test-fixtures/expected-extractions.json`.
- `ZALO_MOCK=true` — the webhook accepts a mock POST and replies via console log.

---

## 1. Tech stack (mirrors the `omnicasa-web` repo)

Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind v4 · shadcn/ui
(radix base + vega preset) · TanStack Query · Zustand · react-hook-form + zod v3 ·
dayjs · sonner · pnpm · Prettier (no-semi / single-quote / 2-space / 100-width) +
ESLint flat config. **Backend** (not in omnicasa-web, per plan): Supabase (Postgres +
Auth + Storage) + **Prisma 7** (new `prisma-client` generator + pg driver adapter).

---

## 2. What is BUILT (verified: build + lint + types + tests all green)

### Foundation

- Next 16 project, Be Vietnam Pro font (`vietnamese` subset), `lang="vi"`, providers
  (TanStack Query + theme + sonner). `lib/format.ts` (VND / liters / date formatting).
- Prisma 7 schema — all 13 models from the plan with snake_case columns + indexes,
  generated client, idempotent seed for **ĐAKNONG_1** (`prisma/seed.ts`).
- Supabase clients: browser, server (async cookies for Next 16), service-role admin.

### Auth & layout

- **`proxy.ts`** (Next 16 renamed `middleware` → `proxy`) + `lib/supabase/update-session.ts`:
  session refresh + page gating.
- `lib/auth/session.ts` (`getCurrentUser` / `requireUser` / `requireRole`),
  `permissions.ts`, `audit.ts`.
- Login page + form; dashboard shell with shadcn sidebar (5 nav items) + logout.

### AI Vision (`lib/ai/`)

- `claude-vision.ts` — Anthropic wrapper, 3× retry + backoff, JSON extraction.
- `prompts.ts` — router / electronic / mechanical / **debt-meter** / vehicle prompts
  (English instructions quoting the on-meter Vietnamese terms TRẠM/TRU/HẦM/ĐỒNG/LÍT).
- `extract-meter.ts` (shift pipeline) · `extract-visit.ts` (**debt anti-truncation §5.6**:
  amount = liters × unit price, reconciled vs the truncated display; also reads plate).
- `image-prep.ts` (sharp ≤1568px JPEG 85), `confidence.ts` (§5.7 thresholds), `mock.ts`.

### Domain logic (`lib/matching`, `lib/inventory`, `lib/documents`, `lib/debts`)

- `anomaly-detection.ts` (5 rules) · `photo-to-reading.ts` · `visit-pairing.ts` ·
  `stock-calculator.ts` · `shift-sales.ts` (inventory deduction on shift complete) ·
  `expiry-checker.ts` (status + 60/30/15 reminders) · `aging.ts` (balance, aging, FIFO).

### Integration

- **Zalo webhook** (`app/api/zalo/webhook/route.ts` + `lib/zalo/*`): signature verify,
  event parse, download → Storage, find/create shift, classify shift-vs-debt, fire-and-forget AI.
- **Manual photo upload** (`app/api/photos/route.ts` + `/upload` page): the non-Zalo entry
  point into the same pipeline (see §"Manual upload" below). The shared store → AI → review
  core lives in **`lib/photos/ingest.ts`**, used by both the webhook and the upload route.

### API routes (zod + auth/role + audit log)

`stations`, `shifts/[id]` (+`complete`, which **posts inventory sales**),
`readings/[id]/{approve,correct,reject}` (**correct preserves the original AI value**),
`documents`, `inventory` (+`movements`), `debts/payments` (FIFO),
`debts/visits/[id]/{approve,correct}`, `shifts/[id]/export-misa`, cron routes.

### UI (Phase D)

All screens built (no 404s) — see §7.

### Ops & docs

- Cron: `document-reminders` + `scheduled-tasks` (guarded by `CRON_SECRET`).
- `Dockerfile` + `docker-compose.yml`. GitHub Actions CI (type-check/lint/test/build).
- Docs: `docs/local-development.md`, Vietnamese guides (`huong-dan-ke-toan`,
  `huong-dan-nhan-vien-tram`, `huong-dan-zalo-oa`).

### Tests (53, all passing)

format, AI extraction + fixtures, anti-truncation, anomaly rules, photo matching,
visit pairing, stock, **shift-sales**, expiry, debt aging, Zalo classify/parse/signature.

---

## 3. External services

| Service                                                                          | Status             | Notes                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Supabase** (Postgres / Auth / Storage)                                         | ✅ **Provisioned** | Trường Thịnh org project, connected via the **Session pooler** (`ap-southeast-1`, IPv4). Schema pushed + seeded; private `station-photos` bucket created; login accounts `admin@truongthinh.local` + `vi@truongthinh.local` linked to profiles. Env: `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`. |
| **Anthropic** (`ANTHROPIC_API_KEY`)                                              | ✅ **Key added**   | `AI_MOCK=false`. Live reading ready; accuracy tuning still needs the 13 sample photos (§4).                                                                                                                                                                                                                                                                                   |
| **Zalo OA** (`ZALO_OA_APP_ID`, `ZALO_OA_ACCESS_TOKEN`, `ZALO_OA_WEBHOOK_SECRET`) | ⏳ **Pending**     | Dev app "TT Station Hub" created — **App ID + App Secret set** in `.env`. Official Account API permissions submitted for Zalo review (messages / send / group GMF). Still need: app activated (contact phone+email), **access/refresh token**, webhook URL (ngrok), and the group-vs-1:1 test (§12.3). Until then `ZALO_MOCK=true`. See `docs/huong-dan-zalo-oa.md`.                                                          |

> The direct DB host (`db.<ref>.supabase.co`) is IPv6-only → use the **Session pooler**
> (IPv4). All secrets live in the gitignored `.env` — never committed.

### Manual upload (test the pipeline without Zalo)

Zalo is only the delivery channel — the **store → AI-read → review** pipeline is independent.
Until the OA is live (Zalo review can take hours/days), use the manual entry point:

- **`/upload`** (sidebar → "Tải ảnh") — pick a station, drop a real meter photo, and the AI
  reading comes back inline (reading / dispenser / fuel / confidence; for debt photos:
  liters / unit price / computed amount + the anti-truncation match check).
- It stores to the same Storage bucket, creates the same `shift_photos` row, finds/creates
  the shift, and runs the **same** `extractMeter` / `extractVisitMeter` as the webhook —
  via the shared `lib/photos/ingest.ts`. So a shift photo lands in the normal review queue.
- Requires `ANTHROPIC_API_KEY` + `AI_MOCK=false` for a real read (or `AI_MOCK=true` for a
  fixture). HEIC may not decode — JPEG/PNG/WebP recommended.

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

Anomaly thresholds (max delta, meter divergence) use sensible defaults in
`DEFAULT_ANOMALY_CONFIG`, to be **tuned during the 3-day pilot** with real data.

---

## 5. Remaining work (not blocked)

- **UI polish** (see §7): settings management screens (currently placeholders),
  in-app photo viewer (signed-URL) in the shift detail, document edit/delete.
- **A few CRUD routes** following the existing pattern: dispensers, debt customers,
  document update/delete.
- **Deliver cron reminders** over a real channel (Zalo/email) once the OA is live.
- **AI accuracy tuning** — add the 13 sample photos to `test-fixtures/sample-photos/`,
  confirm each expected reading, and tune to ≥12/13.

---

## 6. Notable framework specifics handled

- Next 16: `middleware.ts` → **`proxy.ts`**; async `cookies()`; stricter
  `react-hooks/set-state-in-effect` (fixed `use-mobile` with `useSyncExternalStore`).
- Prisma 7: `prisma-client` generator (`lib/generated/prisma`), Query Compiler +
  **pg driver adapter**, config in `prisma.config.ts`.
- shadcn: radix-vega preset; the old RHF `form` is replaced by the `field` primitive.
- Supabase: direct connection is IPv6-only → use the Session pooler; modern
  **publishable/secret** API keys (not legacy anon/service_role).

---

## 7. UI — BUILT

Fully navigable (no 404s). Server components read Prisma directly; small client islands
call the API routes then `router.refresh()`. Aesthetic: a warm "petroleum operations
console" theme (bone paper · petroleum-teal · brass), inked sidebar with a gauge mark.

- **All-stations overview** (`/`) — alert cards + per-station table.
- **Stations list** + **station profile** tabs (overview / shifts / documents / inventory / debts).
- **Shift detail** — readings with **Approve / Correct / Reject** (correction preserves the
  original AI value) + **Complete shift** (deducts inventory; guarded while reviews pending).
- **Review queues** (`/review/shifts`, `/review/debts`, with assign-customer + approve/correct).
- **Data-entry forms** — add document, add inventory movement, record payment.
- **Photo upload** (`/upload`) — drag-and-drop a meter photo → AI reading shown inline; links
  through to the created shift. Runs the real pipeline without Zalo (see §"Manual upload").
- **MISA export** page (download links). **Settings** pages (admin-gated).

### Remaining UI polish (not blocked)

- Settings management screens (currently informative placeholders).
- Photo viewer (signed-URL image) in the shift detail.
- Document edit/delete (create is done).
