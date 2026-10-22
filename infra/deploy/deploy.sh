#!/usr/bin/env bash
# Deploy the portal to a server.
#
#   infra/deploy/deploy.sh [--target <ssh alias | user@host>] [--artifact <file.tar.gz>] [--keep N] [--force]
#
#   --target     where to deploy        (default: $DEPLOY_TARGET or "pre-prod")
#   --artifact   deploy this prebuilt artifact instead of building (this is what the CI/CD pipeline does)
#   --keep       releases to keep       (default 5)
#   --force      allow a build from a dirty tree / a branch other than main (local use only)
#
# env: BASE_URL (public URL used for the smoke test, default http://27.100.38.131:8070), SSH_OPTS
#
# Flow: [build] -> upload -> remote-activate (lock, nginx config test, atomic switch, on-server check, auto-rollback)
#       -> public smoke test -> automatic rollback if the smoke test fails.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

TARGET="${DEPLOY_TARGET:-pre-prod}"
ARTIFACT=""
KEEP=5
FORCE=0
BASE_URL="${BASE_URL:-http://27.100.38.131:8070}"
SSH_OPTS="${SSH_OPTS:-}"

while [ $# -gt 0 ]; do
  case "$1" in
    --target)   TARGET="$2"; shift 2 ;;
    --artifact) ARTIFACT="$2"; shift 2 ;;
    --keep)     KEEP="$2"; shift 2 ;;
    --force)    FORCE=1; shift ;;
    -h|--help)  sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 64 ;;
  esac
done

# shellcheck disable=SC2086  # SSH_OPTS is intentionally word-split
ssh_() { ssh $SSH_OPTS "$@"; }
# shellcheck disable=SC2086
scp_() { scp -q $SSH_OPTS "$@"; }

# ---- 1. build (unless an artifact was handed in)
if [ -z "$ARTIFACT" ]; then
  if git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1 && [ "$FORCE" != 1 ] && [ -z "${CI:-}" ]; then
    branch="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD)"
    [ "$branch" = "main" ] || { echo "Refusing to deploy from branch '$branch' (use --force for a test deploy)"; exit 1; }
    git -C "$ROOT" diff --quiet HEAD || { echo "Refusing to deploy with uncommitted changes (commit them, or use --force)"; exit 1; }
  fi
  bash "$HERE/build-site.sh"
  ARTIFACT="$(cat "$ROOT/dist-site/ARTIFACT_PATH")"
fi
[ -f "$ARTIFACT" ] || { echo "artifact not found: $ARTIFACT" >&2; exit 1; }
# tar and scp read "C:/..." as "host:path" - use an absolute POSIX path (also fixes relative paths)
ARTIFACT="$(cd "$(dirname "$ARTIFACT")" && pwd)/$(basename "$ARTIFACT")"

REVISION="$(tar -xzOf "$ARTIFACT" site/revision.json)"
SHORT="$(printf '%s' "$REVISION" | sed -n 's/.*"shortCommit":"\([^"]*\)".*/\1/p')"
REL="$(date -u +%Y%m%d-%H%M%S)-${SHORT:-nogit}"
echo "== deploying commit ${SHORT:-unknown} as release $REL to $TARGET"

# ---- 2. upload artifact + nginx config, then activate on the server
REMOTE_BASE=/var/www/upavp-portal
INCOMING="$REMOTE_BASE/incoming"
# clear leftovers first: a file left by another user (e.g. root) could not be overwritten by the deploy user
ssh_ "$TARGET" "mkdir -p $INCOMING && rm -f $INCOMING/release.tgz $INCOMING/upavp-portal.conf"
scp_ "$ARTIFACT" "$TARGET:$INCOMING/release.tgz"
scp_ "$ROOT/infra/nginx/upavp-portal.conf" "$TARGET:$INCOMING/upavp-portal.conf"

OUT="$(mktemp)"; trap 'rm -f "$OUT"' EXIT
if ! ssh_ "$TARGET" "bash -s -- '$REL' '$KEEP' '${SHORT:-}'" < "$HERE/remote-activate.sh" | tee "$OUT"; then
  echo "== DEPLOY FAILED on the server (it rolled back by itself where needed)"; exit 1
fi
PREVIOUS="$(sed -n 's/^PREVIOUS=//p' "$OUT" | head -1)"

# ---- 3. public smoke test; roll back if the new release is bad
if ! bash "$HERE/smoke-test.sh" "$BASE_URL" "${SHORT:-}"; then
  echo "== SMOKE TEST FAILED - rolling back to ${PREVIOUS:-?}"
  if [ -n "$PREVIOUS" ] && [ "$PREVIOUS" != "none" ]; then
    bash "$HERE/rollback.sh" --target "$TARGET" "$PREVIOUS"
  fi
  exit 1
fi

echo "== done: $BASE_URL/  (release $REL, commit ${SHORT:-unknown})"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "### Deployed to \`$TARGET\`"
    echo "* release: \`$REL\`"
    echo "* commit: \`${SHORT:-unknown}\`"
    echo "* url: $BASE_URL/"
  } >> "$GITHUB_STEP_SUMMARY"
fi
