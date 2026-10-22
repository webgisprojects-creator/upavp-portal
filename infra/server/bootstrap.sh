#!/usr/bin/env bash
# One-time (admin) step: create the restricted CI/CD deploy user on the server.
# Run by a person who can ssh as root; the pipeline itself never needs root afterwards.
#
#   infra/server/bootstrap.sh install <public-key-file> [--target <ssh alias | root@host>]
#   infra/server/bootstrap.sh remove                    [--target ...]
#
# What it installs and why: see setup-deploy-user.sh (header) and docs/github-setup.md.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${DEPLOY_ADMIN_TARGET:-pre-prod}"
ACTION="${1:-}"; shift || true
KEYFILE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --target) TARGET="$2"; shift 2 ;;
    -*) echo "unknown option: $1" >&2; exit 64 ;;
    *) KEYFILE="$1"; shift ;;
  esac
done

case "$ACTION" in
  install)
    [ -f "$KEYFILE" ] || { echo "usage: bootstrap.sh install <public-key-file> [--target ...]" >&2; exit 64; }
    PUBKEY="$(tr -d '\r' < "$KEYFILE" | head -1)"
    scp -q "$HERE/install-nginx-conf" "$TARGET:/tmp/upavp-install-nginx-conf"
    # the key is passed as a quoted argument; public keys contain no single quotes
    ssh "$TARGET" "bash -s -- install '$PUBKEY'" < "$HERE/setup-deploy-user.sh"
    ;;
  remove)
    ssh "$TARGET" "bash -s -- remove" < "$HERE/setup-deploy-user.sh"
    ;;
  *)
    echo "usage: bootstrap.sh install <public-key-file> | remove  [--target ...]" >&2
    exit 64
    ;;
esac
