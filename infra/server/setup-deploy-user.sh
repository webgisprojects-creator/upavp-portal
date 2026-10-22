#!/usr/bin/env bash
# Runs ON THE SERVER as root (sent by bootstrap.sh). Creates the restricted CI/CD deploy user.
#
#   setup-deploy-user.sh install "<ssh public key line>"
#   setup-deploy-user.sh remove                      (undo everything this script created, except the web files)
#
# Result - least privilege for the pipeline:
#   * user  upavp-deploy : no password, no shell logins except with the one key, key restricted (no forwarding / pty)
#   * owns  /var/www/upavp-portal (releases, incoming) and nothing else
#   * sudo  limited to:  nginx -t | systemctl reload nginx | /opt/upavp/bin/install-nginx-conf (install|restore)
#   * NOT in the sudo group. The pre-existing "deploy" user on this server is left completely alone.
# Idempotent: running it again just re-applies the same state.
set -euo pipefail

NAME=upavp-deploy
BASE=/var/www/upavp-portal
SUDOERS=/etc/sudoers.d/upavp-deploy
HELPER_SRC=/tmp/upavp-install-nginx-conf
HELPER=/opt/upavp/bin/install-nginx-conf

[ "$(id -u)" = 0 ] || { echo "must run as root"; exit 1; }
cmd="${1:-}"

if [ "$cmd" = remove ]; then
  rm -f "$SUDOERS" "$HELPER"
  if id "$NAME" >/dev/null 2>&1; then pkill -u "$NAME" || true; userdel -r "$NAME" 2>/dev/null || userdel "$NAME"; fi
  chown -R root:root "$BASE" 2>/dev/null || true
  echo "removed user $NAME, its sudoers file and the helper (web files kept, ownership back to root)"
  exit 0
fi

[ "$cmd" = install ] || { echo "usage: $0 install \"<public key>\" | remove" >&2; exit 64; }
PUBKEY="${2:?public key line required}"

# ---- 0. sanity checks before changing anything
printf '%s\n' "$PUBKEY" > /tmp/upavp-pubkey.check
ssh-keygen -l -f /tmp/upavp-pubkey.check >/dev/null || { echo "ERROR: not a valid public key"; rm -f /tmp/upavp-pubkey.check; exit 1; }
rm -f /tmp/upavp-pubkey.check
[ -f "$HELPER_SRC" ] || { echo "ERROR: $HELPER_SRC missing (use bootstrap.sh)"; exit 1; }
command -v nginx >/dev/null && command -v systemctl >/dev/null && command -v visudo >/dev/null || { echo "ERROR: nginx/systemctl/visudo not found"; exit 1; }
NGINX="$(command -v nginx)"; SYSTEMCTL="$(command -v systemctl)"

# ---- 1. the user (never touch an existing account that is not ours)
if id "$NAME" >/dev/null 2>&1; then
  echo "user $NAME already exists - re-applying configuration"
else
  useradd --create-home --shell /bin/bash --comment "UPAVP CI/CD deploy user" "$NAME"
fi
passwd -l "$NAME" >/dev/null
if id -nG "$NAME" | tr ' ' '\n' | grep -qx sudo; then gpasswd -d "$NAME" sudo >/dev/null; fi

# ---- 2. the key (restricted: no port/agent/X11 forwarding, no pty)
install -d -m 700 -o "$NAME" -g "$NAME" "/home/$NAME/.ssh"
printf 'restrict %s\n' "$PUBKEY" > "/home/$NAME/.ssh/authorized_keys"
chown "$NAME:$NAME" "/home/$NAME/.ssh/authorized_keys"
chmod 600 "/home/$NAME/.ssh/authorized_keys"

# ---- 3. the web directory belongs to the deploy user; nginx (www-data) only needs to read it
install -d -m 755 -o "$NAME" -g "$NAME" "$BASE" "$BASE/releases" "$BASE/incoming"
chown -R "$NAME:$NAME" "$BASE"
chmod -R a+rX "$BASE"
chmod 700 "$BASE/incoming"

# ---- 4. the root-owned helper (the only way to touch nginx config)
install -d -m 755 -o root -g root /opt/upavp /opt/upavp/bin
install -m 755 -o root -g root "$HELPER_SRC" "$HELPER"
rm -f "$HELPER_SRC"

# ---- 5. sudo rules - validated BEFORE they are installed (a broken sudoers file can lock everyone out of sudo)
TMP="$(mktemp)"
cat > "$TMP" <<EOF
# CI/CD deploy user: may test + reload nginx and use the config helper, nothing else.
$NAME ALL=(root) NOPASSWD: $NGINX -t, $SYSTEMCTL reload nginx, $HELPER install, $HELPER restore
EOF
visudo -cf "$TMP" >/dev/null || { echo "ERROR: generated sudoers file is invalid - nothing installed"; rm -f "$TMP"; exit 1; }
install -m 440 -o root -g root "$TMP" "$SUDOERS"
rm -f "$TMP"
visudo -c >/dev/null && echo "sudoers OK"

# ---- 6. prove the privilege boundary
echo "-- deploy user may run (sudo -l):"
su -s /bin/bash "$NAME" -c 'sudo -n -l' | sed -n '/may run/,$p'
if su -s /bin/bash "$NAME" -c 'sudo -n true' >/dev/null 2>&1; then
  echo "ERROR: deploy user has unrestricted sudo!"; exit 1
fi
echo "-- unrestricted sudo is correctly denied"
echo "-- host key (RSA) to pin in CI:"
ssh-keygen -lf /etc/ssh/ssh_host_rsa_key.pub
echo "OK: $NAME is ready"
