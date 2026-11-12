# Deployment

- **Mode:** Dockhand git stack (mode A in the standards' `docs/core/deploy.md`). Dockhand
  tracks `compose.yaml` on `main` with **Force redeploy** and **Re-pull images** on, and applies
  it on the host through its agent there. `ci.yml`'s deploy job calls the stack's webhook after
  the image is pushed, fails unless Dockhand answers `success: true`, then waits for
  `APP_HEALTH_URL` to report the merged commit.
- **Host:** one Docker host, **arm64**. The image is built for `linux/arm64` only, natively on
  GitHub's arm runner (`ubuntu-24.04-arm`), so it never runs under emulation. The containers are
  `homedocs-app-1` and `homedocs-db-1`.
- **Image:** `ghcr.io/john-fleischauer/homedocs:main` (`pull_policy: always`), and
  `:sha-<short sha>` for each commit. compose only pulls; there is no `build:` block. Postgres is
  `postgres:18-alpine` with no `pull_policy`: its major is pinned and upgraded as planned work.
- **Runs as:** user `app` (not root). The app writes to the `files` volume at `/data`; Postgres
  to `pgdata18`, as the Postgres image's own user.
- **Revision check:** `APP_HEALTH_URL` is `<PUBLIC_BASE_URL>/api/health`. Check by the revision,
  never by the tag:

  ```sh
  curl -s https://homedocs.example.com/api/health   # {"ok":true,"revision":"<git sha>"}
  git rev-parse HEAD
  ```

  or on the host `docker inspect homedocs-app-1 --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}'`.

## How a change reaches the house

1. `.github/workflows/ci.yml` (the standards' `ci` template, reusable workflows at `@v1`):
   - On a pull request: `check` (typecheck, lint, Vitest against Postgres in Docker, `db:drift`),
     `security` (`pnpm audit`), `image` (built, not pushed) and `e2e` (Playwright,
     `.github/workflows/e2e.yml`). All four gate the merge; e2e never gates the image or deploy.
   - On `main`: `check` and `security`, then `image` builds for `linux/arm64` and pushes `:main`
     and `:sha-…`, then `deploy` calls the Dockhand webhook and checks the revision (above).
2. Dockhand runs `docker compose up` on the host. `pull_policy: always` makes sure the fresh
   `:main` is actually pulled.
3. The entrypoint applies migrations, after taking a pre-migration `pg_dump` (Backups, below)
   whenever there is something to apply, then starts the server, which checks the environment
   before serving anything.

**GitHub setup** (secrets or variables):
- `APP_HEALTH_URL` (variable): the public `/api/health` URL the deploy checks.
- `DOCKHAND_WEBHOOK_URL`: the stack's `.../api/git/stacks/<id>/webhook`.
- `DOCKHAND_WEBHOOK_TOKEN`: appended as `?secret=`.
- The GHCR package is public, so the host pulls without registry credentials.

## Exposure: internet-facing, through a reverse proxy on the same host

The claude.ai connector reaches `/mcp` and the OAuth routes from Anthropic's cloud, and share
links (`/g/<token>`) go to people outside the house. No port is published: the app joins the
proxy's external `web` network as `homedocs-app-1:3000` (alias `homedocs`), and the proxy, on
the same host, is the only way in. Postgres publishes no port either; only the app reaches it, on
the stack's default network. Every public URL is built from `PUBLIC_BASE_URL`, never from `Host`
or `X-Forwarded-Proto`.

**The proxy must:**
- Terminate TLS. Camera upload and OAuth need HTTPS.
- Set `X-Real-IP` to the client address on **every** request, overwriting whatever the client
  sent (production reads it; next section). Without `CLIENT_IP_HEADER`, it must instead
  **append** the client address to `X-Forwarded-For`, as most proxies do by default.

### Client address: `CLIENT_IP_HEADER=x-real-ip` (an exception)

The standard reads the client address from the right of `X-Forwarded-For`, counting trusted
proxies (`TRUSTED_PROXY_HOPS`). Production instead sets `CLIENT_IP_HEADER=x-real-ip`: the proxy
in front sets `X-Real-IP` from the client address on every request, so a client can't choose its
value, and it stays right however many hops sit in front of that proxy. John's decision,
2026-11-12 (`docs/plans/standards-conformance.md`, Q9). It holds only while both stay true: the
proxy overwrites `X-Real-IP` on every request, and nothing reaches the app except through it (no
published port). If either changes, unset `CLIENT_IP_HEADER` and set `TRUSTED_PROXY_HOPS`.

It decides who the house guide treats as "at home" (`lib/guide/location.ts`). In Settings → The
home, set the LAN ranges (e.g. `192.168.1.0/24`) and the DDNS hostname; the page shows the
address it sees your device as, which is the quick check. On the home Wi-Fi it should be a LAN
address or your WAN address, not the proxy's.

## Environment (Dockhand stack `.env`)

Compose refuses to start without `POSTGRES_PASSWORD`, `SESSION_SECRET`, `INTEGRATIONS_KEY` and
`PUBLIC_BASE_URL` (`${VAR:?}`). At boot, `lib/env.ts` (zod) checks everything below from
`instrumentation.ts`, and the server exits 1 with a message naming each bad variable, never its
value. The migrator (`dist/migrate.cjs`, before the server) checks only `DATABASE_URL` and
`PGPASSWORD` the same way, so a missing password is named rather than reported as a failed
query. A blank value counts as unset. Locally, `.env.local` from `.env.example`.

| Variable | Required | Rule and notes |
|---|---|---|
| `POSTGRES_PASSWORD` | yes | Any characters. The app gets it as `PGPASSWORD` beside a password-less `DATABASE_URL` (compose builds both), which postgres-js and `pg_dump` read themselves, so a `/` or `@` in it is safe. It only sets the password when Postgres creates a new cluster: changing it later also needs `ALTER ROLE` in the database. |
| `SESSION_SECRET` | yes | 32+ characters (`openssl rand -base64 48`). Tokens (sessions, invites, share links, OAuth codes and tokens) are stored as HMACs under it, so **rotating it signs everyone out, the claude.ai connector included**, and invalidates share links. |
| `INTEGRATIONS_KEY` | yes | 32+ characters and **different** from `SESSION_SECRET`. Encrypts codes and integration tokens. **Keep a copy with the backups**: losing it makes them unreadable (they can be re-entered). |
| `PUBLIC_BASE_URL` | yes | An `https` origin with no path, e.g. `https://homedocs.example.com` (`http` only for `localhost`). Share links, OAuth discovery and the sign-on callback are built from it. |
| `CLIENT_IP_HEADER` | `x-real-ip` here | A header name. When set, the client address is read from it alone (above). |
| `TRUSTED_PROXY_HOPS` | default `1` | A whole number, 1 or more: how many proxies append to `X-Forwarded-For`. Used only when `CLIENT_IP_HEADER` is unset. |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | | Single sign-on: all three or none; the issuer an http(s) URL. Redirect URI: `<PUBLIC_BASE_URL>/login/oidc/callback`. |
| `OIDC_DISPLAY_NAME`, `OIDC_ONLY` | | The button's name; `OIDC_ONLY` hides the password form while sign-on works. |
| `OIDC_TRUST_EMAIL` | | Link a sign-on to an existing account by email even when the provider doesn't mark the address verified. Safe for an identity provider you run yourself. |
| `OIDC_DEFAULT_ROLE` | default `viewer` | `viewer` or `member`: the role for a sign-on that matches no account. |
| `TZ` | default `America/New_York` | An IANA time zone. |
| `WORKER` | | `on` or `off`; `off` keeps a container from running the background jobs. Not passed by compose. |

`OIDC_ONLY` and `OIDC_TRUST_EMAIL` take `true false 1 0 yes no on off` (any case). Compose sets
`DATA_DIR=/data` and `BACKUP_DIR=/data/backups` itself; the image sets `GIT_REVISION`.

## Adding family who use Pocket ID

In Pocket ID, set the client's **Launch URL** to `<PUBLIC_BASE_URL>/sso`. Tapping homedocs there
opens it signed in: straight in if a session exists, otherwise through a sign-on round trip.


On the Family page, **Add someone** with their name, the email address they have in Pocket ID, and a
role. Leave the password blank. Their first Pocket ID sign-in finds the account by that address and
links to it, keeping the role you picked. After that, the link is by Pocket ID identity, so a later
email change there doesn't matter. Linking needs Pocket ID to mark the address verified, or
`OIDC_TRUST_EMAIL=true`. Invite links still work for anyone who'd rather set their own password.

## Connecting paperless

homedocs sees exactly what the token's paperless user sees. paperless shows a user only the
documents, tags and correspondents that user owns, that have no owner, or that are shared with them,
and that holds for a tag list too. With a dedicated, limited user (recommended, so the family can't
search the tax returns), share with it:
- the **tags and correspondents** you want to link places, projects, systems and contacts to
  (paperless → Tags or Correspondents → select them → Permissions → add the user as a viewer);
- the **documents** under them, the same way from the Documents list. A workflow that adds the
  view permission when the tag is assigned keeps new documents shared.

If the picker lists only a few tags, or a tag shows fewer documents than paperless does for you,
this is why.

If paperless also holds another home's papers, pick this house's tag under Settings → paperless →
**Only documents tagged**. Every Documents list, and "Add a document", then needs that tag too,
so a system's "Plumbing" tag shows this house's plumbing only.

## Backups

Photos are primary data here: there is no other copy of the picture of the breaker panel.

- **The backup is the host's daily snapshot**, kept 7 days. It covers the whole disk, so both
  volumes: `pgdata18` (the database) and `files` (photos, documents, and the pre-migration
  dumps). It is crash-consistent: Postgres recovers from it as from a power cut. That is the
  approach until a broader backup approach is considered.
- **No backup service in the stack.** Until 2026-11 a `backup` sidecar wrote a nightly
  `pg_dump` to a `backups` volume, kept 30 days. It was removed (John's decision, 2026-11-12,
  `docs/plans/standards-conformance.md` Q5): its dumps sat on the same disk as the database, so
  they protected against a bad write but not against losing the host, and the snapshots already
  cover that disk. After the deploy that removed it, the old container and volume are cleaned up
  by hand (below).
- **Pre-migration dump.** When the entrypoint has a migration to apply to an existing database,
  `lib/db/migrate.ts` first writes `homedocs-premigrate-<timestamp>.dump` (`pg_dump -Fc`) to
  `BACKUP_DIR` (`/data/backups`, on the `files` volume); a failed dump stops the container
  before anything is migrated. They are never pruned: one per migration, small; delete old ones
  by hand.
- **Before a risky deploy** (a Postgres major, a change to how the app connects or boots), take a
  dump by hand as well, off the host:

  ```sh
  ssh <host> 'docker exec homedocs-db-1 pg_dump -U homedocs -d homedocs -Fc' > ~/homedocs-$(date +%F).dump
  ```

- **The key:** keep `INTEGRATIONS_KEY` with the backups. Without it the codes come back unreadable.

### Removing the old `backup` sidecar (once, after the deploy that drops it)

`docker compose up` leaves a service that left the file running as an orphan unless Dockhand
passes `--remove-orphans`, and the volume is never removed by a deploy. On the host:

```sh
docker ps -a --filter name=homedocs-backup-1     # still there? then:
docker rm -f homedocs-backup-1
# Optional: copy out any dump worth keeping first, e.g. the last pre-migration one.
docker run --rm -v homedocs_backups:/b alpine ls -l /b
docker volume rm homedocs_backups
```

### Restore

Stop the app first so nothing writes, then restore a dump into the stack's database:

```sh
ssh <host> 'docker stop homedocs-app-1'
ssh <host> 'docker exec -i homedocs-db-1 pg_restore -U homedocs -d homedocs --clean --if-exists' < ~/homedocs-YYYY-MM-DD.dump
ssh <host> 'docker start homedocs-app-1'
```

A pre-migration dump is restored the same way, after `docker cp`-ing it out of the app container
(`/data/backups/…`). Restoring the whole host from a snapshot brings back both volumes together.

### Restore drill (do it once, then yearly)

```sh
# 1. A scratch stack beside the real one.
docker compose -p homedocs-restore --env-file restore.env up -d db
# 2. Database, from a dump taken by hand.
docker cp homedocs-YYYY-MM-DD.dump homedocs-restore-db-1:/tmp/r.dump
docker exec homedocs-restore-db-1 pg_restore -U homedocs -d homedocs --clean --if-exists /tmp/r.dump
# 3. Files: copy the `files` volume (from a snapshot) into the scratch stack's `files` volume.
# 4. App, with the same INTEGRATIONS_KEY.
docker compose -p homedocs-restore --env-file restore.env up -d
```

5. Sign in to the scratch stack and press **Settings → Maintenance → Rebuild search**.

Then open three records that have photos, and the house guide with codes shown. If they look right,
the backup is good. Tear down with `docker compose -p homedocs-restore down -v`.

## Rollback

Revert the commit on `main`; the revert deploys like any change, so the image and `compose.yaml`
move together. A migration is not undone by a revert: restore the pre-migration dump.

## Connecting Claude (MCP)

In Settings → Connected apps, copy the address (`<PUBLIC_BASE_URL>/mcp`). Add it in Claude as a
custom connector, sign in, and approve. A viewer's connection is read-only. Any connection can be
disconnected on the same Settings page.
