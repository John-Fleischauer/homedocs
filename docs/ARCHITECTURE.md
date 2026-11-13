# Architecture

homedocs is the house's *reference knowledge*, the part that Homebox (inventory) and
paperless-ngx (documents) don't hold:
- what bulb a light takes
- how much mulch a bed needs
- which paint is in a room
- who we call
- where the shutoffs are

It also does light project tracking and has a house guide that can be shared with a
housesitter.

## Stack

- **App:** Next.js 16 (App Router, `output: 'standalone'`), React 19 and TypeScript.
- **Data:** Postgres 18 through Drizzle (postgres-js), with Zod for validation.
- **UI:** Tailwind 4 with in-house components (`components/ui`), colour tokens in
  `app/globals.css` (checked for AA by `test/design/contrast.test.ts`). Phone first. Light/dark
  follows the device unless someone picks Light or Dark under Settings → You; the choice is per
  device, in `localStorage`, applied by a head script before first paint (`lib/design/theme.ts`).
- **Tests:** Vitest against a real Postgres via testcontainers (`test/`), and Playwright at phone width
  with axe (`e2e/`).

## Domain model (`lib/db/schema.ts`)

| UI name | Table | What it is |
|---|---|---|
| Place | `spaces` | A tree of rooms, floors and outdoor areas, shaped like Home Assistant's floor › area. |
| System | `systems` | One part of how the house works: water & plumbing, electrical, heating & cooling. Seeded per property from `lib/systems/seeds.ts` (`seed_key`); the family can rename, add and delete them. `trades` name who to call. |
| Fixture | `fixtures` | Something installed: a light, a shutoff, the water heater. In at most one system (`system_id`); left out on create, it is guessed from the kind and name (`guessSystemKey`). Serial numbers and warranties belong in Homebox; link to it. |
| Part | `supplies` | A reusable spec, defined once: a bulb type, a paint colour, a filter. `fields` jsonb is validated by the category template in `lib/parts/templates.ts`. |
| (use) | `supply_uses` | A part used by exactly one fixture **or** one place. Holds the quantity, `quantity_needed` (the "really takes 15 bags" figure), surface and finish. Paint sheen lives here. |
| Note | `logs` | A dated record of what happened, with a "next time" lesson and a `remind_after` date. |
| Contact | `contacts` + `contact_trades` | One preferred contact per trade, which is what "our plumber" means. Trades are stored lower-cased; the labels ("HVAC") and the chips offered come from `properties.trade_groups`, the family's own list (null means `DEFAULT_TRADE_GROUPS` in `lib/contacts/trade-labels.ts`). A trade typed on a contact or system joins the list. |
| Project | `projects`, `project_items`, `quotes` | Status, a checklist, materials and quotes. Accepting a quote schedules the project. `contact_id` is who is doing it. |
| Series | `project_series`, `project_series_spaces`, `project_series_items` | A job done again and again (pine straw every spring). Holds the `how_to` every round shows (never copied), and the places, checklist, materials and usual contact a new project starts from (`lib/projects/series.ts`). |
| Material | `materials` | One line of what a job takes, on a series **or** a project (`num_nonnulls = 1`): a name, quantity, unit, notes, and optionally a Part, whose units (`unit` + `extra_units`) limit the line's unit. A project's copy keeps `series_material_id` (checklist items: `series_item_id`), which is how an open project shows what differs from its series and sends changes back after a person confirms them (`lib/projects/materials.ts`). `one_off` lines stay on their project. |
| House guide | `guide_sections`, `secrets`, `share_links` | See below. |
| — | `attachments`, `external_refs` | One nullable FK column per owner type, with a `num_nonnulls(...) = 1` check. Never `owner_type/owner_id`. |

The UI names are the only words the family sees. Fixtures were "Things" and contacts were
"People" until October 2026; `/things` and `/people` redirect (`next.config.ts`).

**Rules on every table:**
- `property_id` on every table, and every domain call takes a `PropertyScope`. There is one property
  today, and the UI hides the property switcher until there are two.
- Soft delete (`deleted_at`). "Recently deleted" restores places, systems, fixtures, parts, notes,
  contacts, projects and series. There is no hard delete in the UI.
- `created_by`/`updated_by` drive "Edited by Mom, 2 days ago". Edit forms send `updatedAt` for
  optimistic concurrency (`StaleWriteError`).
- Every mutation writes an `audit_log` row in the same transaction. The source is `web`, `mcp` or
  `system`. Secret values and tokens are never written to it.

## One write path

