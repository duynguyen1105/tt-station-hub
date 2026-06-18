# Local development

How to run TT Station Hub on your machine. There are two ways to run it:

- **Demo mode (fastest)** — a local Postgres + a dev-only auth bypass + mocked
  AI/Zalo. **No external accounts needed.** Best for exploring the UI. ← this guide
- **Real mode** — a Supabase project + Anthropic API key + Zalo OA. See
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
# Mock external services so no API keys are needed.
AI_MOCK=true
ZALO_MOCK=true

STORAGE_BUCKET=station-photos

# Leave empty in demo mode (DEMO_MODE bypasses Supabase auth/storage).
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

| Flag             | Effect                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------- |
| `DEMO_MODE=true` | Skips Supabase auth; acts as the seeded admin (`lib/auth/session.ts`). **Local only.** |
| `AI_MOCK=true`   | Meter reading returns fixtures from `test-fixtures/` (no Anthropic key).               |
| `ZALO_MOCK=true` | Zalo webhook logs to console instead of calling Zalo.                                  |

## Handy scripts

```bash
pnpm dev | build | start
pnpm type-check | lint | test | validate
pnpm db:studio        # open Prisma Studio to inspect the local DB
pnpm db:push | db:seed
```

## Running for real (production)

> A Trường Thịnh **Supabase** project is already provisioned. With the team's
> credentials you can point at it directly and skip steps 1 & 3.

1. Create/obtain a **Supabase** project; set `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and point
   `DATABASE_URL`/`DIRECT_URL` at its **Session pooler** connection string
   (the direct `db.<ref>.supabase.co` host is IPv6-only).
2. Add `ANTHROPIC_API_KEY` and the Zalo OA keys; set
   `DEMO_MODE`/`AI_MOCK`/`ZALO_MOCK` to `false`.
3. `pnpm exec prisma db push`, `pnpm exec prisma db seed`, and create the private
   `station-photos` Storage bucket. Full status in `PROJECT_STATUS.md`.

## Troubleshooting

- **Port already in use** → run with `-p 3001`.
- **`prisma db push` fails** → make sure Postgres is running and `DATABASE_URL` is correct.
- **`curl`/tools "command not found"** in a script → unrelated to the app; use absolute paths.
- **Empty review screens** → run `pnpm exec tsx prisma/demo-data.ts` (step 4).
