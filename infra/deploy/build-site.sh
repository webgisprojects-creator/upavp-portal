#!/usr/bin/env bash
# Build both apps ONCE and package the result as one deployable artifact.
#
#   infra/deploy/build-site.sh            -> dist-site/portal-<commit>.tar.gz
#
# The artifact contains  site/  (login at the root, dashboard under AwasVikas/) and site/revision.json
# (which commit it was built from). The very same artifact is what CI uploads and what the deploy step ships,
# so what was tested is exactly what runs on the server ("build once, deploy many").
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
OUT="${OUT_DIR:-$ROOT/dist-site}"

# --- which commit is this? (works outside git too, e.g. when run from a zip)
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  COMMIT="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
  BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
  git diff --quiet HEAD 2>/dev/null && DIRTY=false || DIRTY=true
else
  COMMIT=unknown BRANCH=unknown DIRTY=true
fi
SHORT="${COMMIT:0:12}"
BUILT_BY="${GITHUB_ACTOR:-${USER:-${USERNAME:-unknown}}}"

# --- build (CI always installs from the lockfile; locally node_modules is reused)
if [ -n "${CI:-}" ] && [ ! -d node_modules ]; then npm ci --no-audit --no-fund; fi
npm run build

# --- assemble
rm -rf "$OUT"
mkdir -p "$OUT/site/AwasVikas"
cp -r apps/login/dist/. "$OUT/site/"
cp -r apps/dashboard/dist/. "$OUT/site/AwasVikas/"
test -f "$OUT/site/index.html" && test -f "$OUT/site/AwasVikas/index.html"

printf '{"commit":"%s","shortCommit":"%s","branch":"%s","dirty":%s,"builtAt":"%s","builtBy":"%s"}\n' \
  "$COMMIT" "$SHORT" "$BRANCH" "$DIRTY" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$BUILT_BY" > "$OUT/site/revision.json"

ARTIFACT="$OUT/portal-${SHORT}.tar.gz"
tar -C "$OUT" -czf "$ARTIFACT" site
echo "artifact: $ARTIFACT ($(du -h "$ARTIFACT" | cut -f1))"
echo "$ARTIFACT" > "$OUT/ARTIFACT_PATH"
