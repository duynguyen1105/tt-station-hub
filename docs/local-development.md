# Local development

How to run TT Station Hub on your machine. There are two ways to run it:

- **Demo mode (fastest)** — a local Postgres + a dev-only auth bypass + mocked
  AI and photo storage. **No external accounts needed.** Best for exploring the UI. ← this guide
- **Real mode** — a Supabase project + Anthropic API key. See
  [`PROJECT_STATUS.md`](../PROJECT_STATUS.md) §3.

---

## Prerequisites

- **Node.js 22+**
- **pnpm 10+** — `corepack enable` (ships with Node)
- A **PostgreSQL 16** database — via **Docker** (easiest) or **Homebrew**

---

## 1. Install

```bash
git clone git@github.com:thecricsy/TruongThinh.git
cd TruongThinh
pnpm install
pnpm exec prisma generate     # generates the typed client into lib/generated/prisma
```

## 2. Start a local Postgres

### Option A — Docker (recommended, identical on every machine)

```bash
docker compose up -d db
# Postgres runs at localhost:5432 — user: tt / password: tt / db: tt_station_hub
```

### Option B — Homebrew (macOS, no Docker)

```bash
brew install postgresql@16
brew services start postgresql@16
/opt/homebrew/opt/postgresql@16/bin/createdb tt_station_hub
# Connection string uses YOUR macOS username (no password):
#   postgresql://$(whoami)@localhost:5432/tt_station_hub
```

## 3. Create `.env`

Create a `.env` in the project root:

```bash
# --- Docker option ---
DATABASE_URL="postgresql://tt:tt@localhost:5432/tt_station_hub"
DIRECT_URL="postgresql://tt:tt@localhost:5432/tt_station_hub"
# --- Homebrew option (replace <user> with your macOS username) ---
# DATABASE_URL="postgresql://<user>@localhost:5432/tt_station_hub"
# DIRECT_URL="postgresql://<user>@localhost:5432/tt_station_hub"

# Dev-only: auto-login as the seeded admin (skip Supabase). NEVER use in production.
DEMO_MODE=true
# Mock AI and photo storage so no external API or Storage project is needed.
AI_MOCK=true
STORAGE_MOCK=true

STORAGE_BUCKET=station-photos

# Leave empty in demo mode (DEMO_MODE bypasses auth; STORAGE_MOCK bypasses Storage).
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

## 4. Create the schema + seed data

```bash
pnpm exec prisma db push            # create all tables
pnpm exec prisma db seed            # seed station ĐAKNONG 1 (6 dispensers, users, a debt customer)
pnpm exec tsx prisma/demo-data.ts   # optional: 1 shift + 6 readings + 1 debt visit so the review screens have data
```

## 5. Run

```bash
pnpm dev                            # http://localhost:3000
# If 3000 is taken:  pnpm exec next dev -p 3001
```

With `DEMO_MODE=true` you're **auto-logged-in as the seeded admin** — no login
needed. Open `/login` to see the login screen itself.

---

## What the flags do

| Flag                | Effect                                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `DEMO_MODE=true`    | Skips Supabase auth; acts as the seeded admin (`lib/auth/session.ts`). **Local only.**                                       |
| `DEMO_USER_EMAIL`   | With demo mode, acts as a seeded profile such as `vi@truongthinh.local` (kế toán) or `viewer@truongthinh.local` (người xem). |
| `AI_MOCK=true`      | Meter reading returns fixtures from `test-fixtures/` (no Anthropic key).                                                     |
| `STORAGE_MOCK=true` | Stores photos in `public/dev-storage/`, served by `next dev` at `/dev-storage/…`.                                            |

## Handy scripts

```bash
pnpm dev | build | start
pnpm type-check | lint | test | validate
pnpm db:studio        # open Prisma Studio to inspect the local DB
pnpm db:push | db:seed
```

## One-off migrations

The project has no migration history — schema changes go through `db:push`, which
can drop removed columns and their data. Where a change moves data rather than
discarding it, run the script under `scripts/` **before** `db:push` on any database
that predates the change. These scripts are idempotent, including on a brand-new
database.

```bash
pnpm db:phu-trach     # phụ trách: stations.assigned_accountant_id → station_accountants
pnpm db:fuel-stamp    # ca readings: stamp the nhiên liệu their trụ pumps
pnpm exec tsx scripts/rename-zalo-columns.ts
pnpm exec prisma db push --accept-data-loss
pnpm db:generate
```

## Running for real (production)

> A Trường Thịnh **Supabase** project is already provisioned. With the team's
> credentials you can point at it directly and skip steps 1 & 3.

1. Create/obtain a **Supabase** project; set `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and point
   `DATABASE_URL`/`DIRECT_URL` at its **Session pooler** connection string
   (the direct `db.<ref>.supabase.co` host is IPv6-only).
2. Add `ANTHROPIC_API_KEY`; set `DEMO_MODE`/`AI_MOCK`/`STORAGE_MOCK`
   to `false`.
3. `pnpm exec prisma db push`, `pnpm exec prisma db seed`, and create the private
   `station-photos` Storage bucket. Full status in `PROJECT_STATUS.md`.

## Troubleshooting

- **Port already in use** → run with `-p 3001`.
- **`prisma db push` fails** → make sure Postgres is running and `DATABASE_URL` is correct.
- **`curl`/tools "command not found"** in a script → unrelated to the app; use absolute paths.
- **Empty review screens** → run `pnpm exec tsx prisma/demo-data.ts` (step 4).
