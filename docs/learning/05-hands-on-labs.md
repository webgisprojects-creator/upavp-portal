# Hands-on labs

Do these yourself. After each lab, **explain it aloud in two minutes** as if teaching a colleague. Labs marked *(needs GitHub)* require the repository to be pushed
and Actions enabled. Labs that touch the server use **pre-production only** and have a rollback ready - never experiment on anything else.

Format: **Goal -> Steps -> You should see -> Explain it back -> Stretch**

---
## Lab 1 - Trace a request end to end (30 min)
**Goal:** be able to narrate what happens when someone opens the dashboard and switches on Road Centre Line.
**Steps**
```bash
curl -sI http://27.100.38.131:8070/AwasVikas/ | head                 # served by nginx, static
curl -s  http://27.100.38.131:8070/revision.json                      # which commit/release is live
Q='service=WMS&version=1.1.1&request=GetMap&format=image/png&transparent=true&layers=AwasVikas:gda_road_centre_line&styles=&tiled=true&width=256&height=256&srs=EPSG:3857&bbox=8622096.79,3332654.43,8623319.78,3333877.43'
curl -s -o /dev/null -D - "http://27.100.38.131:8070/geoserver/wms?$Q" | grep -i -E "x-edge-cache|cache-control|content-type"   # run it twice
```
**You should see:** first `X-Edge-Cache: MISS`, then `HIT`; `Cache-Control: public, max-age=86400`; `image/png`.
**Explain it back:** browser -> nginx -> (cache?) -> GeoServer -> (GWC?) -> PostGIS; which part is 244 ms away?
**Stretch:** request the same tile with a different `bbox` digit - why is it a MISS? (cache key = full URL)

## Lab 2 - Make CI fail on purpose, then fix it (30 min, locally; *needs GitHub* for the real run)
**Goal:** see what each check protects.
**Steps**
1. `git switch -c lab/break-things`
2. In `apps/dashboard/src/lib/cql.js` change `replaceAll("'", "''")` to `replaceAll("'", "")`. Run `npm test`.
3. Read the failing test names. Revert. Now remove a comma in `infra/nginx/upavp-portal.conf` (e.g. delete a `;`) and run:
   `docker run --rm -v "$PWD/infra/nginx:/conf:ro" nginx:1.18 nginx -t` *(or just read how CI does it)*.
4. Create a file containing something that looks like a cloud key, generated so it is never typed into the repo:
   `echo "AKIA$(printf 'A%.0s' {1..16})" > fake-key.txt` - think about which job would catch it (security/gitleaks), then delete the file.
**You should see:** the unit test about quote escaping fails with a clear message; nginx reports the line number.
**Explain it back:** "unit tests catch logic, infra checks catch config, gitleaks catches secrets - three different classes of mistake."
**Stretch:** push the branch, open a PR, watch the red cross and the "CI passed" check stay red.

## Lab 3 - A renamed column breaks a layer (45 min)
**Goal:** see why the database, the SLD style and the code must agree - and where the tests help.
**Steps**
1. Read `apps/dashboard/src/config/layoutFields.js` and its test `layoutFields.test.js`.
2. Pretend the GIS team renamed `status` to `plot_status`. In the test, change the sample column list accordingly: it fails, naming the column that is gone.
3. Fix `LAYOUT_FIELDS.propertyStatus`, run `npm test -w @upavp/dashboard`: green.
4. Read `docs/runbook.md`, row "One Vrindavan layer is blank but the others draw", and request the style from GeoServer to see the real error message
   (`The style specifies an attribute named '...', not found`).
**Explain it back:** why does GeoServer answer HTTP 200 with an XML error, and why does the map then show nothing instead of an error page?
**Stretch:** the deploy smoke test has a soft check for exactly this. Find it in `infra/deploy/smoke-test.sh`.

## Lab 4 - Rollback drill (20 min, pre-production)
**Goal:** be fast and calm during an incident.
**Steps**
```bash
bash infra/deploy/rollback.sh --list
bash infra/deploy/rollback.sh                 # to the previous release
curl -s -o /dev/null -w "%{http_code}\n" http://27.100.38.131:8070/AwasVikas/
bash infra/deploy/rollback.sh <the release marked live earlier>     # roll forward
bash infra/deploy/smoke-test.sh http://27.100.38.131:8070
```
**You should see:** `OK: rolled back A -> B` both ways and a passing smoke test. A bad id (`rollback.sh nope`) fails safely.
**Explain it back:** why is this instant? (symlink rename; nothing rebuilt) What does it **not** undo? (database/GeoServer changes)
**Stretch:** time it. Write the 5-line incident note you would post in the team chat.

