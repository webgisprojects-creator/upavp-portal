# Architecture

## 1. What it is

A login page and a GIS dashboard served together. The dashboard shows Ghaziabad plot layout, landuse, roads, drainage, sewage,
railway and water bodies on a map, with a summary chart, a landuse filter and base maps (street, satellite, hybrid).

## 2. Where everything runs

| Piece | Host | Address | Notes |
|---|---|---|---|
| Portal web server | `pre-production-testing` | 27.100.38.131 :8070 | nginx 1.18 (Ubuntu). Site `upavp-portal`. Static files only |
| Map server | GeoServer 2.27 (Tomcat 9) | 162.245.218.6 :8080 | Workspaces `Landuse_LULC` and `Planning` (the dashboard), `AwasVikas` (kept, no longer used by the dashboard). **Shared with another portal**; reached only via the portal's `/geoserver/` proxy |
| Database | `db-primary` (PostgreSQL 17 + PostGIS 3.6) | 27.100.38.132 :5432 / PgBouncer :6432 | Database `upavp_geo` |
| Load balancer | `load-balancer-2` (nginx) | 27.100.38.133 | **Not used by this project yet** (it fronts the older app on :8060) |
| Old dashboard | IIS (Windows) | 103.15.81.74 `/AwasVikas/` | Reference only; replaced by the UPAVP Geo Dashboard below |

Also on the pre-prod server and **not to be disturbed**: a PM2 app on :8060 and the `wipzo.in` site on 80/443.

```
browser ─► nginx :8070 ─┬─ /            login page            (static)
                        ├─ /AwasVikas/  dashboard             (static)
                        └─ /geoserver/  proxy ──────────────► GeoServer ──► PostGIS (upavp_geo)
                              └ edge tile cache (2 days)
```

## 3. Components

### Login (`apps/login`)
React 19 + Vite 7. A full-screen video background (skipped on slow links / data-saver), the form, and a redirect to `/AwasVikas/`.
**Authentication is temporary**: a build-time list of demo users (`VITE_DEMO_USERS`) is checked in the browser. This is *not* security.

### Dashboard (`apps/dashboard`)
The **UPAVP Geo Dashboard**: React 19 + OpenLayers 10 + Vite 8, served at `/AwasVikas/` (the login page redirects there).
Per city (Katra, Majhola, Hardoi, Ayodhya, Barabanki, Sikandra, Unnao) it shows land use / land cover, cadastral, scheme and village
boundaries from workspace `Landuse_LULC`; for Lucknow it shows the Vrindavan layout and scheme boundary from workspace `Planning`.
Layers are single-image WMS requests (`ImageWMS`) through the same-origin `/geoserver/wms` proxy; charts, search boxes and the
feature-info popup read the same layers through WFS. Basemaps: OSM, Esri satellite, Esri hybrid.
* `src/config/layoutFields.js` - **the database column names the Vrindavan layout code depends on** (unit-tested). The SLD styles in
  GeoServer name the same columns, so a renamed column must be changed in both places (see runbook).
* `src/config/layerOrder.js` - **the drawing order of the map layers**, bottom to top: basemap imagery, LULC / Vrindavan layout (opaque filled
  areas), railway, cadastral (thin parcel lines), village boundary (thick black line + names), **scheme boundary (red dashed, always on top)**,
  then the Esri place-name labels of the Hybrid basemap, then highlights / search overlays (z-index 900+). The layer panel, the legend and the
  click-to-identify popup list layers in the same order, topmost first. A new layer type must be given a place in that file (a test checks it).
* There is no generated data any more: everything is read live from GeoServer.

### nginx site (`infra/nginx/upavp-portal.conf`)
Serves both apps, proxies **only** read-only OGC requests to GeoServer (`wms|wfs|ows`, GET/HEAD/OPTIONS; the GeoServer web UI and REST API
return 404), keeps a persistent connection to GeoServer, and caches finished `GetMap` image tiles (server 2 days, browser 1 day).

### Database (`db/`)
`upavp_geo` is its own database with its own roles - nothing is shared with the other projects on db-primary.

| Role | Use | Notes |
|---|---|---|
| `upavp_geo_owner` | owns every object | no login |
| `upavp_geo_dev` | developers / pgAdmin | acts as owner automatically, 10 connections |
| `upavp_geo_app` | future backend | read/write data, cannot create objects, 40 connections, 30 s statement timeout |
| `upavp_geo_geoserver` | GeoServer | read-only, 15 connections |

Schemas `auth`, `app` (reserved for the backend) and `public` (currently holds the 8 GIS layers). PgBouncer aliases exist for each role.

### GeoServer (`geoserver/`)
Workspaces used by the dashboard: `Landuse_LULC` (29 layers, 7 cities) and `Planning` (Vrindavan layout, styles `vrindavan_PropertyType_label_plot_cat` and `vrindavan_Alloted_label_plot_cat`). Workspace `AwasVikas` (store `Awas_Vikas_Parishad`, 8 layers) is kept but no longer used. The stores read the database through the shared JNDI pool `java:comp/env/jdbc/upavp_geo`.

