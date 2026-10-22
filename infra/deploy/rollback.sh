#!/usr/bin/env bash
# Switch the live site back to an earlier release (instant: only a symlink changes, no rebuild).
#
#   infra/deploy/rollback.sh [--target <ssh alias | user@host>] [--list] [release-id]
#
#   no release-id  -> the most recent release that is not the live one
#   --list         -> show the releases on the server and which one is live
#
# Works as the restricted deploy user (it owns /var/www/upavp-portal); no root needed.
set -euo pipefail

TARGET="${DEPLOY_TARGET:-pre-prod}"
SSH_OPTS="${SSH_OPTS:-}"
LIST=0
REL=""

while [ $# -gt 0 ]; do
  case "$1" in
    --target) TARGET="$2"; shift 2 ;;
    --list)   LIST=1; shift ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    -*) echo "unknown option: $1" >&2; exit 64 ;;
    *) REL="$1"; shift ;;
  esac
done

# shellcheck disable=SC2086  # SSH_OPTS is intentionally word-split
# NB: the arguments are quoted INSIDE the command string - ssh would otherwise drop an empty $REL and shift $LIST.
ssh $SSH_OPTS "$TARGET" "bash -s -- '$REL' '$LIST'" <<'REMOTE'
set -euo pipefail
BASE=/var/www/upavp-portal
REL="${1:-}"; LIST="${2:-0}"
CUR="$(basename "$(readlink -f "$BASE/current")")"

if [ "$LIST" = 1 ]; then
  ls -1t "$BASE/releases" | while read -r r; do
    [ "$r" = "$CUR" ] && echo "* $r   <- live" || echo "  $r"
  done
  exit 0
fi

exec 9>"$BASE/.deploy.lock"
flock -n 9 || { echo "ERROR: a deployment is running (lock held)"; exit 2; }

if [ -z "$REL" ]; then
  REL="$(ls -1t "$BASE/releases" | grep -vx "$CUR" | head -1 || true)"
fi
[ -n "$REL" ] && [ -d "$BASE/releases/$REL" ] || { echo "ERROR: release not found: '${REL}'"; ls -1t "$BASE/releases"; exit 1; }

ln -sfn "$BASE/releases/$REL" "$BASE/current.new"
mv -T "$BASE/current.new" "$BASE/current"

sleep 1
curl -fsS --max-time 10 http://127.0.0.1:8070/ | grep -q 'id="root"' || { echo "ERROR: site does not answer after rollback"; exit 1; }
echo "OK: rolled back  $CUR  ->  $REL"
REMOTE
