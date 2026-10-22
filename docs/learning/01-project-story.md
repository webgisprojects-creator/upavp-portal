# Your project story

Practise these until they are natural. Keep the **numbers** - they make you credible.

## 60-second pitch

"I work on a GIS portal for the U.P. Housing and Development Board - about 172 thousand plots, plus landuse, roads and drainage for Ghaziabad.
It started as two separate pieces: a login page and a dashboard on a Windows IIS server, with no version control, manual copying and no tests.
I combined them into **one repository**, built a **CI/CD pipeline** on GitHub Actions, and deployed it behind nginx on a Linux pre-production server.
Every change is linted, tested, built and security-scanned; merging deploys the same artifact with automatic rollback.
I also investigated why the map was slow and found a 244-millisecond network hop between GeoServer and the database - a finding that changed our design."

## 3-minute version (structure: context -> problem -> what I did -> result -> what I would do next)

1. **Context:** government GIS portal; React + OpenLayers front end, GeoServer map server, PostgreSQL/PostGIS database, nginx.
2. **Problem:** manual deployments, code existed only on one laptop, no tests, the plot layer took ~45 s to draw, and chart numbers were wrong (it read only the first 10,000 of 172,234 plots).
3. **What I did:**
   * *Engineering:* one monorepo (npm workspaces), extracted logic into tested modules, 30 JS + 20 Python tests, secrets removed from the code.
   * *Delivery:* CI (lint, tests, build, security, nginx/shell/workflow checks) and CD that ships the CI artifact; atomic release switch; smoke test; auto-rollback; lock against concurrent deploys.
   * *Performance:* measured instead of guessing - DB 31 ms, GeoServer 244 ms away. Added tile caching in nginx (0.85 s -> 0.13 s per tile), tiled WMS, minimum zoom for the heavy layer, a cache warm-up script.
   * *Data/UX:* exact statistics from the full table, interactive chart, landuse filter, orientation areas so users know where to zoom.
4. **Result:** plots load in ~3-5 s on a typical mobile hotspot (was ~45 s), deploys are one merge and rollback is one click.
5. **Next:** real authentication (backend + HTTPS), least-privilege deploy user, scheduled DB backups, move the GeoServer next to the database.

## STAR stories (Situation - Task - Action - Result)

### Story 1: "Tell me about a hard performance problem you solved"
* **S:** The plot layer took 45 s to appear and sometimes failed on slow connections.
* **T:** Find the real cause and make the demo reliable.
* **A:** Measured each hop: the database query for the whole city took 31 ms, so SQL was not the problem. A ping showed **GeoServer was 244 ms from the database**, while the portal, the load balancer and the database were 0.2 ms apart. GeoServer fetched rows in batches of 1,000, so 172,234 rows meant about 172 round trips x 0.25 s = 43 s - matching the 45 s observed. I tested a style optimisation too and measured **no gain**, so I dropped that idea. Then I fixed what I controlled: tiled and cache-friendly requests, an nginx tile cache (kept `Cache-Control` under our control), a minimum zoom for the 172k-polygon layer, retries for failed tiles, and a warm-up script.
* **R:** Tile time 0.85 s -> 0.13 s on repeat; plot view 3.5 s on a typical 4G hotspot. The remaining fix (JDBC fetch size) is documented for the GeoServer owner.
* **Lesson:** measure before optimising; be willing to discard your own hypothesis.

### Story 2: "Tell me about improving a process"
* **S:** Deployment was manual file copying; the code lived on one machine.
* **T:** Make delivery repeatable, safe and shared between developers.
* **A:** Restructured into one repo; wrote a pipeline that builds once and deploys that artifact; added safety nets (nginx config test, atomic switch, smoke test, rollback, lock); wrote runbooks and a contributing guide.
* **R:** A deployment is "merge a PR"; rollback takes seconds; a teammate can contribute without tribal knowledge.

### Story 3: "Tell me about a bug you found in testing"
* **S:** While testing my own rollback script I ran `--list` and it printed "release not found: '1'".
* **A:** Reproduced it, realised `ssh` drops an **empty** argument when it re-joins the command line, shifting the remaining arguments. Fixed by quoting arguments inside the remote command string; re-tested list, rollback, roll-forward and a bad id.
* **R:** The script failed *safely* (changed nothing) even while buggy - which is exactly why destructive operations should validate input first.

### Story 4: "Tell me about a security improvement"
* **S:** The login page had usernames and passwords hard-coded in the source, and I was about to publish the repo.
* **A:** Moved them to a build-time secret (git-ignored locally, GitHub secret in CI), added a test for the parser, added gitleaks to CI, documented that this is a *temporary* demo mechanism and the real fix is backend authentication.
* **R:** No credentials in git history. Note the honesty: anything in a browser bundle is public, so I called it out as a known gap rather than pretending it was solved.

### Story 5: "A time you disagreed / changed your mind"
* I first built scale-dependent map styles expecting a speed-up; measurements showed none. I told the stakeholder plainly, kept the styles only as optional readability work, and redirected effort to the real cause.

## What you can honestly say you do **not** have yet (own it - it shows maturity)

* No real authentication, no HTTPS on this environment, no scheduled database backups, no containers/Kubernetes, one environment only.
* Say: "I know what the next steps are and I have them ranked in `docs/architecture.md`."

## Draw these from memory (whiteboard questions)

1. **Architecture:** browser -> nginx -> static files / proxy -> GeoServer -> PostGIS (+ where the 244 ms is).
2. **Pipeline:** PR -> CI jobs -> merge -> CD -> artifact -> ssh -> lock -> nginx -t -> symlink switch -> smoke test -> rollback.
3. **Release layout:** `releases/<id>/` folders and the `current` symlink.

## Numbers to remember

172,234 plots - 150,295 buildings - 7,850 landuse areas - 31 ms DB query - **244 ms** GeoServer RTT - 0.2 ms same-DC RTT - 45 s -> ~3.5 s plot load -
0.85 s -> 0.13 s cached tile - 30 JS + 20 Python tests - 5 releases kept - 5 CI jobs.

## How to talk about using AI tools

Good: "I used an AI assistant to move faster, then reviewed, ran and tested the result, and wrote tests/docs so the team can maintain it."
Avoid: implying you hand-typed everything, or being unable to explain a line. If asked "how did you decide X?", answer from the **reasons in `docs/architecture.md`** (section 4) - make sure they are yours.
