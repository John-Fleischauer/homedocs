# Decisions

Choices this repo made that a reader would otherwise question: why, since when, and what was
rejected. Newest last. The standards sweep's questions and John's answers are in
`docs/plans/standards-conformance.md` ("John's decisions"); the entries below cite them as Q1–Q15.

- [A sign-on that matches nobody gets no access until an admin places it](#2026-11-12-a-sign-on-that-matches-nobody-gets-no-access-until-an-admin-places-it)
- [Deploy mode A on an arm64 host](#2026-11-12-deploy-mode-a-dockhand-git-stack-on-an-arm64-host)
- [The host's snapshots are the backup; no backup sidecar](#2026-11-12-the-hosts-snapshots-are-the-backup-no-backup-sidecar)
- [No `pull_policy` on the database image](#2026-11-12-no-pull_policy-on-the-database-image)
- [Client address from `X-Real-IP` (an exception)](#2026-11-12-client-address-from-x-real-ip-an-exception)
- [CLAUDE.md holds only the rules; the rest lives in `docs/`](#2026-11-12-claudemd-holds-only-the-rules-the-rest-lives-in-docs)
- [Server actions through `act()` with a zod schema, and forms that say what a reset does: a CLAUDE.md rule](#2026-11-12-server-actions-through-act-with-a-zod-schema-and-forms-that-say-what-a-reset-does-a-claudemd-rule)
- [`pnpm db:migrate` defaults to the local database outside production](#2026-11-12-pnpm-dbmigrate-defaults-to-the-local-database-outside-production)
- [A theme choice in Settings; `accent-strong` and the status tokens](#2026-11-12-a-theme-choice-in-settings-accent-strong-and-the-status-tokens)

## 2026-11-12: A sign-on that matches nobody gets no access until an admin places it

**Before:** a single sign-on that matched no account created one with `OIDC_DEFAULT_ROLE` (viewer
unless set), and on an empty house the first one became the admin. A viewer can reveal the
house's codes in the app, so who reached the house was decided only by the identity provider's
group restriction.

**Now** (the standards' security.md, Sign-in with OIDC; John's answer to Q8):

- **Matching is unchanged:** by identity first, then a one-time link by verified (or
  `OIDC_TRUST_EMAIL`) address, never a re-link; a removed account refuses by identity or address.
- **No match:** an account is created with `users.awaiting_placement = true` (role `viewer` only
  because the column needs one), audited, and **no session is started**. The login page says
  they're waiting.
- **Nothing resolves for it:** `resolveSession`, `resolveBearer` and refresh-token rotation refuse
  an awaiting account as they refuse a removed one, and no password reset can be made for it, so
  nothing in the house (the codes included) is reachable through it even if a credential existed.
- **An admin places it** under Awaiting Placement on the Family page: Let In with a role
  (`OIDC_DEFAULT_ROLE` is the suggestion), or Remove (a soft delete, so the next sign-on is refused
  as removed). Each is audited. Add Person can still bring a removed one back.
- **The first account is made only at `/setup`.** A sign-on on a house with no accounts is sent
  there. Under `OIDC_ONLY`, set up with a password, then sign on with the same address to link.
- **The provider's group restriction stays a deployment requirement** (docs/DEPLOYMENT.md): it
  decides who can get onto the list at all.

**Existing accounts are unaffected:** the column was added with `default false` and nothing was
backfilled, so every account that existed, including ones an earlier sign-on created with access,
keeps its role, sessions and connector tokens.

## 2026-11-12: Deploy mode A (Dockhand git stack) on an arm64 host

homedocs runs on an **arm64** Docker host. It stays on deploy mode A as it was: Dockhand tracks
`compose.yaml` on `main`, applies it on that host through its agent there, and `ci.yml`'s deploy
job calls the stack's webhook and checks the revision. The image is built for `linux/arm64` only,
natively on GitHub's `ubuntu-24.04-arm` runner, never under emulation (the standards' `deploy.md`:
the platform matches the host). John's answer to Q3. Details in `docs/DEPLOYMENT.md`.

Rejected: none weighed. The audit only asked John to confirm the setup that was already running.

## 2026-11-12: The host's snapshots are the backup; no backup sidecar

The backup is the host's daily snapshot, kept 7 days, crash-consistent, covering both volumes
(`pgdata18` and `files`). That is the approach until a broader backup approach is considered.
The `backup` sidecar (nightly `pg_dump`, 30 days) was removed: its dumps sat on the same disk as
the database, so they guarded against a bad write but not against losing the host. The
pre-migration dump and a dump by hand before a risky deploy stay. John's answer to Q5; details
and the restore steps in `docs/DEPLOYMENT.md` (Backups).

Rejected: keeping the sidecar for its longer reach back (30 days against 7), which the audit
recommended for photos and codes with no other copy.

## 2026-11-12: No `pull_policy` on the database image

`postgres:18-alpine` has no `pull_policy`; only the app image keeps `pull_policy: always`. The tag
pins the major, a major upgrade is a planned dump and restore, and Dockhand's Re-pull images
already brings minor updates. This follows the standards' 2026-11-11 decision; until then the
`db` (and `backup`) services had `pull_policy: always`. John's answer to Q6.

Rejected: keeping `pull_policy: always` on `db`, which only suggested that database updates were
wanted on every deploy.

## 2026-11-12: Client address from `X-Real-IP` (an exception)

The standard reads the client address from the right of `X-Forwarded-For`, counting trusted
proxies. Production sets `CLIENT_IP_HEADER=x-real-ip` instead: the proxy in front sets `X-Real-IP`
to the client address on every request, so a client can't choose it, and it stays right however
many hops sit in front of that proxy. It decides who the house guide treats as "at home". John's
answer to Q9.

It holds only while the proxy overwrites `X-Real-IP` on every request and nothing reaches the app
except through it (no published port). If either changes, unset `CLIENT_IP_HEADER` and set
`TRUSTED_PROXY_HOPS` (`docs/DEPLOYMENT.md`, Client address).

Rejected: `TRUSTED_PROXY_HOPS` alone, which needs the exact number of hops in front kept right.

## 2026-11-12: CLAUDE.md holds only the rules; the rest lives in `docs/`

CLAUDE.md is loaded into every session, so it holds the commands, the five rules John kept from
the old file (the conformance plan's CLAUDE.md triage, Q15), the guard line, a layout map and this
repo's one exception. Rules the standards already state (migrations append-only, one write path,
the general guard rule, client IP from the right, `AppError`, tap targets, colour tokens, compose, Conventional
Commits, no secrets in audit rows, logs or MCP output) were dropped from it; the project facts it held moved to
`docs/ARCHITECTURE.md` (the old UI names) or were already there (sealed values). New rules an
agent learns go to `docs/claude-candidates.md`, not CLAUDE.md, until John promotes them.

Rejected: keeping the standards' rules in CLAUDE.md as reminders. Two copies drift, and every
session pays for both.

## 2026-11-12: Server actions through `act()` with a zod schema, and forms that say what a reset does: a CLAUDE.md rule

Promoted from `docs/claude-candidates.md` (Phase 3 (a)) by John (Phase 5 brief). An action is a
public endpoint, and a form React resets after a refusal loses what was typed;
`test/action-guards.test.ts` checks both, but an agent that doesn't know the rule writes the
action first and meets the test last. The exceptions are the actions that start a session and so
parse first instead: sign-in, setup, join, OAuth consent and the guide's PIN (`NOT_ACT` in that
test). The Guards rule in CLAUDE.md kept only the page and route halves, which this rule doesn't
cover.

## 2026-11-12: `pnpm db:migrate` defaults to the local database outside production

The migrator doesn't read `.env.local`, so every local run needed a long `DATABASE_URL=…` prefix.
Now, when `NODE_ENV` isn't `production` and `DATABASE_URL` is unset, it uses the dev database from
the README's `docker run` line (`lib/db/migrate-url.ts`, also `drizzle.config.ts`'s default).
Production has no default: the image sets `NODE_ENV=production`, the migrator runs `checkEnv()`
first and `lib/env.ts` refuses a missing `DATABASE_URL`, and `migrationUrl()` returns nothing there
either (`test/migrate-url.test.ts`).

## 2026-11-12: A theme choice in Settings; `accent-strong` and the status tokens

**Before:** dark mode followed the device only, on purpose ("no toggle to find").

**Now** (standards design.md, Dark mode; John's answer to Q11): Light, Dark and System under
Settings → You, not in the header, so the family still has nothing new on every page. System
stays the default. The choice is stored per device in `localStorage` and applied by an inline
head script before first paint (`lib/design/theme.ts`; homedocs sends no CSP); the static offline
pages (`public/offline.html`, the guide's offline copy) still follow the device.

Tokens kept their values; the missing standard ones were mapped onto colours already in use, not
new ones: `ok`/`ok-ink`/`ok-soft` are the accent's (homedocs' green is its done colour),
`warn-ink` and `danger-ink` are white in light and the dark page colour in dark. One app token,
`accent-strong` (darker in light, lighter in dark), is a filled accent button's hover: it
replaces `hover:opacity-90`, which put a translucent fill under the label that the contrast check
can't measure. The header and tab bar lost their translucent `bg-card/95` for the same reason.
`test/design/contrast.test.ts` checks every text pair in both themes, and
`test/design/classes.test.ts` refuses translucent surface fills and fading hovers.

The Wi-Fi QR code keeps `bg-white` (`components/guide/GuideView.tsx`): a QR code needs a white
quiet zone in either theme.
