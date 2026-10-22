# Runbook

Day-to-day operations and what to do when something is wrong. Commands assume the SSH alias `pre-prod` (27.100.38.131).

## Quick checks

```bash
curl -s http://27.100.38.131:8070/revision.json                 # which commit is live, who built it
bash infra/deploy/smoke-test.sh http://27.100.38.131:8070       # full health check
bash infra/deploy/rollback.sh --list                            # releases on the server
ssh pre-prod 'df -h / | tail -1; du -sh /var/cache/nginx/upavp_tiles; systemctl is-active nginx'
```

## Routine tasks

| Task | How |
|---|---|
| Deploy | Merge to `main` (automatic) or Actions -> CD -> Run workflow -> `deploy` |
| Roll back | Actions -> CD -> Run workflow -> `rollback`, or `bash infra/deploy/rollback.sh [release]` |
| Warm map tiles before a demo | `python infra/deploy/warm_cache.py` (~13 min, ~5,000 tiles around Ghaziabad) |
| Clear the server tile cache | `ssh pre-prod 'rm -rf /var/cache/nginx/upavp_tiles/* && systemctl reload nginx'` (and truncate the layer in GeoServer's GWC; browsers keep tiles 1 day) |
| Refresh dashboard data snapshots | `python apps/dashboard/scripts/build-map-data.py`, review the diff, PR, merge |
| See nginx errors | `ssh pre-prod 'tail -50 /var/log/nginx/error.log'` |
| Disk space | `ssh pre-prod 'df -h /'`; releases are auto-pruned to 5; look at other large data on the server |

## Incident checklist: "the site is down / broken"

1. **Is it really down?** `curl -I http://27.100.38.131:8070/` from two places.
2. **Was there a deployment just now?** `curl .../revision.json`; check the CD run. If yes -> **roll back first, investigate after.**
3. **Server side:** `ssh pre-prod 'systemctl status nginx --no-pager | head; nginx -t'`. If `nginx -t` fails, restore the last good config from `/var/backups/upavp/` and `systemctl reload nginx`.
4. **Only the map is broken?** Probably GeoServer, not the portal (see below). The login and the dashboard shell keep working.
5. **Write down** what happened, what fixed it, and what would have prevented it.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| CD fails at "Configure SSH" / "Deploy" | missing/expired secret, SSH not reachable from GitHub | check `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`; see github-setup.md section 5 |
| CD: `another deployment is running (lock held)` | a deploy/rollback is in progress (or died) | wait; if stuck: `ssh pre-prod 'fuser /var/lock/upavp-deploy.lock'` and investigate before removing |
| CD: `nginx -t failed - live site NOT changed` | error in `infra/nginx/upavp-portal.conf` | read the nginx lines above it, fix in a PR (CI's nginx check should have caught it) |
| Smoke test fails -> auto-rollback happened | new release is broken | open the failed run; fix forward in a PR |
| Map layers blank / red banner "failed to load" | GeoServer slow or down | `curl "http://162.245.218.6:8080/geoserver/AwasVikas/wms?service=WMS&request=GetCapabilities"`; tell the GeoServer owner; tiles already cached still load |
| A layer is very slow the first time | tiles not cached (GeoServer is 244 ms away) | `warm_cache.py` for the area; longer term see architecture section 6 |
| Style/data changed but map shows old picture | cached tiles | clear nginx cache + truncate GeoServer GWC; hard-refresh |
| Chart / filter numbers look old | snapshots are generated | re-run `build-map-data.py`, PR, deploy |
| `X-Edge-Cache` is always `MISS` | response is not an image, or request is not `GetMap` | expected for errors/capabilities; otherwise check the cache directory exists |
| pgAdmin: "database postgres does not exist" | wrong maintenance DB | use `upavp_geo` as Maintenance database |
| Login says sign-in is not configured | `VITE_DEMO_USERS` missing at build time | set the secret (CI) or `.env.production.local` (laptop) and redeploy |

## Contacts and access

Keep this table filled in (do **not** put passwords here):

| What | Where / who |
|---|---|
| Server SSH | `pre-prod`, `db-primary`, `geoserver` aliases (ask the project owner for access) |
| Database credentials | `/root/upavp_geo_setup/credentials.txt` on db-primary (root only) or the team password manager |
| GeoServer admin | GeoServer owner (shared with another portal) |
| GitHub admin | repository owner |
