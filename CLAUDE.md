# homedocs

A family's reference for their house: what each light, filter and wall takes, who to call, notes
with a "next time" lesson, projects, and a house guide shared with a housesitter by an expiring
link. Phone first, self-hosted, internet-facing (share links and a claude.ai connector over MCP).

Next.js 16 + Drizzle + PostgreSQL 18; pnpm; Node 24. Follows https://github.com/ki4hrg/standards
(Next.js app profile); the `standards` plugin is enabled in `.claude/settings.json`, and its
`ship` skill is how work lands. How it's built (model, guard table, search, the guide's gate,
integrations, MCP): `docs/ARCHITECTURE.md` · deploy and env: `docs/DEPLOYMENT.md` · decisions:
`docs/DECISIONS.md` · agreed, not built: `docs/ROADMAP.md`. This Next.js is newer than your
training data: read the guide in `node_modules/next/dist/docs/` before using an API.

## Commands

- `pnpm dev`: needs `.env.local` (copy `.env.example`; `lib/env.ts` names what's missing) and
  the local database below, migrated first (`db:migrate`, below). A fresh database starts at `/setup`.
- `pnpm typecheck && pnpm lint && pnpm test`: all three pass before anything is called done,
  and `pnpm db:drift` too after a schema change. CI also runs `pnpm e2e` on the PR, and it gates
  the merge. `pnpm test` runs Vitest on a real Postgres through Testcontainers (Docker running).
- `pnpm e2e`: Playwright at phone width with axe; it starts its own Postgres and `next dev` on
  port 3100.
- `pnpm db:generate --name <what>` after changing `lib/db/schema.ts`; `pnpm db:drift` checks
  nothing is missing a migration (CI runs it). `DATABASE_URL=postgres://homedocs:homedocs@localhost:54330/homedocs
  pnpm db:migrate` applies them locally (it doesn't read `.env.local`).
- Local database: `docker run -d --name homedocs-dev-db -e POSTGRES_USER=homedocs -e POSTGRES_PASSWORD=homedocs -e POSTGRES_DB=homedocs -p 54330:5432 postgres:18-alpine`
- `pnpm render:icons` after changing `app/icon.svg`.

## Rules that are easy to break

- **Every domain call takes a `PropertyScope`, and every query on a domain table filters
  `property_id` and `deleted_at`** (`liveIn()` in `lib/core/internal.ts` for a row by id).
  Without the first a record from another property leaks; without the second a deleted record
  comes back.
- **A write that changes text another record's search document includes calls the cascade in
  `lib/search/rebuild.ts`, and updates the table at the top of that file.** A fixture's document
  carries its place's path and its parts' names, so renaming a place or part otherwise leaves
  search finding the old name.
- **In a correlated Drizzle subquery, write the outer table name by hand (`supplies.id`).**
  Inside a single-table select Drizzle renders `${table.col}` unqualified, so the inner row is
  compared with itself. It has bitten here three times; `test/counts.test.ts` pins the counts.
- **Gated guide content (codes, private sections, the address) is decided only in
  `buildGuide()` (`lib/guide/guide.ts`), and nothing gated reaches the offline guide** (it is
  always built with `unlocked: false`). `resolveVisit()` (`lib/guide/viewing.ts`) decides "at home
  or unlocked"; `buildGuide()` alone decides what that reveals, and the offline copy stays on a
  phone whoever holds it.
- **The UI's words are Place, System, Fixture, Part, Note, Contact, Project.** The family reads
  them; the tables keep older names (`spaces`, `supplies`, `logs`), mapped in ARCHITECTURE.
- **Guards.** `app/(app)/` pages are signed in by their layout and take the viewer's scope;
  server actions are public endpoints and go through `act()` (`lib/web/action.ts`), which signs
  in and parses the input with zod, except the ones that start a session (sign-in, setup, join,
  OAuth consent, the guide's PIN: `NOT_ACT` in `test/action-guards.test.ts`, which checks every
  action), which parse first. Everything outside `app/(app)/` authenticates itself or is public
  by design, as its row in the guard table in `docs/ARCHITECTURE.md` says; a new route gets a
  row.

## Layout

- `app/(app)/` signed-in pages and their `actions.ts` · `app/(auth)/` login, OIDC sign-on, `/sso`,
  invites (`join`), `/setup` · `app/g/[token]/` the shared house guide · `app/api/` health, files,
  Homebox/paperless search and thumbnails (`ext/`) · `app/mcp/`, `app/oauth/`, `app/.well-known/` the connector and its OAuth
- `lib/db/` schema, migrations · `lib/core/` types (`PropertyScope`, `AppError`), audit,
  `liveIn()` · `lib/env.ts` the validated environment · `lib/auth/` sessions, passwords, invites,
  OIDC, route guards (`guards.ts`) · `instrumentation.ts` → `lib/boot.ts` env check, OIDC, jobs
- Domain modules, the one write path: `lib/places/`, `fixtures/`, `parts/`, `systems/`, `notes/`,
  `contacts/`, `projects/` (projects, series, materials), `links/`, `files/`, `trash/`,
  `property/`
- `lib/guide/` the guide, its location gate, share links, offline copy · `lib/search/` ·
  `lib/crypto/sealed.ts` codes and tokens sealed under `INTEGRATIONS_KEY` · `lib/integrations/`
  Homebox and paperless · `lib/mcp/` the MCP server, tools in `tools/` · `lib/oauth/` ·
  `lib/jobs/` background jobs · `lib/web/` `act()`, field schemas, `clientIp()`, the viewer
- `components/ui/` shared primitives · `components/` shared pieces · `app/globals.css` the colour
  tokens
- `public/` service workers (`g/sw.js` the guide's offline copy), icons
- `test/` Vitest on real Postgres · `e2e/` Playwright with its own database · `scripts/`
  `db-drift.sh`, icon rendering

## Exceptions to the standards

- **Client address from `X-Real-IP`** (`CLIENT_IP_HEADER=x-real-ip` in production), not counted
  from the right of `X-Forwarded-For`: the proxy in front overwrites it on every request.
  `docs/DEPLOYMENT.md` says what it relies on; `docs/DECISIONS.md` records the decision.