## 4. Design decisions (short ADRs)

| # | Decision | Why | Trade-off |
|---|---|---|---|
| 1 | **Static front end, no server-side app** | Nothing to run or patch; nginx serves files fast; trivial to roll back | No server logic yet - authentication needs a backend (roadmap) |
| 2 | **Build once, deploy the artifact** | What CI tested is byte-for-byte what runs; no "works on my machine" rebuild on the server | Build-time config (demo users) is baked into the artifact |
| 3 | **Immutable releases + atomic symlink switch** | Deploy and rollback are a single rename; visitors never see a half-deployed site | Releases use disk (pruned to the newest 5) |
| 4 | **Server holds built files only** | No source or build tools on a shared, almost-full server; smaller attack surface | Changes can only come through the pipeline (intended) |
| 5 | **nginx edge cache + tiled WMS** | GeoServer is 244 ms away; cached tiles are served locally in ~0.1 s | Stale tiles for up to 2 days after a data/style change (clear the cache) |
| 6 | **Charts and searches read GeoServer live (WFS)** | Always current: no generated files to refresh after a data change | Every chart / search is a request over the 244 ms link (the LULC chart downloads the whole layer's geometry); the Vrindavan layout is ~19,800 plots |
| 7 | **Dedicated database and roles** | Isolation from the other projects; least privilege | One more database to back up and monitor |
| 8 | **Read-only proxy to GeoServer** | The browser never reaches the GeoServer admin UI/REST | Features needing POST/WFS-T would need an explicit rule |

## 5. Request flow for a map tile

1. Browser asks `/geoserver/wms?...GetMap...&TILED=true&BBOX=...` on the portal origin (no CORS needed).
2. nginx: **cache hit** -> returns the PNG (~0.1 s). **Miss** -> forwards over a kept-alive connection to GeoServer.
3. GeoServer's own tile cache (GWC) may answer; otherwise it renders from PostGIS and stores the tile.
4. nginx stores the image (only `GetMap` + `image/*` responses) and sets browser caching to one day.

## 6. The performance finding that shaped the design

The database answers in ~30 ms, but **GeoServer is ~244 ms away from the database, the load balancer and the portal server** (those three share a
data centre, 0.2 ms apart). GeoServer reads rows in batches of 1,000, so 172,234 plots need ~172 round trips = ~43 s - exactly the 45 s measured.
Fixes in place: tiling + caching + minimum zoom for the heavy layer + warm-up. Fixes still needed on GeoServer (admin access): fetch size 1000 -> 50000,
read-only account, tile-cache seeding, ideally a GeoServer next to the database. Details: [geoserver/README.md](../geoserver/README.md).

## 7. Environments

| Environment | Status |
|---|---|
| local | `npm run dev:*`, talks to the shared GeoServer |
| pre-production | live, deployed by CD |
| production | not created. Plan: hostname + TLS + load balancer server block, same artifact, manual approval |

## 8. Security model (today)

* No real authentication; the dashboard and GeoServer layers are readable by anyone who can reach the URL.
* The browser can only reach GeoServer through read-only OGC endpoints.
* CI scans for committed secrets and for vulnerable runtime dependencies.
* Secrets (deploy key, demo users) live in GitHub secrets, never in the repository.

## 9. Known gaps and roadmap

Ordered by importance.

1. **Authentication.** Build a small backend (Node/Express or similar) against `upavp_geo` schemas `auth`/`app`: hashed passwords (argon2/bcrypt),
   rate limiting and lockout, HttpOnly + Secure + SameSite cookies, audit log, optional OTP. nginx `auth_request` then protects `/AwasVikas/` and `/geoserver/`.
2. **HTTPS and a hostname**; put the site behind the load balancer with its own server block and cache.
3. **GeoServer**: read-only DB account (JNDI), fetch size, tile-cache seeding, status-based plot style (green/red); consider a GeoServer near the DB.
4. **Database hardening**: remove the `0.0.0.0/0` rule in `pg_hba.conf`; scheduled `pg_dump` to a second host with a tested restore; confirm replica state.
5. ~~Least-privilege deploy access~~ **done**: CI/CD uses the restricted `upavp-deploy` user (4 sudo commands, no root) - see docs/deployment.md section 8. Next: rotate the deploy key regularly and restrict SSH by network if GitHub's runner ranges can be allow-listed.
6. **Disk space** on the pre-prod server (98 % full).
7. **Third-party tiles** (OpenStreetMap, Esri): confirm licensing for production or use a licensed provider.
8. **Data quality** (for the GIS team): 85 % of plots have a blank `allotment`; 83 % have no `scheme`; "Viashali" looks like a typo of "Vaishali";
   8 landuse classes have no sub-class; 159 invalid geometries and 7 plots without geometry.
9. **Tech debt**: 3 lint warnings (unused variables / a hook dependency); dev-only advisories in vitest 3 (upgrade to 4 once npm resolves the workspace peer conflict); the login still on Vite 7 while the dashboard is on 8.
