#!/usr/bin/env bash
# Apply the numbered SQL files in db/setup/ to the database, once each, and remember what was applied.
#
#   db/migrate.sh status                      list files and whether they are applied
#   db/migrate.sh baseline 001                mark an already-applied file as done (001 created the database by hand)
#   db/migrate.sh apply                       apply every file that has not been applied yet, in order
#   options: --target <ssh alias>             (default: db-primary; needs ssh access that can run `sudo -u postgres`)
#
# Bookkeeping lives in table public.schema_migrations (version, checksum, applied_at, applied_by).
# A file that was changed AFTER being applied is reported (checksum mismatch) and NOT re-run: make a new numbered file instead.
# Each file runs in ONE transaction: it applies completely or not at all.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${DB_TARGET:-db-primary}"
DB=upavp_geo
CMD="${1:-status}"; shift || true
ARG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --target) TARGET="$2"; shift 2 ;;
    *) ARG="$1"; shift ;;
  esac
done

# run SQL given as an argument (sent on stdin, so there is no shell-quoting of the SQL itself)
q() { ssh "$TARGET" "sudo -u postgres psql -d $DB -X -q -At -v ON_ERROR_STOP=1" <<<"$1"; }
# run a whole file in a single transaction
run_file() { ssh "$TARGET" "sudo -u postgres psql -d $DB -X -q -v ON_ERROR_STOP=1 --single-transaction" < "$1"; }

sum_of() { sha256sum "$1" | cut -c1-16; }
applied() { q "SELECT version || ':' || checksum FROM public.schema_migrations"; }

q "CREATE TABLE IF NOT EXISTS public.schema_migrations (
     version text PRIMARY KEY, name text NOT NULL, checksum text NOT NULL,
     applied_at timestamptz NOT NULL DEFAULT now(), applied_by text NOT NULL DEFAULT current_user)" >/dev/null

case "$CMD" in
  status)
    APPLIED="$(applied)"
    printf '%-8s %-42s %s\n' VERSION FILE STATE
    for f in "$HERE"/setup/[0-9][0-9][0-9]_*.sql; do
      v="$(basename "$f" | cut -c1-3)"; c="$(sum_of "$f")"
      if   grep -q "^$v:$c$" <<<"$APPLIED"; then st="applied"
      elif grep -q "^$v:"    <<<"$APPLIED"; then st="APPLIED, BUT THE FILE CHANGED SINCE (checksum mismatch)"
      else st="pending"; fi
      printf '%-8s %-42s %s\n' "$v" "$(basename "$f")" "$st"
    done
    ;;
  baseline)
    [ -n "$ARG" ] || { echo "usage: migrate.sh baseline <NNN>"; exit 64; }
    f="$(ls "$HERE"/setup/"$ARG"_*.sql)"
    q "INSERT INTO public.schema_migrations(version, name, checksum) VALUES ('$ARG', '$(basename "$f")', '$(sum_of "$f")') ON CONFLICT DO NOTHING"
    echo "baseline: $ARG recorded as applied"
    ;;
  apply)
    APPLIED="$(applied)"
    n=0
    for f in "$HERE"/setup/[0-9][0-9][0-9]_*.sql; do
      v="$(basename "$f" | cut -c1-3)"; c="$(sum_of "$f")"
      if grep -q "^$v:" <<<"$APPLIED"; then
        grep -q "^$v:$c$" <<<"$APPLIED" || echo "WARNING: $(basename "$f") changed after it was applied - not re-running (add a new numbered file instead)"
        continue
      fi
      echo "== applying $(basename "$f")"
      run_file "$f"
      q "INSERT INTO public.schema_migrations(version, name, checksum) VALUES ('$v', '$(basename "$f")', '$c')"
      echo "   done: $v"; n=$((n + 1))
    done
    echo "applied $n new file(s)"
    ;;
  *) echo "usage: migrate.sh status | baseline <NNN> | apply  [--target <ssh alias>]"; exit 64 ;;
esac
