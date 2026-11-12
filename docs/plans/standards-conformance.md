# Standards conformance: homedocs

Audited 2026-11-12 against the standards at `v1` (`c70622c`; local clone at `0c19300`, docs,
templates and workflow comments only ahead), Next.js app profile. This is the Phase 0 report,
tracked from the Phase 1 PR on. The findings below describe `main` as audited; John's answers are
in "John's decisions (2026-11-12)" at the end, and each phase carries them out, so where a
section and a decision disagree, the decision wins.
Repo: `John-Fleischauer/homedocs` (**public**; moved from the previous owner account; the local `origin` already
points at the new owner). Local `main` = `origin/main` = `6345c55` (#8), which is also what
production runs (`/api/health` revision, checked from outside 2026-11-12).

**This repo is public**, so this report names no hostnames, addresses or private repos. "The host" is the
machine homedocs runs on; "the infrastructure repo" is where its own decisions live.

- **Profile:** Next.js app, already very close: Next **16.3.3** (App Router, `output:
  'standalone'`, `agentRules: false`), TypeScript strict + `noUncheckedIndexedAccess`, pnpm
  **11.21** pinned with `packageManager` (`nodeLinker: hoisted`, `supportedArchitectures` for
  sharp and argon2), Drizzle 0.45 + postgres-js on **PostgreSQL 18**, drizzle-kit migrations
  (`0000`–`0006`) applied by the entrypoint after a pre-migration `pg_dump`, zod 4 (MCP only),
  own sessions (argon2) + `openid-client`, Tailwind 4 with mostly the standard token names, the
  official MCP SDK (stateless, JSON responses, 26 tools), Vitest 4 on real Postgres
  (Testcontainers, 18 files), Playwright e2e with axe. Roles viewer/member/admin over one property.
- **Exposure: internet-facing.** The claude.ai Homedocs connector reaches `/mcp` and the OAuth
  routes from Anthropic's cloud; share links (`/g/<token>`) go to housesitters; `APP_HEALTH_URL`
  answers from outside: `{"status":"ok","revision":"6345c55…"}`, HTTP 200. A reverse proxy on the same
  host reaches the app over the external `web` network; no published port.
- **Deploy host differs from the other apps:** an **arm64** host. Dockhand drives it through an
  agent on that host, and the last deploy's reply was `success: true`. So it is deploy mode A,
  but backups, architecture and the proxy are that host's (Deploy, and question 3).
- **Activity:** 10 commits, 2026-10-16 to 2026-10-26 (inside 90 days; nothing since the org
  move). **All 10** carry a Claude trailer; 3 are authored by a second
  account of John's (#6–#8). CLAUDE.md: 3 commits, all with a trailer.
- **Checks today:** not run (no install, build or Docker, by brief). This box has Node 20, which
  pnpm 11 refuses, so the audit ran through `corepack pnpm@10.33.0 audit` on a copy of
  `package.json` (without `packageManager`), `pnpm-lock.yaml` and `pnpm-workspace.yaml` in a
  scratch directory. CI was green on every run (last 2026-10-27, `check`, `e2e`, `image`,
  `deploy`); **no run has started since the move to the organization**.

## The claude.ai connector must keep working through every phase

The connector is `<PUBLIC_BASE_URL>/mcp`, 26 tools (16 read, 10 write; no delete tools, no
codes), signed in through the app's own OAuth 2.1 server (`app/oauth/`, `app/.well-known/`,
`lib/oauth/`). Tokens are HMAC'd under `SESSION_SECRET` (`lib/auth/tokens.ts`), so **rotating
`SESSION_SECRET` signs the connector out** (`docs/DEPLOYMENT.md:34` says so). A viewer's
connection is read-only (scope ∩ live role).

**In this session's claude.ai tool list, Homedocs offers only `authenticate` and
`complete_authentication`**: the connector is signed out or its token expired. It needs
reconnecting before the first deploy, or there's no way to run the connector check (question 14).

After every deploy: list tools from claude.ai and call one read (`search` or `list_places`); no
production writes unless John asks. Per phase:

- **Advisory PR:** Next 16.3 → 16.4 and the MCP SDK's `body-parser`. Connector check after its
  deploy.
- **Phase 1:** `/api/health` changes shape (`status` → `ok`); nothing the connector uses.
- **Phase 2:** `lib/env.ts` must accept exactly what production has for `PUBLIC_BASE_URL`; OAuth
  discovery is built from it (`lib/oauth/config.ts:71`).
- **Phase 3:** zod on `/oauth/register` (`app/oauth/register/route.ts:47–55` casts the JSON),
  `/oauth/token` and `/oauth/revoke` must accept every request claude.ai sends today. Connector
  check after its deploy.
- **Tool names:** `snake_case`, a `title` and annotations on each, refusals as `isError` content
  (`lib/mcp/server.ts:143`) ✓. `search`, `coming_up`, `who_to_call` and `find_part_for` aren't
  strictly `verb_noun`; not worth a hard-cut rename. No rename proposed.

## Security flags (read these first)

1. **Three critical Next.js advisories on an internet-facing app** (Next 16.3.3): unauthenticated
   RCE in Image Optimization (GHSA-2464-fhr4-w9xw), RCE in `use cache` (GHSA-673q-mjm6-r5xr),
   RCE in `next/og` (GHSA-vcvr-r3jv-pc5j), plus image-optimizer SSRF and a server-action DoS. The
   app imports neither `next/image`, `next/og` nor `use cache`, but `/_next/image` is served
   regardless. Fixed in 16.4.1; 16.4.6 is current. **Recommend a PR now**, ahead of Phase 1
   (question 1).
2. **sharp 0.35.3: two high advisories in libheif and librsvg, on a path members use.**
   `lib/files/store.ts:25` accepts `image/heic` and `image/heif` and re-encodes every upload with
   sharp (l.60). The browser converts HEIC before upload, but `POST /api/files` doesn't depend on
   that. Fixed in 0.35.5. Same PR.
