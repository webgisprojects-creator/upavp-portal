#!/usr/bin/env bash
# One-time (admin) step, run as root ON THE SERVER:  bash setup-api.sh install | remove
# Creates: system user "upavp-api", the systemd service "upavp-api", the root-only settings file /etc/upavp/api.env
# (created from a template ONLY if it does not exist - it holds the database password, which this script never invents)
# and a sudo rule so the CI/CD deploy user may restart exactly this one service.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "must run as root"; exit 1; }
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUDOERS=/etc/sudoers.d/upavp-api
case "${1:-}" in
  remove)
    systemctl disable --now upavp-api 2>/dev/null || true
    rm -f /etc/systemd/system/upavp-api.service "$SUDOERS"; systemctl daemon-reload
    echo "removed service and sudo rule (user and /etc/upavp/api.env kept)"; exit 0 ;;
  install) ;;
  *) echo "usage: $0 install | remove" >&2; exit 64 ;;
esac
command -v node >/dev/null || { echo "ERROR: node not installed"; exit 1; }
id upavp-api >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin upavp-api
install -d -m 750 -o root -g upavp-api /etc/upavp
if [ ! -f /etc/upavp/api.env ]; then
  cat > /etc/upavp/api.env <<'ENV'
PORT=3001
HOST=127.0.0.1
GEOSERVER_WFS_URL=http://27.100.38.132:8081/geoserver/wfs
DB_HOST=27.100.38.132
DB_PORT=5432
DB_NAME=upavp_geo
DB_USER=upavp_geo_api
DB_PASSWORD=SET_ME
LAYOUT_SCHEMA=lucknow
LAYOUT_TABLE=vrindavan_layout
ENV
  chown root:upavp-api /etc/upavp/api.env; chmod 640 /etc/upavp/api.env
  echo "created /etc/upavp/api.env - set DB_PASSWORD before the first start"
fi
install -m 644 "$HERE/upavp-api.service" /etc/systemd/system/upavp-api.service
SYSTEMCTL="$(command -v systemctl)"
TMP="$(mktemp)"; echo "upavp-deploy ALL=(root) NOPASSWD: $SYSTEMCTL restart upavp-api" > "$TMP"
visudo -cf "$TMP" >/dev/null || { echo "ERROR: invalid sudoers"; rm -f "$TMP"; exit 1; }
install -m 440 -o root -g root "$TMP" "$SUDOERS"; rm -f "$TMP"
systemctl daemon-reload; systemctl enable upavp-api >/dev/null 2>&1
echo "installed. It starts after the first deployment ships the api/ folder (the deploy restarts it)."
