#!/usr/bin/env bash
# Runs ON THE SERVER (sent over ssh by deploy.sh). Activates an uploaded release safely.
#
#   remote-activate.sh <release-id> <keep> <expected-short-commit>
#
# Safety properties:
#   * a lock prevents two deployments running at once
#   * the new nginx config is tested (nginx -t) BEFORE anything is switched; failure leaves the live site untouched
#   * the switch is atomic (rename of a symlink) - visitors never see a half-deployed site
#   * the new release is checked on the server itself; if the check fails the previous release is restored
#   * only the newest <keep> releases are kept (disk on this server is tight)
set -euo pipefail

REL="$1"; KEEP="${2:-5}"; EXPECT="${3:-}"
BASE=/var/www/upavp-portal
CONF=/etc/nginx/sites-available/upavp-portal
ENABLED=/etc/nginx/sites-enabled/upavp-portal
BACKUP_DIR=/var/backups/upavp
PORT=8070

exec 9>/var/lock/upavp-deploy.lock
flock -n 9 || { echo "ERROR: another deployment is running (lock held)"; exit 2; }

mkdir -p "$BASE/releases" "$BACKUP_DIR" /var/cache/nginx/upavp_tiles
chown www-data:www-data /var/cache/nginx/upavp_tiles

PREV="$(readlink -f "$BASE/current" 2>/dev/null || true)"
echo "PREVIOUS=$(basename "${PREV:-none}")"

# ---- 1. unpack the new release next to the old ones
rm -rf "$BASE/releases/$REL"; mkdir -p "$BASE/releases/$REL"
tar -xzf /tmp/upavp-release.tgz -C "$BASE/releases/$REL"
chown -R www-data:www-data "$BASE/releases/$REL"
test -f "$BASE/releases/$REL/site/index.html"

# ---- 2. nginx config: install only if it changed, keep a backup, test before use
CONF_BACKUP=""
if [ -f "$CONF" ] && cmp -s /tmp/upavp-portal.conf "$CONF"; then
  echo "nginx config unchanged"
else
  [ -f "$CONF" ] && { CONF_BACKUP="$BACKUP_DIR/upavp-portal.conf.$REL"; cp -p "$CONF" "$CONF_BACKUP"; }
  install -m 644 /tmp/upavp-portal.conf "$CONF"
  echo "nginx config updated"
fi
ln -sfn "$CONF" "$ENABLED"
rm -f /etc/nginx/sites-enabled/upavp-login            # the old login-only site used the same port

restore_conf() {
  if [ -n "$CONF_BACKUP" ] && [ -f "$CONF_BACKUP" ]; then install -m 644 "$CONF_BACKUP" "$CONF"; fi
}

if ! nginx -t 2>&1; then
  echo "ERROR: nginx -t failed - live site NOT changed"
  restore_conf
  exit 1
fi

# ---- 3. atomic switch + reload
switch_to() {   # $1 = release directory
  ln -sfn "$1" "$BASE/current.new"
  mv -T "$BASE/current.new" "$BASE/current"
}
switch_to "$BASE/releases/$REL"
systemctl reload nginx

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
  nginx -t >/dev/null 2>&1 && systemctl reload nginx
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

rm -f /tmp/upavp-release.tgz /tmp/upavp-portal.conf
echo "RELEASE=$REL"
echo "OK: $REL is live"
