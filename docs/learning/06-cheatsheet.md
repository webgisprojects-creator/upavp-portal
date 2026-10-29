# Cheat sheet

## Git
```bash
git switch -c feature/x            # new branch          git switch main && git pull     # sync
git status / git diff / git log --oneline --graph --decorate -15
git add -p                         # stage in chunks     git commit -m "feat(scope): message"
git push -u origin feature/x       # first push          git restore <file>              # discard local edits
git revert <sha>                   # undo on shared branch (safe)       git stash / git stash pop
git rebase origin/main             # update your branch (only your own!)
```

## GitHub CLI
```bash
gh auth status | gh auth switch | gh auth login
gh repo create OWNER/NAME --private --source . --push
gh pr create --fill | gh pr checks | gh pr merge --squash --delete-branch
gh run list | gh run watch | gh run view --log-failed | gh workflow run cd.yml -f action=rollback
gh secret set NAME < file | gh variable set NAME --body value
```

## This project
```bash
npm install | npm run dev:dashboard | npm run dev:login | npm run lint | npm test | npm run build | npm run site
bash infra/deploy/deploy.sh [--force] | rollback.sh [--list] [release] | smoke-test.sh <url> [commit]
python infra/deploy/warm_cache.py [--radius-km 12 --max-zoom 17]
curl -s http://27.100.38.131:8070/revision.json          # what is live
```

## Linux / server
```bash
ssh pre-prod 'systemctl status nginx --no-pager; nginx -t; df -h /; free -m; uptime'
ss -ltnp                       # listening ports           journalctl -u nginx -n 50 --no-pager
tail -f /var/log/nginx/error.log                           ls -1t /var/www/upavp-portal/releases
readlink -f /var/www/upavp-portal/current                  du -sh /var/cache/nginx/upavp_tiles
ping -c 5 HOST | mtr HOST      # latency                   curl -w "%{time_total}s %{http_code}\n" -o /dev/null -s URL
```

## curl patterns
```bash
curl -I URL                                  # headers only
curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" URL
curl -s -D - -o /dev/null URL                # show response headers
curl -G URL --data-urlencode "CQL_FILTER=allotment IN ('Alloted')"   # safe encoding of a query param
```

## nginx
```nginx
location ~ ^/geoserver/(...)$ { proxy_pass http://upstream; }       # regex location
try_files $uri $uri/ /index.html;                                      # SPA fallback
proxy_cache_path ... keys_zone=name:10m max_size=300m inactive=14d;   # define a cache
add_header Cache-Control "public, max-age=86400" always;
```
`nginx -t` (validate) -> `systemctl reload nginx` (graceful).

## PostgreSQL / PostGIS
```sql
\du                                   -- roles          \l            -- databases        \dt app.*  -- tables
SELECT postgis_version();
EXPLAIN (ANALYZE, BUFFERS) SELECT ... WHERE geom && ST_MakeEnvelope(77.3,28.5,77.65,28.82,4326);
CREATE INDEX ON t USING gist (geom);   ANALYZE t;
GRANT SELECT ON ALL TABLES IN SCHEMA app TO role;   ALTER DEFAULT PRIVILEGES FOR ROLE owner IN SCHEMA app GRANT SELECT ON TABLES TO role;
```
pg_dump: `pg_dump -Fc -f upavp_geo.dump upavp_geo` - restore: `pg_restore -d scratch_db --no-owner upavp_geo.dump`.

## GeoServer / OGC
`GetMap` params: `LAYERS, STYLES, BBOX, WIDTH, HEIGHT, SRS, FORMAT, TILED`. Filters: `CQL_FILTER=...`. Capabilities: `request=GetCapabilities`.
Zoom <-> scale: z12 1:136k - z14 1:34k - z15 1:17k - z16 1:8.5k - z17 1:4.3k.

## Workflow YAML skeleton
```yaml
name: Example
on: { pull_request: {}, push: { branches: [main] } }
permissions: { contents: read }
concurrency: { group: x-${{ github.ref }}, cancel-in-progress: true }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci && npm test
```

## The five sentences to know cold
1. "CI proves a change is safe; CD ships exactly what CI proved."
2. "A release is an immutable folder; going live is an atomic symlink switch, so rollback is instant."
3. "Validate before you change, verify after you change, undo automatically if verification fails."
4. "Measure before you optimise - the bottleneck was a 244 ms network hop, not the database."
5. "Secrets live in a secret store, never in git; anything in a browser bundle is public."