## Lab 5 - Add a smoke check (30 min)
**Goal:** extend the safety net.
**Steps:** in `infra/deploy/smoke-test.sh` add a hard check that `/geoserver/wfs` with `POST` is rejected (nginx returns 403 for non-GET):
```bash
code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/geoserver/wfs")"
[ "$code" = 403 ] && pass "POST to /geoserver/wfs blocked" || fail "POST returned $code (expected 403)"
```
Run it against pre-production, then run `shellcheck -x infra/deploy/smoke-test.sh`.
**Explain it back:** hard check vs soft (warning) check - which would you pick for GeoServer being slow, and why?
**Stretch:** make the smoke test print a one-line JSON result for the Actions summary.

## Lab 6 - Write a new CI job (45 min, *needs GitHub*)
**Goal:** learn the workflow syntax by doing.
**Steps:** add a job `bundle-size` to `ci.yml` that fails if the dashboard main JS exceeds 800 kB:
```yaml
  bundle-size:
    runs-on: ubuntu-latest
    needs: web
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with: { name: portal-site, path: a }
      - run: |
          tar -xzf a/portal-*.tar.gz -C a
          size=$(stat -c%s a/site/AwasVikas/assets/index-*.js | head -1)
          echo "main bundle: $size bytes"; [ "$size" -lt 800000 ]
```
Add it to `ci-ok`'s `needs`. Run `actionlint` locally first.
**Explain it back:** why `needs: web`? Why reuse the artifact instead of rebuilding?

## Lab 7 - Latency maths (20 min, paper)
**Goal:** be able to *calculate* a bottleneck.
1. Rows: 172,234. Fetch size: 1,000. Round trip: 0.25 s. -> trips = ?  time = ? (172 x 0.25 = 43 s)
2. Same with fetch size 50,000 -> trips = ?  time = ? (4 x 0.25 = 1 s)
3. If GeoServer moves next to the DB (0.2 ms): 172 x 0.0002 = 0.03 s.
4. A tile needs ~5 round trips on a new connection: with keep-alive it needs ~3. Saving = ?
**Explain it back:** why does more bandwidth not help? (the cost is the number of sequential trips)

## Lab 8 - Read the nginx config aloud (30 min)
Open `infra/nginx/upavp-portal.conf`. For each block say: what it matches, what it does, and what breaks if you delete it.
Specifically explain: the two `map` blocks, `proxy_cache_lock`, `proxy_ignore_headers`, `limit_except`, and the `location /geoserver/ { return 404; }` fallback.
**Stretch:** predict the response for `GET /geoserver/web/`, `POST /geoserver/wfs`, `GET /geoserver/AwasVikas/wms?request=GetCapabilities`, then verify with curl.

## Lab 9 - A database migration (45 min)
**Goal:** treat schema changes as code.
**Steps:** create `db/setup/002_add_audit_table.sql` (do not run it on the shared server without a review):
```sql
-- adds a login audit table in the portal schema, owned by the owner role, writable by the app role
SET ROLE upavp_geo_owner;
CREATE TABLE IF NOT EXISTS auth.login_events (
  id          bigserial PRIMARY KEY,
  username    text        NOT NULL,
  success     boolean     NOT NULL,
  ip          inet,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_events_user_time ON auth.login_events (username, occurred_at DESC);
```
Open a PR with a description of the risk and rollback (`DROP TABLE`). 
**Explain it back:** why `IF NOT EXISTS`? why an owner role? why does `_app` automatically get access (default privileges)?

## Lab 10 - Mock interview (60 min, with a friend)
Your friend asks, in this order: (1) the 60-second pitch, (2) draw the architecture, (3) draw the pipeline, (4) three random questions from `04-interview-qa.md`,
(5) "what would you improve?", (6) one live troubleshooting scenario: *"the dashboard shows blank maps"* - talk through your steps.
Score yourself: clarity, numbers, honesty about gaps, did you ask clarifying questions?

---
## Bonus labs
* **Containerise it:** write a multi-stage Dockerfile (`node` build -> `nginx` serve) and run it locally with `docker run -p 8080:80`.
* **Playwright E2E:** automate "open dashboard -> toggle Plot Layout -> chart shows 172,234" and run it in CI.
* **Self-hosted runner:** register a runner on a VM and switch `cd.yml` to use it.
* **Backups:** write a `pg_dump` script + restore test and schedule it with cron/systemd timer on a second host.
