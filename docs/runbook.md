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
| Warm map tiles | `infra/deploy/warm_cache.py` only knows the retired `AwasVikas` layers; the new dashboard requests free-form images, which are not tile-cached |
| Clear the server tile cache | `ssh pre-prod 'rm -rf /var/cache/nginx/upavp_tiles/* && systemctl reload nginx'` (and truncate the layer in GeoServer's GWC; browsers keep tiles 1 day) |
| See nginx errors | `ssh pre-prod 'tail -50 /var/log/nginx/error.log'` |
| Disk space | `ssh pre-prod 'df -h /'`; releases are auto-pruned to 5; look at other large data on the server |

## Incident checklist: "the site is down / broken"

1. **Is it really down?** `curl -I http://27.100.38.131:8070/` from two places.
2. **Was there a deployment just now?** `curl .../revision.json`; check the CD run. If yes -> **roll back first, investigate after.**
3. **Server side:** `ssh pre-prod 'systemctl status nginx --no-pager | head; nginx -t'`. If `nginx -t` fails, restore the last good config with `sudo /opt/upavp/bin/install-nginx-conf restore` (backups are in `/var/backups/upavp/`) and `sudo systemctl reload nginx`.
4. **Only the map is broken?** Probably GeoServer, not the portal (see below). The login and the dashboard shell keep working.
5. **Write down** what happened, what fixed it, and what would have prevented it.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| CD fails at "Configure SSH" / "Deploy" | missing/expired secret, SSH not reachable from GitHub | check `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`; see github-setup.md section 5 |
| CD: `another deployment is running (lock held)` | a deploy/rollback is in progress (or died) | wait; if stuck: `ssh pre-prod 'fuser /var/www/upavp-portal/.deploy.lock'` and investigate before removing |
| CD: `nginx -t failed - live site NOT changed` | error in `infra/nginx/upavp-portal.conf` | read the nginx lines above it, fix in a PR (CI's nginx check should have caught it) |
| Smoke test fails -> auto-rollback happened | new release is broken | open the failed run; fix forward in a PR |
| Map layers blank / red banner "failed to load" | GeoServer slow or down | check with ONE small image, not capabilities: `curl -so /dev/null -w '%{http_code} %{content_type}
' "http://162.245.218.6:8080/geoserver/wms?service=WMS&version=1.1.1&request=GetMap&layers=Landuse_LULC:scheme_boundary_hardoi&styles=&bbox=80.13,27.38,80.15,27.40&width=64&height=64&srs=EPSG:4326&format=image/png"`; tell the GeoServer owner |
| One Vrindavan layer is blank but the others draw (GeoServer answers 200 with an XML error) | an SLD names a database column that no longer exists | request the layer with its style and read the message: `...&layers=Planning:vrindavan_layout&styles=vrindavan_PropertyType_label_plot_cat...` -> `The style specifies an attribute named 'x', not found`. Fix the column in the SLD and in `apps/dashboard/src/config/layoutFields.js` |
| GeoServer answers 503 to everything after a reload | **never send `GetCapabilities` to the global endpoint right after a reload or restart**: it reads the column list of all ~600 layers over the 244 ms link, one at a time, under one lock; every repeat adds another pass and blocks all other requests (incident 2026-10-29). Send nothing and let it finish; check progress in `/opt/geoserver/data_dir/logs/geoserver.log` ('running requests / blocked requests') |
| A layer is very slow the first time | GeoServer is 244 ms away | see architecture section 6 |
| Style/data changed but map shows old picture | cached tiles | clear nginx cache + truncate GeoServer GWC; hard-refresh |
| `X-Edge-Cache` is always `MISS` | response is not an image, or request is not `GetMap` | expected for errors/capabilities; otherwise check the cache directory exists |
| pgAdmin: "database postgres does not exist" | wrong maintenance DB | use `upavp_geo` as Maintenance database |
| Login says sign-in is not configured | `VITE_DEMO_USERS` missing at build time | set the secret (CI) or `.env.production.local` (laptop) and redeploy |

## Dedicated GeoServer (primary since the cut-over PR)

The portal's `/geoserver/` now goes to the DEDICATED GeoServer on db-primary (27.100.38.132:8081, next to the database, no other users).
The shared GeoServer (162.245.218.6:8080) stays configured as nginx's `backup` upstream and is used automatically only while the dedicated one fails.

Why: on 12 Nov 2026 the shared GeoServer was handling ~2,500-3,000 requests/min for another portal (via 27.100.38.133); our map got HTTP 504 and the
red "failed to load" banner. The same 1331x975 Vrindavan view takes 0.3-0.5 s on the dedicated server and 4.5 s on the shared one.

After the PR is merged and CD has deployed it:
1. Check one small image through the portal: `curl -s -o /dev/null -w '%{http_code} %{content_type}\n' 'http://27.100.38.131:8070/geoserver/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&FORMAT=image/png&LAYERS=Planning:vrindavan_layout&STYLES=&WIDTH=64&HEIGHT=64&SRS=EPSG:3857&BBOX=9012015,3093779,9013415,3095179'`
2. Mark the cut-over so the sync script can never overwrite layers published on the dedicated server: `ssh db-primary 'sudo touch /var/lib/geoserver-upavp/CUTOVER_DONE'`
3. From now on publish layers and edit styles on the DEDICATED GeoServer (it listens on 127.0.0.1 and the portal servers only; use an SSH tunnel: `ssh -L 8081:127.0.0.1:8081 db-primary`, then http://localhost:8081/geoserver/web/; admin password: `/root/upavp_geo_setup/geoserver_admin.txt` on db-primary, root only). Changes made on the shared GeoServer no longer reach the portal.
4. Roll back = revert the PR (nginx points at the shared GeoServer again).

Before the cut-over, `infra/geoserver-local/sync-config.sh` copies the UPAVP workspaces from the shared to the dedicated server (it refuses to run once the marker exists).

## Contacts and access

Keep this table filled in (do **not** put passwords here):

| What | Where / who |
|---|---|
| Server SSH | `pre-prod`, `db-primary`, `geoserver` aliases (ask the project owner for access) |
| Database credentials | `/root/upavp_geo_setup/credentials.txt` on db-primary (root only) or the team password manager |
| GeoServer admin | GeoServer owner (shared with another portal) |
| GitHub admin | repository owner |
