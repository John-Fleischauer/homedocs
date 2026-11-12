#!/bin/sh
# Fails when lib/db/schema.ts has changes with no migration (docs/profiles/nextjs-app.md).
# It copies the migrations directory as it is now (committed or not, so it works while
# a new migration is still uncommitted), generates a throwaway "drift-check" migration,
# compares, and puts the copy back, pass, fail or interrupted.
set -eu
dir=lib/db/migrations

[ -d "$dir" ] || { echo "db:drift: no $dir directory." >&2; exit 1; }
command -v drizzle-kit >/dev/null 2>&1 \
  || { echo "db:drift: drizzle-kit not found; run it through pnpm (pnpm db:drift)." >&2; exit 1; }

saved=$(mktemp -d)
restore() {
  # Only once the copy is complete, so a failed copy never deletes the original.
  if [ -f "$saved/.complete" ]; then
    rm -rf "$dir" && cp -a "$saved/migrations" "$dir"
  fi
  rm -rf "$saved"
}
trap restore EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

cp -a "$dir" "$saved/migrations"
touch "$saved/.complete"

drizzle-kit generate --name=drift-check
if ! diff -r "$saved/migrations" "$dir" >/dev/null; then
  diff -rq "$saved/migrations" "$dir" >&2 || true
  echo "db:drift: schema.ts has changes with no migration. Run pnpm db:generate --name <what>." >&2
  exit 1
fi
