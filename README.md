# homedocs

Everything about our house, in one place. homedocs keeps the facts that fall between
[Homebox](https://github.com/sysadminsmedia/homebox) (inventory) and
[paperless-ngx](https://github.com/paperless-ngx/paperless-ngx) (documents):

- **What does it take?** One bulb, filter or paint spec, linked to every light, vent or wall that uses it.
- **What did we use, and what should we do next time?** "12 bags of mulch in the front bed — needed 3
  more." It comes back around next spring.
- **Who do we call?** The plumber, the electrician, the HOA, with a call button.
- **Projects:** the panel replacement, its quotes, and "add 2 outlets in the garage while he's here."
- **The house guide:** shutoffs, people and the Wi-Fi for a housesitter, shared by an expiring link.
  Alarm codes show only at the house or with a PIN.
- **Ask Claude:** an MCP connector, so you can ask "what bulb does the living room light take?"

It's phone-first, made for the whole family, and self-hosted.

## Develop

```sh
pnpm install
docker run -d --name homedocs-dev-db -e POSTGRES_USER=homedocs -e POSTGRES_PASSWORD=homedocs \
  -e POSTGRES_DB=homedocs -p 54330:5432 postgres:18-alpine
cp .env.example .env.local   # fill SESSION_SECRET and INTEGRATIONS_KEY (openssl rand -base64 48)
pnpm db:migrate              # the database above, unless DATABASE_URL says otherwise
pnpm dev                     # http://localhost:3000 → /setup
```

`pnpm test` runs Vitest against Postgres in Docker. `pnpm e2e` runs Playwright, which starts its own
database and server.

`pnpm format` rewrites files with Prettier (default settings; `.prettierignore` says what it
skips).

## Docs

- [Architecture](docs/ARCHITECTURE.md): the model, the guard table, search, the guide's location gate,
  files, integrations and MCP.
- [Deployment](docs/DEPLOYMENT.md): CI to GHCR to Dockhand, environment, reverse proxy, backups and
  restore.
- [Decisions](docs/DECISIONS.md): choices this repo made, with why and what was rejected.
- [Roadmap](docs/ROADMAP.md): agreed, not yet built.
- [CLAUDE.md](CLAUDE.md): commands and the rules that are easy to break, for agents and people
  alike.
