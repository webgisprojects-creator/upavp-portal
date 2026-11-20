#!/usr/bin/env bash
# Copy the UPAVP workspaces (config only: stores, layers, styles) from the SHARED GeoServer to the DEDICATED one, then reload it.
#
#   infra/geoserver-local/sync-config.sh            (run from a workstation that has the ssh aliases below)
#
# USE IT BEFORE THE CUT-OVER ONLY. Until the portal's nginx points at the dedicated GeoServer, the shared one is where people
# publish layers and edit styles; this script brings those changes over. After the cut-over the dedicated GeoServer is the
# source of truth: create the marker file (see below) and this script refuses to run, so it can never overwrite layers that were
# published on the dedicated server.
#
# What is copied: workspaces AwasVikas, Landuse_LULC, Planning and the two shared styles they use (generic, line).
# What is NOT copied: any other workspace (the other portal's), users, security settings, passwords (our stores use the JNDI pool).
set -euo pipefail

SRC="${SRC_HOST:-geoserver}"        # ssh alias of the shared GeoServer host
DST="${DST_HOST:-db-primary}"       # ssh alias of the dedicated GeoServer host
SRC_DATA=/opt/geoserver/data_dir
DST_DATA=/var/lib/geoserver-upavp/data_dir
MARKER=/var/lib/geoserver-upavp/CUTOVER_DONE
WORKSPACES=(AwasVikas Landuse_LULC Planning)
GLOBAL_STYLES=(generic line)

ssh "$DST" "test ! -e $MARKER" || { echo "REFUSING: $MARKER exists - the dedicated GeoServer is already the source of truth."; exit 2; }

PATHS=()
for w in "${WORKSPACES[@]}"; do PATHS+=("workspaces/$w"); done
for s in "${GLOBAL_STYLES[@]}"; do PATHS+=("styles/$s.xml"); done

echo "1/3 packing ${WORKSPACES[*]} from $SRC ..."
ssh "$SRC" "tar -C $SRC_DATA -czf /tmp/upavp-overlay.tgz ${PATHS[*]} && ls -l /tmp/upavp-overlay.tgz | awk '{print \"   \" \$5 \" bytes\"}'"

echo "2/3 transferring to $DST (via this machine) ..."
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
scp -q "$SRC:/tmp/upavp-overlay.tgz" "$TMP/upavp-overlay.tgz"
ssh "$SRC" "rm -f /tmp/upavp-overlay.tgz"
scp -q "$TMP/upavp-overlay.tgz" "$DST:/tmp/upavp-overlay.tgz"

echo "3/3 applying on $DST and reloading GeoServer ..."
ssh "$DST" "sudo env DST_DATA=$DST_DATA bash -s" <<'REMOTE'
set -euo pipefail
OV=/tmp/gs-overlay
rm -rf "$OV"; mkdir -p "$OV"; tar -xzf /tmp/upavp-overlay.tgz -C "$OV"; rm -f /tmp/upavp-overlay.tgz

# Layers refer to the shared styles (generic, line) by ID, and IDs differ between GeoServer installations: re-point them.
python3 - "$OV" "$DST_DATA" <<'PY'
import pathlib, re, sys
ov, new = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
sid = lambda p: re.search(r"<id>([^<]+)</id>", p.read_text(encoding="utf-8")).group(1)
mapping = {sid(ov / "styles" / f"{n}.xml"): sid(new / "styles" / f"{n}.xml") for n in ("generic", "line")}
changed = 0
for f in (ov / "workspaces").rglob("*.xml"):
    text = f.read_text(encoding="utf-8"); out = text
    for old, new_id in mapping.items():
        out = out.replace(old, new_id)
    if out != text:
        f.write_text(out, encoding="utf-8"); changed += 1
print(f"   shared-style references re-pointed in {changed} file(s)")
PY

# safety: our stores must use the JNDI pool, never carry a password
if grep -rIlE 'key="passwd"|key="user"|key="host"' "$OV/workspaces" >/dev/null; then
  echo "ERROR: a copied store has its own credentials - convert it to a JNDI store first (geoserver/tools/migrate_stores_to_jndi.py)"; exit 3
fi

for w in $(ls "$OV/workspaces"); do rm -rf "$DST_DATA/workspaces/$w"; done      # so layers deleted at the source disappear here too
cp -a "$OV/workspaces/." "$DST_DATA/workspaces/"
chown -R tomcat:tomcat "$DST_DATA/workspaces"
rm -rf "$OV"

PW="$(awk '/^password:/{print $2}' /root/upavp_geo_setup/geoserver_admin.txt)"
code="$(curl -s -o /dev/null -w '%{http_code}' -u "admin:$PW" -X POST http://127.0.0.1:8081/geoserver/rest/reload)"
echo "   GeoServer reload: HTTP $code (200 = ok)"
[ "$code" = 200 ]
REMOTE
echo "done. Verify with: python3 infra/geoserver-local/benchmark.py <shared base url> <dedicated base url>   (run on the portal server)"
