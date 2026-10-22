# Deployment

How the portal gets from a pull request to the pre-production server, and how to do it by hand when needed.

## 1. The pipeline at a glance

```
 pull request ──► CI ────────────────────────────────────────────────────────────┐
                   ├ web      lint · unit tests · build both apps · upload artifact │
                   ├ python   pytest (data scripts)                                 │ all green
                   ├ infra    shellcheck · nginx -t (v1.18) · actionlint             │ required to merge
                   ├ security gitleaks (secrets) · npm audit (runtime deps)          │
                   └ ci-ok    single required status check ◄──────────────────────┘
 merge to main ──► CI again ──► CD (workflow_run) ──► download THE SAME artifact
                                                      ► ssh ► lock ► unpack ► nginx -t ► atomic switch ► reload
                                                      ► on-server check ► public smoke test ► (auto-rollback on failure)
```

| Workflow | File | Trigger | Output |
|---|---|---|---|
| CI | `.github/workflows/ci.yml` | every PR, every push to `main`, manual | green/red checks + artifact `portal-site` |
| CD | `.github/workflows/cd.yml` | CI succeeded on `main`; manual (deploy / rollback) | new release live on pre-production |

**Build once, deploy many:** CD never rebuilds. It downloads the artifact CI produced from the *same commit*, so what was tested is what runs.

## 2. What is on the server

| Path on 27.100.38.131 | Content |
|---|---|
| `/var/www/upavp-portal/releases/<time>-<commit>/site/` | One immutable folder per deployment (~8.5 MB): login at the root, dashboard in `AwasVikas/`, `revision.json` |
| `/var/www/upavp-portal/current` | Symlink to the live release. nginx serves `current/site` |
| `/etc/nginx/sites-available/upavp-portal` | Site definition (a copy of `infra/nginx/upavp-portal.conf`), enabled via `sites-enabled` |
| `/var/cache/nginx/upavp_tiles/` | Edge tile cache (max 300 MB, 2 days) |
| `/var/backups/upavp/` | Previous nginx site files, kept when the config changes |
| `/var/lock/upavp-deploy.lock` | Held during a deploy/rollback so two cannot overlap |

The server has **no source code, no `node_modules`, no git** for the portal - only built files. Check what is live:
`curl http://27.100.38.131:8070/revision.json` -> commit, branch, build time, who built it.

## 3. What a deployment does (`infra/deploy/`)

| Script | Runs | Purpose |
|---|---|---|
| `build-site.sh` | CI / laptop | Builds both apps, assembles `site/`, writes `revision.json`, packs `dist-site/portal-<commit>.tar.gz` |
| `deploy.sh` | CI / laptop | Orchestrator: (optional build) -> upload -> `remote-activate.sh` -> public smoke test -> auto-rollback if it fails |
| `remote-activate.sh` | server (via ssh) | Lock -> unpack -> install nginx config if changed -> **`nginx -t`** -> **atomic switch** (`mv -T`) -> reload -> on-server check -> prune old releases |
| `smoke-test.sh` | CI / laptop | Pages load, referenced JS/CSS load, revision matches, GeoServer admin/REST blocked (hard); a real tile loads (soft warning) |
| `rollback.sh` | CI / laptop | Point `current` at an earlier release (default: previous). `--list` shows releases |
| `warm_cache.py` | laptop | Pre-warm the tile caches before a demo |

Safety properties: a failed `nginx -t` leaves the live site untouched; a failed on-server check restores the previous release and config;
a failed public smoke test triggers a rollback; the lock prevents overlapping runs; only the newest 5 releases are kept.

## 4. Deploying

### Normal way
Merge a pull request into `main`. CI runs, then CD deploys automatically. Watch it in the **Actions** tab; the run page shows the commit and URL.

### Manual: deploy the latest green `main`
GitHub -> Actions -> **CD** -> *Run workflow* -> action `deploy`.

### Manual: from a laptop (emergency / before GitHub is set up)
```bash
npm install
bash infra/deploy/deploy.sh                    # target alias "pre-prod" from ~/.ssh/config; builds from your working tree
bash infra/deploy/deploy.sh --force            # allow a dirty tree / non-main branch (test deploys only)
DEPLOY_TARGET=root@27.100.38.131 bash infra/deploy/deploy.sh
```
Without a `main`-and-clean tree the script refuses, so a laptop deploy always corresponds to a committed state (use `--force` knowingly).
The login needs its demo users at build time: put `VITE_DEMO_USERS` in `apps/login/.env.production.local` (git-ignored).

## 5. Rolling back

```bash
bash infra/deploy/rollback.sh --list           # releases, "<- live" marks the active one
bash infra/deploy/rollback.sh                  # previous release
bash infra/deploy/rollback.sh 20261013-125720  # a specific release
```
Or GitHub -> Actions -> CD -> Run workflow -> action `rollback` (optionally a release id). It is instant: only a symlink changes.
Remember a rollback does not undo a database or GeoServer change - those are separate and reviewed in `db/` and `geoserver/`.

## 6. Configuration the pipeline needs

Set once (see [github-setup.md](github-setup.md)):

| Name | Kind | Meaning |
|---|---|---|
| `DEPLOY_SSH_KEY` | secret | private key allowed to log in to the server |
| `VITE_DEMO_USERS` | secret | JSON list of temporary demo sign-ins, injected at build time |
| `DEPLOY_HOST`, `DEPLOY_USER` | variable | e.g. `27.100.38.131`, `root` (to be replaced by a least-privilege user) |
| `DEPLOY_KNOWN_HOSTS` | variable | `ssh-keyscan -H 27.100.38.131` output (pins the server identity) |
| `PUBLIC_URL` | variable | `http://27.100.38.131:8070` (used by the smoke test and shown on the deployment) |

## 7. The nginx site

`infra/nginx/upavp-portal.conf` is deployed by the pipeline and validated in CI against nginx 1.18.

| Location | Behaviour |
|---|---|
| `/` | login page (`no-cache`) |
| `/AwasVikas/` | dashboard single-page app (fallback to its `index.html`) |
| `/assets/`, `/AwasVikas/assets/` | hashed build files, cached for a year |
| `/geoserver/<ws>/(wms\|wfs\|ows)` | proxy to GeoServer, GET/HEAD/OPTIONS only; everything else under `/geoserver/` is 404 |
| tile caching | `GetMap` image responses only; `X-Edge-Cache: HIT/MISS/BYPASS` shows the result; errors are never cached |

`proxy_ignore_headers Cache-Control Expires` is deliberate: GeoServer marks tiles it serves from its own cache as `no-cache`, which would prevent nginx from ever caching them.