- **Callers:** server actions (`app/**/actions.ts`, wrapped in `act()` from `lib/web/action.ts`,
  which signs in first and then parses the input with zod, using the field schemas in
  `lib/web/fields.ts`; the ones that start a session parse first instead, `NOT_ACT` in
  `test/action-guards.test.ts`), route handlers and MCP tools. The schemas check shape only (an id is a uuid,
  text is text and not a megabyte); the domain modules still own the rules.
- **Domain modules:** every caller goes through the modules under `lib/`: `places`, `fixtures`, `parts`,
  `systems`, `notes`, `contacts`, `projects`, `guide`, `links`, `integrations`, `files`, `trash`,
  `property`.
- **Shared rules:** the modules check the role (`assertCanEdit`/`assertAdmin`), validate input, write
  the audit row, and rebuild the search documents.
- **Errors:** `AppError` subclasses are refusals meant for a person. Forms show them, and MCP returns
  them as content.

## Roles

|  | viewer | member | admin |
|---|---|---|---|
| Read everything, and reveal codes in the app (audited) | ✓ | ✓ | ✓ |
| Create, edit, delete, restore | | ✓ | ✓ |
| Family page, share links, home settings, integrations | | | ✓ |
| MCP scopes | `homedocs:read` | `homedocs:read` `homedocs:write` | same as member |

MCP authorization is **scope ∩ role**, and the role is read live on every call. A token minted
while someone was a member stops writing the moment they become a viewer.

## Guards

A page under `app/(app)/` is authenticated by its layout. Everything else authenticates itself:

Every way in that resolves a person (a session cookie, an MCP bearer token, a refresh token)
refuses a removed account and one **awaiting placement** (a sign-on that matched nobody; it has no
access until an admin lets it in from Family).

