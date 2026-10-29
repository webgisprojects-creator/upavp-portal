#!/usr/bin/env bash
# Quick checks that a deployed site is really working.
#
#   infra/deploy/smoke-test.sh <base-url> [expected-short-commit]
#
# Hard checks (the script fails, and the pipeline rolls back):
#   login + dashboard pages load, the JS/CSS bundles they reference load, the revision matches the build,
#   the GeoServer proxy exposes only what it should (web UI and REST are blocked).
# Soft check (warning only): a real map tile comes back as an image. GeoServer is a different, shared
#   system 244 ms away; its hiccups must not roll back a good portal release.
set -uo pipefail

BASE="${1:?usage: smoke-test.sh <base-url> [expected-short-commit]}"
EXPECT="${2:-}"
FAIL=0

pass() { echo "  ok    $*"; }
fail() { echo "  FAIL  $*"; FAIL=1; }
warn() { echo "  warn  $*"; }

echo "== smoke test: $BASE"

body="$(curl -fsS --max-time 15 "$BASE/" 2>/dev/null)"        && grep -q 'id="root"' <<<"$body" && pass "login page loads"      || fail "login page (/)"
dash="$(curl -fsS --max-time 15 "$BASE/AwasVikas/" 2>/dev/null)" && grep -q 'id="root"' <<<"$dash" && pass "dashboard page loads" || fail "dashboard page (/AwasVikas/)"

# the bundles the pages point at must exist (catches a half-uploaded release)
for page in "/:$body" "/AwasVikas/:$dash"; do
  prefix="${page%%:*}"; html="${page#*:}"
  for asset in $(grep -oE '(src|href)="[^"]+\.(js|css)"' <<<"$html" | sed -E 's/.*="([^"]+)"/\1/'); do
    url="$BASE${asset}"; [[ "$asset" != /* ]] && url="$BASE${prefix}${asset}"
    curl -fsS --max-time 20 -o /dev/null "$url" 2>/dev/null && pass "asset $asset" || fail "asset $asset"
  done
done

rev="$(curl -fsS --max-time 10 "$BASE/revision.json" 2>/dev/null)"
if [ -n "$rev" ]; then
  if [ -n "$EXPECT" ] && ! grep -q "\"shortCommit\":\"$EXPECT\"" <<<"$rev"; then fail "revision.json is not commit $EXPECT: $rev"; else pass "revision $rev"; fi
else
  fail "revision.json missing"
fi

# the proxy must not expose the GeoServer admin UI / REST API
for path in /geoserver/web/ /geoserver/rest/workspaces; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$BASE$path")"
  [ "$code" = 404 ] && pass "$path blocked ($code)" || fail "$path returned $code (expected 404)"
done

# soft: a real tile through the proxy
tile="$BASE/geoserver/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true&LAYERS=Landuse_LULC:scheme_boundary_hardoi&STYLES=&WIDTH=128&HEIGHT=128&SRS=EPSG:3857&BBOX=8920467,3170678,8922867,3173078"
ctype="$(curl -s -o /dev/null -w '%{content_type}' --max-time 45 "$tile")"
[[ "$ctype" == image/* ]] && pass "map image via GeoServer proxy ($ctype)" || warn "map image did not return an image (GeoServer slow/unreachable?) - not blocking"

# soft: the Vrindavan layout is drawn with a zoom-dependent SLD that names database columns. When the table is rebuilt
# with other column names GeoServer answers 200 with an XML error instead of an image - the dashboard then shows nothing.
vstyle="$BASE/geoserver/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true&LAYERS=Planning:vrindavan_layout&STYLES=vrindavan_PropertyType_label_plot_cat&WIDTH=64&HEIGHT=64&SRS=EPSG:3857&BBOX=9012015,3093779,9013415,3095179"
vtype="$(curl -s -o /dev/null -w '%{content_type}' --max-time 60 "$vstyle")"
[[ "$vtype" == image/* ]] && pass "Vrindavan layout style renders ($vtype)" || warn "Vrindavan layout style did not render ($vtype) - an SLD may name a column that no longer exists (see docs/runbook.md)"

if [ "$FAIL" = 0 ]; then echo "== smoke test PASSED"; else echo "== smoke test FAILED"; fi
exit "$FAIL"
