# Concepts, explained with this project

Each concept: **what it is** (plain words) -> **where it is in this repo** -> **the interview-ready sentence**.

---
## Part A - Git, CI and CD

### Git, branches, pull requests
**What:** Git records every change as a *commit*, so you can see who changed what, compare, and go back. A *branch* is a separate line of work;
a *pull request* (PR) asks to merge a branch into `main` and gives teammates a place to review and discuss.
**Here:** `CONTRIBUTING.md` (feature branch -> PR -> review -> squash-merge). `main` is always deployable.
**Say:** "Nobody pushes to main; every change is a small PR that CI checks and a teammate reviews. That gives us history, review and a safe way to deploy."

### Trunk-based development vs Git Flow
**What:** *Trunk-based*: one main branch, short-lived feature branches (hours/days), merge often. *Git Flow*: long-lived `develop`/`release` branches.
**Here:** trunk-based - right for a small team and continuous deployment.
**Say:** "Long-lived branches mean big painful merges; short branches + CI keep integration risk small."

### Squash merge
Collapses all commits of a PR into one on `main` -> clean history, easy revert of a whole feature.

### Conventional Commits
`feat(scope): ...`, `fix: ...` - a convention that makes history readable and lets tools generate changelogs/versions.

### Continuous Integration (CI)
**What:** every change is automatically built and tested in a clean environment, so problems are found in minutes, not at deploy time.
**Here:** `.github/workflows/ci.yml` - jobs `web`, `python`, `infra`, `security`, `ci-ok`.
**Say:** "CI answers 'does this change break anything?' on a clean machine, before a human reviews it."

### Continuous Delivery vs Continuous Deployment
*Delivery*: every green change *could* be released; a human presses the button. *Deployment*: every green change on main is released automatically.
**Here:** pre-production = continuous **deployment** (merge deploys). Production would use delivery: same artifact, manual approval.

### Artifact and "build once, deploy many"
**What:** the build output (a tarball) is stored and *reused*. You do not rebuild per environment.
**Why:** a rebuild can differ (new dependency version, different env) - then what you tested is not what you ship.
**Here:** `build-site.sh` -> `portal-<commit>.tar.gz`; CI uploads it, CD downloads *that same file*.
**Caveat to know:** build-time config is baked into the artifact (e.g. `VITE_DEMO_USERS`), so one artifact = one config. For true multi-environment promotion use *runtime* config.

### Immutable releases + atomic switch (deployment strategy)
**What:** every deployment goes in a new folder; the live site is a symlink. Switching = renaming a symlink, which is **atomic** (all-or-nothing, no half-deployed state).
**Here:** `/var/www/upavp-portal/releases/<id>/` and `current`; `remote-activate.sh` uses `ln -sfn ... current.new && mv -T current.new current`.
**Why `mv -T`:** `ln -sfn` alone removes then creates (a tiny gap); `rename()` replaces in one step.
**Say:** "Rollback is the same operation pointing at the older folder, so it takes a second and needs no rebuild."

### Deployment strategies you should be able to compare
| Strategy | How | Pros | Cons | Us |
|---|---|---|---|---|
| Recreate | stop old, start new | simplest | downtime | - |
| Rolling | replace instances one by one | no downtime | mixed versions briefly | - |
| **Blue/green** | run new next to old, switch traffic | instant rollback | needs 2x capacity | **closest: symlink switch on static files** |
| Canary | send a % of traffic to the new version | limits blast radius | needs traffic splitting + metrics | no |

### Smoke test, health check, rollback
A **smoke test** is a few fast checks that the thing is basically alive (pages load, assets exist, revision matches). Failing it triggers **rollback**.
We made the GeoServer tile check a *warning*, not a failure: a different, shared system's hiccup should not roll back a good portal release.

### Concurrency control (locks)
Two deployments at once can corrupt state. `flock` on the server and GitHub's `concurrency:` group (no cancel-in-progress for deploys) prevent that.

### Secrets management
Secrets never go in git. They live in GitHub *Secrets* (encrypted, masked in logs) or a password manager. `.gitignore` blocks `.env*`; CI runs **gitleaks**.
`VITE_*` variables are **public** - anything in a browser bundle can be read - so never treat them as secure.

### Least privilege
Give every account/key only what it needs: DB roles (`_app` cannot create tables, `_geoserver` is read-only), a dedicated deploy key, and (roadmap) a deploy user instead of root.

---
## Part B - Web serving, nginx and caching

### Static site vs server-rendered app
Our front end is files (HTML/JS/CSS) built ahead of time. nginx just serves them - fast, nothing to patch. Anything needing secrets or logic (login!) needs a backend.