| Routes | Authentication | Authorization and scope | Input parsing |
|---|---|---|---|
| `app/(app)/**` pages | layout → `viewer()` → `requireUser()` | admin pages also call `requireRole('admin')`; every query takes the viewer's `PropertyScope` | route params passed to the domain, which looks them up within the scope |
| server actions under `app/(app)/`, `lib/web/*-actions.ts` | `act()` → `viewer()` first (every action is a public endpoint) | the domain modules: `assertCanEdit` / `assertAdmin`, scoped by property | zod in `act()`, over the form and bound arguments (`lib/web/fields.ts`); `test/action-guards.test.ts` checks every action |
| `GET /api/health` | none | none: returns `{ ok: true, revision }` only, no database call | none |
| `POST /api/files` | `requireApiUser()` via `requireApiRole('member')` | member or admin; the property comes from the owning record | `owner` parsed (`kind:uuid`); body needs `Content-Length` (411), capped at 25 MB + 64 KB (413), one `file` and a text `caption` (zod) |
| `GET /api/files/[sha]` | `requireApiUser()` | the sha must belong to a live attachment | sha must be 64 hex characters |
| `GET /api/ext/search` | `requireApiRole('member')` | member or admin; the home's own integration token, never sent to the browser | zod over the query: `system` one of two, `q` ≤ 500, `kind` (`location` for Homebox, `tag` / `correspondent` for paperless); each once |
| `GET /api/ext/[system]/[id]/thumb` | `requireApiUser()` | a live `external_refs` row, or for paperless a document under a linked tag or correspondent (can't browse paperless) | `system` one of two, strict id format |
| `GET /g/[token]`, `/g/[token]/files/[sha]`, `/g/[token]/offline` | the share-link token (HMAC lookup, expiring, revocable); rate limited per IP; preview bots get a stub | gated content (codes, address) only at home or after the PIN, decided in `buildGuide()`; files only if on a record this guide shows; offline always `unlocked: false` | token `[A-Za-z0-9_-]` ≤ 100; sha 64 hex |
| PIN unlock (server action) | link token + PIN | per-IP limit; 10 failures lock the link in the DB | zod first: token shape, PIN text |
| `/mcp` | OAuth bearer (`lib/oauth/grants.ts`) | scope ∩ live role per tool; no codes or passwords in any tool | zod per tool (MCP SDK) |
| `POST /oauth/register` | none, by design (registration grants nothing) | rate limited per address (10/hour); total clients capped | body ≤ 64 KB (413); zod: `redirect_uris` (1–5, allowlisted in `lib/oauth/clients.ts`), `client_name`, `logo_uri`; other fields ignored |
| `POST /oauth/token`, `POST /oauth/revoke` | PKCE verifier or refresh token (no client secrets) | refresh re-checks the live role and refuses removed and awaiting accounts | body ≤ 64 KB (413); zod: each parameter once, ≤ 4 KB; unknown ones (`resource`, `client_id` on revoke) ignored |
| `/oauth/authorize` page and its approve / deny actions | session; signed out goes through `/login?next=` and back | client and redirect URI must be registered; scope ∩ role | `parseAuthorizeParams` (zod) for the query and the form alike; a repeated parameter is refused |
| `/.well-known/*` | none | public documents | none |
| `/login`, `/setup`, `/join/[token]` (and their actions) | none: they start a session | setup disables itself once a user exists; invites are single-use HMAC tokens; password sign-in throttled per address and per email | zod first; email ≤ 320, password ≤ 1,000, `next` through `safeNext` |
| `/login/oidc`, `/login/oidc/callback`, `/sso` | none: they start a session | matching rules in `lib/auth/oidc-accounts.ts`; a sign-on that matches nobody gets an account awaiting placement and no session; none on an empty house (→ `/setup`) | `next` through `safeNext`; callback query parsed (zod, each parameter once) |

## Search

- **Where it lives:** each searchable table has a `search_doc` tsvector, rebuilt in app code inside the
  same transaction as the write (`lib/search/rebuild.ts`).
- **What a fixture's document holds:** the path of its place, its system's name, and the names and
  fields of the parts it uses, which is how "living room bulb" finds the overhead light and "plumbing
  shutoff" finds the main shutoff.
- **Cascades:** the cascade table at the top of `rebuild.ts` is the contract. A rename of a place, part
  or contact rebuilds every document that includes its text.
- **Rebuilding everything:** `rebuildAll()` rebuilds every document. Run it after a restore.
- **Query:** `lib/search/search.ts` does a prefix-matched full-text search across all kinds, then falls
  back to `pg_trgm` similarity on names to handle typos.

> Drizzle renders a column **unqualified** inside a single-table select. A correlated subquery
> written as `${table.id}` compares the inner row to itself, so write `outer_table.id` by hand. This
> has bitten here three times; `test/counts.test.ts` pins the counts.

## The house guide

- **Emergency card:** generated, not typed. It shows fixtures marked "Show on the house guide" with
  their photos and housesitter notes, grouped by system ("Water & plumbing: main shutoff, call Ace
  Plumbing"; fixtures in no system come last). A system's call buttons are its trades' contacts that
  are already on the guide. Then the preferred contact for each trade and anyone marked for the guide.
- **Guide sections:** free text only.
- **Gated content:** secrets with gate `home_or_pin`, sections marked private, and the street address.
  A share-link visitor sees them when:
  - **at home:** the client IP (see below) is in the property's LAN ranges, or equals an address its
    DDNS hostname resolves to; or
  - **unlocked:** they entered the link's PIN, which sets an HMAC cookie good for an hour, scoped to
    `/g/<token>`.
- **Codes for family:** signed-in family see codes after tapping "Show", and each reveal is audited.
- **Secret storage:** AES-256-GCM under `INTEGRATIONS_KEY` (`lib/crypto/sealed.ts`), with a key
  fingerprint on each value.
- **Share links:**
  - The token is 256 bits and stored as an HMAC.
  - Links expire after 7 days by default, 30 at most, and can be revoked.
  - The page sends `no-store`, `no-referrer` and `noindex`, and has no Open Graph tags.
  - Views, unlocks and failed PINs are logged per link.
- **Offline:** `public/g/sw.js` is scoped to `/g/` and caches only `/g/<token>/offline`. That is plain
  HTML with nothing gated in it, carrying its expiry. The worker deletes it after expiry or on a
  404/410. Printing the guide gives a copy that survives the server being down, and it includes a
  Wi-Fi QR code.

### Client IP

Next gives a route handler no socket address, so `lib/web/client-ip.ts` reads `X-Forwarded-For`
**from the right**. With `TRUSTED_PROXY_HOPS=N`, it takes the Nth entry from the right, which is the
one our outermost proxy appended. Anything to the left of it was written by the client and is ignored.
With `CLIENT_IP_HEADER` set, it reads that one header instead, which the proxy in front must set on
every request. Production does this with `x-real-ip`, an exception recorded in `docs/DEPLOYMENT.md`.

A LAN client that reaches the container port directly can forge the header. A LAN client is at home
anyway, so that gains nothing.

## Files

- **Upload:** `POST /api/files` is a route handler, because Server Actions cap a body at 1 MB.
- **In the browser:** photos are shrunk to about 2560px JPEG before upload, which also converts HEIC.
- **On the server:**
  - sharp re-encodes the image, applies EXIF orientation, then drops all metadata, GPS included.
  - Only an allowlist of types is accepted. SVG is refused, and a PDF must have PDF magic bytes.
  - Files are stored by content hash at `DATA_DIR/files/<sha[0:2]>/<sha>`.
  - Thumbnails are made on first request.
- **Serving:** every file is served with `nosniff` and a sandboxing CSP.

## Integrations

- **Step 1: pasted links.** `lib/links/links.ts` recognises Homebox `/item/<uuid>`, paperless
  `/documents/<id>` and Home Assistant device, area and entity URLs. No token is needed.
- **Step 2: live lookups.** Connections are in `lib/integrations/*` and are admin-configured.
  - Homebox needs version 0.26 or newer, using `/api/v1/entities` and an `hb_` key.
  - paperless uses API v10 with a token.
  - Tokens are sealed. Calls are server-side only, to fixed paths with validated ids.
  - **Search picker:** lets a member search the other app and link a result. The server fetches the
    record again before storing the link, rather than trusting what the browser sent.
  - **Thumbnail proxy:** cached for a day on disk, and serves linked ids only.
  - **Staleness check:** a lazy check, once a day per link, marks a link `missing` (keeping its title)
    or `auth_error`.
  - **Test connection:** warns when the paperless token can see more than 500 documents.
  - **Places ↔ Homebox locations:** a place can link to a Homebox location (an `external_refs` row
    whose URL is `/location/<uuid>`; the URL tells a location from an item, so there's no extra
    column). The place page then lists what Homebox keeps there (`GET /v1/entities?parentIds=`),
    marks the items already linked to a fixture, and adds the others as a linked fixture in one tap
    (`addFixtureFromHomebox`, which fetches the item's name again server-side).
  - **Documents by paperless tag or correspondent:** a place, project or system can follow one
    paperless tag, and a contact one correspondent. They are `external_refs` rows with `external_id`
    `tag:<id>` or `correspondent:<id>`, so they never collide with a document number; picking another
    replaces the first. The record's page lists the newest 50 documents filed under it
    (`GET /api/documents/?tags__id__all=` or `?correspondent__id=`); filing in paperless is the only
    upkeep. Their documents' thumbnails
    go through the proxy, which asks paperless how the document is filed first. The picker lists every
    tag (or correspondent) before anything is typed.
  - **One Documents section:** every record page lists its paperless documents together
    (`documentsFor`, `components/DocumentsSection.tsx`): the ones linked one by one first, then the
    rest of what its tag or correspondent holds, each document once (a linked one keeps its Remove).
    Fixtures, parts and notes follow no tag and list only linked documents. No paperless row shows
    under Linked, which is left to Homebox, Home Assistant and pasted addresses.
  - **The house's tag:** `integrations.required_tags` (Settings → paperless, admin) lists tags every
    document must also have — for a paperless that also holds another home's papers. They are added
    to every Documents list (`tags__id__all=<filter>,<required>`), to "Add a document" searches,
    to the Open link into paperless, and to the thumbnail proxy's check.
  - **Homebox type names:** built-in entity types come back as translation keys
    (`global.location`) and are left out of subtitles.
- These response shapes come from the projects' published APIs and are tested against a fake server.
  They have **not** yet been verified against live instances.

## MCP

- **Endpoint:** `POST /mcp` uses stateless Streamable HTTP and the low-level `Server`.
- **Auth:** OAuth 2.1 with PKCE and dynamic client registration, for claude.ai custom connectors.
- **Tools:** in `lib/mcp/tools/{read,write}.ts`. Records can be named instead of looked up by id
  (`resolve.ts`); an ambiguous name is refused with the candidates listed.
- **Not available:** no delete tools, and no codes.

## Background jobs

`lib/jobs` runs in process and is started from `instrumentation.ts`. Setting `WORKER=off` disables it.
- Expired sessions are purged.
- Expired OAuth tokens and clients that never got consent are purged.

## Testing

**Vitest (`pnpm test`):**
- One Postgres 18 container per run.
- Migrations are applied to a template database, and each test file clones it, so files run in
  parallel.
- Tests are separated by truncation, so real commits happen.

**Playwright (`pnpm e2e`):**
- `e2e/serve.ts` starts its own Postgres and `next dev` on port 3100.
- The journeys answer the four questions at phone width.
- The guide is checked as an outsider, and axe runs on the main pages.
