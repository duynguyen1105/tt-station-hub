# Contributing / Onboarding

Welcome. This gets a new teammate from clone → running → first change.

## 1. Prerequisites

- **Node.js 22+**, **pnpm 10+** (`corepack enable`)
- A **PostgreSQL 16** (Docker or Homebrew) — only for the local-demo path

## 2. Get the code

```bash
git clone git@github.com:thecricsy/TruongThinh.git
cd TruongThinh
pnpm install
pnpm exec prisma generate
```

## 3. Environment (`.env`)

`.env` is **gitignored** (it holds secrets) — it is **not** in the repo. Two ways to fill it:

- **Demo path (fastest, no secrets):** local Postgres + `DEMO_MODE=true` + mock AI/Zalo.
  Follow [docs/local-development.md](docs/local-development.md). Best for exploring the UI.
- **Shared project:** to connect to the team's **Supabase / Anthropic**, ask the project
  owner for the `.env` values (Supabase **Session pooler** connection string + the
  publishable/secret keys + `ANTHROPIC_API_KEY`). Use `.env.example` as the shape.

**Never commit `.env` or paste secrets into the repo, issues, or chat groups.**

## 4. Run

```bash
pnpm dev     # http://localhost:3000  (use -p 3001 if 3000 is busy)
```

- Demo mode → you're auto-logged-in as the seeded admin.
- Shared Supabase → log in with the team-provided account.

## 5. Dev loop (do this before every push)

```bash
pnpm type-check && pnpm lint && pnpm test && pnpm build
```

CI (GitHub Actions) runs the same on every push — keep it green. Add/extend a
**Vitest** test for any domain-logic change (`lib/**`).

## 6. Git

- Commit with **your own** name + email (don't reuse someone else's identity).
- Branch for non-trivial work; open a PR if the team uses them.
- The working tree must stay clean (no stray files; secrets gitignored).

## 7. Where things are

| Doc                                                              | Purpose                                                           |
| ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| [README.md](README.md)                                           | Overview + quick start                                            |
| [docs/architecture.md](docs/architecture.md)                     | How the system fits together + module map                         |
| [docs/local-development.md](docs/local-development.md)           | Run it locally (demo + real)                                      |
| [PROJECT_STATUS.md](PROJECT_STATUS.md)                           | What's built / external services / blockers / next                |
| [CLAUDE.md](CLAUDE.md) + [.claude/standards/](.claude/standards) | Conventions & coding standards                                    |
| `docs/huong-dan-*.md`                                            | Vietnamese end-user guides (accountant / station staff / Zalo OA) |

## 8. Conventions in one line

TypeScript strict · Prettier (no-semi, single-quote, 2-space, 100-width) · per-feature
folders · **code in English, UI text in Vietnamese** (`messages/vi.ts`) · server
components read Prisma, client islands call API routes then `router.refresh()`.
