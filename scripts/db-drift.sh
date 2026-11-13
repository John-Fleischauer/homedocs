#!/bin/sh
# Fails when lib/db/schema.ts has changes with no migration (standards:
# https://github.com/ki4hrg/standards/blob/main/docs/profiles/nextjs-app.md).
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
  rc=$?
  # Ignore interrupts from here on: one between removing the directory and moving the
  # copy in would leave no migrations directory at all.
  trap '' HUP INT TERM
  # Only once the copy is complete, so a failed copy never deletes the original. The copy
  # goes back beside the directory first and is swapped in with mv, so a failed copy
  # leaves the directory as it was. The saved copy is removed only once it's back in
  # place; otherwise it's kept and named, and the script fails with its own exit code
  # (or 1 if it had passed).
  if [ -f "$saved/.complete" ]; then
    if rm -rf "$dir.restoring" && cp -a "$saved/migrations" "$dir.restoring" \
      && rm -rf "$dir" && mv "$dir.restoring" "$dir"; then
      rm -rf "$saved"
    else
      # The copy beside it stays only if the directory itself is gone.
      if [ -d "$dir" ]; then rm -rf "$dir.restoring" || true; fi
      echo "db:drift: couldn't restore $dir; the original is in $saved/migrations." >&2
      [ "$rc" -ne 0 ] || rc=1
    fi
  else
    rm -rf "$saved"
  fi
  exit "$rc"
}
trap restore EXIT
trap 'exit 129' HUP
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
