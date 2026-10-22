#!/usr/bin/env bash
# Runs ON THE SERVER (sent over ssh by deploy.sh) as the restricted deploy user. Activates an uploaded release safely.
#
#   remote-activate.sh <release-id> <keep> <expected-short-commit>
#
# Safety properties:
#   * a lock prevents two deployments running at once
#   * the new nginx config is installed through a root-owned helper that TESTS it first and restores the old one if it is
#     invalid - on failure nothing is switched and the live site is untouched
#   * the switch is atomic (rename of a symlink) - visitors never see a half-deployed site
#   * the new release is checked on the server itself; if the check fails the previous release (and config) is restored
#   * only the newest <keep> releases are kept (disk on this server is tight)
#
# Privileges: runs as "upavp-deploy" (owns /var/www/upavp-portal). Anything needing root goes through sudo and is limited by
# /etc/sudoers.d/upavp-deploy to: nginx -t, systemctl reload nginx, /opt/upavp/bin/install-nginx-conf install|restore.
# (Running it as root also works, e.g. for an administrator.)
set -euo pipefail

REL="$1"; KEEP="${2:-5}"; EXPECT="${3:-}"
BASE=/var/www/upavp-portal
INCOMING="$BASE/incoming"
HELPER=/opt/upavp/bin/install-nginx-conf
PORT=8070

if [ "$(id -u)" = 0 ]; then SUDO=""; else SUDO="sudo -n"; fi

[ -x "$HELPER" ] || { echo "ERROR: $HELPER not found - an administrator must run infra/server/bootstrap.sh once (docs/github-setup.md)"; exit 3; }
mkdir -p "$BASE/releases" "$INCOMING"

RELDIR="$BASE/releases/$REL"
SUCCESS=0
cleanup() {
  rm -f "$INCOMING/release.tgz" "$INCOMING/upavp-portal.conf"
  # a release that did not go live must not stay behind: "rollback" would later offer it as the "previous" release
  if [ "$SUCCESS" != 1 ] && [ -d "$RELDIR" ] && [ "$(readlink -f "$BASE/current" 2>/dev/null)" != "$RELDIR" ]; then
    rm -rf -- "$RELDIR"
  fi
}
trap cleanup EXIT

exec 9>"$BASE/.deploy.lock"
flock -n 9 || { echo "ERROR: another deployment is running (lock held)"; exit 2; }

PREV="$(readlink -f "$BASE/current" 2>/dev/null || true)"
echo "PREVIOUS=$(basename "${PREV:-none}")"

switch_to() {   # $1 = release directory; rename() is atomic, unlike remove-then-create
  ln -sfn "$1" "$BASE/current.new"
  mv -T "$BASE/current.new" "$BASE/current"
}

# ---- 1. unpack the new release next to the old ones
rm -rf "$RELDIR"; mkdir -p "$RELDIR"
tar --no-same-owner -xzf "$INCOMING/release.tgz" -C "$RELDIR"
chmod -R a+rX "$RELDIR"                                   # nginx (www-data) only needs to read
if [ "$(id -u)" = 0 ]; then chown -R --reference="$BASE" "$RELDIR"; fi
test -f "$RELDIR/site/index.html"

# ---- 2. nginx config: the helper backs up, installs, tests (and restores by itself on failure)
if ! CONF_OUT="$($SUDO "$HELPER" install 2>&1)"; then
  echo "$CONF_OUT"
  echo "ERROR: nginx config rejected - live site NOT changed"
  exit 1
fi
CONF_STATE="$(tail -n 1 <<<"$CONF_OUT")"
echo "nginx config: $CONF_STATE"
$SUDO nginx -t

restore_conf() { if [ "$CONF_STATE" = updated ]; then $SUDO "$HELPER" restore || true; fi; }

# ---- 3. atomic switch + graceful reload
switch_to "$RELDIR"
$SUDO systemctl reload nginx

# ---- 4. check it from the server itself; undo on failure
sleep 1
OK=1
curl -fsS --max-time 10 "http://127.0.0.1:$PORT/" | grep -q 'id="root"' || OK=0
curl -fsS --max-time 10 "http://127.0.0.1:$PORT/AwasVikas/" | grep -q 'id="root"' || OK=0
if [ -n "$EXPECT" ]; then
  curl -fsS --max-time 10 "http://127.0.0.1:$PORT/revision.json" | grep -q "\"shortCommit\":\"$EXPECT\"" || OK=0
fi
if [ "$OK" != 1 ]; then
  echo "ERROR: new release failed the on-server check - rolling back"
  if [ -n "$PREV" ] && [ -d "$PREV" ]; then switch_to "$PREV"; fi
  restore_conf
  if $SUDO nginx -t >/dev/null 2>&1; then $SUDO systemctl reload nginx; fi
  exit 1
fi

# ---- 5. housekeeping: keep the newest $KEEP releases (never the live or the previous one)
cd "$BASE/releases"
ls -1t | tail -n +"$((KEEP + 1))" | while read -r old; do
  full="$BASE/releases/$old"
  [ "$full" = "$(readlink -f "$BASE/current")" ] && continue
  [ "$full" = "$PREV" ] && continue
  rm -rf -- "$full"; echo "pruned $old"
done

SUCCESS=1
echo "RELEASE=$REL"
echo "OK: $REL is live"