3. **OIDC creates accounts with access, and the first one as admin**
   (`lib/auth/oidc-accounts.ts:107–121`, copied from another app's ADR). A sign-on that matches
   nothing becomes a **viewer**, and a viewer can reveal the house's codes (alarm, Wi-Fi) in the
   app (`docs/ARCHITECTURE.md:68`, audited). `security.md`: creation only with **no** access, never
   the first account, listed for an admin to place. Who reaches the client is the identity
   provider's group restriction today (question 8).
4. **The deploy accepts anything but an explicit failure.** `.github/workflows/deploy.yml:113`
   fails only on `.success == false`; a body without `success` (an HTML error page behind a 200,
   an empty reply) passes. The standard is `success: true` or fail. And there's no revision
   check, although `APP_HEALTH_URL` is set. Phase 1.
5. **A hand merge today deploys nothing new.** CI pushes to `ghcr.io/${GITHUB_REPOSITORY,,}`
   (`deploy.yml:66`), now `ghcr.io/john-fleischauer/homedocs`, which doesn't exist yet; compose
   still pulls `ghcr.io/<old owner>/homedocs:main` (`compose.yaml:6`). Dockhand would say
   `success: true` with the old image running. The first PR after the move must change the compose
   path (question 1).

Lower: the repo is public and names its deploy host (`deploy.yml:49`) and two private repos
(`docs/ARCHITECTURE.md:23–24`, comments in `lib/auth/oidc*.ts`, `lib/db/schema.ts:743`);
`decisions.md` asks for a gitleaks scan of the history before a repo goes public (question 7).

## Summary

| Area | Status | Top gaps |
|---|---|---|
| Workflow | partial | `deploy.yml` runs on `pull_request` ✓, squash-merged Conventional Commit titles ✓ (8 of 8), but hand-rolled, not the template caller; **`image` needs `e2e`**, so Playwright sits in the deploy path; `ubuntu-latest`; no top-level `permissions:`, no `workflow_dispatch`; no merge-on-green, `automerge` or `agent-found` label; merge commit and rebase allowed, `COMMIT_OR_PR_TITLE`, branches not deleted (3 stale); no PR template; public repo with `PR_RUNNER` set (inert) |
| Quality | partial | typecheck, lint, test gate the image ✓; tests on real Postgres, no skip path ✓; MCP tools zod ✓; every action through `act()` ✓; guard table ✓; **82 server actions and the OAuth/ext routes parse by hand**; 69 `ActionForm`s with no `keepFormValues`; no `db:drift`; guard table not in the standard's columns; upload accepts a missing `Content-Length` |
| Security | conflicts | **audit fails: 3 critical, 5 high**; no audit in CI; no Dependabot (config or alerts); **OIDC creates viewer/admin accounts**; no `lib/env.ts` (partial boot checks exit 1 ✓); no top-level `permissions:`; public repo naming its host and private repos. Meets: `${VAR:?}` on the app ✓, non-root ✓, `INTEGRATIONS_KEY` separate from and checked against `SESSION_SECRET` ✓, client IP from the right ✓, GitGuardian ✓, login throttled ✓ |
| Deploy | partial | image in CI ✓ (arm64, native), no `build:` ✓, `pull_policy: always` ✓, `:main` + `:sha-` + revision label ✓, `GIT_REVISION` ✓, `/api/health` no auth, no DB, reports the revision ✓, PG18 mount ✓, `PGPASSWORD` ✓, migrations at boot ✓, no published port ✓; **webhook check inverted**, no revision check; `/api/health` says `status`, not `ok`; **compose pulls the old owner's image**; `pull_policy` on the `db` and `backup` postgres images; Node 22; DEPLOYMENT.md doesn't name the host's snapshot, mode or architecture |
| Stack | close | Node 22; no Prettier; MCP SDK and zod on caret ranges; no `format`, `db:drift`, `check:contrast` scripts |
| Design | partial | standard token names ✓ (missing `ok*`, `warn-ink`, `danger-ink`), 1 raw palette class, 0 `dark:` ✓; system dark mode, no flash ✓, **no toggle**; no contrast check; manifest ✓; Title Case ✓ (#8); **15 `truncate`s, most on names** (incl. the shared `Card` row); **`confirm()`/`alert()`** in 12 places; `autoFocus` on 10 fields; date inputs keep native appearance; phone check in Chromium (Pixel 7), not WebKit 360px |
| Agent docs | partial | CLAUDE.md 39 lines ✓, every path it names exists ✓, but half repeats standards; ARCHITECTURE ✓ (guard table, model), DEPLOYMENT ✓, ROADMAP ✓, README ✓; stale old-owner image path; claims about other repos; no `AGENTS.md`, `.claude/settings.json`, DECISIONS, `claude-candidates.md` |

Gaps counted: Workflow 7, Quality 7, Security 7, Deploy 8, Stack 4, Design 8, Agent docs 5
(46; the fix list groups them).

## Details

### Workflow

- `.github/workflows/deploy.yml` ("build & deploy"): `push` to `main` and `pull_request` ✓; no
  `workflow_dispatch`. Jobs `check` (install, `typecheck`, `lint`, `test`; l.16–27), `e2e`
  (Playwright Chromium; l.30–45), `image` (`needs: [check, e2e]`, l.48; pushes only on `push`),
  `deploy` (l.88–116). `check`, `e2e` and `deploy` on `ubuntu-latest` (profile: `ubuntu-24.04`);
  `image` on `ubuntu-24.04-arm` ✓, `platforms: linux/arm64` (l.81), because the host is arm64.
  Node 22 (l.22, l.36). Concurrency cancels superseded PR runs only ✓.
- **e2e gates the image** (l.48). `decisions.md`: e2e never sits in the deploy path.
- No top-level `permissions:`. The repo's default token is read-only
  (`default_workflow_permissions: read`), so nothing is over-granted; `image` elevates to
  `packages: write` ✓.
- Image: tags `type=ref,event=branch` + `type=sha,prefix=sha-` ✓, OCI labels ✓, `GIT_REVISION`
  build arg ✓, GHA cache with `ignore-error` ✓.
- Deploy: plain GET, `?secret=` appended ✓, Secret-or-Variable ✓, skips without a URL ✓,
  `curl -fsS` ✓; but **`jq -e '.success == false'`** (l.113) and no revision check (Security flag 4).
- Repo settings (`gh api repos/John-Fleischauer/homedocs`): **public**; squash, merge commit and
  rebase all allowed; `delete_branch_on_merge: false`; `squash_merge_commit_title:
  COMMIT_OR_PR_TITLE`. Labels: GitHub defaults plus `accessibility`. Actions enabled,
  `allowed_actions: all`.
- Variables: `APP_HEALTH_URL`, `DOCKHAND_WEBHOOK_URL`, `PR_RUNNER`. Secrets:
  `DOCKHAND_WEBHOOK_TOKEN`. Standard names, so the template's by-name pass needs no rename. No
  environments. **`PR_RUNNER` does nothing on a public repo**: the template routes only private
  repos' PRs to the self-hosted runner, and the runner group refuses public repos (`workflow.md`).
- PR history: #1–#8 all squash-merged with Conventional Commit titles ✓. Remote branches left
  over: `feat/project-series`, `fix/photo-upload-paint-label`, `ui-copy-trim` (all from merged
  PRs). No `.github/pull_request_template.md`.
- Issues: none, open or closed.
- **No run since the move**, so org-side Actions are unproven for this repo. As a public repo its
  GitHub-hosted minutes (arm64 included) are free.

### Quality

- Scripts: `typecheck` (`tsc --noEmit`), `lint` (`eslint .`), `test` (`vitest run`), `e2e`,
  `db:generate`, `db:migrate`, `render:icons`. Missing from the profile: `format`, `db:drift`,
  `check:contrast`. Real migrations exist (`0000`–`0006`), so `db:drift` can go in now.
- Tests: 18 Vitest files (OAuth endpoints and grants, MCP, family, series, networks, counts…) on
  `postgres:18-alpine` via Testcontainers (`test/setup.ts:28`), migrations applied to a template
  database, no skip path: fails without Docker ✓. Unproven on the self-hosted runner, which this
  repo can't use while public.
- **Trust boundaries:**
  - Server actions: 18 `'use server'` files, 82 exports, every one through `act()`
    (`lib/web/action.ts:16`: authenticates via `viewer()`, returns `AppError`s, rethrows anything
    else so `redirect()` passes) ✓. Inputs are read with `field()`/`checkbox()` and checked in the
    domain modules; **none uses zod**.
  - Route handlers (16): MCP parses with zod ✓. `oauth/register` casts `request.json()` (l.47–55);
    `oauth/token` and `oauth/revoke` read form params by hand; `api/ext/search` reads query params
    by hand. Every `app/api/` route calls `requireApiUser()`/`requireApiRole()` and answers JSON ✓.
  - Upload (`app/api/files/route.ts:19–26`): authenticates first ✓ and refuses a declared
    `Content-Length` over 25 MB ✓, but a **missing** one counts as 0 and the whole body is read.
    Member-only, so small. Phase 3.
- **Forms keep what was typed:** `components/ActionForm.tsx` runs `useActionState` over a plain
  `<form action>` (69 uses) with no `onReset={keepFormValues}`, so React 19's reset clears a
  refused form's uncontrolled fields. Phase 3.
- **What a 500 returns:** 14 plain `throw new Error` in `lib/`, all config or internal except
  `lib/web/context.ts:34` ("No home exists. Run setup again."), which a person can act on.
- Guard table ✓ (`docs/ARCHITECTURE.md:76–95`), but as Route | Guard; `security.md` wants
  Routes | Authentication | Authorization and scope | Input parsing.
- Background jobs (`lib/jobs/index.ts`) run without an advisory lock. One container, so harmless
  today; the profile asks for the lock. Phase 3, small.

### Security

- **Audit:** see Audit results.
- No `.github/dependabot.yml`; Dependabot alerts and security updates are **off** for the repo
  (`gh api …/dependabot/alerts`: "disabled"); no audit job.
- GitGuardian: ran on every PR (#1–#8, before the move) ✓; the app is installed on the
  organization with `all` repositories ✓. Its first check under the organization is still to see.
- **Compose guards ✓** on the app: `POSTGRES_PASSWORD`, `SESSION_SECRET`, `INTEGRATIONS_KEY`,
  `PUBLIC_BASE_URL` (`compose.yaml:14–20`). The `db` and `backup` services repeat
  `${POSTGRES_PASSWORD}` bare (l.73, l.93); compose interpolates the whole file, so the app's
  guard already fails the deploy, but the bare copies read as optional. Cosmetic, Phase 2.
- **Env at boot:** partial. `instrumentation.ts` runs `checkOidcAtBoot()` (half-set OIDC → log,
  `process.exit(1)`, `lib/auth/oidc.ts:136–143`) ✓ and `checkEnvAtBoot()` (`INTEGRATIONS_KEY`
  ≥ 32 chars and ≠ `SESSION_SECRET`, exit 1, `lib/boot.ts`) ✓. `SESSION_SECRET` length and
  `PUBLIC_BASE_URL` are checked lazily at first use (`lib/auth/tokens.ts:24`,
  `lib/oauth/config.ts:71`). No `lib/env.ts`. Phase 2.
- Non-root: `USER app`, `/data` and `/backups` created and `chown`ed before it ✓.
- Auth: own sessions, HMAC'd tokens ✓; OIDC never re-links ✓, refuses removed accounts ✓,
  links by email only when verified or trusted ✓; creation conflicts (flag 3). Password sign-in
  throttled (`loginLimiter`) ✓; OAuth endpoints rate limited ✓.
- Stored secrets and integration tokens: AES-256-GCM under `INTEGRATIONS_KEY`, separate from the
  session secret and enforced at boot ✓ (`security.md`).
- Client IP: `lib/web/client-ip.ts` counts `X-Forwarded-For` from the right by
  `TRUSTED_PROXY_HOPS` ✓, or reads one proxy-set header (`CLIENT_IP_HEADER`). `docs/DEPLOYMENT.md`
  lists `CLIENT_IP_HEADER` twice with different advice (l.37 `x-real-ip` "here", l.39
  `cf-connecting-ip`); which one production sets decides who the house guide treats as "at
  home" (question 9).
- Request body limits: `next.config.ts` raises neither limit ✓; no proxy/middleware file.
- Share links: 256-bit, stored as HMAC, expiring, revocable, `no-store`/`no-referrer`/`noindex`
  headers (`next.config.ts:47–54`) ✓; PIN unlock rate-limited and locks after 10 failures ✓.

### Deploy

- `compose.yaml` (Dockhand tracks this name): `image: ${APP_IMAGE:-ghcr.io/<old owner>/homedocs:main}`
  (l.6, **old owner**), `pull_policy: always` ✓, no `build:` ✓, `restart: unless-stopped` ✓,
  `depends_on: service_healthy` ✓, a comment on every non-obvious line ✓.
- Healthcheck: Node `fetch` on `/api/health` ✓, `start_period: 60s`. The route
  (`app/api/health/route.ts`) has no auth, no database ✓, `force-dynamic` ✓, and reports the
  revision ✓, as `{ status: 'ok', revision }` (l.14); the standard shape is `{ ok: true, revision }`.
  `dockhand-deploy.yml` reads only `.revision`, so `APP_HEALTH_URL` works with either; Phase 1
  changes the shape in the same PR as the template caller.
- **GHCR:** `ghcr.io/<old owner>/homedocs` is public (anonymous pull works; tags `main` and
  `sha-376d988` … `sha-6345c55`). `ghcr.io/john-fleischauer/homedocs` doesn't exist yet: the first
  `main` run creates it, possibly private (question 4).
- Postgres: `postgres:18-alpine`, `pgdata18` at `/var/lib/postgresql` ✓, `pg_isready` ✓, no
  published port ✓, `DATABASE_URL` without a password + `PGPASSWORD` ✓. **`pull_policy: always`
  on `db` (l.72) and on `backup` (l.92)**: `decisions.md` (2026-11-11) puts it on app images only.
- Migrations: esbuild-bundled `dist/migrate.cjs` from the entrypoint ✓; committed ✓; never
  `db push` ✓. When there's something to apply, `lib/db/migrate.ts` writes
  `homedocs-premigrate-*.dump` first ✓ (better than the standard asks).
- Exposure: no published port; the app joins the external `web` network as `homedocs` and the
  reverse proxy, on the same host, proxies to it (`compose.yaml:61–67`) ✓: `deploy.md`'s "join the proxy's
  network" case.
- **Backups:** a `backup` sidecar (`compose.yaml:85–113`) `pg_dump -Fc`s nightly into the
  `backups` volume, keeping 30 days. The standard backup is the host's whole-machine snapshot; for
  this host that's its provider's **daily block-level snapshots, kept 7 days, crash-consistent**
  (per the infrastructure repo). The sidecar is allowed as the app's own. `docs/DEPLOYMENT.md:89–100` says to
  include `backups` and `files` in "the host's offsite backup" but doesn't name the host snapshots
  (question 5).
- Architecture: arm64 (`deploy.yml:49–52`, `:81`); not in `docs/DEPLOYMENT.md`.
- Node 22: `node:22-alpine` ×3 (`Dockerfile:4,13,26`), CI `node-version: 22`, `engines: >=22`,
  `@types/node` 22.19.4, and the `pnpm-workspace.yaml` comment (l.19). `postgresql18-client`
  (`Dockerfile:39`) must still install on `node:24-alpine`.
- `docs/DEPLOYMENT.md:8` names `ghcr.io/<old owner>/homedocs`; l.24 shows the `status` shape.

### Stack

Matches the profile except: Node 22 (own PR beside Phase 2); no Prettier or
`eslint-config-prettier` (Phase 6); caret ranges on `@modelcontextprotocol/sdk` (^1.30) and `zod`
(^4.4.3), which the profile pins for anything whose upgrades need care (pin the SDK exactly in the
advisory PR); the missing scripts above. pnpm 11 is fine (needs Node ≥ 22). The shared component
kit isn't built yet; `components/ui/` stays until it is.

### Design

- `app/globals.css`: Tailwind 4 `@theme` with the **standard names** ✓: `page`, `card`, `sunk`,
  `line`, `ink`/`ink-2`/`ink-3`, `accent`/`accent-ink`/`accent-soft`, `warn`/`warn-soft`,
  `danger`/`danger-soft`. Missing `ok`, `ok-ink`, `ok-soft`, `warn-ink`, `danger-ink`. One raw
  palette class (`bg-white` behind the Wi-Fi QR code, `components/guide/GuideView.tsx:184`,
  arguably right: a QR code needs white), 0 `dark:` ✓.
- Dark mode: follows the system through `@media (prefers-color-scheme: dark)` (l.28), so no flash
  ✓, but **no toggle** and no head script; the CSS comment says that was deliberate ("there is no
  toggle to find", l.4). `design.md` requires light/dark/system (question 11).
- No contrast check.
- Manifest ✓ (`app/manifest.ts`: `standalone`, scope and start `/`; 200 without sign-in).
- 16px touch floor ✓ (`globals.css:53–60`); 44px tap targets in CLAUDE.md. **No `appearance: none`
  on date inputs** (4 date fields).
- **Names truncate:** 15 `truncate`s, including the shared row title and detail
  (`components/ui/Card.tsx:67–68`), family names and emails (`app/(app)/family/page.tsx:25,28,74`),
  "Recently deleted" titles (`deleted/page.tsx:26`), document and link titles
  (`components/DocumentsSection.tsx:49,51`, `LinksSection.tsx:38`), Homebox items
  (`HomeboxHere.tsx:58,60`), connected-app names (`settings/page.tsx:62`).
- **Browser dialogs:** `DeleteButton` asks with `confirm()` and reports with `alert()`
  (`components/DeleteButton.tsx:33,36`); also `confirm()` in `projects/materials.tsx:41`,
  `projects/[id]/series-parts.tsx:55,82`, `share/forms.tsx:73`, and `alert()` in 6 more places.
  `design.md`: inline two-step confirm, never `confirm()`; errors shown in place (question 12).
- Deletes: soft delete with "Recently deleted" restore for every record kind ✓.
- `autoFocus` on 10 fields (login, setup, join, and the six create forms), not limited to
  non-touch screens.
- Playwright: the `phone` project is `devices['Pixel 7']` (Chromium, 412px)
  (`playwright.config.ts:28`); `design.md` wants WebKit at 360px.
- Copy: already Title Case and trimmed (#8) ✓. Stragglers: "Add something", "Add to this place",
  "Covered by quote", "New to-do". A `ui-verbosity-reduction` pass would change little.

### Agent docs

- **CLAUDE.md: 39 lines** ✓. Every path, helper and command it names exists (`liveIn()`,
  `buildGuide()`, `lib/search/rebuild.ts`, `lib/crypto/sealed.ts`, `clientIp()`, the e2e port
  3100) ✓. About half restates the profile, `security.md` or `design.md` (triage below).
- Stale: `docs/DEPLOYMENT.md:8` (old-owner image), l.24 (health shape); CLAUDE.md l.36 says
  `pull_policy: always` without "app images only".
- Claims about other repos: `docs/ARCHITECTURE.md:23–24` ("Auth and OAuth/MCP come from …", "CI
  and Compose come from …"), and "copied from …, ADR-0012 there" in `lib/auth/oidc.ts:2`,
  `oidc-config.ts:2`, `oidc-accounts.ts:2`, `login/oidc/*.ts:2`, `lib/db/schema.ts:743`. In a
  public repo these also name private repos.
- `docs/`: ARCHITECTURE (227 lines: model, roles, guard table, search, guide, files,
  integrations, MCP, jobs, testing) ✓, DEPLOYMENT ✓, ROADMAP ✓; README ✓.
- Missing: `AGENTS.md`, `.claude/settings.json` (`.gitignore` already has `.claude/*` +
  `!.claude/settings.json` ✓), `docs/DECISIONS.md` (needed for the exceptions below),
  `docs/claude-candidates.md`. `agentRules: false` ✓.
- No plans referenced outside the repo ✓.

## Audit results

`pnpm audit` on `main` (pnpm 10.33.0 via corepack, `COREPACK_ENABLE_STRICT=0`, on a scratch copy
of `package.json` without its `packageManager` line, `pnpm-lock.yaml` and `pnpm-workspace.yaml`;
no install): **fails**, 24 vulnerabilities (**3 critical, 5 high**, 13 moderate, 3 low).

| Package (locked) | Severity | Via | Proposed fix |
|---|---|---|---|
| `next` 16.3.3 | **3 critical** (RCE ×3), 2 high (image-optimizer SSRF GHSA-cjq9-62q9-8jv4, server-action DoS GHSA-p3m5-59mp-jv5r); also 5 moderate, 1 low | direct, runtime | `16.4.6` exact, with `eslint-config-next` 16.4.6. A minor, but read the 16.4 notes for runtime changes (caching, server actions, body limits) |
| `sharp` 0.35.3 | high ×2 (libheif GHSA-rgj7-g3m4-5g8c, librsvg GHSA-wq5f-xc86-pv6w) | direct, runtime (uploads, HEIC accepted) | `0.35.5` exact |
| `body-parser` 2.3.0 | high (DoS, GHSA-27r3-jxmh-p828) | MCP SDK 1.32.1 → express | lockfile refresh to ≥2.4.0, else a pnpm `overrides` |
| `fast-uri` 3.1.8, `@vitest/mocker` 4.1.11, `glob`, `minimatch`, `esbuild` 0.18.20 | moderate/low | MCP SDK; vitest; drizzle-kit (dev) | not gating; lockfile refresh where in range |

The MCP SDK (1.32.1), zod (4.6.7), `undici`, `vite` and `proxy-addr` are already locked at patched
versions, so this is a smaller list than the other swept apps had. All fixes are patch/minor or a
Next minor: one PR. **Not trialled** (no install by brief): the session doing it runs install,
typecheck, lint, test, e2e and a build (arm64 in CI), then the connector check after deploy.

## CLAUDE.md triage

Provenance: written in `376d988` (2026-10-16, John with a Claude trailer, the v1 commit), edited
in `e24a18f` and `562c9a0` (the vocabulary line, both with trailers). Nothing was added after an
incident in this repo, but ARCHITECTURE says the Drizzle subquery trap "has bitten here three
times". "Errors meant for a person are `AppError` subclasses" appears nearly verbatim in two
other repos' CLAUDE.md (copied); no other rule does.

### Drop (repeats or contradicts a standard)

| # | Rule (CLAUDE.md line) | Why |
|---|---|---|
| D1 | Migrations append-only; backfill in the same migration (l.10–11) | Profile (Migrations) |
| D2 | One write path through `lib/<area>/`, role, validate, audit, `act()` (l.14–15) | Profile. "Rebuild search" is candidate 2; `act()` stays in a layout map line |
| D3 | Guards: `app/(app)/` by its layout; `app/api/`, `app/g/`, `app/mcp` authenticate themselves (l.18–19) | `security.md` + profile; the guard table in ARCHITECTURE holds the routes |
| D4 | Client IP from the right, never leftmost (l.27–28) | `security.md`. `clientIp()` stays in the layout map |
| D5 | Errors meant for a person are `AppError` subclasses, plain words (l.29–30) | Profile; the verbosity skill. Copied across repos |
| D6 | Phone first, 44px tap targets (l.32) | `design.md` |
| D7 | Colour tokens, never raw palette colours (l.33) | `design.md` |
| D8 | Compose: no `build:`, `pull_policy: always` (l.36) | `deploy.md` (and now app images only) |
| D9 | Conventional Commits; `main` deploys via CI → GHCR → Dockhand (l.39) | `workflow.md`, `deploy.md`; DEPLOYMENT.md already describes the pipeline |
| D10 | "Never put a secret or token in audit rows, logs, MCP output" (l.25, first part) | `security.md`. "…or the offline guide" goes to candidate 4 |

### Move to docs

| # | Content (line) | Where |
|---|---|---|
| M1 | Values sealed with `INTEGRATIONS_KEY` in `lib/crypto/sealed.ts` (l.24) | Already in ARCHITECTURE (House guide, l.128); one layout-map line |
| M2 | "Fixtures were Things and contacts were People until October 2026; the old routes redirect" (l.34–35) | ARCHITECTURE (domain model); the redirect is commented in `next.config.ts` |
| M3 | `pnpm e2e` starts its own Postgres and `next dev` on 3100 (l.8) | Stays in Commands (a command) |
| M4 | ARCHITECTURE "Origins" (l.22–24) and the "from/copied from …" code comments | Drop the repo names; where a reason matters (the OIDC rules), cite this repo's `docs/DECISIONS.md` instead |
| M5 | `docs/DEPLOYMENT.md` `CLIENT_IP_HEADER` rows (l.37, l.39) | One row, saying what production sets and why (question 9) |

### Candidates (John decides: yes keeps one line in CLAUDE.md; no leaves it in docs only)

Recommendation in brackets.

1. **Every domain call takes a `PropertyScope`; every query on a domain table filters
   `property_id` and `deleted_at` through `liveIn()`.** (l.16–17; the local form of "scope every
   query", with the soft-delete filter) [keep]
2. **A write that changes text another record's search document includes calls the cascade in
   `lib/search/rebuild.ts`, and updates the table at the top of that file.** (l.20–21) [keep]
3. **In a correlated Drizzle subquery, write the outer table name by hand (`supplies.id`);
   `${table.col}` renders unqualified.** (l.22–23; bitten three times, `test/counts.test.ts` pins
   it) [keep]
4. **Gated guide content (codes, private sections, the address) is decided only in
   `buildGuide()`; no secret value reaches the offline guide.** (l.25–26) [keep]
5. **The UI's words are Place, System, Fixture, Part, Note, Contact, Project.** (l.34) [keep]

## Fix list (ordered by harm, rough effort)

1. **Next.js criticals and sharp** (S, before Phase 1): one deps PR (Audit results) + exact pins
   for Next, sharp, the MCP SDK; **compose `image:` → `ghcr.io/john-fleischauer/homedocs:main`**
   and `docs/DEPLOYMENT.md:8` in the same PR, or the deploy pulls the old image (questions 1, 4).
2. **Pipeline** (M, Phase 1): template `ci.yml` replacing `deploy.yml`: check `typecheck lint test
   db:drift` with `node-version: '22'`; `security` (pnpm); `image` with `platforms: linux/arm64`
   and `ubuntu-24.04-arm` in its `runs-on`; e2e as a PR-only local `e2e.yml` that gates the merge,
   not the image; merge-on-green + close-issues; `dockhand-deploy` by name (success **and**
   revision checks); `db:drift` script; Dependabot (npm, docker, docker-compose, actions; Node,
   Postgres, Next, React, Tailwind majors ignored); Dependabot alerts on; PR template;
   `docs/claude-candidates.md`; `repo-settings.sh` (squash only, `PR_TITLE`, delete on merge,
   `automerge` + `agent-found`). Drop the host name from the workflow comment.
3. **`/api/health` reports `{ ok: true, revision }`** (XS, in the Phase 1 PR: `APP_HEALTH_URL` is
   already set and the template's deploy checks it from that PR on).
4. **OIDC account creation** (S–M, Phase 3 (b)): no-access state, "awaiting placement" list, the
   first account only through `/setup`, per question 8.
5. **Env validated at boot** (S, Phase 2): `lib/env.ts` (zod) from `instrumentation.ts`, folding
   in `checkOidcAtBoot` and `checkEnvAtBoot`; `SESSION_SECRET` ≥ 32, `PUBLIC_BASE_URL` an https
   URL in production.
6. **Node 24** (S, own PR beside Phase 2): Dockerfile ×3, `engines`, `@types/node` 24, drop
   `node-version: '22'`, the workspace comment; check `postgresql18-client` on `node:24-alpine`.
7. **Compose and deploy docs** (S, Phase 2): no `pull_policy` on `db` and `backup`; guarded
   `${POSTGRES_PASSWORD:?}` everywhere or a comment; `docs/DEPLOYMENT.md`: mode A through Dockhand
   and its agent on the host, arm64, exposure (the reverse proxy on the same host, `web` network, no port),
   backups (host snapshots + the sidecar, question 5), one `CLIENT_IP_HEADER` row, the health
   shape.
8. **Trust boundaries** (M, Phase 3): (a) zod at server actions (a schema argument to `act()` or a
   form-parse helper, area by area), `keepFormValues` on `ActionForm`, the one person-facing
   `Error` → `AppError`, refusal tests; (b) zod on `oauth/register`, `token`, `revoke`,
   `api/ext/search`; the upload requires `Content-Length` (411); OIDC (item 4); jobs take an
   advisory lock; guard table in the standard's columns; `/security-review`.
9. **Agent docs** (S, Phase 4): CLAUDE.md per the triage; `docs/DECISIONS.md` (the exceptions
   below, the OIDC decision); ARCHITECTURE without the other repos' names; `AGENTS.md`;
   `.claude/settings.json` (plugin, `autoUpdate`); fact-check by a fresh reviewer.
10. **Design** (M, Phase 5): add `ok*`, `warn-ink`, `danger-ink`; light/dark/system toggle + head
    script (question 11); contrast check (as a test inside `test`, so `ci.yml` needn't change);
    names wrap at the 15 sites; inline two-step confirms and in-place errors for the 12 dialogs
    (question 12); `autoFocus` off on touch; date inputs `appearance: none`; WebKit 360px phone
    project; the few casing stragglers.
11. **Prettier** (S, Phase 6 if in scope).
12. Public-repo hygiene (XS, any time; question 7): gitleaks over the history once.

## Prerequisites before Phase 1

Already true: repo in `John-Fleischauer` ✓ (public); Actions enabled ✓ (`allowed_actions: all`);
GitGuardian on the organization with all repositories ✓; `DOCKHAND_WEBHOOK_URL` (variable) and
`DOCKHAND_WEBHOOK_TOKEN` (secret) have the standard names ✓; `APP_HEALTH_URL` is set, public, and
the route already reports the revision ✓.

Still needed:

- **First run starts:** no run has started since the move. The advisory PR's run is the first
  check; a public repo's hosted minutes are free, so billing shouldn't block it.
- **Compose image path** to the org (in the advisory PR, fix list 1). Then **registry access**:
  the first `main` run creates `ghcr.io/john-fleischauer/homedocs`; make it public like the
  current one, or give Dockhand registry credentials for the host (question 4). Then confirm
  `/api/health` reports the merged commit (it's public, so anyone can check).
- **John confirms** the Dockhand stack has **Force redeploy** and **Re-pull images** on
  (question 2).
- **Connector reconnected** in claude.ai, so the post-deploy connector check can run (question 14).
- **`PR_RUNNER`:** delete it while the repo stays public (it routes nothing) (question 7).
- `pg_dump -Fc` by hand before the Node 24 and Phase 2 deploys (no migration in either, so the
  app's own pre-migration dump won't run); or rely on the sidecar's dump that night, John's call.
- Stale remote branches (3): listed for John at close-out.

## Proposed scope and PR plan (to agree with John)

Proposed scope: **phases 1–5 and Node 24; Phase 6 only Prettier**, last (everything else already
matches the profile). Postgres stays. Connector check (tool list + one read) after every deploy;
`/api/health` revision after every deploy (CI checks it from Phase 1 on).

| Phase | PRs | Contents | Touches `.github/workflows/` | Merge |
|---|---|---|---|---|
| 0.5 Advisories | 1 | `fix(deps): …`: Next 16.4.6 + `eslint-config-next` 16.4.6, sharp 0.35.5, MCP SDK exact, lockfile refresh (`body-parser`), `overrides` only if needed; compose `image:` → org path; DEPLOYMENT.md l.8. Runs the current `deploy.yml` (check, e2e, image, deploy) | no | **John by hand** (no merge-on-green yet); check `/api/health` by hand after |
| 1 Pipeline | 1 | `ci.yml` from the template (arm64 image), `deploy.yml` deleted (new name, so no re-enable step), `e2e.yml` (PR-only, gates the merge); `db:drift` script; `/api/health` `{ ok, revision }`; `dependabot.yml`; PR template; `docs/claude-candidates.md`. Then `repo-settings.sh`, Dependabot alerts on | **yes** | **John by hand**; watches the first deploy's revision check |
| Node 24 | 1 | `node:24-alpine` ×3, `engines`, `@types/node` 24, drop `node-version: '22'` from `ci.yml` and `e2e.yml`, workspace comment | **yes** | **John by hand**; `pg_dump` first |
| 2 Runtime | 1 | `lib/env.ts` + exit; `pull_policy` off `db` and `backup`; `POSTGRES_PASSWORD` guards; DEPLOYMENT.md (mode, arm64, exposure, backups, client IP) | no | No label: John watches; `pg_dump` first |
| 3 Boundaries | 2 | (a) zod at server actions, `keepFormValues`, `AppError`, refusal tests; (b) zod on OAuth and ext routes, upload `Content-Length`, OIDC creation (question 8), jobs lock, guard-table columns; `/security-review` on both | no | (a) `automerge`; (b) no label: OAuth and sign-in, John looks first |
| 4 Agent docs | 1 | CLAUDE.md per triage; DECISIONS.md; ARCHITECTURE and comments without other repos' names; `AGENTS.md`; `.claude/settings.json`; fact-check by a fresh reviewer | no | `automerge` |
| 5 Design/copy | 2 | (a) tokens, toggle + head script, contrast test, date inputs, `autoFocus`; (b) names wrap, inline confirms and in-place errors, WebKit 360px project in `playwright.config.ts`, casing | no (if the contrast check is a test and the WebKit project needs no `e2e.yml` change) | `automerge` |
| 6 Prettier | 1 | Formatting only, `.git-blame-ignore-revs`, `lint` adds `prettier --check` | no (workflow files stay unformatted until John's next workflow PR, or `.prettierignore` them) | `automerge` |

Hand merges for `.github/workflows/`: **Phase 1 and Node 24**. The advisory PR is a hand merge
only because merge-on-green doesn't exist yet. Dependabot's Actions bumps will be too. If Phase
5 (b)'s WebKit project needs `playwright install webkit` in `e2e.yml`, that PR becomes a hand
merge as well.

### Exceptions to record in `docs/DECISIONS.md` (if John agrees)

- arm64 image, built natively on `ubuntu-24.04-arm` (the host's architecture).
- The `backup` sidecar kept beside the host snapshots (question 5).
- Client IP from a proxy-set header, if that's what production uses (question 9).
- System-only dark mode, only if John says no to the toggle (question 11).

## Questions for John

1. **Next.js criticals and sharp:** a deps PR now, ahead of Phase 1, through the current
   `deploy.yml`, with the compose image moved to `ghcr.io/john-fleischauer/homedocs` in the same
   PR, merged by you? Recommend yes, today: unauthenticated RCE on an internet-facing app, and
   without the image path the merge deploys nothing new while Dockhand reports success.
2. **Dockhand:** are Force redeploy and Re-pull images on for the homedocs stack? Recommend yes;
   Phase 1's revision check depends on them.
3. **The host:** confirm homedocs stays deploy mode A (Dockhand git stack, webhook to
   Dockhand, applied on the host by its agent, which the last deploy's reply
   shows), with the image built for arm64 on GitHub's arm runner. Recommend yes, recorded in
   DEPLOYMENT.md and DECISIONS.md. Is anything about that host (its own update policy, its agent being unreachable) something the deploy job should expect?
4. **Registry:** the org package doesn't exist yet. Make `ghcr.io/john-fleischauer/homedocs`
   public after the first push (the old owner's one is public, and so is the repo), or give
   Dockhand registry credentials for the host? Recommend public. And remove the
   old owner's `homedocs` package once the new one serves?
5. **Backups:** the standard backup here is the host's snapshots (daily, 7 days,
   crash-consistent, per the infrastructure repo). Keep the `backup` sidecar as the app's own (30 days of
   dumps, on the same disk, so inside the snapshots), and say both in DEPLOYMENT.md? Recommend
   keep it: photos and codes have no other copy, and 30 days of dumps reach further back than 7
   days of snapshots. Can you confirm the snapshot policy covers the volume holding Docker's data?
6. **`pull_policy: always` on `db` and `backup`:** drop both, per the 2026-11-11 decision?
   Recommend drop.
7. **Public repo:** keep homedocs public? If yes: delete `PR_RUNNER` (it can't route a public
   repo), take the host name out of the workflow comment and the other repos' names out of
   ARCHITECTURE and the code comments, and run gitleaks over the history once (`decisions.md`
   asks for it before a repo goes public; was it ever private?). Recommend public (free minutes,
   arm64 included), with that cleanup in Phases 1 and 4.
8. **OIDC account creation:** a sign-on that matches nothing becomes a viewer (who can reveal the
   codes), and the first becomes admin. Recommend conforming in Phase 3 (b): no access until an
   admin places them, an "awaiting placement" list on Family, the first account only through
   `/setup`. The alternative is a recorded exception relying on the identity provider's group
   restriction.
9. **Client IP:** does production set `CLIENT_IP_HEADER=x-real-ip` (DEPLOYMENT.md l.37), and is
   there another proxy in front (l.39)? It decides "at home" for the house guide. Recommend: if the proxy
   overwrites `X-Real-IP` on every request, keep it and record it as an exception; otherwise unset
   it and use `TRUSTED_PROXY_HOPS`. One DEPLOYMENT.md row either way.
10. **e2e:** a PR-only job (local `e2e.yml`) that gates the merge but not the image or deploy, on
    GitHub's runner? Recommend yes.
11. **Theme toggle:** add light/dark/system with a head script in Phase 5, as `design.md`
    requires? The CSS says system-only was a choice ("no toggle to find"). Recommend yes, in
    Settings rather than the header, so the family still has nothing to find.
12. **Browser dialogs:** replace `confirm()` with the inline two-step confirm (Delete, Turn off
    link) and `alert()` with errors shown in place, keeping a modal only for the series
    "send back" confirms that list what changes? Recommend yes, Phase 5.
13. **Scope:** phases 1–5 + Node 24, Phase 6 limited to Prettier? Recommend yes, Prettier last.
14. **Connector:** Homedocs in claude.ai currently offers only `authenticate`; reconnect it before
    the advisory PR's deploy so the connector check can run? Recommend yes.
15. **The five candidate rules above:** yes/no each.

## John's decisions (2026-11-12)

- **Q1:** yes, today: deps-only advisory PR (Next 16.4.6, sharp 0.35.5, lockfile refresh) with the compose image moved to `ghcr.io/john-fleischauer/homedocs`, through the current `deploy.yml`; John merges by hand.
- **Q2:** Dockhand Force redeploy and Re-pull images are both on for the stack.
- **Q3:** keep deploy mode A as is (Dockhand webhook, applied on the host by its agent; arm64 built on GitHub's arm runner); record it in DEPLOYMENT.md and DECISIONS.md.
- **Q4:** make the org package public after its first push; delete the old owner's `homedocs` package once the new one serves.
- **Q5:** **drop the `backup` sidecar.** The host's snapshots (daily, 7 days) are the approach until a broader backup approach is considered (as the infrastructure repo records). DEPLOYMENT.md says so.
- **Q6:** drop `pull_policy: always` on `db` (and the sidecar goes with Q5).
- **Q7:** keep public; it was always public. Do the cleanup (delete `PR_RUNNER`, remove host and other repos' names from comments and docs, one gitleaks pass over history).
- **Q8:** conform as another of John's apps already did: a sign-on that matches nobody gets no access and waits on an "awaiting placement" list on Family; the first account only via `/setup`.
- **Q9:** The proxy in front sets `X-Real-IP` to the client address on every request. Keep `CLIENT_IP_HEADER=x-real-ip`, recorded as an exception in DEPLOYMENT.md.
- **Q10:** e2e as a PR-only job gating the merge, not the image or deploy, on GitHub's runner.
- **Q11:** theme toggle (light/dark/system, head script) in Settings, not the header.
- **Q12:** replace `confirm()`/`alert()`: inline two-step confirm, errors in place; a modal only for the series "send back" confirms.
- **Q13:** scope phases 1–5 + Node 24, Phase 6 Prettier only, last.
- **Q14:** John reconnected the connector (2026-11-12).
- **Q15:** keep all five candidate rules.
