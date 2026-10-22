# UPAVP Portal

[![CI](https://github.com/webgisprojects-creator/upavp-portal/actions/workflows/ci.yml/badge.svg)](https://github.com/webgisprojects-creator/upavp-portal/actions/workflows/ci.yml)

Geo-enabled portal for **Awas Vikas Parishad (U.P. Housing & Development Board)**: a login page and a GIS dashboard
(plots, landuse, roads, drainage, sewage, railway, water bodies for Ghaziabad) built as **one project, one pipeline, one deployment**.

| | |
|---|---|
| Pre-production | http://27.100.38.131:8070/ (login) - http://27.100.38.131:8070/AwasVikas/ (dashboard) |
| Stack | React 19, Vite, OpenLayers 10 - PostgreSQL/PostGIS - GeoServer - nginx - GitHub Actions |
| Status | Pre-production. **Not production-ready** until authentication and TLS are done - see [docs/architecture.md](docs/architecture.md#9-known-gaps-and-roadmap) |

## How it fits together

```
                        +--------------------------- GitHub ---------------------------+
 developer ── PR ─────► |  CI: lint · tests · build artifact · security · infra checks  |
                        |  CD: ship the SAME artifact ► smoke test ► auto-rollback      |
                        +------------------------------+--------------------------------+
                                                       | ssh
 browser ──► nginx (pre-production-testing :8070) ◄────┘
              /              login page            (static)
              /AwasVikas/    GIS dashboard         (static)
              /geoserver/    proxy + tile cache ──► GeoServer ──► PostgreSQL/PostGIS (db: upavp_geo)
```

## Repository layout

```
apps/
  login/            Login page            (React 19 + Vite 7)
  dashboard/        GIS dashboard         (React 19 + OpenLayers + Vite 8)
    src/lib/          pure, unit-tested logic (CQL filter builders)
    src/data/         generated data snapshots (see "Data snapshots")
    scripts/          build-map-data.py + tests
infra/
  deploy/           build-site.sh · deploy.sh · remote-activate.sh · rollback.sh · smoke-test.sh · warm_cache.py
  nginx/            upavp-portal.conf     (the site definition installed on the server)
db/                 database setup SQL + rules for schema changes
geoserver/          styles, findings, helper scripts for the shared GeoServer
docs/               architecture · deployment · runbook · github-setup · learning/
.github/            CI + CD workflows, CODEOWNERS, PR template, Dependabot
```

## Quick start (developer machine)

Requirements: Node 22 (`nvm use` reads `.nvmrc`), Python 3.13 (only for the data scripts), Git.

```bash
npm install                     # one install for the whole repo (npm workspaces)
npm run dev:dashboard           # http://localhost:5173/AwasVikas/   (map data comes from the shared GeoServer)
npm run dev:login               # http://localhost:5173/
cp apps/login/.env.example apps/login/.env.local     # then edit: sign-in is disabled until VITE_DEMO_USERS is set
```

| Command | What it does |
|---|---|
| `npm run lint` | oxlint on both apps |
| `npm test` | Vitest unit tests (CQL builders, data-snapshot integrity, demo auth) |
| `npm run test:py` | pytest for the data scripts |
| `npm run build` | production build of both apps |
| `npm run site` | build + package the deployable artifact (`dist-site/portal-<commit>.tar.gz`) |

## Working together (summary - details in [CONTRIBUTING.md](CONTRIBUTING.md))

1. Branch from `main` (`feature/short-name`), commit small, open a **pull request**.
2. **CI must be green** and one teammate must approve. Nobody pushes to `main` directly.
3. Merging to `main` **deploys automatically to pre-production** (same artifact CI built). Rollback is one click.
4. Never edit files on the server: the server only receives builds. A hot-fix is a PR like any other change.

## Data snapshots

Orientation areas, landuse labels/filter, legends and chart statistics are **generated from the database** into
`apps/dashboard/src/data/*.json` (GeoServer is ~244 ms away, so these must not be fetched live). Regenerate after the data or
the SLD colours change:

```bash
python apps/dashboard/scripts/build-map-data.py     # needs ssh access to db-primary
```

## Documentation

| Doc | For |
|---|---|
| [docs/architecture.md](docs/architecture.md) | What runs where, why it is built this way, known gaps and roadmap |
| [docs/deployment.md](docs/deployment.md) | How the pipeline and the scripts work, paths on the server |
| [docs/runbook.md](docs/runbook.md) | Day-to-day operations, troubleshooting |
| [docs/github-setup.md](docs/github-setup.md) | One-time GitHub + server setup for CI/CD |
| [docs/learning/](docs/learning/00-start-here.md) | Learn the concepts behind this project and prepare for interviews |
| [AUTHORS.md](AUTHORS.md) | Who builds this, and how credit and git authorship work |
| [db/README.md](db/README.md), [geoserver/README.md](geoserver/README.md) | Database and GeoServer notes |
