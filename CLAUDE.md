# homedocs

A family reference app for the house (see README.md, docs/ARCHITECTURE.md). Next.js 16 + Drizzle +
Postgres 18; pnpm.

## Commands
- `pnpm typecheck && pnpm lint && pnpm test`: run all three before saying anything is done.
- `pnpm e2e`: Playwright at phone width; it starts its own Postgres and `next dev` on port 3100.
- `pnpm db:generate --name <what>`: after changing `lib/db/schema.ts`.
  - Migrations are append-only.
  - Put any backfill in the same migration.

## Rules that are easy to break
- **One write path.** Mutations go through the domain modules in `lib/<area>/`. They check the role,
  validate, audit (same transaction), and rebuild search. Server actions wrap them in `act()`.
- **Scope everything.** Every domain call takes a `PropertyScope`. Every query on a domain table
  filters `property_id` and `deleted_at`; use `liveIn()`.
- **Guards.** `app/(app)/` is guarded by its layout. Anything under `app/api/`, `app/g/` or `app/mcp`
  is not: authenticate explicitly, and add the route to the guard table in docs/ARCHITECTURE.md.
- **Search cascades.** If a write changes text that another record's search document includes, call
  the cascade in `lib/search/rebuild.ts`, and update the table at the top of that file.
- **Drizzle subqueries.** Inside a single-table select, Drizzle renders `${table.col}` *unqualified*.
  In a correlated subquery, write the outer table name by hand (`supplies.id`).
- **Secrets.** Values are sealed with `INTEGRATIONS_KEY` (`lib/crypto/sealed.ts`).
  - Never put a secret value or token in audit rows, logs, MCP output, or the offline guide.
  - Gated guide content is decided only in `buildGuide()`.
- **Client IP.** Use `clientIp()`, which reads `X-Forwarded-For` from the right. Never use the leftmost
  entry; the client controls it.
- **Errors meant for a person** are `AppError` subclasses (`ValidationError`, `ForbiddenError`,
  `StaleWriteError`). Write them in plain words; the family reads them.
- **UI.**
  - Phone first: tap targets of 44px or more.
  - Use the colour tokens in `app/globals.css`, never raw palette colours.
  - Plain words: Place, System, Fixture, Part, Note, Contact, Project. (Fixtures were "Things" and contacts
    were "People" until October 2026; the old routes redirect.)
- **Compose.** No `build:` block, and `pull_policy: always` on the app image (not on postgres); CI builds the image.

## Git
Conventional Commits. `main` deploys (CI → GHCR → Dockhand webhook).