### Reverse proxy
nginx sits in front of GeoServer and forwards selected requests. Benefits here: same origin (no CORS), hide GeoServer admin/REST, add caching, add keep-alive.
**Here:** `location ~ ^/geoserver/(...)?(wms|wfs|ows)$ { proxy_pass http://upavp_geoserver; }`; everything else under `/geoserver/` returns 404.

### HTTP caching
* `Cache-Control: max-age=...` tells browsers how long to reuse a response; hashed filenames (`index-AbC123.js`) allow **1 year** because a new build has a new name.
* `no-cache` = revalidate before reuse (we use it for `index.html` so users get new builds). `no-store` = never store.
* **Here:** tiles 1 day (browser) / 2 days (nginx); errors `no-store`.
* **Why `proxy_ignore_headers Cache-Control Expires`:** GeoServer marked its cached tiles `no-cache, no-store`; nginx obeys upstream headers, so we override to cache them.

### Cache key, hit/miss, cache stampede
The key is the full URL. `X-Edge-Cache: HIT/MISS`. `proxy_cache_lock on` makes many simultaneous requests for the same new tile wait for **one** upstream fetch (prevents a stampede).

### Keep-alive and round-trip time (RTT)
Opening a TCP connection costs a round trip; with a 244 ms link every new connection adds ~0.25 s. `upstream { keepalive 16; }` reuses connections.

### Latency vs throughput (the key insight of this project)
*Throughput* = how much per second; *latency* = delay per round trip. Many small sequential trips (1,000 rows per fetch x 172 fetches) are dominated by latency:
`172 x 0.25 s = 43 s` - no amount of bandwidth fixes that; fewer round trips (bigger fetch size) or moving the services closer does.

### CORS and same-origin
Browsers block cross-origin requests unless the server allows them. Proxying `/geoserver/` through our own origin removes the problem.

### SPA fallback
`try_files $uri $uri/ /AwasVikas/index.html;` serves the app for client-side routes. Side effect to know: a missing file also returns 200 with HTML, so tests must check content (e.g. `revision.json` content), not just status.

### Graceful reload
`nginx -t` (validate) then `systemctl reload nginx` (new workers start, old ones finish current requests) - no dropped connections.

---
## Part C - Databases and GIS

### PostgreSQL roles, privileges, default privileges
A *role* is a user/group. `GRANT` gives rights on existing objects; `ALTER DEFAULT PRIVILEGES` gives rights on **future** objects created by a role - essential so the app can read tables the migration creates later.
**Here:** `db/setup/001_create_database.sql`: `upavp_geo_owner` (no login) owns everything; `_dev` acts as owner; `_app` can only read/write; `_geoserver` read-only.

### Connection pooling (PgBouncer)
Opening DB connections is expensive; a pooler shares a few real connections among many clients. *Transaction pooling* (apps) vs *session pooling* (tools like pgAdmin that need session state).

### PostGIS, geometry, SRID, spatial index
A geometry column stores shapes; **SRID** says the coordinate system. **EPSG:4326** = lat/lon degrees (storage); **EPSG:3857** = web-mercator metres (web maps).
A **GiST** index makes "give me shapes in this box" (`geom && bbox`) fast. Our full-city query on 172k rows: 31 ms.

### WMS, WFS, tiles, GWC
* **WMS** returns map *pictures*; **WFS** returns *features* (data). **Tiled** WMS requests fixed 256-px squares on a grid so results are cacheable.
* **GWC** = GeoWebCache, GeoServer's own tile cache. **Metatiling** renders a 4x4 block at once to avoid label clipping and reduce work.
* **CQL** = filter language used in `CQL_FILTER` (`allotment IN ('Alloted',...)`); we build it in `lib/cql.js`. **Always quote user-influenced values** (`sqlQuote` doubles `'`).

### Why snapshots for orientation/labels/chart
They are static, small, and would otherwise need many slow GeoServer round trips. Trade-off: they go stale -> generated by a script + integrity tests.

### Messy data is normal
`allotment` is free text ("Alloted", "Aloted", "Vaccant"). A tested `categorize()` function normalises it. In interviews: *treat data cleaning as code - version it, test it, document the rules.*

---
## Part D - Testing

| Level | Here | What it proves |
|---|---|---|
| Unit | `layoutFields.test.js`, `demoAuth.test.js` | pure logic is right, edge cases (quotes, empty lists, NULL) |
| Data/contract | `data.test.js` | generated snapshots are consistent (counts add up, ids valid) |
| Config | nginx `-t` in CI, shellcheck, actionlint | infrastructure files are valid before they touch a server |
| Smoke | `smoke-test.sh` after every deploy | the live site works |
| E2E (manual so far) | headless-Chrome checks used during development | user journeys; next step: automate with Playwright in CI |

**Test pyramid:** many fast unit tests, fewer integration tests, very few slow end-to-end tests.
**Good test habit:** make logic *pure* (no React, no network) so it is trivial to test - that is why `cql.js` exists.
