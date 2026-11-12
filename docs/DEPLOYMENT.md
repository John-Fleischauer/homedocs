# Deployment

## How a change reaches the house

1. `.github/workflows/ci.yml` (the standards' `ci` template, reusable workflows at `@v1`):
   - On a pull request: `check` (typecheck, lint, Vitest against Postgres in Docker, `db:drift`),
     `security` (`pnpm audit`), `image` (built, not pushed) and `e2e` (Playwright,
     `.github/workflows/e2e.yml`). All four gate the merge; e2e never gates the image or deploy.
   - On `main`: `check` and `security`, then `image` builds for `linux/arm64` on GitHub's arm
     runner (the deploy host is arm64) and pushes `ghcr.io/john-fleischauer/homedocs:main` and
     `:sha-…`, then `deploy` calls the Dockhand webhook, fails unless the reply says
     `success: true`, and waits until `APP_HEALTH_URL` reports the new revision.
2. Dockhand runs `docker compose up`. `pull_policy: always` makes sure the fresh `:main` is actually
   pulled. There is no `build:` block; the deploy host only pulls.
3. The entrypoint applies migrations, after taking a pre-migration `pg_dump` into the backups volume
   whenever there is something to apply.

**GitHub setup** (secrets or variables):
- `APP_HEALTH_URL` (variable): the public `/api/health` URL the deploy checks.
- `DOCKHAND_WEBHOOK_URL`: the stack's `.../api/git/stacks/<id>/webhook`.
- `DOCKHAND_WEBHOOK_TOKEN`: appended as `?secret=`.
- The first push creates the GHCR package as **private**. Either make it public, or give Dockhand
  registry credentials.

**Check what's running:**

```sh
curl -s https://homedocs.example.com/api/health   # {"ok":true,"revision":"<git sha>"}
git rev-parse HEAD
```

## Environment (Dockhand stack `.env`)

| Variable | Required | Notes |
|---|---|---|
| — | | No published port. The app joins the external `web` network as `homedocs-app-1:3000` (alias `homedocs`), and Caddy proxies to it there. |
| `POSTGRES_PASSWORD` | yes | Any characters; it travels as `PGPASSWORD`, not inside the URL. |
| `SESSION_SECRET` | yes | 32+ chars. Rotating it signs everyone out and invalidates links and OAuth tokens. |
| `INTEGRATIONS_KEY` | yes | 32+ chars and **different** from `SESSION_SECRET`. Encrypts codes and integration tokens. **Back it up with the database**: losing it makes them unreadable (they can be re-entered). |
| `PUBLIC_BASE_URL` | yes | The HTTPS origin, e.g. `https://homedocs.example.com`. Share links and OAuth are built from it. |
| `CLIENT_IP_HEADER` | `x-real-ip` here | Caddy sets `X-Real-IP {client_ip}`, resolving Cloudflare's `CF-Connecting-IP` through `trusted_proxies`. Correct for both the split-horizon home route and the Cloudflare route. |
| `TRUSTED_PROXY_HOPS` | default `1` | How many proxies append to `X-Forwarded-For`. Must match reality for the guide's "at home" check. |
| `CLIENT_IP_HEADER` | | `cf-connecting-ip` behind Cloudflare Tunnel. |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | | Pocket ID. All three or none. Redirect URI: `<PUBLIC_BASE_URL>/login/oidc/callback`. |
| `OIDC_DISPLAY_NAME`, `OIDC_ONLY` | | The button's name; `OIDC_ONLY` hides the password form while sign-on works. |
| `OIDC_TRUST_EMAIL` | | Link a sign-on to an existing account by email even when the provider doesn't mark the address verified. Safe for a Pocket ID you run yourself. |
| `OIDC_DEFAULT_ROLE` | default `viewer` | Role for a sign-on that matches no account (`viewer` or `member`). |
| `BACKUP_KEEP_DAYS`, `BACKUP_AT_HOUR` | 30, 3 | The backup sidecar. |
| `TZ` | | Default `America/New_York`. |

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

## Reverse proxy

**Requirements:**
- Terminate TLS. Camera upload and OAuth need HTTPS.
- **Append** the client address to `X-Forwarded-For`. Caddy, nginx (`$proxy_add_x_forwarded_for`) and
  Traefik all do this by default.

**Telling it the house's network:** in Settings → The home, set the LAN ranges (e.g.
`192.168.1.0/24`) and the DDNS hostname. The settings page shows the address it sees your device
as, which is a quick check that `TRUSTED_PROXY_HOPS` is right. On the home Wi-Fi it should be a LAN
address or your WAN address, not the proxy's.

## Backups

Photos are primary data here: there is no other copy of the picture of the breaker panel.

- **Database:** the `backup` sidecar writes `homedocs-<timestamp>.dump` (`pg_dump -Fc`) to the
  `backups` volume:
  - at boot, then daily at `BACKUP_AT_HOUR`
  - keeping `BACKUP_KEEP_DAYS` of them
  - plus `homedocs-premigrate-*.dump` before any migration
- **Offsite:** include both the **`backups`** and **`files`** volumes in the host's offsite backup.
  The files are content-addressed and immutable, so rsync is cheap.
- **The key:** keep `INTEGRATIONS_KEY` with the backups. Without it the codes come back unreadable.

### Restore drill (do it once, then yearly)

```sh
# 1. A scratch stack beside the real one.
docker compose -p homedocs-restore --env-file restore.env up -d db
# 2. Database.
docker cp homedocs-YYYYMMDD-HHMMSS.dump homedocs-restore-db-1:/tmp/r.dump
docker exec homedocs-restore-db-1 pg_restore -U homedocs -d homedocs --clean --if-exists /tmp/r.dump
# 3. Files: copy the files volume backup into the scratch stack's `files` volume.
# 4. App, with the same INTEGRATIONS_KEY.
docker compose -p homedocs-restore --env-file restore.env up -d
```

5. Sign in to the scratch stack and press **Settings → Maintenance → Rebuild search**.

Then open three records that have photos, and the house guide with codes shown. If they look right,
the backup is good. Tear down with `docker compose -p homedocs-restore down -v`.

## Connecting Claude (MCP)

In Settings → Connected apps, copy the address (`<PUBLIC_BASE_URL>/mcp`). Add it in Claude as a
custom connector, sign in, and approve. A viewer's connection is read-only. Any connection can be
disconnected on the same Settings page.
